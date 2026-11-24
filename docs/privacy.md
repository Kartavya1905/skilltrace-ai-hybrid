# Privacy

Privacy is a product feature in SkillTrace, not a setting buried in a menu.

## What is collected, and only after opt-in

Tracking is **off by default**. In the dashboard and in the extension, nothing is recorded until the learner turns it on. The extension then runs only on origins the learner approves one by one, through Chrome's own permission prompt (optional host permissions).

On an approved page SkillTrace may record:

- page title, origin and path (query strings and fragments are dropped), and a hashed page ID
- content type, word count, and section word counts
- a short excerpt (up to 1,500 characters) of the main content, used for skill detection
- media events (play, pause, seek, rate, position checkpoints), scroll position, page visibility and focus
- a throttled "interaction" presence ping, with **no key or pointer details**

SkillTrace never records keystrokes, form-field values, passwords, clipboard, private messages, microphone, camera or screen. The content script ignores navigation, headers, forms and editable regions, and never changes the page's DOM. Page text is treated as data. Prompts fence it and tell the model never to follow instructions inside it.

## Speech-based skill detection (opt-in, off by default)

With **Detect skills from speech** on in the extension popup, the extension records at most three short audio clips per video session: about 20 seconds each, taken while the video plays.

- **Where the audio comes from:** the tracked `<video>`/`<audio>` element itself, through `HTMLMediaElement.captureStream()`. Never the microphone, other tabs, or the screen. If a site serves cross-origin media without CORS, nothing can be captured and nothing is recorded.
- **How clips travel:** clips sit in the extension's local IndexedDB until the dashboard syncs. The dashboard transcribes them once and the extension deletes them on acknowledgement. Audio is **never** written to Firestore.
- **Who transcribes:** Chrome's on-device Gemini Nano does it first, through the Prompt API's audio input, so nothing leaves the browser. If that isn't available, the cloud model through Firebase AI Logic is used, but only under your cloud-AI setting. With "ask" you approve each upload, and the prompt states the clip count and length. With "deny" audio never leaves the device.
- **What is kept:** a short transcript excerpt of up to 900 characters, stored in `learning_sources.excerpt`, plus `learning_sources.speech`, which records who transcribed it: `on_device` or `in_cloud` as reported, the model, the clip count and the time.
- **How the transcript is treated:** as untrusted content, like page text. Prompts fence it as data, and anything said in a video is never followed as an instruction.

## When content leaves the device

| Setting                            | Behaviour                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Cloud AI: **Ask** (default)        | On-device first. If it is unavailable, a dialog says exactly what would be uploaded and asks before each cloud request. |
| Cloud AI: **Allow**                | `PREFER_ON_DEVICE`: the Firebase SDK falls back to the cloud automatically.                                             |
| Cloud AI: **Never**                | On-device only. Tasks wait until a local model is available.                                                            |
| Include excerpts in cloud requests | **Off** by default: cloud requests contain titles only.                                                                 |

Engagement questions for Learning Lab reading are generated **on-device only**, or use the lesson author's question. Lesson text is never uploaded for them.

The SDK's `firebase/ai` would send even an `ONLY_ON_DEVICE` request to the cloud when Chrome's Prompt API is missing. SkillTrace blocks that case before calling the SDK.

## Storage

- Extension: events stay in the extension's own IndexedDB until the dashboard syncs and acknowledges them, then they are deleted.
- Dashboard: Firestore under `users/{uid}` (owner-only rules), or browser IndexedDB in Local demo mode.
- GitHub: public, unauthenticated API only. No token is requested or stored, and rules reject token fields.

## Learner controls

In Privacy & Settings, the learner can:

- pause tracking (dashboard and extension)
- remove individual sites (extension popup)
- export all data as JSON
- delete learning history
- delete the account, which deletes all data, revokes the public passport and deletes the Auth user
- disconnect GitHub
- disable public sharing
- load or remove clearly labelled sample data

The passport is private until published. The learner picks the skills and projects, and whether source titles, dates and assessment results appear. The public document contains only aggregated, selected evidence: never raw events, URLs, excerpts, engagement checks or inference logs.

## Fairness

- Reading speed and scrolling are not comprehension measures and are never used to label anyone dishonest.
- Incorrect answers carry no penalty.
- Lack of mouse or keyboard input alone never removes credit. Only a missed explicit check does.
- Response windows can be extended 2× or 4× for accessibility, and missed checks can be disputed.
- AI-assisted work is not treated as dishonest. Assessments record their assistance policy.

## Security review (pre-deployment checklist)

- [x] Firestore rules: owner-only, allow-listed collections, envelope validation, business rules, public allow-list (12 emulator tests)
- [x] App Check initialised before any AI Logic call (reCAPTCHA v3 or Enterprise; debug token for local dev only)
- [x] No secrets in the repository (`pnpm check:secrets`). The Firebase web config is not secret, but it lives in `.env.local`, which git ignores
- [x] Extension: minimal permissions (`storage`, `scripting`, `activeTab`), optional per-site hosts, external messages restricted to exact dashboard origins and re-checked
- [x] Hosting headers: `nosniff`, `X-Frame-Options: DENY`, restrictive `Permissions-Policy`
- [ ] Configure App Check enforcement for Firestore in the console after verifying traffic (see deployment.md)
- [ ] Production reCAPTCHA domain list must contain only the hosting domain
