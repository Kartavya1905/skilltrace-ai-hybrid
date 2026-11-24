/**
 * Builds the MV3 extension into apps/extension/dist (load it via chrome://extensions > Load unpacked).
 * SKILLTRACE_DASHBOARD_ORIGINS: comma-separated dashboard origins allowed to talk to the extension,
 * e.g. "http://localhost:5310,https://your-project.web.app". Wildcard subdomains are not allowed
 * by Chrome for externally_connectable, so list exact origins.
 * SKILLTRACE_VERSION: release version (x.y.z, e.g. from a git tag); defaults to package.json.
 * The manifest `key` from extension-key.json pins the extension ID on every install.
 */
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const origins = (process.env.SKILLTRACE_DASHBOARD_ORIGINS ?? 'http://localhost:5310')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);
for (const o of origins) {
  if (!/^https?:\/\/[^*/]+$/.test(o))
    throw new Error(`Invalid dashboard origin "${o}" (no wildcards or paths).`);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = {
  bundle: true,
  minify: false,
  sourcemap: true,
  target: 'chrome120',
  logLevel: 'info',
};
await build({
  ...common,
  entryPoints: [join(here, 'src/background.ts')],
  outfile: join(dist, 'background.js'),
  format: 'esm',
});
await build({
  ...common,
  entryPoints: [join(here, 'src/content.ts')],
  outfile: join(dist, 'content.js'),
  format: 'iife',
});
await build({
  ...common,
  entryPoints: [join(here, 'src/popup.ts')],
  outfile: join(dist, 'popup.js'),
  format: 'iife',
});

const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8'));
const version = process.env.SKILLTRACE_VERSION || pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid version "${version}" (use x.y.z).`);
manifest.version = version;
manifest.key = JSON.parse(readFileSync(join(here, 'extension-key.json'), 'utf8')).key;
manifest.externally_connectable = { matches: origins.map((o) => `${o}/*`) };
if (process.env.SKILLTRACE_E2E === '1') {
  // Test build only: automated browsers cannot click Chrome's permission prompt, so the
  // localhost permission is granted up front. Never use this build for real browsing.
  manifest.host_permissions = ['http://localhost/*'];
  manifest.name += ' (E2E test build)';
}
writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));
cpSync(join(here, 'src/popup.html'), join(dist, 'popup.html'));
cpSync(join(here, 'icons'), join(dist, 'icons'), { recursive: true });
writeFileSync(join(dist, 'dashboard-origins.json'), JSON.stringify(origins));
console.log(`Extension ${version} built to ${dist}\nDashboard origins: ${origins.join(', ')}`);
