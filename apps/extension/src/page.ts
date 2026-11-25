/**
 * Page and media-source rules for the content script, kept free of DOM access so they can be
 * unit-tested.
 *
 * 1. cleanTitle: drops the unread-notification count sites put in front of the tab title
 *    ("(3) Python Tutorial - YouTube") and YouTube's " - YouTube" suffix.
 * 2. mediaAllowedOn: on YouTube, only watch, live, embed and Shorts pages hold a video the learner
 *    chose to watch. Muted hover previews on the home feed, search and channel pages are skipped.
 * 3. MediaSessionSwitch: one session per piece of content. When the same <video> element briefly
 *    plays something else (an ad break, or a source reload), the session is parked instead of
 *    ended, and picks up again when the original content returns.
 */

const YOUTUBE_HOST = /(^|\.)(youtube\.com|youtube-nocookie\.com)$/;

export function isYouTubeHost(hostname: string): boolean {
  return YOUTUBE_HOST.test(hostname);
}

// ---------------------------------------------------------------------------------------------
// 1. Titles
// ---------------------------------------------------------------------------------------------

export function cleanTitle(title: string, hostname = ''): string {
  let t = title.replace(/^\s*\(\d+\+?\)\s*/, '');
  if (isYouTubeHost(hostname)) t = t.replace(/\s+-\s+YouTube\s*$/, '');
  return (t.trim() || title.trim()).slice(0, 300);
}

// ---------------------------------------------------------------------------------------------
// 2. Which pages may start a media session
// ---------------------------------------------------------------------------------------------

export function mediaAllowedOn(href: string): boolean {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return false;
  }
  if (!isYouTubeHost(u.hostname)) return true;
  return /^\/(watch|live\/|embed\/|shorts\/)/.test(u.pathname);
}

// ---------------------------------------------------------------------------------------------
// 3. Session switching for one media element
// ---------------------------------------------------------------------------------------------

/** A running session as seen by the switch. suspend/resume stop and restart crediting. */
export interface SessionHandle {
  stop(): void;
  suspend(): void;
  resume(): void;
}

export interface SwitchOptions {
  /** Wait before starting: single-page sites update the title and description after a switch. */
  startDelayMs: number;
  /** A parked session that does not come back within this time is ended. */
  parkMs: number;
}

export const DEFAULT_SWITCH_OPTIONS: SwitchOptions = { startDelayMs: 1_200, parkMs: 3 * 60_000 };

/** Keys look like "<pageId>|<rounded duration>"; the page part identifies the watch page. */
const pageOf = (key: string) => key.split('|')[0];

export class MediaSessionSwitch {
  private current: { key: string; h: SessionHandle } | null = null;
  private parked = new Map<string, { h: SessionHandle; timer: ReturnType<typeof setTimeout> }>();
  private pending: { key: string; timer: ReturnType<typeof setTimeout> } | null = null;

  /**
   * @param start   starts a new session for a key
   * @param keyNow  the key of the content playing now, or null if nothing trackable is playing
   */
  constructor(
    private readonly start: (key: string) => SessionHandle,
    private readonly keyNow: () => string | null,
    private readonly opts: SwitchOptions = DEFAULT_SWITCH_OPTIONS,
  ) {}

  /** The key of the session being credited right now, if any. */
  get activeKey(): string | null {
    return this.current?.key ?? null;
  }

  /** Trackable content with this key is loaded or playing. */
  observe(key: string): void {
    if (this.current?.key === key || this.pending?.key === key) return;
    this.cancelPending();
    // Content from another watch page never comes back to this element's sessions.
    for (const [k, p] of this.parked) if (pageOf(k) !== pageOf(key)) this.endParked(k, p);
    this.park();
    const back = this.parked.get(key);
    if (back) {
      clearTimeout(back.timer);
      this.parked.delete(key);
      back.h.resume();
      this.current = { key, h: back.h };
      return;
    }
    const timer = setTimeout(() => {
      this.pending = null;
      if (!this.current && this.keyNow() === key) this.current = { key, h: this.start(key) };
    }, this.opts.startDelayMs);
    this.pending = { key, timer };
  }

  /** Something that must not be credited is playing (an ad), or the source was removed. */
  interrupt(): void {
    this.cancelPending();
    this.park();
  }

  /** Ends every session of this element. */
  stopAll(): void {
    this.cancelPending();
    for (const [k, p] of this.parked) this.endParked(k, p);
    this.current?.h.stop();
    this.current = null;
  }

  private park(): void {
    if (!this.current) return;
    const { key, h } = this.current;
    this.current = null;
    h.suspend();
    const timer = setTimeout(() => {
      this.parked.delete(key);
      h.stop();
    }, this.opts.parkMs);
    this.parked.set(key, { h, timer });
  }

  private endParked(key: string, p: { h: SessionHandle; timer: ReturnType<typeof setTimeout> }) {
    clearTimeout(p.timer);
    this.parked.delete(key);
    p.h.stop();
  }

  private cancelPending(): void {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
  }
}
