# Test plan and results

Last full run: 2026-11-23 on Windows 11, Node 24.22.2.

| Suite                                             | Command              | Result                                              |
| ------------------------------------------------- | -------------------- | --------------------------------------------------- |
| Unit + integration (Vitest: core, extension, web) | `pnpm test`          | **74 passed**                                       |
| Firestore rules (emulator)                        | `pnpm test:rules`    | **12 passed**                                       |
| End-to-end (Playwright)                           | `pnpm test:e2e`      | **2 passed** (full workflow; extension in Chromium) |
| Typecheck (strict)                                | `pnpm typecheck`     | pass                                                |
| Lint                                              | `pnpm lint`          | pass                                                |
| Secret scan                                       | `pnpm check:secrets` | pass                                                |

## Coverage of the required scenarios

**Video** (`packages/tracking-engine/test/playback.test.ts`)

- 10-minute video watched once at 1× gives 10 min active and 10 min coverage ✔
- Rewinding 5 min and rewatching gives 15 min active, 10 min coverage, 5 min revision ✔
- Paused time is never counted ✔
- Skipped sections aren't counted, and unannounced jumps count as discontinuities ✔
- 2× playback credits real elapsed time ✔ · rate changes mid-video ✔ · buffering earns nothing ✔
- Duplicate and out-of-order events don't change totals ✔
- A crash credits only up to the last checkpoint ✔ · a refresh splits cleanly into sessions ✔
- Hidden-tab video isn't credited by default; audio is ✔
- A missed verification invalidates only the current window, and a crash during a check counts as missed ✔
- Production bounds are 5–90 min with 30 s to respond ✔ · randomized scheduling ✔
- The same behaviour was verified live in the browser on the generated lesson: 8 s play, 5 s rewind, 7 s play gives 15 s active, 10 s coverage, 5 s revision.

**Reading** (`reading.test.ts`)

- Word count, and the 238 wpm baseline for expected duration ✔
- Personalised pace: baseline until 3 credible sessions, outliers excluded, converges with more data ✔
- Fast scrolling triggers a check ✔
- Credit pauses during a question, and a valid response resumes it ✔
- An incorrect answer has no penalty ✔
- Five consecutive misses reset the page's credit and keep the raw audit log ✔
- A valid response resets the miss counter ✔ · other pages are unchanged ✔ · revisits are counted ✔

**GitHub and projects** (`taxonomy.test.ts`, `project-time.test.ts`, e2e)

- Repository skill suggestions from languages, topics and README ✔ · URL parsing ✔
- Import adds zero learning and zero project hours; commits add zero hours (e2e asserts the dashboard totals) ✔
- Manual sessions update only project time (e2e) ✔ · user confirmation is required (e2e) ✔
- A project shared across skills is one record (one canonical `projects` doc with `skillNames[]`) ✔
- Only `self_reported` and `timer_recorded` sessions carry hours (unit test and Firestore rule) ✔

**AI** (`packages/ai-engine/test/*.test.ts`)

- The real `firebase/ai` SDK accepts our `HybridParams`; `initializeDeviceModel` exists ✔
- `ONLY_IN_CLOUD` through the real SDK (network stubbed) reports `inferenceSource: in_cloud` ✔
- An on-device-only call without the Prompt API makes **no** network call (regression for the SDK fallback found during development) ✔
- Structured output: malformed JSON is retried once then fails, schema violations are rejected, fenced JSON is accepted ✔
- Consent: `ask` prompts only after local failure, a decline uploads nothing, `deny` never reaches the cloud ✔
- Offline with no local model queues the task and never claims a fallback ✔
- Rate limits are surfaced (HTTP 429 and the client limiter) ✔
- The source is never guessed (`unknown` when the SDK does not report it) ✔

**Security** (`tests/rules`, `apps/web/test/passport.test.ts`)

- Users can't read, list, write or delete another user's records ✔
- Path and owner mismatches and unknown collections are rejected ✔
- The public passport accepts only allow-listed fields; it can't be listed, or written as someone else ✔
- The public projection excludes unselected skills, excerpts and URLs, and hides dates and sources unless enabled ✔
- No `independently_verified` claims from clients ✔ · no GitHub tokens in Firestore ✔ · no secrets committed ✔

**End to end** (`tests/e2e/workflow.spec.ts`)
Covers the full path: sign in (local) → onboarding with opt-in → video lesson with rewind → session queued (no AI) → skill correction → 5/5 assessment → GitHub import (API mocked) → "New relevant project detected" → confirm → manual 2 h session → publish passport → public view with evidence labels → revoke.

**Extension** (`tests/e2e/extension.spec.ts`)
Loads the unpacked MV3 build in Chromium, opts in, approves localhost, tracks reading and audio on a plain static page, and pulls both sessions from the dashboard origin. Query strings are confirmed stripped.

## Not automated (manual or hardware-dependent)

- **Real on-device inference.** This needs desktop Chrome 139+ with the Prompt API flag and a downloaded Gemini Nano model. It can't run in CI. The in-app check correctly reported `unavailable` in the test browser.
- **Real cloud inference.** This needs a configured Firebase project with App Check. See deployment.md.
- **Firebase Auth popup flows.** These need a real project.
