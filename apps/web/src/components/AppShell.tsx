import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/app-context';
import { ConsentDialog } from './ConsentDialog';
import { cx } from './ui';
import { classifySession, trackingOptions } from '../lib/actions';
import { recoverLabSessions } from '../lib/lab-session';

const NAV: { to: string; label: string; end?: boolean }[] = [
  { to: '/app', label: 'Overview', end: true },
  { to: '/app/lab', label: 'Learning Lab' },
  { to: '/app/sessions', label: 'Sessions' },
  { to: '/app/skills', label: 'Skills' },
  { to: '/app/analytics', label: 'Analytics' },
  { to: '/app/engagement', label: 'Engagement checks' },
  { to: '/app/assessments', label: 'Assessments' },
  { to: '/app/github', label: 'GitHub' },
  { to: '/app/projects', label: 'Projects' },
  { to: '/app/passport', label: 'Skill Passport' },
  { to: '/app/ai', label: 'Hybrid AI' },
  { to: '/app/settings', label: 'Privacy & Settings' },
];

/** Background worker: classify pending sessions when AI is available; retries when back online. */
function useClassificationQueue() {
  const { data, store, ai, online, loaded } = useApp();
  const running = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;
  const pendingIds = data.learning_sessions
    .filter((s) => s.classificationStatus === 'pending' || s.classificationStatus === 'queued_offline')
    .map((s) => s.id)
    .join(',');
  useEffect(() => {
    if (!store || !loaded || running.current || !pendingIds) return;
    running.current = true;
    void (async () => {
      try {
        for (const id of pendingIds.split(',')) {
          const s = dataRef.current.learning_sessions.find((x) => x.id === id);
          if (!s) continue;
          const outcome = await classifySession(store, dataRef.current, ai, s);
          if (outcome === 'queued' || outcome === 'failed') break; // stop; retry on next change/online
        }
      } finally {
        running.current = false;
      }
    })();
  }, [pendingIds, store, ai, online, loaded]);
}

export function AppShell() {
  const { user, signOut, profile, prefs, store, data, loaded, online, ai } = useApp();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  useClassificationQueue();

  useEffect(() => {
    if (store && loaded) void recoverLabSessions(store, trackingOptions(prefs, data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, loaded]);

  useEffect(() => {
    if (loaded && store && !profile.onboardingComplete && data.profile.length === 0) nav('/onboarding');
  }, [loaded, store, profile.onboardingComplete, data.profile.length, nav]);

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className={cx('no-print border-r border-slate-200 bg-white lg:block lg:w-60 lg:shrink-0', open ? 'block' : 'hidden')}>
        <div className="flex h-16 items-center gap-2 px-5">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <span className="font-semibold text-slate-900">SkillTrace AI</span>
        </div>
        <nav aria-label="Main" className="space-y-0.5 px-3 pb-6">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) => cx('block rounded-lg px-3 py-2 text-sm', isActive ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-700 hover:bg-slate-50')}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="no-print flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 lg:px-8">
          <button type="button" className="rounded-lg px-2 py-1 text-sm ring-1 ring-slate-300 lg:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            Menu
          </button>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {user?.isLocal && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">Local demo mode: data stays in this browser</span>}
            {!online && <span className="rounded-full bg-slate-200 px-2 py-0.5 font-medium text-slate-700">Offline: tracking continues, AI tasks queue</span>}
            <span className={cx('rounded-full px-2 py-0.5 font-medium', prefs.trackingEnabled && !prefs.trackingPaused ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600')}>
              Tracking {prefs.trackingEnabled ? (prefs.trackingPaused ? 'paused' : 'on') : 'off'}
            </span>
            {prefs.demoMode && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700">DEMO mode: short verification intervals</span>}
            {!ai && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">AI not configured</span>}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-600 sm:inline">{profile.displayName || user?.displayName || user?.email}</span>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-slate-700 hover:bg-slate-100"
              onClick={async () => {
                await signOut();
                nav('/');
              }}
            >
              Sign out
            </button>
          </div>
        </div>
        <main id="main" className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
          <Outlet />
        </main>
      </div>
      <ConsentDialog />
    </div>
  );
}
