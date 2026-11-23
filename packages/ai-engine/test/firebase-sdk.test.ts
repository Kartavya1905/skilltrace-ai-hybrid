/**
 * Integration test against the REAL firebase/ai SDK (no mocks of the SDK itself).
 * The network is replaced by a stubbed fetch so no request leaves the machine, which lets us
 * verify that:
 *   - our HybridParams are accepted by getGenerativeModel,
 *   - ONLY_ON_DEVICE without Chrome's Prompt API fails (no fabricated result),
 *   - ONLY_IN_CLOUD results carry inferenceSource 'in_cloud' set BY THE SDK, which we report as-is.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { FirebaseModelFactory, hybridParamsFor } from '../src/firebase';
import { HybridAIService } from '../src';

let app: FirebaseApp | null = null;

function makeApp() {
  app = initializeApp(
    { apiKey: 'test-api-key-not-real', appId: '1:000000000000:web:0000000000000000', projectId: 'demo-skilltrace' },
    `test-${Math.random()}`,
  );
  return app;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  if (app) await deleteApp(app);
  app = null;
});

const classification = {
  isLearningContent: true,
  primarySkill: 'Python',
  secondarySkills: [],
  topics: ['Functions'],
  contentKind: 'tutorial',
  confidence: 0.9,
};

describe('firebase/ai SDK integration', () => {
  it('builds hybrid params with JSON schema for both cloud and on-device', () => {
    const p = hybridParamsFor('classify', 'prefer_on_device', 'gemini-3.5-flash-lite');
    expect(p.mode).toBe('prefer_on_device');
    expect(p.inCloudParams?.generationConfig?.responseMimeType).toBe('application/json');
    expect(p.onDeviceParams?.promptOptions?.responseConstraint).toBeDefined();
  });

  it('exposes initializeDeviceModel on the real GenerativeModel', () => {
    const f = new FirebaseModelFactory(makeApp());
    expect(typeof f.model('classify', 'prefer_on_device').initializeDeviceModel).toBe('function');
  });

  it('ONLY_ON_DEVICE without the Prompt API returns local_unavailable, never a result', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const svc = new HybridAIService(new FirebaseModelFactory(makeApp()), { consent: () => 'deny', isOnline: () => true });
    const r = await svc.run('classify', { local: 'Classify: Python functions', cloud: '', cloudDataDescription: '' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.kind).toBe('local_unavailable');
    // Without our guard the real SDK would have sent this to the cloud (no LanguageModel global).
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ONLY_IN_CLOUD reads inferenceSource from the SDK response', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(classification) }] }, finishReason: 'STOP', index: 0 }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const svc = new HybridAIService(new FirebaseModelFactory(makeApp(), 'gemini-3.5-flash-lite'), { consent: () => 'allow', isOnline: () => true });
    const r = await svc.runWithMode('classify', 'only_in_cloud', 'Classify: Python functions');
    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = String((fetchSpy.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('firebasevertexai.googleapis.com');
    expect(url).toContain('gemini-3.5-flash-lite');
    expect(r.ok).toBe(true);
    expect(r.ok && r.source).toBe('in_cloud');
  });

  it('surfaces HTTP 429 from the backend as rate_limited', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { code: 429, message: 'Resource exhausted', status: 'RESOURCE_EXHAUSTED' } }), { status: 429 })),
    );
    const svc = new HybridAIService(new FirebaseModelFactory(makeApp()), { consent: () => 'allow', isOnline: () => true });
    const r = await svc.runWithMode('classify', 'only_in_cloud', 'x');
    expect(!r.ok && r.error.kind).toBe('rate_limited');
  });
});
