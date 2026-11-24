#!/usr/bin/env node
/**
 * M2: fills apps/web/.env.local and .firebaserc from your Firebase project, using the
 * Firebase CLI you are already signed in to (`pnpm exec firebase login`).
 *
 *   pnpm setup:firebase --project <project-id> [--app <web-app-id>] [--create-app]
 *
 * Only the public web config (VITE_FIREBASE_*) is written; App Check and other settings
 * already in .env.local are kept. Values are never printed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { envFromSdkConfig, mergeEnv, parseEnv, validateEnv } from './lib/env.mjs';

const root = resolve(import.meta.dirname, '..');
const envPath = join(root, 'apps/web/.env.local');
const rcPath = join(root, '.firebaserc');
const cli = join(root, 'node_modules/firebase-tools/lib/bin/firebase.js');

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? '') : undefined;
};
const fail = (msg) => {
  console.error(`\n${msg}`);
  process.exit(1);
};

const rcProject = existsSync(rcPath)
  ? JSON.parse(readFileSync(rcPath, 'utf8')).projects?.default
  : undefined;
const project = flag('project') || rcProject;
if (!project)
  fail('Pass --project <your-firebase-project-id> (Firebase console > Project settings).');

function firebase(...cmd) {
  let out;
  try {
    out = execFileSync(process.execPath, [cli, ...cmd, '--project', project, '--json'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    out = e.stdout || '';
    if (!out.trim()) fail(`Firebase CLI failed: ${(e.stderr || e.message).trim()}`);
  }
  const json = JSON.parse(out.slice(out.indexOf('{')));
  if (json.status !== 'success') {
    const msg = String(json.error ?? 'unknown error');
    if (/auth|login|credential/i.test(msg)) fail('Not signed in. Run:  pnpm exec firebase login');
    fail(
      `Firebase CLI: ${msg}\nCheck that project "${project}" exists and this account can open it:` +
        '\n  pnpm exec firebase projects:list',
    );
  }
  return json.result;
}

console.log(`Project: ${project}`);
let apps = firebase('apps:list', 'WEB');
let appId = flag('app');
if (!appId) {
  if (apps.length === 0 && args.includes('--create-app')) {
    console.log('Creating web app "SkillTrace AI Web"…');
    appId = firebase('apps:create', 'WEB', 'SkillTrace AI Web').appId;
  } else if (apps.length === 0) {
    fail('This project has no web app. Add one in the console, or rerun with --create-app.');
  } else if (apps.length > 1) {
    console.log('Several web apps found. Rerun with --app <id>:');
    for (const a of apps) console.log(`  ${a.appId}  ${a.displayName ?? ''}`);
    process.exit(1);
  } else {
    appId = apps[0].appId;
  }
}

const result = firebase('apps:sdkconfig', 'WEB', appId);
const sdk = result.sdkConfig ?? JSON.parse(result.fileContents.match(/\{[\s\S]*\}/)[0]);
const values = envFromSdkConfig(sdk);

const template = existsSync(envPath)
  ? readFileSync(envPath, 'utf8')
  : readFileSync(join(root, '.env.example'), 'utf8');
writeFileSync(envPath, mergeEnv(template, values));
writeFileSync(rcPath, JSON.stringify({ projects: { default: project } }, null, 2) + '\n');
console.log(`Wrote ${Object.keys(values).length} Firebase values to apps/web/.env.local`);
console.log(`Wrote .firebaserc (default: ${project})`);

const { errors, warnings } = validateEnv(parseEnv(readFileSync(envPath, 'utf8')), {
  firebaserc: project,
});
for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
console.log(errors.length ? '\nFix the errors above.' : '\nNext: pnpm check:env, then pnpm dev');
process.exit(errors.length ? 1 : 0);
