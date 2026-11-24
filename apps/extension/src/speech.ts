/**
 * Speech sampling for skill detection (opt-in, off by default).
 *
 * Records a few short audio clips from the tracked <video>/<audio> element itself through
 * HTMLMediaElement.captureStream(): never the microphone, never other tabs. Clips are taken only
 * while the media is actually playing, are capped at MAX_SPEECH_CLIPS per session, and travel to
 * the dashboard once for transcription, which then discards them.
 * Cross-origin media without CORS cannot be captured; then nothing is recorded, silently.
 */
import { MAX_SPEECH_CLIPS, type SpeechClip } from '@skilltrace/shared';

export interface SpeechPlan {
  /** Seconds of playback before the first clip (skips intros). */
  firstAfterSec: number;
  /** Clip length in seconds of playback. */
  clipSec: number;
  /** Seconds of playback between the end of one clip and the start of the next. */
  gapSec: number;
}

export const SPEECH_PLAN: SpeechPlan = { firstAfterSec: 10, clipSec: 20, gapSec: 60 };
export const DEMO_SPEECH_PLAN: SpeechPlan = { firstAfterSec: 2, clipSec: 6, gapSec: 4 };

/** Shortest clip worth keeping (a clip stops early when the learner pauses). */
export const MIN_CLIP_SEC = 3;

/** Pure scheduling rule: should a new clip start at this amount of played time? */
export function shouldStartClip(
  playedSec: number,
  clipsTaken: number,
  lastClipEndedAtPlayedSec: number | null,
  plan: SpeechPlan,
): boolean {
  if (clipsTaken >= MAX_SPEECH_CLIPS) return false;
  if (lastClipEndedAtPlayedSec === null) return playedSec >= plan.firstAfterSec;
  return playedSec - lastClipEndedAtPlayedSec >= plan.gapSec;
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

type CapturableMedia = HTMLMediaElement & { captureStream?: () => MediaStream };

/**
 * Samples speech from `el` according to `plan`, calling `onClip` for each finished clip.
 * Returns a stop function (also ends any clip in progress, keeping it if long enough).
 */
export function recordSpeech(
  el: HTMLMediaElement,
  plan: SpeechPlan,
  onClip: (clip: SpeechClip) => void,
): () => void {
  if (typeof MediaRecorder === 'undefined' || !(el as CapturableMedia).captureStream)
    return () => {};
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : '';
  if (!mimeType) return () => {};

  let playedSec = 0;
  let taken = 0;
  let lastEnd: number | null = null;
  let disabled = false;
  let clip: {
    recorder: MediaRecorder;
    stream: MediaStream;
    startPlayed: number;
    atSec: number;
  } | null = null;

  const finish = () => {
    if (!clip) return;
    const { recorder, stream, startPlayed, atSec } = clip;
    clip = null;
    lastEnd = playedSec;
    const durationSec = Math.min(30, playedSec - startPlayed);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (durationSec < MIN_CLIP_SEC || !chunks.length) return;
      const data = await toBase64(new Blob(chunks, { type: 'audio/webm' }));
      if (data.length >= 16)
        onClip({ atSec: Math.round(atSec * 10) / 10, durationSec, mimeType: 'audio/webm', data });
    };
    if (recorder.state !== 'inactive') recorder.stop();
  };

  const begin = () => {
    try {
      const audio = (el as CapturableMedia).captureStream!().getAudioTracks();
      if (!audio.length) return; // no audio yet; try again on a later tick
      const stream = new MediaStream(audio);
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 });
      recorder.start();
      taken++;
      clip = { recorder, stream, startPlayed: playedSec, atSec: el.currentTime };
    } catch {
      disabled = true; // e.g. cross-origin media: capture is not allowed, record nothing
    }
  };

  const timer = setInterval(() => {
    const playing = !el.paused && !el.ended && el.readyState >= 3;
    if (!playing) {
      if (clip) finish(); // never record across a pause
      return;
    }
    playedSec += 1;
    if (clip && playedSec - clip.startPlayed >= plan.clipSec) finish();
    else if (!clip && !disabled && shouldStartClip(playedSec, taken, lastEnd, plan)) begin();
  }, 1_000);

  return () => {
    clearInterval(timer);
    finish();
  };
}
