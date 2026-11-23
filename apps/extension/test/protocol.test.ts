import { describe, expect, it } from 'vitest';
import { matchPattern, originOf } from '../src/protocol';

describe('extension origin handling', () => {
  it('only allows https pages, plus http on localhost for development', () => {
    expect(originOf('https://docs.python.org/3/tutorial/?q=secret#x')).toBe('https://docs.python.org');
    expect(originOf('http://localhost:5310/lab/extension-demo.html')).toBe('http://localhost:5310');
    expect(originOf('http://example.com/page')).toBeNull();
    expect(originOf('chrome://extensions')).toBeNull();
    expect(originOf('file:///C:/notes.html')).toBeNull();
  });

  it('builds a per-site match pattern (never a broad wildcard)', () => {
    expect(matchPattern('https://docs.python.org')).toBe('https://docs.python.org/*');
    expect(matchPattern('http://localhost:5310')).toBe('http://localhost/*');
  });
});
