/**
 * Stable, deterministic identifiers. Re-uploading the same event must produce the same ID so
 * that Firestore writes are idempotent (set-by-id instead of add).
 */

/** cyrb53: small, fast, non-cryptographic 53-bit string hash. Good enough for dedupe keys. */
export function hash53(input: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(36).padStart(11, '0');
}

/** Random ID for new records (not for dedupe-sensitive events). */
export function randomId(prefix = ''): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return prefix ? `${prefix}_${body}` : body;
}

/** Event IDs are derived from the session and a per-session sequence number. */
export function eventId(sessionId: string, seq: number): string {
  return `${sessionId}_${String(seq).padStart(6, '0')}`;
}

/**
 * Privacy-preserving page identifier: origin + pathname only (query and fragment dropped,
 * so tokens or search terms in URLs are never part of the ID), then hashed.
 */
export function pageIdFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return `page_${hash53(`${u.origin}${u.pathname}`)}`;
  } catch {
    return `page_${hash53(url)}`;
  }
}

/** URL with query string and fragment removed, for display/storage when the user allows it. */
export function sanitizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '';
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}
