/**
 * Speech transcription routing: on-device (Chrome Prompt API audio) first, cloud only when the
 * learner's policy allows it, and the reported source is never invented.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  HybridAIService,
  SkillTraceAI,
  TRANSCRIBE_INSTRUCTION,
  type AudioInput,
  type ModelFactory,
  type PromptPart,
} from '../src';

const clips: AudioInput[] = [
  { mimeType: 'audio/webm', data: 'T2dnUwACAAAAAAAAAAA=', durationSec: 20 },
  { mimeType: 'audio/webm', data: 'T2dnUwACAAAAAAAAAAB=', durationSec: 18 },
];

function setup(opts: {
  consent: 'allow' | 'ask' | 'deny';
  onDevice?: (instruction: string, c: AudioInput[]) => Promise<string>;
  cloud?: { text: string; source?: string };
  grant?: boolean;
  online?: boolean;
}) {
  const cloudCalls: PromptPart[][] = [];
  const factory: ModelFactory = {
    cloudModelName: 'test-cloud-model',
    onDeviceApiPresent: () => !!opts.onDevice,
    ...(opts.onDevice ? { onDeviceAudio: opts.onDevice } : {}),
    model: () => ({
      async generateContent(prompt) {
        cloudCalls.push(prompt as PromptPart[]);
        const r = opts.cloud ?? { text: '{"transcript":""}', source: 'in_cloud' };
        return { response: { text: () => r.text, inferenceSource: r.source } };
      },
    }),
  };
  const requestCloudConsent = vi.fn(
    async (_task: string, _description: string) => opts.grant ?? false,
  );
  const ai = new SkillTraceAI(
    new HybridAIService(factory, {
      consent: () => opts.consent,
      isOnline: () => opts.online ?? true,
      requestCloudConsent,
    }),
    () => true,
  );
  return { ai, cloudCalls, requestCloudConsent };
}

describe('speech transcription routing', () => {
  it('uses the on-device model first and labels it on_device', async () => {
    const onDevice = vi.fn(async () => 'In Python a function is defined with def.');
    const { ai, cloudCalls } = setup({ consent: 'allow', onDevice });
    const r = await ai.transcribeSpeech(clips);
    expect(r.ok && r.source).toBe('on_device');
    expect(r.ok && r.output.transcript).toMatch(/Python/);
    expect(onDevice).toHaveBeenCalledWith(TRANSCRIBE_INSTRUCTION, clips);
    expect(cloudCalls).toHaveLength(0);
  });

  it('deny: never uploads audio when on-device is unavailable', async () => {
    const { ai, cloudCalls } = setup({ consent: 'deny' });
    const r = await ai.transcribeSpeech(clips);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.kind).toBe('local_unavailable');
    expect(cloudCalls).toHaveLength(0);
  });

  it('ask: asks first, and uploads nothing on a no', async () => {
    const { ai, cloudCalls, requestCloudConsent } = setup({ consent: 'ask', grant: false });
    const r = await ai.transcribeSpeech(clips);
    expect(requestCloudConsent).toHaveBeenCalledOnce();
    expect(requestCloudConsent.mock.calls[0]![1]).toMatch(
      /2 short audio clip\(s\), about 38 seconds/,
    );
    expect(!r.ok && r.error.kind).toBe('cloud_consent_denied');
    expect(cloudCalls).toHaveLength(0);
  });

  it('ask + yes: sends the clips as inline audio and reports the SDK source', async () => {
    const { ai, cloudCalls } = setup({
      consent: 'ask',
      grant: true,
      cloud: { text: '{"transcript":"JavaScript promises and async await"}', source: 'in_cloud' },
    });
    const r = await ai.transcribeSpeech(clips);
    expect(r.ok && r.source).toBe('in_cloud');
    expect(r.ok && r.model).toBe('test-cloud-model');
    const parts = cloudCalls[0]!;
    expect(parts[0]).toEqual({ text: TRANSCRIBE_INSTRUCTION });
    expect(parts.slice(1)).toEqual(
      clips.map((c) => ({ inlineData: { mimeType: 'audio/webm', data: c.data } })),
    );
  });

  it('allow: falls back to the cloud when on-device audio input is unsupported', async () => {
    const onDevice = vi.fn(async () => {
      throw Object.assign(new Error('On-device audio input is "unavailable"'), {
        code: 'unsupported',
      });
    });
    const { ai, cloudCalls, requestCloudConsent } = setup({
      consent: 'allow',
      onDevice,
      cloud: { text: '{"transcript":"SQL joins"}', source: 'in_cloud' },
    });
    const r = await ai.transcribeSpeech(clips);
    expect(r.ok && r.output.transcript).toBe('SQL joins');
    expect(requestCloudConsent).not.toHaveBeenCalled();
    expect(cloudCalls).toHaveLength(1);
  });

  it('never claims a source the SDK did not report', async () => {
    const { ai } = setup({ consent: 'allow', cloud: { text: '{"transcript":"x"}' } });
    const r = await ai.transcribeSpeech(clips);
    expect(r.ok && r.source).toBe('unknown');
  });

  it('offline with no on-device model: queues instead of failing', async () => {
    const { ai, cloudCalls } = setup({ consent: 'allow', online: false });
    const r = await ai.transcribeSpeech(clips);
    expect(!r.ok && r.error.kind).toBe('offline');
    expect(!r.ok && r.retryLater).toBe(true);
    expect(cloudCalls).toHaveLength(0);
  });
});
