/**
 * Chrome extension ID helpers. An unpacked extension whose manifest has a `key` (base64 DER
 * SubjectPublicKeyInfo) always gets the same ID: the first 16 bytes of SHA-256(key) written in
 * hex with the digits 0-f mapped to the letters a-p.
 */
import { createHash } from 'node:crypto';

export function extensionIdFromKey(base64Key) {
  const der = Buffer.from(base64Key, 'base64');
  const hex = createHash('sha256').update(der).digest('hex').slice(0, 32);
  return [...hex].map((h) => String.fromCharCode(97 + parseInt(h, 16))).join('');
}
