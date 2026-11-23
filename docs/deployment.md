# Deployment

Everything below works on Firebase's no-cost **Spark** plan. Nothing in this setup needs a billing account.

## 1. Create the Firebase project

1. Create a project at https://console.firebase.google.com and add a **Web app**. Copy its config.
2. **Authentication** → Sign-in method: enable **Google** and **Email/Password**.
3. **Firestore** → Create database (production mode).
4. **AI Logic** → Get started → choose the **Gemini Developer API** provider.
5. **App Check** → register the web app with **reCAPTCHA v3**: create a v3 site key at https://www.google.com/recaptcha/admin, adding your hosting domain only. App Check is enforced for Firebase AI Logic.
   - For local development, set `VITE_APPCHECK_DEBUG=true`, open the app, copy the debug token from the browser console, and add it under App Check → Apps → Manage debug tokens.
   - Optional: `VITE_APPCHECK_PROVIDER=recaptcha-enterprise` uses `ReCaptchaEnterpriseProvider` instead.

## 2. Configure the web app

```bash
cp .env.example apps/web/.env.local   # fill in the VITE_FIREBASE_* values and VITE_RECAPTCHA_SITE_KEY
pnpm dev                              # http://localhost:5310
```

Open **Hybrid AI** in the dashboard. It shows the Firebase and App Check status. You can initialise the on-device model there and run the same classification in `PREFER_ON_DEVICE`, `ONLY_ON_DEVICE` and `ONLY_IN_CLOUD`, each tagged with the source the SDK reports.

### On-device model (Gemini Nano in Chrome)

- Desktop Chrome 139 or newer.
- Enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, then restart Chrome.
- In the dashboard, click **Initialise on-device model**. The download needs a user click, and progress is shown.

## 3. Deploy rules and hosting

```bash
npx firebase login
npx firebase use --add                 # select your project
pnpm build:web
npx firebase deploy --only firestore:rules,firestore:indexes,hosting
```

After you've confirmed that real traffic carries App Check tokens, turn on App Check **enforcement** for Cloud Firestore in the console.

## 4. Chrome extension for the hosted dashboard

```bash
# PowerShell
$env:SKILLTRACE_DASHBOARD_ORIGINS="https://YOUR-PROJECT.web.app,http://localhost:5310"; pnpm build:extension
```

Load `apps/extension/dist` unpacked. To distribute, zip the `dist` folder. Chrome Web Store listing is optional; judges can load it unpacked.

## 5. Emulators (optional)

```bash
npx firebase emulators:start --only auth,firestore --project demo-skilltrace
# in apps/web/.env.local: VITE_USE_EMULATORS=true
```

The Firestore emulator uses port 8085 and Auth uses 9099. Java 11+ is required.

## 6. Regenerating lesson media (optional)

`pnpm media:generate` needs Windows (for the built-in speech voices) and an installed Google Chrome. The generated files are already committed in `apps/web/public/lab/media`.

## Known deployment limits

- **No Cloud Functions on Spark.** That rules out a GitHub App OAuth token exchange and server-side assessment grading. GitHub uses the public API (60 requests/hour per IP), and assessments are client-graded with rule-bounded claims.
- **Public passport in Local demo mode.** The link works only in the same browser. Use a signed-in account for real sharing.
