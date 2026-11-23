# #BuildHybridAI 2026: submission draft

## Project name

SkillTrace AI

## Tagline

The evidence-backed Skill Passport: show what you learned, how you learned it, and what you built, with on-device AI that keeps your study private.

## Problem

A résumé line like "Python, 2 years" carries no evidence. Learners who teach themselves through videos, docs and side projects can't show _how_ they built a skill. Recruiters can't tell real study from keyword stuffing. Existing trackers make it worse: they merge everything into one inflated "hours" number, count a video as watched because it ran in a background tab, treat GitHub commits as hours, or upload your whole browsing history to a server.

## Solution

SkillTrace records learning activity on pages the learner explicitly approves, and keeps three kinds of evidence strictly apart:

1. **Learning activity**: deterministic, rewind-aware video and audio timing and a personalized reading engine. Engagement checks pause credit, never punish wrong answers, and reset only the affected page after repeated misses.
2. **Project work**: GitHub repositories become evidence milestones worth zero hours. Hours come only from the learner's own timer or manual entries, labelled self-reported.
3. **Demonstrated skill**: objectively graded assessments, labelled unproctored.

Firebase AI Logic classifies each session into skills and topics, on-device whenever possible. The learner then publishes a Skill Passport in which every claim shows the type of evidence behind it.

## Main features

- Chrome MV3 extension with opt-in, per-site permissions, and crash-safe event logging
- Built-in Learning Lab with original lessons: a reading lesson, a narrated video and an audio lesson
- Active time vs unique coverage vs revision vs unverified vs paused, all shown separately
- Randomized presence checks (5–90 min) and a DEMO mode for judges
- Reading pace personalization from credible sessions only
- Skill taxonomy with alias normalization and weighted time attribution (no double counting)
- Learner corrections that later AI inference never overwrites
- GitHub repository import with skill suggestions and user confirmation
- Project timeline with timer, manual sessions and milestones
- Deterministic assessments
- Shareable, printable, revocable Skill Passport
- Export, delete-history and delete-account controls

## Technologies

React 19, TypeScript (strict), Vite, Tailwind CSS 4, Chrome Extension Manifest V3, IndexedDB, **Firebase AI Logic hybrid inference (`firebase/ai`)**, Gemini Nano via Chrome's Prompt API, Gemini cloud model, Firebase App Check, Firebase Authentication, Cloud Firestore (offline persistent cache), Firebase Hosting, Firebase Emulator Suite, Vitest, React Testing Library, Playwright, zod, esbuild.

## Hybrid AI architecture

Six capabilities run through one `HybridAIService` built on `getGenerativeModel(ai, HybridParams)`: skill classification, topic extraction, engagement questions, session summaries, evidence explanations and passport drafts. Each task carries a JSON Schema, passed both as `inCloudParams.generationConfig.responseJsonSchema` and as `onDeviceParams.promptOptions.responseConstraint`, and every response is validated with zod.

- **Allow** maps to `InferenceMode.PREFER_ON_DEVICE`: the SDK's own routing and cloud fallback.
- **Ask** (the default) maps to `ONLY_ON_DEVICE` first. If no local model is available, the learner sees exactly what would be uploaded, then `ONLY_IN_CLOUD` runs once on approval.
- **Never** keeps everything on the device. Tasks wait in a durable queue until a local model is available.
- The UI shows the inference source **reported by the SDK** (`response.inferenceSource`), plus duration and model, for every call. It never guesses.
- Engagement questions on lesson text are generated **on-device only**.

**Why hybrid matters here:** learning content is personal. On-device inference lets skill detection run on everything a learner reads, offline and without uploading it. The cloud model keeps the product working on devices that can't run Gemini Nano, but only with consent and only with minimized input (titles by default).

## Technical challenges

- **An SDK fallback that would have broken our privacy promise.** Integration tests against the real `firebase/ai` package showed that without Chrome's `LanguageModel` global, the SDK creates no on-device adapter and runs even `ONLY_ON_DEVICE` requests in the cloud. We added a guard that refuses on-device-only calls when the Prompt API is absent, and a second check that discards any on-device-only result the SDK reports as cloud.
- **Counting time honestly.** HTML5 `seeking` already reports the target position, so we carry the last observed position into the event. Each span credits `min(real time, media advance / rate)`, so skips, buffering and unannounced jumps earn nothing, and 2× speed earns real time.
- **Surviving crashes and service-worker suspension.** Every event is persisted before it is applied, with stable IDs. Sessions are rebuilt by replaying the log. Duplicates and out-of-order delivery are harmless.
- **Reading "progress" that can't be gamed by a tall screen.** A section counts as read only after a share of its expected reading time has been visible.
- **Original demo media with zero budget.** Narration comes from Windows' built-in speech synthesis. Slides are drawn on a canvas and encoded into a seekable VP9/Opus WebM with WebCodecs in Chrome, and captions are timed from the real audio.

## Real-world impact

Self-taught learners, bootcamp students and career switchers get a credible, private way to show sustained effort and practice. Recruiters get something better than keywords: hours of real study (with their limits stated), revision patterns, practical projects and objective checks, each labelled by evidence type. Because tracking is opt-in, per-site and mostly on-device, the learner stays in control.

## Limitations

- Activity tracking shows time spent with material, not comprehension or identity.
- Project hours are self-reported; GitHub ownership doesn't prove sole authorship.
- Assessments are unproctored and client-graded. Without Cloud Functions, rules bound what a client may claim, but they can't re-grade.
- On-device inference needs desktop Chrome 139+ with the Prompt API flag.
- The extension's reading checks are presence confirmations. Section-specific questions are in the Learning Lab.
- GitHub uses the public, unauthenticated API (public repositories only, 60 requests/hour).
- Audio without captions is tracked for time but not attributed to topics. No speech recognition is performed.

## Future roadmap

- GitHub App with read-only OAuth via a server-side token exchange
- Transcript-based topic attribution for third-party captions
- Proctored or employer-verified assessments (the only path to an "independently verified" label)
- Course-platform integrations that respect each platform's terms
- An Android companion using on-device models

---

# Three-minute demo script

**0:00–0:20 · Hook.** Start on the landing page. "A résumé says 'Python, 2 years'. SkillTrace shows the evidence: what you studied, how, what you built, and what you can prove, with AI that runs on your device."

**0:20–0:45 · Onboarding and privacy.** Sign in. Pick interests. Point at the tracking toggle: "off until I opt in." Approve a site in the extension popup and show Chrome's permission prompt. On the on-device AI step, click **Initialise on-device model** and show the status badge.

**0:45–1:20 · Rewind-aware tracking.** Open the Learning Lab video. Play about 20 s, rewind 10 s, play again. The panel shows active time rising, coverage staying flat, and revision rising. Switch to 2× and point out that active time follows real seconds. Turn on DEMO mode, wait for the "Are you still watching?" check, and answer it.

**1:20–1:45 · Reading and engagement.** On the reading lesson, scroll fast to trigger a question. Answer it wrong and show that no time is lost and the counter resets. Mention the five-miss page reset and that the audit log is kept.

**1:45–2:10 · Hybrid AI.** Open Sessions: the lesson is classified as **Python → Functions, Parameters, Scope**, with a green **On-device (SDK-reported)** badge. Open the Hybrid AI page and run the same prompt in `ONLY_IN_CLOUD`; the badge switches to **Cloud (SDK-reported)**. "The badge comes from the SDK response, never from our guess. And in 'Ask' mode nothing goes to the cloud without consent."

**2:10–2:35 · Projects.** Import a GitHub repository. The banner reads "New relevant project detected." Confirm Python and FastAPI. Point at the overview: learning hours unchanged, project hours 0. Start the project timer, stop it, and show that only project time moves.

**2:35–2:55 · Passport.** Choose skills and projects, leave dates hidden, and publish. Open the public link: every skill shows its evidence badges (automatically recorded, assessment result, self-reported) and a "How to read this passport" section.

**2:55–3:00 · Close.** "Private by default, honest by design. SkillTrace AI."

## Submission checklist (owner actions)

- [ ] Create the Firebase project and deploy (docs/deployment.md), then put the hosted URL in Devpost
- [ ] Record the demo on a machine with Chrome 139+ and the Prompt API flag enabled, so the on-device badge is real
- [ ] Push to a public GitHub repository (Apache-2.0 LICENSE included)
- [ ] Upload the video to YouTube as public, under 3 minutes
- [ ] Paste this description into Devpost
