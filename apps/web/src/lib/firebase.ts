/**
 * Firebase initialisation: App, App Check, Auth, Firestore (offline-first persistent cache).
 * When no Firebase config is present the app runs in clearly labelled Local Demo mode:
 * tracking works, data stays in this browser, and AI features report "not configured".
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  initializeAppCheck,
  type AppCheck,
} from 'firebase/app-check';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: env.VITE_FIREBASE_APP_ID ?? '',
};

/** VITE_FORCE_LOCAL_DEMO=true (set by the E2E web server) ignores any Firebase config on disk. */
export const isFirebaseConfigured =
  env.VITE_FORCE_LOCAL_DEMO !== 'true' &&
  Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

export interface FirebaseServices {
  app: FirebaseApp;
  appCheck: AppCheck | null;
  appCheckStatus: string;
  auth: Auth;
  db: Firestore;
}

let services: FirebaseServices | null = null;

export function getFirebase(): FirebaseServices | null {
  if (!isFirebaseConfigured) return null;
  if (services) return services;
  const app = initializeApp(firebaseConfig);

  // App Check must be initialised before any Firebase AI Logic call (enforced for AI Logic).
  let appCheck: AppCheck | null = null;
  let appCheckStatus = 'not configured (set VITE_RECAPTCHA_SITE_KEY)';
  if (env.DEV && env.VITE_APPCHECK_DEBUG === 'true') {
    // Local development only (never in a production build). Either use the token you generated
    // in the Firebase console (App Check > Apps > Manage debug tokens), set as
    // VITE_APPCHECK_DEBUG_TOKEN, or let the SDK print a new one to the console for you to register.
    (
      self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string }
    ).FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APPCHECK_DEBUG_TOKEN || true;
  }
  if (env.VITE_RECAPTCHA_SITE_KEY || (env.DEV && env.VITE_APPCHECK_DEBUG === 'true')) {
    const key = env.VITE_RECAPTCHA_SITE_KEY ?? 'debug-only';
    const provider =
      env.VITE_APPCHECK_PROVIDER === 'recaptcha-enterprise'
        ? new ReCaptchaEnterpriseProvider(key)
        : new ReCaptchaV3Provider(key);
    appCheck = initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true });
    appCheckStatus =
      env.DEV && env.VITE_APPCHECK_DEBUG === 'true'
        ? 'debug provider (development)'
        : `${env.VITE_APPCHECK_PROVIDER ?? 'recaptcha-v3'}`;
  }

  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (env.VITE_USE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8085);
  }
  services = { app, appCheck, appCheckStatus, auth, db };
  return services;
}
