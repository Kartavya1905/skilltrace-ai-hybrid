import { readFileSync } from 'node:fs';
import { crc32, inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { SKILLTRACE_EXTENSION_ID } from '../../packages/shared/src/extension';
// @ts-expect-error plain ESM script helpers without type declarations
import { extensionIdFromKey } from '../../scripts/lib/extension-id.mjs';
// @ts-expect-error plain ESM script helpers without type declarations
import { createZip } from '../../scripts/lib/zip.mjs';

describe('pinned extension ID', () => {
  const pinned = JSON.parse(readFileSync('apps/extension/extension-key.json', 'utf8')) as {
    id: string;
    key: string;
  };

  it('is derived from the committed public key and matches the shared constant', () => {
    expect(extensionIdFromKey(pinned.key)).toBe(pinned.id);
    expect(pinned.id).toBe(SKILLTRACE_EXTENSION_ID);
    expect(pinned.id).toMatch(/^[a-p]{32}$/);
  });

  it('commits only a public key', () => {
    expect(readFileSync('apps/extension/extension-key.json', 'utf8')).not.toMatch(/PRIVATE/);
  });
});

/** Reads entries back through the central directory, like an unzip tool would. */
function readZip(zip: Buffer) {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const out: Record<string, Buffer> = {};
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(p)).toBe(0x02014b50);
    const method = zip.readUInt16LE(p + 10);
    const crc = zip.readUInt32LE(p + 16);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const body = zip.subarray(dataStart, dataStart + size);
    const data = method === 8 ? inflateRawSync(body) : Buffer.from(body);
    expect(crc32(data)).toBe(crc);
    out[name] = data;
    p += 46 + nameLen;
  }
  return out;
}

describe('zip writer', () => {
  it('round-trips compressed and stored entries with nested paths', () => {
    const big = Buffer.from('const x = 1;\n'.repeat(500));
    const tiny = Buffer.from([1, 2, 3]);
    const files = readZip(
      createZip([
        { name: 'manifest.json', data: big },
        { name: 'icons/icon16.png', data: tiny },
      ]),
    );
    expect(Object.keys(files)).toEqual(['manifest.json', 'icons/icon16.png']);
    expect(files['manifest.json']!.equals(big)).toBe(true);
    expect(files['icons/icon16.png']!.equals(tiny)).toBe(true);
  });

  it('is deterministic', () => {
    const entries = [{ name: 'a.txt', data: Buffer.from('hello') }];
    expect(createZip(entries).equals(createZip(entries))).toBe(true);
  });
});
