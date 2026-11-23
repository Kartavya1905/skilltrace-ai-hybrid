import { Link } from 'react-router-dom';
import { useApp } from '../lib/app-context';

const PILLARS = [
  {
    title: 'Learning activity',
    body: 'Rewind-aware video and audio timing, personalised reading pace, and engagement checks on pages you approve. Re-watching adds study time, never coverage.',
    tag: 'Automatically recorded',
  },
  {
    title: 'Project work',
    body: 'Connect public GitHub repositories as evidence milestones, then log your own work sessions. Commits never become hours.',
    tag: 'Self-reported + GitHub metadata',
  },
  {
    title: 'Demonstrated skill',
    body: 'Objectively graded assessments, kept separate from time. Results are labelled as unproctored self-attempts.',
    tag: 'Assessment results',
  },
];

export function Landing() {
  const { user } = useApp();
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="text-lg font-semibold">SkillTrace AI</span>
        </div>
        <Link to={user ? '/app' : '/signin'} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          {user ? 'Open dashboard' : 'Sign in'}
        </Link>
      </header>
      <main className="mx-auto max-w-6xl px-6">
        <section className="py-16 text-center">
          <p className="text-sm font-medium text-indigo-700">The evidence-backed Skill Passport</p>
          <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Show what you learned, how you learned it, and what you built.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            SkillTrace records your study on pages you choose, detects skills with on-device Gemini Nano through Firebase AI Logic (with a cloud model only when you
            allow it), and turns real evidence into a shareable passport. Every claim shows exactly what supports it.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to={user ? '/app' : '/signin'} className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-700">
              Get started
            </Link>
            <a href="#how" className="rounded-lg px-5 py-3 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-white">
              How it works
            </a>
          </div>
        </section>
        <section id="how" className="grid gap-4 pb-12 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">{p.tag}</span>
              <h2 className="mt-3 text-lg font-semibold">{p.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{p.body}</p>
            </div>
          ))}
        </section>
        <section className="mb-16 grid gap-6 rounded-2xl bg-slate-900 p-8 text-slate-100 md:grid-cols-2">
          <div>
            <h2 className="text-xl font-semibold">Hybrid AI, private by default</h2>
            <p className="mt-2 text-sm text-slate-300">
              Skill classification, topic extraction and engagement questions run on your device when Chrome's built-in model is available. If it isn't, you decide
              whether a minimised request may go to the cloud. The app always shows which one actually ran, as reported by the Firebase SDK.
            </p>
          </div>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>• Opt-in tracking, only on sites you approve</li>
            <li>• No keystrokes, form fields, microphone or screen capture</li>
            <li>• Learning time, project time and assessments are never merged</li>
            <li>• You choose every skill, project and detail that becomes public</li>
          </ul>
        </section>
      </main>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        Apache-2.0 · Built for Google #BuildHybridAI 2026 ·{' '}
        <Link className="underline" to="/signin">
          Try the Learning Lab
        </Link>
      </footer>
    </div>
  );
}
