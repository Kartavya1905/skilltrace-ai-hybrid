import { describe, expect, it, vi } from 'vitest';
import {
  HybridAIService,
  SkillTraceAI,
  classifyError,
  parseModelJson,
  type InferenceModeValue,
  type ModelFactory,
  type ModelHandle,
} from '../src';

type Behaviour = (
  mode: InferenceModeValue,
  prompt: string,
) => Promise<{ text: string; source?: string }>;

function factory(behaviour: Behaviour) {
  const calls: { mode: InferenceModeValue; prompt: string }[] = [];
  const f: ModelFactory = {
    cloudModelName: 'test-cloud-model',
    onDeviceApiPresent: () => true,
    model: (_task, mode): ModelHandle => ({
      async generateContent(prompt: string) {
        calls.push({ mode, prompt });
        const r = await behaviour(mode, prompt);
        return { response: { text: () => r.text, inferenceSource: r.source } };
      },
    }),
  };
  return { f, calls };
}

const goodClassification = JSON.stringify({
  isLearningContent: true,
  primarySkill: 'Python',
  secondarySkills: [],
  topics: ['Functions', 'Parameters', 'Return Values', 'Variable Scope'],
  contentKind: 'tutorial',
  confidence: 0.91,
});

const localUnavailable = () =>
  Promise.reject(
    Object.assign(
      new Error('Inference mode is ONLY_ON_DEVICE, but an on-device model is not available.'),
      { code: 'unsupported' },
    ),
  );

const input = {
  title: 'Python Functions: Parameters, Return Values and Scope',
  excerpt: 'def greet(name): return name',
  contentType: 'reading',
};

describe('HybridAIService routing and consent', () => {
  it('allow -> PREFER_ON_DEVICE, and reports the SDK-reported source verbatim', async () => {
    const { f, calls } = factory(async () => ({ text: goodClassification, source: 'in_cloud' }));
    const ai = new SkillTraceAI(
      new HybridAIService(f, { consent: () => 'allow', isOnline: () => true }),
      () => true,
    );
    const r = await ai.classifySkills(input);
    expect(calls[0]!.mode).toBe('prefer_on_device');
    expect(r.ok && r.source).toBe('in_cloud');
    expect(r.ok && r.output.primarySkill).toBe('Python');
    expect(r.ok && r.model).toBe('test-cloud-model');
  });

  it('never claims a source the SDK did not report', async () => {
    const { f } = factory(async () => ({ text: goodClassification }));
    const r = await new HybridAIService(f, { consent: () => 'allow', isOnline: () => true }).run(
      'classify',
      { local: 'x', cloud: 'x', cloudDataDescription: '' },
    );
    expect(r.ok && r.source).toBe('unknown');
  });

  it('deny -> ONLY_ON_DEVICE and nothing goes to the cloud when local is unavailable', async () => {
    const { f, calls } = factory(localUnavailable);
    const r = await new HybridAIService(f, { consent: () => 'deny', isOnline: () => true }).run(
      'classify',
      { local: 'L', cloud: 'C', cloudDataDescription: '' },
    );
    expect(calls.map((c) => c.mode)).toEqual(['only_on_device']);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.kind).toBe('local_unavailable');
    expect(!r.ok && r.retryLater).toBe(true);
  });

  it('ask -> tries on-device, asks for consent, then ONLY_IN_CLOUD with the minimised prompt', async () => {
    const { f, calls } = factory(async (mode) =>
      mode === 'only_on_device'
        ? localUnavailable()
        : { text: goodClassification, source: 'in_cloud' },
    );
    const requestCloudConsent = vi.fn(async () => true);
    const ai = new SkillTraceAI(
      new HybridAIService(f, { consent: () => 'ask', isOnline: () => true, requestCloudConsent }),
      () => false,
    );
    const r = await ai.classifySkills(input);
    expect(requestCloudConsent).toHaveBeenCalledOnce();
    expect(calls.map((c) => c.mode)).toEqual(['only_on_device', 'only_in_cloud']);
    expect(calls[1]!.prompt).not.toContain('def greet'); // excerpts disabled -> title only
    expect(calls[0]!.prompt).toContain('def greet'); // local prompt keeps the excerpt on-device
    expect(r.ok && r.source).toBe('in_cloud');
  });

  it('ask + declined consent uploads nothing and returns a failure, not a result', async () => {
    const { f, calls } = factory(localUnavailable);
    const r = await new HybridAIService(f, {
      consent: () => 'ask',
      isOnline: () => true,
      requestCloudConsent: async () => false,
    }).run('classify', {
      local: 'L',
      cloud: 'C',
      cloudDataDescription: 'd',
    });
    expect(calls).toHaveLength(1);
    expect(!r.ok && r.error.kind).toBe('cloud_consent_denied');
  });

  it('offline with no local model queues instead of claiming cloud fallback', async () => {
    const { f } = factory(localUnavailable);
    const consent = vi.fn(async () => true);
    const r = await new HybridAIService(f, {
      consent: () => 'ask',
      isOnline: () => false,
      requestCloudConsent: consent,
    }).run('classify', {
      local: 'L',
      cloud: 'C',
      cloudDataDescription: '',
    });
    expect(consent).not.toHaveBeenCalled();
    expect(!r.ok && r.error.kind).toBe('offline');
    expect(!r.ok && r.retryLater).toBe(true);
  });

  it('local success in ask mode never prompts for consent', async () => {
    const { f } = factory(async () => ({ text: goodClassification, source: 'on_device' }));
    const consent = vi.fn(async () => true);
    const r = await new HybridAIService(f, {
      consent: () => 'ask',
      isOnline: () => true,
      requestCloudConsent: consent,
    }).run('classify', {
      local: 'L',
      cloud: 'C',
      cloudDataDescription: '',
    });
    expect(consent).not.toHaveBeenCalled();
    expect(r.ok && r.source).toBe('on_device');
  });
});

describe('on-device privacy guard', () => {
  it('refuses on-device-only calls when the Prompt API is missing (SDK would use cloud)', async () => {
    const { f, calls } = factory(async () => ({ text: goodClassification, source: 'in_cloud' }));
    const svc = new HybridAIService(
      { ...f, onDeviceApiPresent: () => false },
      { consent: () => 'deny', isOnline: () => true },
    );
    const r = await svc.run('classify', { local: 'L', cloud: 'C', cloudDataDescription: '' });
    expect(calls).toHaveLength(0);
    expect(!r.ok && r.error.code).toBe('prompt-api-missing');
  });

  it('discards an on-device-only result that the SDK says came from the cloud', async () => {
    const { f } = factory(async () => ({ text: goodClassification, source: 'in_cloud' }));
    const r = await new HybridAIService(f, { consent: () => 'deny', isOnline: () => true }).run(
      'classify',
      { local: 'L', cloud: 'C', cloudDataDescription: '' },
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.kind).toBe('policy_violation');
  });
});

describe('structured output validation', () => {
  it('rejects malformed JSON after one retry and returns no output', async () => {
    const { f, calls } = factory(async () => ({
      text: '{"primarySkill": "Python", "confid',
      source: 'on_device',
    }));
    const r = await new HybridAIService(f, { consent: () => 'allow', isOnline: () => true }).run(
      'classify',
      { local: '', cloud: '', cloudDataDescription: '' },
    );
    expect(calls).toHaveLength(2);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.kind).toBe('malformed_output');
  });

  it('rejects schema violations (confidence out of range)', async () => {
    const bad = JSON.stringify({ ...JSON.parse(goodClassification), confidence: 7 });
    const { f } = factory(async () => ({ text: bad, source: 'on_device' }));
    const r = await new HybridAIService(f, { consent: () => 'allow', isOnline: () => true }).run(
      'classify',
      { local: '', cloud: '', cloudDataDescription: '' },
    );
    expect(r.ok).toBe(false);
  });

  it('accepts fenced JSON', () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});

describe('error classification', () => {
  it('maps rate limits, network and App Check failures', () => {
    expect(
      classifyError({ code: 'fetch-error', message: '429 RESOURCE_EXHAUSTED' }, 'prefer_on_device')
        .kind,
    ).toBe('rate_limited');
    expect(
      classifyError({ code: 'fetch-error', message: 'Failed to fetch' }, 'prefer_on_device').kind,
    ).toBe('network');
    expect(
      classifyError(
        { code: 'fetch-error', message: '403 PERMISSION_DENIED App Check token is invalid' },
        'only_in_cloud',
      ).kind,
    ).toBe('app_check');
  });

  it('enforces a client-side cloud rate limit', async () => {
    const { f } = factory(async () => ({ text: goodClassification, source: 'in_cloud' }));
    const svc = new HybridAIService(f, {
      consent: () => 'allow',
      isOnline: () => true,
      cloudCallsPerMinute: 2,
      now: () => 1000,
    });
    const p = { local: '', cloud: '', cloudDataDescription: '' };
    await svc.run('classify', p);
    await svc.run('classify', p);
    const third = await svc.run('classify', p);
    expect(!third.ok && third.error.kind).toBe('rate_limited');
  });
});
