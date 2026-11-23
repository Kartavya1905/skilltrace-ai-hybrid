/**
 * HybridAIService: every runtime AI operation in SkillTrace goes through Firebase AI Logic.
 *
 * Routing follows the learner's explicit cloud-consent preference:
 *   allow -> InferenceMode.PREFER_ON_DEVICE  (the SDK's own hybrid routing and cloud fallback)
 *   ask   -> ONLY_ON_DEVICE first; if unavailable, ask the learner, then ONLY_IN_CLOUD on a yes
 *   deny  -> ONLY_ON_DEVICE; never leaves the device
 *
 * The reported inference source is read from the SDK response (`response.inferenceSource`).
 * When the SDK does not report it, the source is 'unknown' - we never infer or guess it.
 * Failures return an error result. A completed result is never fabricated.
 */
import type { CloudAIConsent, InferenceSourceLabel } from '@skilltrace/shared';
import { JSON_SCHEMAS, VALIDATORS, parseModelJson, type TaskName } from './schemas';

/** Mirrors firebase/ai InferenceMode string values (verified against firebase 13.4.0 typings). */
export type InferenceModeValue =
  'prefer_on_device' | 'only_on_device' | 'only_in_cloud' | 'prefer_in_cloud';

/** Minimal surface of firebase/ai GenerativeModel that the service relies on. */
export interface ModelHandle {
  generateContent(
    prompt: string,
  ): Promise<{ response: { text(): string; inferenceSource?: string } }>;
  initializeDeviceModel?(onDownloadProgress?: (progress: number) => void): Promise<void>;
}

export interface ModelFactory {
  /** Create (or return a cached) model for this task's schema and inference mode. */
  model(task: TaskName, mode: InferenceModeValue): ModelHandle;
  readonly cloudModelName: string;
  /**
   * Whether Chrome's Prompt API global (LanguageModel) exists. IMPORTANT: firebase/ai creates no
   * on-device adapter without it, and then sends even ONLY_ON_DEVICE requests to the cloud.
   * The service therefore refuses on-device-only calls when this returns false.
   */
  onDeviceApiPresent(): boolean;
}

export type AIErrorKind =
  | 'local_unavailable'
  | 'offline'
  | 'cloud_consent_denied'
  | 'rate_limited'
  | 'network'
  | 'malformed_output'
  | 'not_configured'
  | 'app_check'
  | 'policy_violation'
  | 'unknown';

export interface AIResultBase {
  task: TaskName;
  mode: InferenceModeValue | null;
  durationMs: number;
  timestamp: string;
}

export interface AISuccess<T> extends AIResultBase {
  ok: true;
  output: T;
  source: InferenceSourceLabel;
  model: string;
}

export interface AIFailure extends AIResultBase {
  ok: false;
  error: { kind: AIErrorKind; message: string; code: string };
  /** The caller should keep the task pending and retry later (offline, local model downloading...). */
  retryLater: boolean;
}

export type AIResult<T> = AISuccess<T> | AIFailure;

export interface PromptPair {
  /** Full prompt for on-device inference (content stays on the device). */
  local: string;
  /** Minimised prompt used whenever the request may go to the cloud. */
  cloud: string;
  /** Plain-language description of what would be uploaded, shown in the consent prompt. */
  cloudDataDescription: string;
}

export interface HybridAIDeps {
  consent: () => CloudAIConsent;
  /** Only used in 'ask' mode. Must resolve true only on an explicit learner action. */
  requestCloudConsent?: (task: TaskName, description: string) => Promise<boolean>;
  isOnline: () => boolean;
  now?: () => number;
  onLog?: (entry: AIResult<unknown>) => void;
  /** Max cloud-capable calls per rolling minute (protects free-tier quota). */
  cloudCallsPerMinute?: number;
}

export const ON_DEVICE_MODEL_LABEL = 'Chrome built-in model via Prompt API (version not reported)';

function mapSource(raw: string | undefined): InferenceSourceLabel {
  if (raw === 'on_device') return 'on_device';
  if (raw === 'in_cloud') return 'in_cloud';
  return 'unknown';
}

export function classifyError(
  err: unknown,
  mode: InferenceModeValue | null,
): { kind: AIErrorKind; code: string; message: string } {
  const e = err as { code?: string; message?: string; customErrorData?: { status?: number } };
  const code = String(e?.code ?? 'unknown');
  const message = String(e?.message ?? err ?? 'Unknown error');
  const status = e?.customErrorData?.status;
  if (status === 429 || /RESOURCE_EXHAUSTED|429|quota/i.test(message))
    return { kind: 'rate_limited', code, message };
  if (/app.?check|PERMISSION_DENIED|403/i.test(message) || status === 403)
    return { kind: 'app_check', code, message };
  if (
    code === 'no-api-key' ||
    code === 'no-app-id' ||
    code === 'no-project-id' ||
    code === 'no-model'
  )
    return { kind: 'not_configured', code, message };
  if (code === 'fetch-error' || /Failed to fetch|NetworkError|network/i.test(message))
    return { kind: 'network', code, message };
  if ((code === 'unsupported' || code === 'api-not-enabled') && mode === 'only_on_device')
    return { kind: 'local_unavailable', code, message };
  if (code === 'parse-failed') return { kind: 'malformed_output', code, message };
  return { kind: 'unknown', code, message };
}

export class HybridAIService {
  private cloudCalls: number[] = [];

  constructor(
    private readonly factory: ModelFactory,
    private readonly deps: HybridAIDeps,
  ) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private takeCloudToken(): boolean {
    const limit = this.deps.cloudCallsPerMinute ?? 12;
    const t = this.now();
    this.cloudCalls = this.cloudCalls.filter((x) => t - x < 60_000);
    if (this.cloudCalls.length >= limit) return false;
    this.cloudCalls.push(t);
    return true;
  }

  /** Must be called from a user gesture (button click). May download the on-device model. */
  async initializeOnDevice(
    onProgress?: (p: number) => void,
  ): Promise<{ ok: boolean; message: string }> {
    const m = this.factory.model('classify', 'prefer_on_device');
    if (!m.initializeDeviceModel)
      return { ok: false, message: 'initializeDeviceModel is not available in this SDK build.' };
    try {
      await m.initializeDeviceModel(onProgress);
      return { ok: true, message: 'On-device model initialised.' };
    } catch (err) {
      return { ok: false, message: (err as Error).message ?? String(err) };
    }
  }

  private async attempt<T>(
    task: TaskName,
    mode: InferenceModeValue,
    prompt: string,
  ): Promise<AIResult<T>> {
    const started = this.now();
    const base = { task, mode, timestamp: new Date(started).toISOString() };
    if (mode !== 'only_on_device' && !this.takeCloudToken()) {
      return {
        ...base,
        ok: false,
        durationMs: 0,
        retryLater: true,
        error: {
          kind: 'rate_limited',
          code: 'client-rate-limit',
          message: 'Local rate limit reached; will retry shortly.',
        },
      };
    }
    if (mode === 'only_on_device' && !this.factory.onDeviceApiPresent()) {
      return {
        ...base,
        ok: false,
        durationMs: 0,
        retryLater: true,
        error: {
          kind: 'local_unavailable',
          code: 'prompt-api-missing',
          message:
            'Chrome built-in AI (Prompt API) is not available in this browser, so no on-device request was made.',
        },
      };
    }
    let lastErr: unknown = null;
    for (let tries = 0; tries < 2; tries++) {
      try {
        const result = await this.factory.model(task, mode).generateContent(prompt);
        const source = mapSource(result.response.inferenceSource);
        if (mode === 'only_on_device' && source !== 'on_device') {
          // Defence in depth: an on-device-only request must not be satisfied by the cloud.
          return {
            ...base,
            ok: false,
            durationMs: this.now() - started,
            retryLater: false,
            error: {
              kind: 'policy_violation',
              code: 'unexpected-source',
              message: `On-device-only request reported source "${source}". Result discarded.`,
            },
          };
        }
        const parsed = VALIDATORS[task].safeParse(parseModelJson(result.response.text()));
        if (!parsed.success) {
          lastErr = Object.assign(
            new Error(`Malformed ${task} output: ${parsed.error.issues[0]?.message ?? ''}`),
            { code: 'parse-failed' },
          );
          continue; // one retry for malformed structured output
        }
        return {
          ...base,
          ok: true,
          output: parsed.data as T,
          source,
          model:
            source === 'in_cloud'
              ? this.factory.cloudModelName
              : source === 'on_device'
                ? ON_DEVICE_MODEL_LABEL
                : 'unknown',
          durationMs: this.now() - started,
        };
      } catch (err) {
        lastErr =
          err instanceof SyntaxError || /not valid JSON/.test(String((err as Error)?.message))
            ? Object.assign(new Error((err as Error).message), { code: 'parse-failed' })
            : err;
        const kind = classifyError(lastErr, mode).kind;
        if (kind !== 'malformed_output') break;
      }
    }
    const error = classifyError(lastErr, mode);
    return {
      ...base,
      ok: false,
      durationMs: this.now() - started,
      error,
      retryLater: ['local_unavailable', 'offline', 'rate_limited', 'network'].includes(error.kind),
    };
  }

  private log<T>(r: AIResult<T>): AIResult<T> {
    this.deps.onLog?.(r);
    return r;
  }

  async run<T>(task: TaskName, prompts: PromptPair): Promise<AIResult<T>> {
    const consent = this.deps.consent();
    const online = this.deps.isOnline();

    if (consent === 'allow') {
      // Genuine SDK hybrid routing. The prompt may go to the cloud, so use the minimised one.
      const r = await this.attempt<T>(task, 'prefer_on_device', prompts.cloud);
      if (!r.ok && !online)
        return this.log({ ...r, retryLater: true, error: { ...r.error, kind: 'offline' } });
      return this.log(r);
    }

    const local = this.log(await this.attempt<T>(task, 'only_on_device', prompts.local));
    if (local.ok || consent === 'deny') return local;
    if (!online) {
      return {
        ...local,
        retryLater: true,
        error: {
          kind: 'offline',
          code: 'offline',
          message: 'Offline and the on-device model is unavailable. Queued.',
        },
      };
    }
    const granted =
      (await this.deps.requestCloudConsent?.(task, prompts.cloudDataDescription)) ?? false;
    if (!granted) {
      return {
        ...local,
        mode: 'only_in_cloud',
        retryLater: false,
        error: {
          kind: 'cloud_consent_denied',
          code: 'consent',
          message: 'Cloud inference was not approved. Nothing was uploaded.',
        },
      };
    }
    return this.log(await this.attempt<T>(task, 'only_in_cloud', prompts.cloud));
  }

  /** Force a specific mode (used by the hybrid demo panel to show both paths side by side). */
  async runWithMode<T>(
    task: TaskName,
    mode: InferenceModeValue,
    prompt: string,
  ): Promise<AIResult<T>> {
    if (mode !== 'only_on_device' && this.deps.consent() === 'deny') {
      return {
        task,
        mode,
        ok: false,
        durationMs: 0,
        timestamp: new Date(this.now()).toISOString(),
        retryLater: false,
        error: {
          kind: 'cloud_consent_denied',
          code: 'consent',
          message: 'Cloud AI is disabled in your privacy settings.',
        },
      };
    }
    return this.log(await this.attempt<T>(task, mode, prompt));
  }
}

export { JSON_SCHEMAS };
