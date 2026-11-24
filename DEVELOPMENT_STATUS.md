# Development status

_Last updated: 2026-11-23. Deadline: 2026-11-30 17:00 ET._

## Current phase

Phase 8 (integration, security, docs) is complete in code. What remains needs owner credentials: Firebase project, deployment, live AI verification, public repository and demo video.

## Completed modules

| Phase | Module                                                                                                      | State                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1     | Monorepo (pnpm, strict TS, ESLint, Prettier), Firebase config, App Check init, `firebase/ai` hybrid service | Done. Real SDK integration tested with a stubbed network. Live inference **not yet verified** (needs a project) |
| 2     | Chrome MV3 extension, Learning Lab, IndexedDB event logs, session reconstruction                            | Done. Extension E2E passes in Chromium                                                                          |
| 3     | Video/audio engine: rewind, pause, seek, rate, buffering, hidden tab, verification windows                  | Done                                                                                                            |
| 4     | Reading engine: word counts, personalised pace, checks, five-miss page reset                                | Done                                                                                                            |
| 5     | Skill classification pipeline, taxonomy and normalisation, attribution, timelines (day/week/month)          | Done (AI path needs a project to run live)                                                                      |
| 6     | GitHub public import and discovery, skill hints + AI suggestions, confirmation, project timelines           | Done (public API; GitHub App OAuth is P2, needs Functions)                                                      |
| 7     | Assessments, passport builder, public recruiter view, privacy settings, export and delete                   | Done                                                                                                            |
| 8     | Firestore rules + tests, E2E, secret scan, docs, Devpost draft, demo script                                 | Done                                                                                                            |

## Tests last run (2026-11-23)

- `pnpm test`: 74/74 passed
- `pnpm test:rules`: 12/12 passed (Firestore emulator)
- `pnpm test:e2e`: 2/2 passed (workflow; extension in cached Chromium 1248)
- `pnpm typecheck`, `pnpm lint`, `pnpm check:secrets`: pass

## Delivery pipeline

Milestones M1–M6 are in docs/pipeline-milestones.md.

- **M1 (CI quality gate): done.** `.github/workflows/ci.yml` passed all three jobs (quality, Firestore rules, E2E) on GitHub, run 45315453716, 2026-11-23.
- **M2 (Firebase project and config): done 2026-11-24.** `skilltrace-hybrid-2026` ("SkillTrace AI Hybrid", Spark plan) is this version's own project, separate from the Codex version.
  - Web app: **SkillTrace Hybrid Web** (`…af84170287ba`). The first app, SkillTrace AI Web, is unused and can be deleted.
  - Firestore `(default)` in nam5, with this repo's rules and indexes.
  - Auth: Google and Email/Password enabled. AI Logic: Gemini Developer API.
  - App Check: Fraud Defense key "SkillTrace Hybrid Web", created in this project with the reCAPTCHA Enterprise API enabled.
  - Verified 2026-11-24 on localhost: an App Check token was issued, and a cloud `generateContent` call succeeded with `inferenceSource: in_cloud`.
  - Verified end to end with the owner signed in. Two Learning Lab video sessions were saved under `users/<uid>/learning_sessions`, with their events, sources, skills and inference logs. One had 64.1 s eligible time.
  - Both sessions are classified as Python by the **on-device** model: `classifiedBy.source: "on_device"`, mode `only_on_device`, model "Chrome built-in model via Prompt API", in 8.7 s and 25.5 s. This confirms that live hybrid on-device inference works.
  - The earlier cloud path was verified as well: `inferenceSource: in_cloud`.
- **M3 (continuous deployment): done 2026-11-24.** Pipeline run 45364961480 on `edbb00a` passed:
  - CI: quality, Firestore rules and E2E
  - live deploy of Hosting plus Firestore rules and indexes, then a smoke test

  The live release on https://skilltrace-hybrid-2026.web.app is labelled "GitHub Actions edbb00a" and was released by the `github-deploy` service account. App Check on the live domain was verified earlier (an Enterprise token was exchanged with HTTP 200). From now on, every push to `main` deploys automatically after CI passes, and same-repository PRs get a 7-day preview.

## Open blockers (owner action needed)

1. **M4 extension release.** Build the extension with the hosted origin and publish the zip on a GitHub Release.

2. **Live hybrid verification.** On-device and cloud are both confirmed on localhost (2026-11-24). Re-check on the deployed site in M5.
3. **Deploy.** `pnpm build:web && npx firebase deploy --only firestore:rules,firestore:indexes,hosting`, then rebuild the extension with the hosted origin.
4. **YouTube demo (under 3 min).** The public repository is live at https://github.com/Kartavya1905/skilltrace-ai-hybrid. The demo script is in docs/hackathon-submission.md.

## Next executable task

After the Firebase config exists: run `pnpm dev`, sign in with Google, complete a Learning Lab session, and confirm the session is classified with an SDK-reported source. Then deploy.

## Known limitations

See README and docs/hackathon-submission.md (Limitations).
