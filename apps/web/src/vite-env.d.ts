/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_APPCHECK_PROVIDER?: 'recaptcha-v3' | 'recaptcha-enterprise';
  readonly VITE_RECAPTCHA_SITE_KEY?: string;
  readonly VITE_APPCHECK_DEBUG?: string;
  readonly VITE_APPCHECK_DEBUG_TOKEN?: string;
  readonly VITE_AI_CLOUD_MODEL?: string;
  readonly VITE_USE_EMULATORS?: string;
  readonly VITE_FORCE_LOCAL_DEMO?: string;
  readonly VITE_EXTENSION_ID?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
