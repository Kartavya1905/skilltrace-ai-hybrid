#!/usr/bin/env node
/**
 * M4: zips the built extension (apps/extension/dist) into
 * apps/extension/release/skilltrace-extension-v<version>.zip for a GitHub Release.
 *
 *   SKILLTRACE_DASHBOARD_ORIGINS=https://<project>.web.app,... SKILLTRACE_VERSION=1.2.3 \
 *     pnpm build:extension && pnpm package:extension
 *
 * Refuses to package an E2E test build (it carries a test-only localhost host permission).
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createZip } from './lib/zip.mjs';
import { extensionIdFromKey } from './lib/extension-id.mjs';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'apps/extension/dist');
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));

if (manifest.host_permissions?.length || /E2E/.test(manifest.name))
  throw new Error('dist is an E2E test build. Rebuild with: pnpm build:extension');
if (!manifest.key)
  throw new Error('manifest.key is missing; the extension ID would not be stable.');

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push({ name: relative(dist, path).split('\\').join('/'), data: readFileSync(path) });
  }
})(dist);

const outDir = join(root, 'apps/extension/release');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `skilltrace-extension-v${manifest.version}.zip`);
writeFileSync(out, createZip(files));

const origins = JSON.parse(readFileSync(join(dist, 'dashboard-origins.json'), 'utf8'));
console.log(`Packaged ${files.length} files -> ${relative(root, out)}`);
console.log(`Version ${manifest.version}, extension ID ${extensionIdFromKey(manifest.key)}`);
console.log(`Dashboard origins: ${origins.join(', ')}`);
