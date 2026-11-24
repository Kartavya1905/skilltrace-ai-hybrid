# #BuildHybridAI 2026: submission

## Links

| What                | Where                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Live app            | https://skilltrace-hybrid-2026.web.app                                                                                                                             |
| Source (Apache-2.0) | https://github.com/Kartavya1905/skilltrace-ai-hybrid                                                                                                               |
| Chrome extension    | https://github.com/Kartavya1905/skilltrace-ai-hybrid/releases/tag/v0.2.0 (`skilltrace-extension-v0.2.0.zip`, load unpacked; ID `kecllpafndpfocijmodnoilonglpkjcf`) |
| Demo video          | _add the YouTube link after uploading_                                                                                                                             |

**For judges:** open the live app and choose **Continue in Local demo mode** to explore without an account. Sign in with Google or email to use Firebase AI Logic. On-device inference needs desktop Chrome 139+ with Chrome's built-in AI (Prompt API) enabled.

## Project name

SkillTrace AI

## Tagline

The evidence-backed Skill Passport: show what you learned, how you learned it, and what you built, with on-device AI that keeps your study private.

## Problem

A résumé line like "Python, 2 years" carries no evidence. Learners who teach themselves through videos, docs and side projects can't show _how_ they built a skill. Recruiters can't tell real study from keyword stuffing. Existing trackers make it worse:

- they merge everything into one inflated "hours" number
- they count a video as watched because it ran in a background tab
- they treat GitHub commits as hours
- they upload your whole browsing history to a server

## Solution

SkillTrace records learning activity on pages the learner explicitly approves, and keeps three kinds of evidence strictly apart:

1. **Learning activity.** Deterministic, rewind-aware video and audio timing, and a personalized reading engine. Engagement checks pause credit, never punish wrong answers, and reset only the affected page after repeated misses.
2. **Project work.** GitHub repositories become evidence milestones worth zero hours. Hours come only from the learner's own timer or manual entries, labelled self-reported.
3. **Demonstrated skill.** Objectively graded assessments, labelled unproctored.

Firebase AI Logic classifies each session into skills and topics, on-device whenever possible. For videos, it can also use **what is said**: opt-in speech detection transcribes short clips from the video itself, never the microphone. The learner then publishes a Skill Passport in which every claim shows the type of evidence behind it.

## Main features

- **Chrome MV3 extension.**
  - Opt-in, per-site permissions and crash-safe event logging.
  - A fixed extension ID, so the dashboard connects with no setup.
  - On YouTube-style sites, one session per video, with that video's own title and description. Ads are never credited.
- **Speech-based skill detection (opt-in).** Up to three 20-second clips are taken from the playing media element and transcribed on-device first. A video titled "Lecture 7" whose narration covers `SELECT` queries is classified as SQL.
- **Built-in Learning Lab** with original lessons: a reading lesson, a narrated video and an audio lesson.
- **Separate time measures.** Active time, unique coverage, revision, unverified time and paused time are all shown separately.
- **Presence checks.** Randomized checks every 5–90 minutes, plus a DEMO mode for judges.
- **Reading pace personalization** from credible sessions only.
- **Skill taxonomy** with alias normalization and weighted time attribution, so nothing is counted twice.
- **Learner corrections** that later AI inference never overwrites.
- **GitHub repository import** with skill suggestions and user confirmation.
- **Project timeline** with a timer, manual sessions and milestones.
- **Deterministic assessments.**
- **Skill Passport** that can be shared, printed and revoked.
- **Data controls:** export, delete history and delete account.

## Technologies

| Area               | Tools                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend           | React 19, TypeScript (strict), Vite, Tailwind CSS 4                                                                                                                                  |
| Extension          | Chrome Extension Manifest V3, IndexedDB, MediaRecorder / `captureStream()`                                                                                                           |
| AI                 | **Firebase AI Logic hybrid inference (`firebase/ai`)**, Gemini Nano via Chrome's Prompt API (text and audio input), Gemini cloud model                                               |
| Firebase           | App Check with reCAPTCHA Enterprise / Fraud Defense (enforced for AI Logic and Firestore), Authentication, Cloud Firestore with an offline persistent cache, Hosting, Emulator Suite |
| Testing            | Vitest, React Testing Library, Playwright                                                                                                                                            |
| Build and delivery | GitHub Actions (CI, then deploy, then live smoke test; tag-triggered extension releases), zod, esbuild                                                                               |

## Hybrid AI architecture

Eight AI tasks run through one `HybridAIService`:

- skill classification
- topic extraction
- engagement questions
- session summaries
- evidence explanations
- passport drafts
- repository skill suggestions
- speech transcription

The text tasks use `getGenerativeModel(ai, HybridParams)`. Each carries a JSON Schema, passed both as `inCloudParams.generationConfig.responseJsonSchema` and as `onDeviceParams.promptOptions.responseConstraint`, and every response is validated with zod.

Routing follows the learner's setting:

- **Allow** maps to `InferenceMode.PREFER_ON_DEVICE`: the SDK's own routing and cloud fallback.
- **Ask** (the default) maps to `ONLY_ON_DEVICE` first. If no local model is available, the learner sees exactly what would be uploaded, and `ONLY_IN_CLOUD` runs once on approval.
- **Never** keeps everything on the device. Tasks wait in a durable queue until a local model is available.

Two rules apply to every call:

- **The UI never guesses the source.** It shows the source **reported by the SDK** (`response.inferenceSource`), plus the duration and model.
- **Engagement questions on lesson text are generated on-device only.**

Speech follows the same consent rules:

1. **On-device:** Chrome's Prompt API with audio input.
2. **Cloud:** Firebase AI Logic in `ONLY_IN_CLOUD` with inline audio, only under Allow, or under Ask after an explicit yes.

Audio is never stored. Only a short transcript and its provenance are kept.

**Why hybrid matters here:** learning content is personal. On-device inference lets skill detection run on everything a learner reads and hears, offline and without uploading it. The cloud model keeps the product working on devices that can't run Gemini Nano, but only with consent and only with minimized input (titles by default).

**Verified live (2026-11-24):**

- **On-device classification:** two Learning Lab sessions saved to Firestore were classified as Python by Chrome's built-in model, with the SDK reporting `on_device` (8.7 s and 25.5 s).
- **Cloud transcription:** a 12-second narration clip was transcribed accurately through Firebase AI Logic (`in_cloud`, 2.3 s).
- **Speech-driven detection:** with only that transcript, a video titled "Lecture 7" moved from "not learning content" to **SQL (confidence 0.95)**.

## Technical challenges

- **An SDK fallback that would have broken our privacy promise.**
  - Integration tests against the real `firebase/ai` package showed that without Chrome's `LanguageModel` global, the SDK creates no on-device adapter and runs even `ONLY_ON_DEVICE` requests in the cloud.
  - We added a guard that refuses on-device-only calls when the Prompt API is absent, and a second check that discards any on-device-only result the SDK reports as cloud.
- **Audio isn't supported by the SDK's on-device path.** The `firebase/ai` Chrome adapter accepts only text and JPEG/PNG images. On-device speech therefore calls the Prompt API's audio input directly and is labelled `on_device` only because it never leaves the browser. Cloud speech goes through Firebase AI Logic and reports the SDK's source.
- **Single-page video sites.**
  - YouTube swaps videos inside one `<video>` element and keeps the video ID in the query string. A naive tracker merges every video into the first session, under one "/watch" page.
  - SkillTrace ends a session whenever the source changes and re-reads the title and description. Its page ID hashes only the site's known content parameter (`v`). Stored URLs never include query strings.
- **Counting time honestly.**
  - HTML5 `seeking` already reports the target position, so we carry the last observed position into the event.
  - Each span credits `min(real time, media advance / rate)`. Skips, buffering and unannounced jumps earn nothing, and 2× speed earns real time.
- **Surviving crashes and service-worker suspension.** Every event is persisted before it is applied, with stable IDs, and sessions are rebuilt by replaying the log. Duplicates and out-of-order delivery are harmless.
- **Reading "progress" that can't be gamed by a tall screen.** A section counts as read only after a share of its expected reading time has been visible.
- **Original demo media with zero budget.** Narration comes from Windows' built-in speech synthesis. Slides are drawn on a canvas and encoded into a seekable VP9/Opus WebM with WebCodecs in Chrome, and captions are timed from the real audio.
- **A delivery pipeline that can't ship a red build.**
  - Every push runs:
    - 116 unit and security-rules tests (on the Firestore emulator)
    - 2 end-to-end tests, one of which loads the real extension
  - Only then does it deploy to Firebase Hosting, followed by a browser smoke test of the live site.
  - Version tags publish the extension zip.
  - App Check is enforced for Firebase AI Logic and Cloud Firestore.

## Real-world impact

- **Learners** (self-taught learners, bootcamp students and career switchers) get a credible, private way to show sustained effort and practice.
- **Recruiters** get something better than keywords: hours of real study (with their limits stated), revision patterns, practical projects and objective checks, each labelled by evidence type.
- **Control stays with the learner,** because tracking is opt-in, per-site and mostly on-device.

## Limitations

- **Evidence:**
  - Activity tracking shows time spent with material, not comprehension or identity.
  - Project hours are self-reported, and GitHub ownership doesn't prove sole authorship.
  - Assessments are unproctored and client-graded. Without Cloud Functions, security rules bound what a client may claim, but they can't re-grade.
- **On-device AI:**
  - It needs desktop Chrome 139+ with Chrome's built-in AI.
  - On-device speech also needs the Prompt API's multimodal (audio) input. Without it, speech goes to the cloud only with consent.
- **Speech detection** samples up to three 20-second clips per video. It can't capture cross-origin media served without CORS; such media is still tracked for time.
- **Sync** from the extension happens when the learner clicks Sync in the dashboard, not in real time.
- **Extension reading checks** are presence confirmations. Section-specific questions are in the Learning Lab.
- **GitHub** uses the public, unauthenticated API: public repositories only, 60 requests per hour.

## Future roadmap

- A GitHub App with read-only OAuth via a server-side token exchange
- Automatic background sync between the extension and the dashboard
- Proctored or employer-verified assessments (the only path to an "independently verified" label)
- Course-platform integrations that respect each platform's terms
- An Android companion using on-device models

---

# Three-minute demo script (live site)

**Setup before recording:**

- Use desktop Chrome with built-in AI enabled.
- Install the v0.2.0 extension, turn on tracking, **Detect skills from speech** and DEMO mode, and approve `skilltrace-hybrid-2026.web.app` in the popup.
- Sign in on the live site, and set cloud AI to **Ask**.
- Use only SkillTrace's own lessons on screen, with no third-party videos.

**0:00–0:20 · Hook.** Start on the landing page. "A résumé says 'Python, 2 years'. SkillTrace shows the evidence: what you studied, how, what you built and what you can prove, with AI that runs on your device."

**0:20–0:55 · Rewind-aware tracking.**

1. Open the Learning Lab video. Play about 20 s, rewind 10 s, and play again.
2. The panel shows active time rising, coverage staying flat and revision rising.
3. Switch to 2×: active time follows real seconds.
4. Wait for the DEMO "Are you still watching?" check and answer it.

**0:55–1:20 · Hybrid AI.**

1. Open **Sessions**. The lesson is classified as **Python → Functions, Parameters, Scope**, with an **On-device (SDK-reported)** badge.
2. On the **Hybrid AI** page, run the same classification in `ONLY_IN_CLOUD`. The badge switches to **Cloud (SDK-reported)**.
3. Say: "The badge comes from the SDK response, never from our guess."

**1:20–1:55 · Speech-based skill detection.**

1. Open `/lab/extension-demo.html` (our own SQL narration) and play the audio for about 15 s. The extension samples a clip from the audio element, not the microphone.
2. In **Settings → Extension**, click **Sync**: "1 with speech transcribed."
3. If the cloud is needed, show the consent prompt with the clip count and length.
4. The session is classified as **SQL** because of what was said.

**1:55–2:20 · Projects.**

1. Import a GitHub repository. The banner reads "New relevant project detected."
2. Confirm the suggested skills.
3. The overview shows learning hours unchanged and project hours at 0.
4. Start and stop the project timer: only project time moves.

**2:20–2:50 · Passport.**

1. Choose skills and projects, and publish.
2. Open the public link. Every skill shows its evidence badges: automatically recorded, assessment result and self-reported.
3. Show the "How to read this passport" section.
4. Revoke the link: it stops working.

**2:50–3:00 · Close.** "Private by default, honest by design. SkillTrace AI."

## Submission checklist (owner actions)

- [x] Firebase project created and deployed: https://skilltrace-hybrid-2026.web.app (CI-gated auto-deploy)
- [x] Public GitHub repository with an Apache-2.0 LICENSE: https://github.com/Kartavya1905/skilltrace-ai-hybrid
- [x] Extension released: v0.2.0
- [ ] Sign in on the live site and run the Hybrid AI modes. Install the v0.2.0 extension and confirm a speech-transcribed sync (M5 owner check).
- [ ] Record the demo following the script above: Chrome with built-in AI, so the on-device badge is real, and only SkillTrace's own lesson media.
- [ ] Upload it to YouTube as **public**, under 3 minutes, and put the link in the Links table above and in the README.
- [ ] Paste this description into Devpost, add the live app, repository and video links, and submit before **2026-11-30 17:00 ET**.
