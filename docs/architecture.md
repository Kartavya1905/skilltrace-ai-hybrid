# Architecture

## Pipeline

```
Learner opts in ──► Chrome extension (approved sites)      First-party Learning Lab (dashboard)
                     content script                         React pages
                        │  DOM bindings (packages/tracking-engine/dom)
                        ▼
                  TrackedSession ── every event persisted BEFORE it is applied
                        │            extension: background IndexedDB   lab: dashboard IndexedDB
                        ▼
        Deterministic reducers (packages/tracking-engine)
          PlaybackTracker  · active time, coverage, revision, unverified, paused
          ReadingTracker   · credited time, progress, revisits, checks, page reset
                        │
                        ▼  reconstructSession(meta, events) — same reducers, idempotent ids
               learning_sessions / learning_events (Firestore, or local IndexedDB in demo mode)
                        │
                        ▼  classification queue (status field is the durable queue)
        HybridAIService (packages/ai-engine) ── firebase/ai getGenerativeModel(HybridParams)
          allow → PREFER_ON_DEVICE (SDK hybrid routing + cloud fallback)
          ask   → ONLY_ON_DEVICE, then consent dialog, then ONLY_IN_CLOUD
          deny  → ONLY_ON_DEVICE only
                        │  zod-validated JSON; source = response.inferenceSource
                        ▼
        Skill taxonomy: normalise names, weighted attribution, user corrections locked
                        │
            ┌───────────┴───────────┐
            ▼                       ▼
   Skill timelines           Project registry ◄── GitHub public import (milestones, 0 h)
   (attributed/shared)       manual sessions + timer (self-reported hours)
            └───────────┬───────────┘
                        ▼
        Passport builder ──► public_passports/{shareId} (selected, aggregated only)
```

## Key decisions

**Event log as the source of truth.** Trackers are pure reducers over an append-only log of events with stable IDs (`{sessionId}_{seq}`). Persisting events is enough to rebuild a session after a refresh, crash or service-worker suspension. Time after the last persisted checkpoint is never credited. Duplicate or out-of-order delivery doesn't change totals.

**Consistency check for media credit.** Each span between two observations credits `min(real elapsed, media advance / rate)`. If the position jumps further than real time allows, the span is a discontinuity and earns no credit. If the position stalls (buffering), the span earns nothing. Seeks close the span at the last observed position before the seek.

**Unique time across tabs.** Each session stores its credited wall-clock intervals. The learner's total is the union of those intervals, so two tabs playing at once count once.

**Attribution, not duplication.** A session that covers Python and SQL splits its time by explicit weights: primary 0.6, secondary skills share 0.4. Per-skill "attributed" time therefore sums to unique time. "Involved" and "shared" time expose the overlap.

**Projects are separate.** Project hours come only from `project_work_sessions` with provenance `self_reported` or `timer_recorded`. GitHub milestones have `durationMs: 0`. Firestore rules enforce both.

**Hybrid AI honesty.**

- The SDK's `inferenceSource` is the only source of truth for where inference ran.
- A request marked on-device-only is refused when `LanguageModel` is missing. Without that global, `firebase/ai` creates no Chrome adapter and would quietly call the cloud.
- An on-device-only result that the SDK reports as `in_cloud` is discarded.

**Extension ↔ dashboard sync.** Sync uses `externally_connectable` with exact dashboard origins set at build time. The background checks `sender.origin` again. The dashboard pulls finished sessions, validates every event with zod, rebuilds totals with the same engine, writes them with set-by-id (idempotent), then sends an ACK so the extension deletes its local copy.

**Offline first.** Tracking needs no network. Firestore uses the persistent multi-tab cache, so writes queue while offline. AI classification uses the session's `classificationStatus` (`pending`/`queued_offline`) as a durable queue and retries when the app comes back online or the AI becomes available. Cloud fallback is never attempted offline.

**Why no Cloud Functions.** The project runs on Firebase's no-cost Spark plan. That means no server-side token exchange for a GitHub App and no server-side assessment grading. GitHub uses the public, unauthenticated REST API, clearly labelled. Assessment scores are graded deterministically on the client, and rules bound what a client may claim (`score ≤ maxScore`, unproctored only).

## Packages

| Package                       | Depends on                             | Notes                                                                                           |
| ----------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `@skilltrace/shared`          | zod                                    | Types for every Firestore entity, event schemas, ID and time helpers                            |
| `@skilltrace/tracking-engine` | shared                                 | No React or Firebase. `./dom` holds the browser bindings used by both the lab and the extension |
| `@skilltrace/skill-taxonomy`  | shared                                 | Taxonomy, aliases, ambiguous-alias context rules, attribution, GitHub hints                     |
| `@skilltrace/ai-engine`       | shared, taxonomy, zod (peer: firebase) | `./firebase` holds the `firebase/ai` factory; the core is SDK-agnostic for testing              |
