# Deployment

Everything below works on Firebase's no-cost **Spark** plan. Nothing in this setup needs a billing account.

## 1. Create the Firebase project

1. Create a project at https://console.firebase.google.com and add a **Web app**. Copy its config.
2. **Authentication** → Sign-in method: enable **Google** and **Email/Password**.
3. **Firestore** → Create database (production mode).
4. **AI Logic** → Get started → choose the **Gemini Developer API** provider.
5. **App Check** uses **Fraud Defense** (formerly reCAPTCHA Enterprise). Google no longer issues Classic reCAPTCHA keys. The free tier covers 10,000 assessments a month. Without a billing account, requests beyond that fail instead of costing money.
   - In Google Cloud, enable the **reCAPTCHA Enterprise API** for this project.
   - Under **Security → Fraud Defense → Create key**, choose type **Web** with the domains `localhost` and `<project>.web.app`. Create the key **in the same project**; a key from another project fails with "CreateAssessment".
   - In **App Check → Apps → your web app → Fraud Defense**, paste the **site key** and save. No secret key is needed. New registrations take a few minutes to start working.
   - In `apps/web/.env.local`, set `VITE_APPCHECK_PROVIDER=recaptcha-enterprise` and `VITE_RECAPTCHA_SITE_KEY=<site key>`.

## 2. Configure the web app

The Firebase CLI writes the web config for you. It uses the public `VITE_FIREBASE_*` values, never a service account.

```bash
pnpm exec firebase login                          # once per machine
pnpm setup:firebase --project <your-project-id>   # writes apps/web/.env.local and .firebaserc
                                                  # add --create-app if the project has no web app yet
```

Then add the App Check values to `apps/web/.env.local` by hand:

- `VITE_APPCHECK_PROVIDER=recaptcha-enterprise` and `VITE_RECAPTCHA_SITE_KEY=<Fraud Defense site key>` from step 1.5. Because `localhost` is in the key's domains, local development needs no debug token.

```bash
pnpm check:env                # validates the config without printing any values
pnpm check:env --production   # deploy rules: site key required, emulators off
pnpm dev                      # http://localhost:5310
```

**M2 is done when** you can:

- sign in with Google
- finish a Learning Lab session
- see it under `users/<uid>/learning_sessions` in the Firestore console
- see it classified with a source badge that the SDK reported (on-device or cloud)

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

## 3b. Continuous deployment (GitHub Actions)

`.github/workflows/pipeline.yml` runs CI on every push and pull request:

- **Push to `main`:** after CI passes, it deploys Hosting plus Firestore rules and indexes, then smoke-tests the live URL.
- **Same-repository pull request:** after CI passes, it deploys a 7-day Hosting preview channel and posts the link on the PR.

One-time setup in GitHub (repository **Settings → Secrets and variables → Actions**):

1. **Variable `FIREBASE_WEB_ENV`** (Variables tab). Paste the public web config as multi-line text: the `VITE_FIREBASE_*` lines plus `VITE_APPCHECK_PROVIDER` and `VITE_RECAPTCHA_SITE_KEY` from `apps/web/.env.local`. These values ship in the public JavaScript anyway, so a variable is fine; don't include `VITE_APPCHECK_DEBUG*` or `VITE_USE_EMULATORS`.
2. **Secret `FIREBASE_SERVICE_ACCOUNT`** (Secrets tab). This is the JSON key of a deploy-only service account:
   1. Google Cloud console → **IAM & Admin → Service accounts → Create service account**, named `github-deploy`.
   2. Grant these roles:
      - **Firebase Hosting Admin**
      - **Firebase Rules Admin**
      - **Cloud Datastore Index Admin**
      - **Service Usage Consumer**
      - **API Keys Viewer**
   3. Open the account → **Keys → Add key → JSON**. Paste the downloaded file's contents into the secret, then delete the file.

Without these settings, the deploy job fails with a message that names what's missing. CI itself needs neither.

Preview channels run on hosts like `<project>--pr12-….web.app`. Those hosts aren't in the reCAPTCHA key's domains or Auth's authorized domains, so previews show the UI, but App Check, Google sign-in and AI calls fail there. Check those on the live site.

## 4. Chrome extension for the hosted dashboard

The extension's ID is pinned to `kecllpafndpfocijmodnoilonglpkjcf` on every install. The manifest `key` comes from `apps/extension/extension-key.json`, which holds only a public key. The dashboard therefore reaches the extension with no ID setup.

**Release (recommended):** push a version tag. `.github/workflows/release.yml` then does the following:

1. Runs CI.
2. Builds the extension for `https://<project>.web.app`, `https://<project>.firebaseapp.com` and `http://localhost:5310`.
3. Stamps the tag's version into the extension.
4. Publishes `skilltrace-extension-v<version>.zip` on a GitHub Release.

```bash
git tag v0.2.0 && git push origin v0.2.0
```

**Local build:**

```powershell
$env:SKILLTRACE_DASHBOARD_ORIGINS="https://YOUR-PROJECT.web.app,http://localhost:5310"; $env:SKILLTRACE_VERSION="0.2.0"
pnpm build:extension; pnpm package:extension   # zip in apps/extension/release/
```

To install, unzip the file (or use `apps/extension/dist`), open `chrome://extensions`, turn on Developer mode, and click **Load unpacked**. A Chrome Web Store listing is optional; judges can load the extension unpacked.

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
