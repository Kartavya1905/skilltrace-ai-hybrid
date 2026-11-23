/**
 * SkillTrace content script. Injected ONLY on origins the learner approved, and only does anything
 * when tracking is enabled and not paused.
 *
 * Collected: page title, privacy-preserving page id, origin+path (no query/fragment), content type,
 * word count, a short text excerpt from the main content, and media/scroll/visibility events.
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

const send = <T>(msg: InternalMessage) => chrome.runtime.sendMessage(msg) as Promise<T>;

const MIN_READING_WORDS = 250;
const MIN_MEDIA_SECONDS = 30;
const CHUNK_WORDS = 150;

function trackingOptions(s: ExtensionSettings): TrackingOptions {
  return {
    videoVerification: { ...(s.demoMode ? DEMO_VIDEO_VERIFICATION : PRODUCTION_VIDEO_VERIFICATION), rng: Math.random },
    creditHiddenVideo: s.creditHiddenVideo,
    readingWpm: s.readingWpm,
    readingRandomCheck: s.demoMode ? { minMs: 45_000, maxMs: 90_000, rng: Math.random } : { minMs: 4 * 60_000, maxMs: 12 * 60_000, rng: Math.random },
    responseWindowMultiplier: s.responseWindowMultiplier,
    initialConsecutiveMissed: 0,
  };
}

/** Main readable content, skipping navigation, forms and editable regions. */
function mainContainer(): HTMLElement {
  return (document.querySelector('main article, article, main, [role="main"]') as HTMLElement | null) ?? document.body;
}

function readableBlocks(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('p, li, pre, blockquote, h1, h2, h3, h4, td')).filter(
    (el) =>
      !el.closest('nav, header, footer, aside, form, [contenteditable="true"], input, textarea, select, [aria-hidden="true"]') &&
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
      current = { id: `s${sections.length}`, heading: isHeading ? b.innerText.trim().slice(0, 200) : '', words: 0 };
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
  const t = setInterval(() => (left.textContent = `${Math.max(0, Math.ceil((check.expiresAt - Date.now()) / 1000))}s left`), 500);
  return () => {
    clearInterval(t);
    host.remove();
  };
}

async function main() {
  if (window.top !== window) return; // top frame only
  if (document.querySelector('meta[name="skilltrace:first-party-tracking"]')) return; // dashboard tracks itself
  const settings = await send<ExtensionSettings>({ type: 'getSettings' });
  if (!settings?.trackingEnabled || settings.paused || !settings.origins.includes(location.origin)) return;
  const opts = trackingOptions(settings);
  const queue = makeQueue();
  const started = new WeakSet<HTMLMediaElement>();

  const baseMeta = (contentType: SessionMeta['contentType'], extra: Partial<SessionMeta>): SessionMeta => ({
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

  function run(meta: SessionMeta, attach: (s: TrackedSession) => () => void, media?: HTMLMediaElement) {
    let hide: (() => void) | null = null;
    const session = new TrackedSession(meta, opts, {
      persist: (e) => queue.push(e),
      onCheck: (c) => (hide = showCheck(c, () => session.respond(c.checkId))),
      onCheckResolved: (_id, outcome) => {
        hide?.();
        hide = null;
        if (outcome === 'missed') media?.pause(); // stop crediting until the learner resumes
      },
    });
    void send({ type: 'meta', meta }).then(() => {
      const detach = attach(session);
      const tick = setInterval(() => session.tick(), 1_000);
      window.addEventListener('pagehide', () => {
        clearInterval(tick);
        detach();
        queue.flush();
        void send({ type: 'closeSession', sessionId: meta.sessionId });
      });
    });
  }

  const excerpt = (mainContainer().innerText ?? '').replace(/\s+/g, ' ').slice(0, 1500);

  function trackMedia(el: HTMLMediaElement) {
    if (started.has(el)) return;
    const begin = () => {
      if (started.has(el) || !Number.isFinite(el.duration) || el.duration < MIN_MEDIA_SECONDS) return;
      started.add(el);
      const kind = el instanceof HTMLVideoElement ? 'video' : 'audio';
      const captions = Array.from(el.querySelectorAll('track'))
        .map((t) => t.label)
        .join(', ');
      run(baseMeta(kind, { durationSec: el.duration, excerpt: `${captions}\n${excerpt}`.trim().slice(0, 1500) }), (s) => {
        // Media may already be playing when we attach.
        if (!el.paused) s.media('play', { pos: el.currentTime, rate: el.playbackRate, duration: el.duration });
        return bindMediaElement(el, s);
      }, el);
    };
    if (el.readyState >= 1) begin();
    el.addEventListener('loadedmetadata', begin);
    el.addEventListener('play', begin);
  }

  document.querySelectorAll('video, audio').forEach((m) => trackMedia(m as HTMLMediaElement));
  new MutationObserver((records) => {
    for (const r of records)
      r.addedNodes.forEach((n) => {
        if (n instanceof HTMLMediaElement) trackMedia(n);
        else if (n instanceof HTMLElement) n.querySelectorAll('video, audio').forEach((m) => trackMedia(m as HTMLMediaElement));
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
