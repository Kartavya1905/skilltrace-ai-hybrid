/**
 * Firebase web config helpers shared by setup-firebase-env.mjs and check-env.mjs.
 * Pure functions only (no I/O) so they are unit-tested in tests/unit/env.test.ts.
 */

/** Maps Firebase SDK config keys to the VITE_* variables read by apps/web/src/lib/firebase.ts. */
export const SDK_TO_ENV = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
};

/** Parses a dotenv file: KEY=value lines, # comments, optional surrounding quotes. */
export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

/**
 * Rewrites a dotenv template with new values: existing keys keep their position and comments,
 * keys not in the template are appended. Values are never quoted (Firebase config has no spaces).
 */
export function mergeEnv(template, values) {
  const pending = new Map(Object.entries(values));
  const lines = template.split(/\r?\n/).map((raw) => {
    const m = /^\s*([A-Z0-9_]+)\s*=/.exec(raw);
    if (!m || !pending.has(m[1])) return raw;
    const v = pending.get(m[1]);
    pending.delete(m[1]);
    return `${m[1]}=${v}`;
  });
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  for (const [k, v] of pending) lines.push(`${k}=${v}`);
  return lines.join('\n') + '\n';
}

/** Converts an SDK config object (from `firebase apps:sdkconfig`) to VITE_* values. */
export function envFromSdkConfig(sdk) {
  const out = {};
  for (const [k, envKey] of Object.entries(SDK_TO_ENV)) {
    if (typeof sdk[k] === 'string' && sdk[k]) out[envKey] = sdk[k];
  }
  return out;
}

/**
 * Validates a parsed env. Returns { errors, warnings }; errors block a real-project build,
 * warnings flag features that will not work (e.g. AI Logic without App Check).
 * `target` is 'development' (local .env.local) or 'production' (CI deploy build).
 */
export function validateEnv(env, { target = 'development', firebaserc } = {}) {
  const errors = [];
  const warnings = [];
  const get = (k) => (env[k] ?? '').trim();

  for (const k of Object.values(SDK_TO_ENV)) if (!get(k)) errors.push(`${k} is empty`);

  const projectId = get('VITE_FIREBASE_PROJECT_ID');
  const checks = [
    ['VITE_FIREBASE_API_KEY', /^AIza[0-9A-Za-z_-]{35}$/, 'should look like AIza… (39 characters)'],
    ['VITE_FIREBASE_PROJECT_ID', /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, 'is not a valid project ID'],
    ['VITE_FIREBASE_MESSAGING_SENDER_ID', /^\d{6,}$/, 'should be numeric'],
    ['VITE_FIREBASE_APP_ID', /^1:\d+:web:[0-9a-f]+$/, 'should look like 1:<number>:web:<hex>'],
  ];
  for (const [k, re, msg] of checks) if (get(k) && !re.test(get(k))) errors.push(`${k} ${msg}`);

  if (projectId === 'your-project')
    errors.push('VITE_FIREBASE_PROJECT_ID is still the placeholder');
  const sender = get('VITE_FIREBASE_MESSAGING_SENDER_ID');
  const appId = get('VITE_FIREBASE_APP_ID');
  if (sender && appId && !appId.startsWith(`1:${sender}:`))
    errors.push('VITE_FIREBASE_APP_ID does not belong to VITE_FIREBASE_MESSAGING_SENDER_ID');
  const authDomain = get('VITE_FIREBASE_AUTH_DOMAIN');
  if (projectId && authDomain && !authDomain.startsWith(`${projectId}.`))
    warnings.push(`VITE_FIREBASE_AUTH_DOMAIN (${authDomain}) is not ${projectId}.firebaseapp.com`);
  if (firebaserc !== undefined && firebaserc !== projectId)
    errors.push(`.firebaserc default project (${firebaserc || 'none'}) differs from ${projectId}`);

  const provider = get('VITE_APPCHECK_PROVIDER') || 'recaptcha-v3';
  if (!['recaptcha-v3', 'recaptcha-enterprise'].includes(provider))
    errors.push(`VITE_APPCHECK_PROVIDER must be recaptcha-v3 or recaptcha-enterprise`);
  const siteKey = get('VITE_RECAPTCHA_SITE_KEY');
  const debug = get('VITE_APPCHECK_DEBUG') === 'true';
  if (target === 'production') {
    if (!siteKey) errors.push('VITE_RECAPTCHA_SITE_KEY is required for a deployed build');
    if (debug) warnings.push('VITE_APPCHECK_DEBUG=true is ignored in production builds');
    if (get('VITE_USE_EMULATORS') === 'true')
      errors.push('VITE_USE_EMULATORS=true must not be used for a deployed build');
  } else if (!siteKey && !debug) {
    warnings.push(
      'No App Check: set VITE_RECAPTCHA_SITE_KEY or VITE_APPCHECK_DEBUG=true, or AI Logic calls are rejected',
    );
  }
  if (siteKey && !/^[0-9A-Za-z_-]{40}$/.test(siteKey))
    warnings.push(
      'VITE_RECAPTCHA_SITE_KEY does not look like a reCAPTCHA site key (40 characters)',
    );
  return { errors, warnings };
}
