#!/usr/bin/env node
/** Fails if tracked files contain likely secrets or real .env files are tracked. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const PATTERNS = [
  [/AIza[0-9A-Za-z_-]{35}/, 'Google API key'],
  [/gh[pousr]_[0-9A-Za-z]{36,}/, 'GitHub token'],
  [/github_pat_[0-9A-Za-z_]{40,}/, 'GitHub fine-grained token'],
  [/-----BEGIN (RSA |EC |)PRIVATE KEY-----/, 'private key'],
  [/"private_key"\s*:\s*"-----BEGIN/, 'service account key'],
  [/sk-[A-Za-z0-9]{32,}/, 'API secret key'],
  [/xox[baprs]-[0-9A-Za-z-]{10,}/, 'Slack token'],
];
const SKIP = /(^|\/)(pnpm-lock\.yaml|.*\.(png|webm|jpg|ico))$/;
let problems = 0;
for (const f of files) {
  if (/(^|\/)\.env(\..+)?$/.test(f) && !f.endsWith('.env.example')) {
    console.error(`Tracked env file: ${f}`);
    problems++;
  }
  if (SKIP.test(f) || f === 'scripts/check-secrets.mjs') continue;
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  for (const [re, label] of PATTERNS) {
    if (re.test(text)) {
      console.error(`Possible ${label} in ${f}`);
      problems++;
    }
  }
}
if (problems) {
  console.error(`${problems} potential secret(s) found.`);
  process.exit(1);
}
console.log(`No secrets found in ${files.length} tracked files.`);
