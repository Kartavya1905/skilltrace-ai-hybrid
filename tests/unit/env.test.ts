import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script helper without type declarations
import { envFromSdkConfig, mergeEnv, parseEnv, validateEnv } from '../../scripts/lib/env.mjs';

const good = {
  VITE_FIREBASE_API_KEY: 'AIza' + 'x'.repeat(35),
  VITE_FIREBASE_AUTH_DOMAIN: 'skilltrace-demo.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'skilltrace-demo',
  VITE_FIREBASE_STORAGE_BUCKET: 'skilltrace-demo.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789012',
  VITE_FIREBASE_APP_ID: '1:123456789012:web:abc123def456',
  VITE_RECAPTCHA_SITE_KEY: '6L' + 'a'.repeat(38),
};

describe('env helpers', () => {
  it('parses dotenv text with comments and quotes', () => {
    expect(parseEnv('# c\nA=1\nB="two"\n\nC=\nbad line\n')).toEqual({ A: '1', B: 'two', C: '' });
  });

  it('merges values into a template, keeping comments and order', () => {
    const out = mergeEnv('# head\nA=\nB=keep\n', { A: 'x', NEW: 'y' });
    expect(out).toBe('# head\nA=x\nB=keep\nNEW=y\n');
  });

  it('maps SDK config keys to VITE_* names', () => {
    expect(envFromSdkConfig({ apiKey: 'k', projectId: 'p', measurementId: 'm' })).toEqual({
      VITE_FIREBASE_API_KEY: 'k',
      VITE_FIREBASE_PROJECT_ID: 'p',
    });
  });

  it('accepts a complete config', () => {
    expect(validateEnv(good, { target: 'production', firebaserc: 'skilltrace-demo' })).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it('rejects placeholders, mismatched ids and a wrong .firebaserc', () => {
    const { errors } = validateEnv(
      {
        ...good,
        VITE_FIREBASE_PROJECT_ID: 'your-project',
        VITE_FIREBASE_APP_ID: '1:999999:web:ab',
      },
      { firebaserc: 'other' },
    );
    expect(errors.join('\n')).toMatch(/placeholder/);
    expect(errors.join('\n')).toMatch(/does not belong/);
    expect(errors.join('\n')).toMatch(/\.firebaserc/);
  });

  it('requires an App Check site key and no emulators for a deployed build', () => {
    const { errors } = validateEnv(
      { ...good, VITE_RECAPTCHA_SITE_KEY: '', VITE_USE_EMULATORS: 'true' },
      { target: 'production' },
    );
    expect(errors).toHaveLength(2);
  });

  it('warns in development when App Check is missing (AI Logic would be rejected)', () => {
    const { errors, warnings } = validateEnv({ ...good, VITE_RECAPTCHA_SITE_KEY: '' });
    expect(errors).toEqual([]);
    expect(warnings.join()).toMatch(/App Check/);
    expect(
      validateEnv({
        ...good,
        VITE_RECAPTCHA_SITE_KEY: '',
        VITE_APPCHECK_DEBUG: 'true',
        VITE_APPCHECK_DEBUG_TOKEN: '0f8fad5b-d9cb-469f-a165-70867728950e',
      }).warnings,
    ).toEqual([]);
  });
});

describe('App Check debug token', () => {
  it('accepts a console-generated UUID and rejects anything else', () => {
    const dev = { ...good, VITE_APPCHECK_DEBUG: 'true' };
    expect(
      validateEnv({ ...dev, VITE_APPCHECK_DEBUG_TOKEN: '0f8fad5b-d9cb-469f-a165-70867728950e' }),
    ).toEqual({ errors: [], warnings: [] });
    expect(validateEnv({ ...dev, VITE_APPCHECK_DEBUG_TOKEN: 'abc' }).errors).toHaveLength(1);
    expect(validateEnv(dev).warnings.join()).toMatch(/debug token|DEBUG_TOKEN/);
  });
});
