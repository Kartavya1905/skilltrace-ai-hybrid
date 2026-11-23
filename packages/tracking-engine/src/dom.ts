/**
 * DOM bindings shared by the first-party Learning Lab and the Chrome extension content script.
 * They translate browser signals into TrackedSession events. Privacy rules enforced here:
 *  - no keystroke contents, no form-field values, no clipboard; "interaction" is a bare,
 *    throttled presence ping from pointer/keyboard activity,
 *  - no microphone, camera or screen access.
 */
import type { TrackedSession } from './session';

const CHECKPOINT_MS = 2_000;

/** Attach to an HTML5 <video> or <audio> element. Returns a detach function. */
export function bindMediaElement(el: HTMLMediaElement, session: TrackedSession, doc: Document = document): () => void {
  let lastPos = el.currentTime;
  let lastPosT = Date.now();
  let lastCheckpoint = 0;
  const snap = () => ({ pos: el.currentTime, rate: el.playbackRate || 1, duration: Number.isFinite(el.duration) ? el.duration : 0 });
  const on = (type: string, fn: () => void) => {
    el.addEventListener(type, fn);
    return () => el.removeEventListener(type, fn);
  };
  const offs = [
    on('play', () => session.media('play', snap())),
    on('playing', () => session.media('playing', snap())),
    on('pause', () => session.media('pause', snap())),
    on('ended', () => session.media('ended', snap())),
    on('waiting', () => session.media('waiting', snap())),
    on('ratechange', () => session.media('ratechange', snap())),
    // currentTime is already the seek target when 'seeking' fires; send the last observed position.
    on('seeking', () => session.media('seeking', { ...snap(), fromPos: lastPos, fromT: lastPosT })),
    on('seeked', () => {
      lastPos = el.currentTime;
      lastPosT = Date.now();
      session.media('seeked', snap());
    }),
    on('timeupdate', () => {
      if (el.seeking) return;
      lastPos = el.currentTime;
      lastPosT = Date.now();
      if (!el.paused && lastPosT - lastCheckpoint >= CHECKPOINT_MS) {
        lastCheckpoint = lastPosT;
        session.media('checkpoint', snap());
      }
    }),
  ];
  const vis = () => session.media(doc.visibilityState === 'hidden' ? 'hidden' : 'visible', snap());
  doc.addEventListener('visibilitychange', vis);
  const hide = () => session.media('interrupt', snap());
  window.addEventListener('pagehide', hide);
  if (doc.visibilityState === 'hidden') vis();
  return () => {
    offs.forEach((f) => f());
    doc.removeEventListener('visibilitychange', vis);
    window.removeEventListener('pagehide', hide);
  };
}

export interface ReadingBindingOptions {
  /** Elements whose visibility marks reading progress, each with data-section-id. */
  sections: Element[];
  /** Scroll container; defaults to the document. */
  scroller?: HTMLElement | null;
  /** Fraction of a section (or of the viewport, for tall sections) that must be visible. */
  visibleRatio?: number;
  /**
   * Visible time a section needs before it counts as read: a share of its expected reading time
   * (words / wpm), never less than minDwellMs. A fixed short dwell would let a fast scroll or a
   * tall viewport "read" several sections in seconds.
   */
  wpm?: number;
  dwellShare?: number;
  minDwellMs?: number;
  /** Words per section id (from SessionMeta.sections). */
  sectionWords?: Record<string, number>;
  /** Map an observed element to its section id (default: data-section-id). Lets the extension
   * track third-party pages without modifying their DOM. */
  sectionIdOf?: (el: Element) => string | undefined;
}

export function bindReading(session: TrackedSession, opts: ReadingBindingOptions, doc: Document = document): () => void {
  const visibleRatio = opts.visibleRatio ?? 0.5;
  const wpm = opts.wpm ?? 238;
  const dwellShare = opts.dwellShare ?? 0.3;
  const minDwellMs = opts.minDwellMs ?? 3_000;
  const visibleEls = new Map<Element, string>(); // several elements may belong to one section
  const dwell = new Map<string, number>(); // accumulated visible ms since the section last came into view
  const read = new Set<string>();
  let lastEmitted: string | null = null;
  session.readingEvent('open');

  const required = (id: string) => {
    const words = opts.sectionWords?.[id] ?? 0;
    return Math.max(minDwellMs, (words / wpm) * 60_000 * dwellShare);
  };

  const io =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const id = opts.sectionIdOf?.(entry.target) ?? (entry.target as HTMLElement).dataset.sectionId;
              if (!id) continue;
              const vh = entry.rootBounds?.height ?? window.innerHeight;
              const coversViewport = entry.intersectionRect.height >= vh * visibleRatio;
              if (entry.isIntersecting && (entry.intersectionRatio >= visibleRatio || coversViewport)) visibleEls.set(entry.target, id);
              else visibleEls.delete(entry.target);
            }
          },
          { threshold: [0, 0.25, 0.5, 0.75, 1] },
        )
      : null;
  opts.sections.forEach((s) => io?.observe(s));

  // Accumulate visible time once per second while the page is visible.
  const ticker = setInterval(() => {
    if (doc.visibilityState === 'hidden') return;
    const visible = new Set(visibleEls.values());
    // A section that left the viewport starts its dwell again when it returns.
    for (const id of [...dwell.keys()]) if (!visible.has(id)) dwell.delete(id);
    for (const id of visible) {
      const ms = (dwell.get(id) ?? 0) + 1_000;
      dwell.set(id, ms);
      const needed = read.has(id) ? minDwellMs : required(id); // revisits need only a short dwell
      if (ms >= needed && lastEmitted !== id) {
        read.add(id);
        lastEmitted = id;
        session.readingEvent('section_visible', { sectionId: id });
      }
    }
  }, 1_000);

  let lastScroll = 0;
  const scrollTarget: HTMLElement | Window = opts.scroller ?? window;
  const onScroll = () => {
    const now = Date.now();
    if (now - lastScroll < 1_000) return;
    lastScroll = now;
    const el = opts.scroller ?? doc.scrollingElement ?? doc.documentElement;
    const max = Math.max(1, el.scrollHeight - el.clientHeight);
    session.readingEvent('scroll', { scrollRatio: Math.min(1, Math.max(0, el.scrollTop / max)) });
  };
  let lastInteraction = 0;
  // Presence only: the key or pointer details are never read or recorded.
  const onInteract = () => {
    const now = Date.now();
    if (now - lastInteraction < 5_000) return;
    lastInteraction = now;
    session.readingEvent('interaction');
  };
  const onVis = () => session.readingEvent(doc.visibilityState === 'hidden' ? 'hidden' : 'visible');
  const onBlur = () => session.readingEvent('blur');
  const onFocus = () => session.readingEvent('focus');
  const onHide = () => session.readingEvent('close');

  scrollTarget.addEventListener('scroll', onScroll, { passive: true });
  doc.addEventListener('pointerdown', onInteract, { passive: true });
  doc.addEventListener('keydown', onInteract, { passive: true });
  doc.addEventListener('visibilitychange', onVis);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  window.addEventListener('pagehide', onHide);
  return () => {
    io?.disconnect();
    clearInterval(ticker);
    scrollTarget.removeEventListener('scroll', onScroll);
    doc.removeEventListener('pointerdown', onInteract);
    doc.removeEventListener('keydown', onInteract);
    doc.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('pagehide', onHide);
  };
}

/** Collect section metadata (id, heading, word count) from marked-up content. */
export function extractSections(root: ParentNode, countWords: (t: string) => number) {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-section-id]'));
  return els.map((el) => ({
    id: el.dataset.sectionId!,
    heading: (el.querySelector('h1,h2,h3')?.textContent ?? '').trim().slice(0, 200),
    words: countWords(el.innerText ?? el.textContent ?? ''),
  }));
}
