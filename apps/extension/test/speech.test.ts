import { describe, expect, it } from 'vitest';
import { MAX_SPEECH_CLIPS, SpeechClipSchema, pageIdFromUrl, sanitizeUrl } from '@skilltrace/shared';
import { DEMO_SPEECH_PLAN, SPEECH_PLAN, shouldStartClip } from '../src/speech';

describe('speech sampling schedule', () => {
  it('waits for the intro, then spaces clips by playback time', () => {
    expect(shouldStartClip(9, 0, null, SPEECH_PLAN)).toBe(false);
    expect(shouldStartClip(10, 0, null, SPEECH_PLAN)).toBe(true);
    // first clip ended at 30 s of playback; next one 60 s later
    expect(shouldStartClip(89, 1, 30, SPEECH_PLAN)).toBe(false);
    expect(shouldStartClip(90, 1, 30, SPEECH_PLAN)).toBe(true);
  });

  it(`never takes more than ${MAX_SPEECH_CLIPS} clips per session`, () => {
    expect(shouldStartClip(10_000, MAX_SPEECH_CLIPS, 0, SPEECH_PLAN)).toBe(false);
  });

  it('demo plan samples quickly for recordings and tests', () => {
    expect(shouldStartClip(2, 0, null, DEMO_SPEECH_PLAN)).toBe(true);
  });
});

describe('speech clip validation', () => {
  const clip = { atSec: 12, durationSec: 20, mimeType: 'audio/webm', data: 'T2dnUwACAAAAAAAAAAA=' };
  it('accepts a well-formed clip', () => {
    expect(SpeechClipSchema.safeParse(clip).success).toBe(true);
  });
  it('rejects long clips, other formats and non-base64 data', () => {
    expect(SpeechClipSchema.safeParse({ ...clip, durationSec: 45 }).success).toBe(false);
    expect(SpeechClipSchema.safeParse({ ...clip, mimeType: 'video/mp4' }).success).toBe(false);
    expect(SpeechClipSchema.safeParse({ ...clip, data: '<script>alert(1)</script>' }).success).toBe(
      false,
    );
  });
});

describe('page identity for single-page video sites', () => {
  it('gives each YouTube video its own page ID', () => {
    const a = pageIdFromUrl('https://www.youtube.com/watch?v=rfscVS0vtbw');
    const b = pageIdFromUrl('https://www.youtube.com/watch?v=PkZNo7MFNFg');
    expect(a).not.toBe(b);
  });
  it('ignores other query parameters (timestamps, playlists, tracking)', () => {
    expect(pageIdFromUrl('https://www.youtube.com/watch?v=rfscVS0vtbw&t=42s&list=PL1')).toBe(
      pageIdFromUrl('https://www.youtube.com/watch?v=rfscVS0vtbw'),
    );
  });
  it('still drops query strings everywhere else, and never stores them', () => {
    expect(pageIdFromUrl('https://docs.python.org/3/tutorial/?session=abc')).toBe(
      pageIdFromUrl('https://docs.python.org/3/tutorial/'),
    );
    expect(sanitizeUrl('https://www.youtube.com/watch?v=rfscVS0vtbw')).toBe(
      'https://www.youtube.com/watch',
    );
  });
});
