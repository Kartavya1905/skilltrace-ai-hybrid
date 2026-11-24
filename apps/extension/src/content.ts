/**
 * SkillTrace content script. Injected ONLY on origins the learner approved, and only does anything
 * when tracking is enabled and not paused.
 *
 * Collected: page title, privacy-preserving page id, origin+path (no query/fragment), content type,
 * word count, a short text excerpt (for videos: the page's own description of the video), and
 * media/scroll/visibility events. With the opt-in speech setting: up to three short audio clips
 * taken from the tracked media element itself, never the microphone (see speech.ts).
 * Never collected: keystrokes, form-field values, passwords, clipboard, microphone, camera, screen.
 * Page text is treated as data only.
 */
import type { LearningEvent, SessionMeta } from '@skilltrace/shared';
import { pageIdFromUrl, randomId, sanitizeUrl } from '@skilltrace/shared';
import {
  DEMO_VIDEO_VERIFICATION,
  PRODUCTION_VIDEO_VERIFICATION,
  TrackedSession,
  countWords,
  type CheckRequest,
  type TrackingOptions,
} from '@skilltrace/tracking-engine';
import { bindMediaElement, bindReading } from '@skilltrace/tracking-engine/dom';
import type { ExtensionSettings, InternalMessage } from './protocol';
import { DEMO_SPEECH_PLAN, SPEECH_PLAN, recordSpeech } from './speech';

const send = <T>(msg: InternalMessage) => chrome.runtime.sendMessage(msg) as Promise<T>;

const MIN_READING_WORDS = 250;
const MIN_MEDIA_SECONDS = 30;
const CHUNK_WORDS = 150;

function trackingOptions(s: ExtensionSettings): TrackingOptions {
  return {
    videoVerification: {
      ...(s.demoMode ? DEMO_VIDEO_VERIFICATION : PRODUCTION_VIDEO_VERIFICATION),
      rng: Math.random,
    },
    creditHiddenVideo: s.creditHiddenVideo,
    readingWpm: s.readingWpm,
    readingRandomCheck: s.demoMode
      ? { minMs: 45_000, maxMs: 90_000, rng: Math.random }
      : { minMs: 4 * 60_000, maxMs: 12 * 60_000, rng: Math.random },
    responseWindowMultiplier: s.responseWindowMultiplier,
    initialConsecutiveMissed: 0,
  };
}

/** Main readable content, skipping navigation, forms and editable regions. */
function mainContainer(): HTMLElement {
  return (
    (document.querySelector('main article, article, main, [role="main"]') as HTMLElement | null) ??
    document.body
  );
}

function readableBlocks(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('p, li, pre, blockquote, h1, h2, h3, h4, td'),
  ).filter(
    (el) =>
      !el.closest(
        'nav, header, footer, aside, form, [contenteditable="true"], input, textarea, select, [aria-hidden="true"]',
      ) &&
      el.offsetParent !== null &&
      (el.innerText ?? '').trim().length > 0,
  );
}

/** Group blocks into ~150-word chunks used as reading sections (no DOM modification). */
function chunkBlocks(blocks: HTMLElement[]) {
  const sectionOf = new Map<Element, string>();
  const sections: { id: string; heading: string; words: number }[] = [];
  let current: { id: string; heading: string; words: number } | null = null;
  for (const b of blocks) {
    const words = countWords(b.innerText);
    const isHeading = /^H[1-4]$/.test(b.tagName);
    if (!current || isHeading || current.words >= CHUNK_WORDS) {
      current = {
        id: `s${sections.length}`,
        heading: isHeading ? b.innerText.trim().slice(0, 200) : '',
        words: 0,
      };
      sections.push(current);
    }
    current.words += words;
    sectionOf.set(b, current.id);
  }
  return { sections, sectionOf };
}

function makeQueue() {
  let buffer: LearningEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!buffer.length) return;
    const batch = buffer;
    buffer = [];
    // On failure (e.g. extension reloaded) put events back for the next flush.
    send({ type: 'events', events: batch }).catch(() => (buffer = [...batch, ...buffer]));
  };
  return {
    push(e: LearningEvent) {
      buffer.push(e);
      if (e.kind !== 'media' || e.type !== 'checkpoint') flush();
      else if (!timer) timer = setTimeout(flush, 2_000);
    },
    flush,
  };
}

/** Minimal, accessible check-in overlay in a closed shadow root (isolated from page styles/scripts). */
function showCheck(check: CheckRequest, onRespond: () => void): () => void {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'closed' });
  const isVideo = check.kind === 'video_presence';
  root.innerHTML = `
    <style>
      .wrap{position:fixed;inset:auto 16px 16px auto;z-index:2147483647;font:14px system-ui,sans-serif;background:#fff;color:#0f172a;
        border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);padding:16px;max-width:320px;border:1px solid #c7d2fe}
      button{margin-top:10px;background:#4f46e5;color:#fff;border:0;border-radius:8px;padding:8px 12px;font:inherit;cursor:pointer}
      button:focus-visible{outline:3px solid #a5b4fc}
      small{color:#475569}
    </style>
    <div class="wrap" role="alertdialog" aria-labelledby="t" aria-describedby="d">
      <strong id="t">SkillTrace check-in</strong>
      <p id="d">${isVideo ? 'Are you still watching?' : 'Still reading?'} Eligible time is paused until you respond.
        <span aria-live="polite" id="left"></span></p>
      <button type="button">I'm here, continue</button><br/>
      <small>No answer is graded. Only not responding affects credit.</small>
    </div>`;
  const btn = root.querySelector('button')!;
  const left = root.querySelector('#left')!;
  btn.addEventListener('click', onRespond);
  document.documentElement.appendChild(host);
  btn.focus();
  const t = setInterval(
    () =>
      (left.textContent = `${Math.max(0, Math.ceil((check.expiresAt - Date.now()) / 1000))}s left`),
    500,
  );
  return () => {
    clearInterval(t);
    host.remove();
  };
}

/**
 * The page's own description of its content. YouTube keeps it in the watch-page DOM (its <meta>
 * description goes stale after in-page navigation); other sites use their meta tags.
 */
function pageDescription(): string {
  const yt = document.querySelector<HTMLElement>(
    'ytd-watch-metadata #description-inline-expander, ytd-watch-metadata #description',
  );
  const isYouTube = /(^|\.)youtube\.com$/.test(location.hostname);
  const meta = isYouTube
    ? ''
    : document.querySelector<HTMLMetaElement>(
        'meta[property="og:description"], meta[name="description"]',
      )?.content;
  return (yt?.innerText || meta || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
}

async function main() {
  if (window.top !== window) return; // top frame only
  if (document.querySelector('meta[name="skilltrace:first-party-tracking"]')) return; // dashboard tracks itself
  const settings = await send<ExtensionSettings>({ type: 'getSettings' });
  if (!settings?.trackingEnabled || settings.paused || !settings.origins.includes(location.origin))
    return;
  const opts = trackingOptions(settings);
  const queue = makeQueue();
  const bound = new WeakSet<HTMLMediaElement>();
  const speechPlan = settings.demoMode ? DEMO_SPEECH_PLAN : SPEECH_PLAN;

  /** Every live session's stop function; leaving the page ends them all. */
  const active = new Set<() => void>();
  window.addEventListener('pagehide', () => [...active].forEach((stop) => stop()));

  const baseMeta = (
    contentType: SessionMeta['contentType'],
    extra: Partial<SessionMeta>,
  ): SessionMeta => ({
    sessionId: randomId('ext'),
    pageId: pageIdFromUrl(location.href),
    origin: location.origin,
    url: sanitizeUrl(location.href),
    title: document.title.slice(0, 300),
    contentType,
    wordCount: 0,
    durationSec: 0,
    excerpt: '',
    sections: [],
    startedAt: Date.now(),
    device: 'extension',
    ...extra,
  });

  /** Starts a tracked session and returns a stop function that ends it (safe to call twice). */
  function run(
    meta: SessionMeta,
    attach: (s: TrackedSession) => () => void,
    media?: HTMLMediaElement,
  ): () => void {
    let hide: (() => void) | null = null;
    let detach: (() => void) | null = null;
    let tick: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    const session = new TrackedSession(meta, opts, {
      persist: (e) => queue.push(e),
      onCheck: (c) => (hide = showCheck(c, () => session.respond(c.checkId))),
      onCheckResolved: (_id, outcome) => {
        hide?.();
        hide = null;
        if (outcome === 'missed') media?.pause(); // stop crediting until the learner resumes
      },
    });
    const stop = () => {
      if (stopped) return;
      stopped = true;
      active.delete(stop);
      if (tick) clearInterval(tick);
      detach?.();
      hide?.();
      queue.flush();
      void send({ type: 'closeSession', sessionId: meta.sessionId });
    };
    active.add(stop);
    void send({ type: 'meta', meta }).then(() => {
      if (stopped) return;
      detach = attach(session);
      tick = setInterval(() => session.tick(), 1_000);
    });
    return stop;
  }

  const excerpt = (mainContainer().innerText ?? '').replace(/\s+/g, ' ').slice(0, 1500);

  /** YouTube-style players: an ad is playing in the same <video> element. */
  const adPlaying = () => !!document.querySelector('.ad-showing, .ad-interrupting');

  /**
   * One session per piece of content. Sites like YouTube swap videos inside the same <video>
   * element without a page load, so a new source (new page ID or duration) ends the current
   * session and starts a new one with the new title and description.
   */
  function trackMedia(el: HTMLMediaElement) {
    if (bound.has(el)) return;
    bound.add(el);
    let current: { key: string; stop: () => void } | null = null;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const keyNow = () => `${pageIdFromUrl(location.href)}|${Math.round(el.duration)}`;

    const end = () => {
      if (pending) clearTimeout(pending);
      pending = null;
      current?.stop();
      current = null;
    };

    const start = (key: string) => {
      const kind = el instanceof HTMLVideoElement ? 'video' : 'audio';
      const description = pageDescription();
      const captions = Array.from(el.querySelectorAll('track'))
        .map((t) => t.label)
        .join(', ');
      const meta = baseMeta(kind, {
        durationSec: el.duration,
        ...(description ? { description } : {}),
        // The description is about this video; the rest of the page may be unrelated sidebars.
        excerpt: (description || `${captions}\n${excerpt}`).trim().slice(0, 1500),
      });
      const stop = run(
        meta,
        (s) => {
          // Media may already be playing when we attach.
          if (!el.paused)
            s.media('play', { pos: el.currentTime, rate: el.playbackRate, duration: el.duration });
          const unbind = bindMediaElement(el, s);
          const stopSpeech = settings.speechDetection
            ? recordSpeech(el, speechPlan, (clip) => {
                void send({ type: 'speech', sessionId: meta.sessionId, clip });
              })
            : () => {};
          return () => {
            stopSpeech();
            unbind();
          };
        },
        el,
      );
      current = { key, stop };
    };

    const sync = () => {
      if (adPlaying()) return end(); // ads are never credited or classified
      if (!Number.isFinite(el.duration) || el.duration < MIN_MEDIA_SECONDS) return;
      const key = keyNow();
      if (current?.key === key || pending) return;
      end();
      // Wait a moment: single-page sites update the title and description after the switch.
      pending = setTimeout(() => {
        pending = null;
        if (!adPlaying() && keyNow() === key && !current) start(key);
      }, 1_200);
    };

    for (const ev of ['loadedmetadata', 'durationchange', 'play', 'playing'])
      el.addEventListener(ev, sync);
    el.addEventListener('emptied', end); // source removed, e.g. moving to another video
    sync();
  }

  document.querySelectorAll('video, audio').forEach((m) => trackMedia(m as HTMLMediaElement));
  new MutationObserver((records) => {
    for (const r of records)
      r.addedNodes.forEach((n) => {
        if (n instanceof HTMLMediaElement) trackMedia(n);
        else if (n instanceof HTMLElement)
          n.querySelectorAll('video, audio').forEach((m) => trackMedia(m as HTMLMediaElement));
      });
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Reading: only when there is substantial readable text (ordinary browsing is not learning).
  const blocks = readableBlocks(mainContainer());
  const { sections, sectionOf } = chunkBlocks(blocks);
  const wordCount = sections.reduce((a, s) => a + s.words, 0);
  if (wordCount >= MIN_READING_WORDS) {
    run(baseMeta('reading', { wordCount, sections, excerpt }), (s) =>
      bindReading(s, {
        sections: blocks,
        sectionIdOf: (el) => sectionOf.get(el),
        sectionWords: Object.fromEntries(sections.map((x) => [x.id, x.words])),
        wpm: opts.readingWpm,
      }),
    );
  }
}

void main();
