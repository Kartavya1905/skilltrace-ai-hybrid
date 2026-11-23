# End-to-end delivery pipeline: milestones

_Written 2026-11-23. Deadline: 2026-11-30 17:00 ET._

The product code is complete (see DEVELOPMENT_STATUS.md). These milestones take it from a repository to a deployed, verified, submitted entry. Every stage stays free: a public GitHub repository gets free Actions minutes, and Firebase runs on the Spark plan.

```
 push / PR ──► M1 CI gate ──► M3 deploy ──► M5 post-deploy smoke ──► M6 submission
                  │              ▲  ▲
                  │   M2 Firebase project + config
                  └──► M4 extension release (zip on tag)
```

| #   | Milestone                     | Outcome                                                                                                                                                                                                                                                                                                           | Who                     | Done when                                                                                              |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| M1  | **CI quality gate**           | GitHub Actions on every push and PR, in three parallel jobs. **Quality:** format, lint, typecheck, unit tests, secret scan, web and extension builds. **Rules:** Firestore rules tests on the emulator. **E2E:** Playwright workflow and extension tests on Linux Chromium. Uploads the build and test artifacts. | Claude                  | All three jobs pass on `main` and a status badge is in the README                                      |
| M2  | **Firebase project + config** | Spark project with Auth (Google and Email), Firestore, AI Logic (Gemini Developer API) and App Check (reCAPTCHA v3). `.firebaserc` is set and `apps/web/.env.local` is filled. The same values are stored as GitHub Actions variables.                                                                            | Owner (console), Claude | `pnpm dev` signs in, saves a Lab session to Firestore, and classifies it with a source the SDK reports |
| M3  | **Continuous deployment**     | PRs get Hosting preview channels. A merge to `main` deploys Hosting plus Firestore rules and indexes, but only after M1 passes. Deploys use a service-account secret.                                                                                                                                             | Claude + owner (secret) | A push to `main` updates `https://<project>.web.app` with no manual steps                              |
| M4  | **Extension release**         | Pinned manifest `key` so the extension ID is stable. The extension is built with the hosted origin, its version stamped from the tag, and the zip attached to a GitHub Release.                                                                                                                                   | Claude                  | Tag `v0.x.y` produces a downloadable zip that syncs with the hosted dashboard                          |
| M5  | **Production verification**   | Playwright smoke test against the deployed URL after each deploy. Manual check of hybrid AI in Chrome 139+ (on-device badge and cloud fallback). App Check enforcement turned on.                                                                                                                                 | Claude + owner          | Smoke passes on the live URL, all three AI modes are checked, and App Check is enforced                |
| M6  | **Submission**                | Demo video (under 3 minutes) recorded from the live site. Devpost filled in from docs/hackathon-submission.md. README links to the live app, video and release. Final status recorded.                                                                                                                            | Owner, Claude (docs)    | Devpost submitted before 2026-11-30 17:00 ET                                                           |

## Design decisions

- **Gate before deploy.** M3 reuses the M1 workflow (`workflow_call` / `needs`), so a red build can never reach Hosting.
- **No secrets in the browser build.** The `VITE_FIREBASE_*` values are public web config. They live in Actions **variables**, not secrets. The only real secret is the deploy service account (M3).
- **The E2E tests need no Firebase.** They run in Local demo mode against the Vite dev server, so M1 is independent of M2.
- **Extension tests need full Chromium.** The headless shell can't load extensions, so CI uses Playwright's `chromium` channel. Google Chrome builds reject `--load-extension`.
- **Rules tests use the emulator only** (`demo-skilltrace` project ID), so CI never touches a real project.
