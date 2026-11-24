#!/usr/bin/env node
/**
 * M2: validates the Firebase web config before you run or build against a real project.
 *
 *   pnpm check:env                 apps/web/.env.local + .firebaserc (local development)
 *   pnpm check:env --production    same file, deploy rules (App Check site key required)
 *   pnpm check:env --ci            reads process.env instead (GitHub Actions deploy, M3)
 *
 * Prints variable names only, never values.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseEnv, validateEnv } from './lib/env.mjs';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const ci = args.includes('--ci');
const target = ci || args.includes('--production') ? 'production' : 'development';
const envPath = join(root, 'apps/web/.env.local');
const rcPath = join(root, '.firebaserc');

let env;
if (ci) {
  env = process.env;
} else if (existsSync(envPath)) {
  env = parseEnv(readFileSync(envPath, 'utf8'));
} else {
  console.error('apps/web/.env.local not found. Run: pnpm setup:firebase --project <id>');
  console.error('(Without it the app runs in Local demo mode, which needs no Firebase.)');
  process.exit(1);
}
const firebaserc =
  !ci && existsSync(rcPath)
    ? (JSON.parse(readFileSync(rcPath, 'utf8')).projects?.default ?? '')
    : ci
      ? undefined
      : '';

const { errors, warnings } = validateEnv(env, { target, firebaserc });
for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s) in the ${target} Firebase config.`);
  process.exit(1);
}
console.log(
  `Firebase config OK for ${target} (project ${env.VITE_FIREBASE_PROJECT_ID}, App Check: ${
    env.VITE_RECAPTCHA_SITE_KEY ? env.VITE_APPCHECK_PROVIDER || 'recaptcha-v3' : 'debug token'
  }).`,
);
