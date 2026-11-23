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

## Open blockers (owner action needed)

1. **Firebase project.** Create it, enable Auth (Google and Email), Firestore, AI Logic (Gemini Developer API) and App Check (reCAPTCHA v3), then fill in `apps/web/.env.local`. See docs/deployment.md.
2. **Live hybrid verification.** On Chrome 139+ with the Prompt API flag, open Hybrid AI and run all three modes; confirm the on-device badge appears.
3. **Deploy.** `pnpm build:web && npx firebase deploy --only firestore:rules,firestore:indexes,hosting`, then rebuild the extension with the hosted origin.
4. **Public GitHub repository and YouTube demo (under 3 min).** The script is in docs/hackathon-submission.md.

## Next executable task

After the Firebase config exists: run `pnpm dev`, sign in with Google, complete a Learning Lab session, and confirm the session is classified with an SDK-reported source. Then deploy.

## Known limitations

See README and docs/hackathon-submission.md (Limitations).
