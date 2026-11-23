import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, updateProfile } from 'firebase/auth';
import { getFirebase, isFirebaseConfigured } from '../lib/firebase';
import { useApp } from '../lib/app-context';
import { Button, Field, inputCls } from '../components/ui';

export function SignIn() {
  const { user, enterLocalMode } = useApp();
  const nav = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) nav('/app');
  }, [user, nav]);

  const fb = getFirebase();

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message.replace('Firebase: ', ''));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fb) return;
    void run(async () => {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(fb.auth, email, password);
        if (name) await updateProfile(cred.user, { displayName: name });
      } else {
        await signInWithEmailAndPassword(fb.auth, email, password);
      }
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <Link to="/" className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="font-semibold">SkillTrace AI</span>
        </Link>
        <h1 className="mt-6 text-xl font-semibold">{mode === 'signin' ? 'Sign in' : 'Create your account'}</h1>
        {isFirebaseConfigured ? (
          <>
            <Button className="mt-5 w-full" variant="secondary" disabled={busy} onClick={() => fb && run(() => signInWithPopup(fb.auth, new GoogleAuthProvider()))}>
              Continue with Google
            </Button>
            <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" /> or email <span className="h-px flex-1 bg-slate-200" />
            </div>
            <form onSubmit={onSubmit} className="space-y-3">
              {mode === 'signup' && (
                <Field label="Display name">
                  <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </Field>
              )}
              <Field label="Email">
                <input className={inputCls} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </Field>
              <Field label="Password" hint={mode === 'signup' ? 'At least 6 characters.' : undefined}>
                <input
                  className={inputCls}
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
              </Field>
              {error && (
                <p role="alert" className="text-sm text-rose-700">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </Button>
            </form>
            <button type="button" className="mt-4 text-sm text-indigo-700 hover:underline" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
            </button>
          </>
        ) : (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Firebase is not configured for this build, so accounts and AI are unavailable. You can still try the full tracking flow in Local demo mode. See
            docs/deployment.md to connect a Firebase project.
          </p>
        )}
        <div className="mt-6 border-t border-slate-200 pt-5">
          <Button variant="ghost" className="w-full" onClick={enterLocalMode}>
            Continue in Local demo mode (no account)
          </Button>
          <p className="mt-2 text-xs text-slate-500">Local demo mode keeps everything in this browser's storage. Nothing syncs to a server.</p>
        </div>
      </div>
    </div>
  );
}
