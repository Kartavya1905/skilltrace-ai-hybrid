import { describe, expect, it } from 'vitest';
import { withSpokenText } from '../src/lib/actions';

describe('withSpokenText', () => {
  it('puts the transcript first, labelled, ahead of the description', () => {
    const out = withSpokenText('Learn Python basics.', 'Today we write a  Python\nfunction.');
    expect(out).toBe(
      'Spoken in the video: Today we write a Python function.\n\nLearn Python basics.',
    );
  });

  it('keeps the excerpt unchanged when nothing was said', () => {
    expect(withSpokenText('Description only', '   ')).toBe('Description only');
  });

  it('stays within the stored excerpt limit', () => {
    const out = withSpokenText('d'.repeat(2000), 'word '.repeat(1000));
    expect(out.length).toBeLessThanOrEqual(1500);
    expect(out.startsWith('Spoken in the video: word')).toBe(true);
  });
});
