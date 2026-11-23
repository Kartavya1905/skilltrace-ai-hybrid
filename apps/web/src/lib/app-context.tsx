import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth';
import type { CollectionTypes, PrivateCollection } from '@skilltrace/shared';
import { HybridAIService, SkillTraceAI, type AIResult, type TaskName } from '@skilltrace/ai-engine';
import { FirebaseModelFactory } from '@skilltrace/ai-engine/firebase';
import { getFirebase } from './firebase';
import { FirestoreStore, LIVE_COLLECTIONS, LocalStore, type DataStore } from './store';
import {
  defaultPassportProfile,
  defaultPreferences,
  defaultProfile,
  defaultShareSettings,
} from './defaults';
import { recordInference } from './actions';

export type AppData = { [C in PrivateCollection]: CollectionTypes[C][] };

const emptyData = (): AppData =>
  Object.fromEntries(
    [...LIVE_COLLECTIONS, 'learning_events'].map((c) => [c, []]),
  ) as unknown as AppData;

export interface SessionUser {
  uid: string;
  displayName: string;
  email: string;
  isLocal: boolean;
}

interface ConsentRequest {
  task: TaskName;
  description: string;
  resolve: (ok: boolean) => void;
}

export interface AppContextValue {
  authReady: boolean;
  user: SessionUser | null;
  store: DataStore | null;
  data: AppData;
  loaded: boolean;
  prefs: CollectionTypes['preferences'];
  profile: CollectionTypes['profile'];
  share: CollectionTypes['public_share_settings'];
  passport: CollectionTypes['passport_profiles'];
  ai: SkillTraceAI | null;
  online: boolean;
  enterLocalMode: () => void;
  signOut: () => Promise<void>;
  consentRequest: ConsentRequest | null;
  answerConsent: (ok: boolean) => void;
}

const Ctx = createContext<AppContextValue | null>(null);
const LOCAL_FLAG = 'skilltrace:local-mode';
const LOCAL_USER: SessionUser = {
  uid: 'local-demo-user',
  displayName: 'Local demo learner',
  email: '',
  isLocal: true,
};

export function AppProvider({ children }: { children: ReactNode }) {
  const fb = getFirebase();
  const [authReady, setAuthReady] = useState(!fb);
  const [user, setUser] = useState<SessionUser | null>(() =>
    localStorage.getItem(LOCAL_FLAG) === '1' ? LOCAL_USER : null,
  );
  const [data, setData] = useState<AppData>(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [consentRequest, setConsentRequest] = useState<ConsentRequest | null>(null);

  useEffect(() => {
    if (!fb) return;
    return onAuthStateChanged(fb.auth, (u) => {
      if (u)
        setUser({
          uid: u.uid,
          displayName: u.displayName ?? '',
          email: u.email ?? '',
          isLocal: false,
        });
      else setUser(localStorage.getItem(LOCAL_FLAG) === '1' ? LOCAL_USER : null);
      setAuthReady(true);
    });
  }, [fb]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const store = useMemo<DataStore | null>(() => {
    if (!user) return null;
    if (user.isLocal || !fb) return new LocalStore(user.uid);
    return new FirestoreStore(fb.db, user.uid);
  }, [user, fb]);

  useEffect(() => {
    setData(emptyData());
    setLoaded(false);
    if (!store) return;
    const seen = new Set<string>();
    const unsubs = LIVE_COLLECTIONS.map((c) =>
      store.subscribe(c, (rows) => {
        setData((d) => ({ ...d, [c]: rows }));
        seen.add(c);
        if (seen.size === LIVE_COLLECTIONS.length) setLoaded(true);
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [store]);

  const uid = user?.uid ?? 'anonymous';
  const prefs = data.preferences[0] ?? defaultPreferences(uid);
  const profile = data.profile[0] ?? defaultProfile(uid, user?.displayName ?? '');
  const share = data.public_share_settings[0] ?? defaultShareSettings(uid);
  const passport = data.passport_profiles[0] ?? defaultPassportProfile(uid, profile.displayName);

  // Keep the latest preference values available to the AI service without re-creating it.
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const storeRef = useRef(store);
  storeRef.current = store;

  const requestCloudConsent = useCallback(
    (task: TaskName, description: string) =>
      new Promise<boolean>((resolve) => setConsentRequest({ task, description, resolve })),
    [],
  );

  const ai = useMemo(() => {
    // Firebase AI Logic needs the Firebase app + App Check, not a signed-in user.
    if (!fb || !user) return null;
    const factory = new FirebaseModelFactory(
      fb.app,
      import.meta.env.VITE_AI_CLOUD_MODEL || undefined,
    );
    const service = new HybridAIService(factory, {
      consent: () => prefsRef.current.cloudAIConsent,
      requestCloudConsent,
      isOnline: () => navigator.onLine,
      onLog: (r: AIResult<unknown>) => {
        if (storeRef.current) void recordInference(storeRef.current, r);
      },
    });
    return new SkillTraceAI(service, () => prefsRef.current.allowCloudExcerpts);
  }, [fb, user, requestCloudConsent]);

  const answerConsent = useCallback(
    (ok: boolean) => {
      consentRequest?.resolve(ok);
      setConsentRequest(null);
    },
    [consentRequest],
  );

  const enterLocalMode = useCallback(() => {
    localStorage.setItem(LOCAL_FLAG, '1');
    setUser(LOCAL_USER);
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(LOCAL_FLAG);
    if (fb && user && !user.isLocal) await fbSignOut(fb.auth);
    setUser(null);
  }, [fb, user]);

  const value: AppContextValue = {
    authReady,
    user,
    store,
    data,
    loaded: loaded || !store,
    prefs,
    profile,
    share,
    passport,
    ai,
    online,
    enterLocalMode,
    signOut,
    consentRequest,
    answerConsent,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}

/** Convenience: only for components rendered inside the signed-in shell. */
export function useStore(): DataStore {
  const { store } = useApp();
  if (!store) throw new Error('No data store (not signed in)');
  return store;
}
