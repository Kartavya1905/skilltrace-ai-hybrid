# SkillTrace AI: the evidence-backed Skill Passport

[![Pipeline](https://github.com/Kartavya1905/skilltrace-ai-hybrid/actions/workflows/pipeline.yml/badge.svg)](https://github.com/Kartavya1905/skilltrace-ai-hybrid/actions/workflows/pipeline.yml)

**Live app:** https://skilltrace-hybrid-2026.web.app (choose _Continue in Local demo mode_ to explore without an account) · **Chrome extension:** [v0.2.0 release](https://github.com/Kartavya1905/skilltrace-ai-hybrid/releases/tag/v0.2.0) · **Submission:** [docs/hackathon-submission.md](docs/hackathon-submission.md)

SkillTrace AI records what you study on pages you approve, detects the skills involved with **Firebase AI Logic hybrid inference** (on-device Gemini Nano in Chrome, with a cloud model only when you allow it), connects the projects you built, and turns real evidence into a shareable **Skill Passport**.

It keeps three kinds of evidence apart and never merges them into one number:

| Evidence           | Where it comes from                                                  | Shown as                        |
| ------------------ | -------------------------------------------------------------------- | ------------------------------- |
| Learning activity  | Deterministic tracking of video, audio and reading on approved pages | Automatically recorded activity |
| Project work       | Your own manual entries or project timer                             | Self-reported                   |
| Demonstrated skill | Objectively graded assessments                                       | Assessment result (unproctored) |
| GitHub             | Public repository metadata                                           | GitHub metadata, zero hours     |

Built for Google **#BuildHybridAI 2026**.

## Highlights

- **Rewind-aware media timing.** Active time is real elapsed playback time. Unique coverage, revision time, unverified time and paused time are kept separate. Watch 10 minutes, rewind 5 and rewatch: 15 minutes active, 10 minutes coverage, 5 minutes revision. At 2× speed you get real elapsed time.
- **Reading engine.** Uses a 238 wpm baseline that becomes a personalized pace after credible sessions (robust median, outliers excluded). A section counts as read only after enough visible time. Engagement questions pause credit while they're open; wrong answers have no penalty, and five consecutive missed questions reset only that page.
- **Randomized engagement verification.** Video checks come every 5–90 minutes of playback, with 30 s to respond. A missed check marks only the interval since the last verified point as unverified, and the raw log is kept. DEMO mode shortens the intervals without touching production defaults.
- **Hybrid AI that tells the truth.** Every AI feature goes through `firebase/ai`. The source badge reads the SDK's own `response.inferenceSource`. The app never guesses the source and never invents a result.
- **Privacy guard.** We found that `firebase/ai` sends even `ONLY_ON_DEVICE` requests to the cloud when Chrome's Prompt API is missing. SkillTrace refuses on-device-only calls in that case, and throws away any on-device-only result the SDK reports as cloud.
- **Chrome MV3 extension.** Opt-in, per-site optional host permissions, local IndexedDB event log, crash-safe checkpoints, and pull/ack sync with the dashboard over `externally_connectable`. On single-page video sites such as YouTube, each video becomes its own session with its own title and description. Ads are never credited.
- **Speech-based skill detection (opt-in).** Short clips from the watched video, never the microphone, are transcribed on-device by Gemini Nano through the Prompt API audio input. The cloud is used only with your consent. What is _said_ then drives skill detection: a video titled "Lecture 7" whose audio is about `SELECT` queries is classified as SQL.
- **Skill Passport.** You choose exactly which skills, projects, sources and dates are public. Every claim carries its evidence type. You can revoke the link or print the passport.

## Repository layout

```
apps/web            React + Vite + Tailwind dashboard, Learning Lab, passport (Firebase Hosting)
apps/extension      Chrome Manifest V3 extension (esbuild)
packages/shared     Data model, IDs, UTC time helpers, zod event schemas
packages/tracking-engine  Framework-free playback/reading/project-time engines + DOM bindings
packages/skill-taxonomy   Skill normalisation, attribution rules, GitHub skill hints
packages/ai-engine  HybridAIService over Firebase AI Logic (structured output, consent, guard)
firebase/           Firestore rules and indexes
tests/e2e           Playwright: full learning-to-passport flow, extension flow
tests/rules         Firestore rules tests (emulator)
scripts/            Media generator, icon renderer, secret scan
docs/               Architecture, data model, privacy, test plan, deployment, submission
```

## Quick start (local, no Firebase needed)

Requirements: Node 22+, pnpm 10+.

```bash
pnpm install
pnpm dev                 # http://localhost:5310
```

Choose **Continue in Local demo mode**. Tracking, the Learning Lab, projects, assessments and the passport all work, and data stays in your browser. AI features show "not configured" until you connect Firebase. Sessions are queued, never auto-labelled.

To connect Firebase AI Logic, App Check, Auth and Firestore, see [docs/deployment.md](docs/deployment.md).

### Chrome extension

```bash
pnpm build:extension     # apps/extension/dist
```

Open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and select `apps/extension/dist`. Then, in the popup:

1. Enable tracking.
2. Open a learning page and click **Allow tracking on this site**.
3. Use **Open dashboard** to connect the extension.

For a quick demo, approve `localhost` and open `http://localhost:5310/lab/extension-demo.html`. For a hosted dashboard, build with `SKILLTRACE_DASHBOARD_ORIGINS=https://your-project.web.app,http://localhost:5310`.

## Scripts

| Command                        | What it does                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `pnpm test`                    | Unit and integration tests (Vitest, React Testing Library, real `firebase/ai` SDK with stubbed network) |
| `pnpm test:rules`              | Firestore rules tests on the emulator (needs Java)                                                      |
| `pnpm test:e2e`                | Playwright end-to-end tests, including the unpacked extension (needs a Chromium build)                  |
| `pnpm typecheck` / `pnpm lint` | Strict TypeScript and ESLint                                                                            |
| `pnpm check:secrets`           | Fails if a tracked file looks like it contains a secret                                                 |
| `pnpm media:generate`          | Regenerates the original lesson video and audio (Windows speech + Chrome WebCodecs)                     |

## Documentation

- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Privacy](docs/privacy.md)
- [Test plan and results](docs/test-plan.md)
- [Deployment](docs/deployment.md)
- [Hackathon submission and demo script](docs/hackathon-submission.md)
- [Development status](DEVELOPMENT_STATUS.md)

## License

Apache-2.0. See [LICENSE](LICENSE). All lesson text, narration and slides in the Learning Lab are original to this project.
