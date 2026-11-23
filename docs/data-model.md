# Data model

The TypeScript definitions live in `packages/shared/src/model.ts`. Firestore layout:

```
users/{uid}/{collection}/{id}      private, owner-only (see firebase/firestore.rules)
public_passports/{shareId}         explicitly published, aggregated passport (get by id only)
```

Every private record has the envelope `id, userId, createdAt, updatedAt (ISO-8601 UTC), provenance, schemaVersion`.

| Collection              | Purpose                                                                                                                                  | Notable fields                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profile`               | Display name, interests, target career, onboarding state                                                                                 |                                                                                                                                                               |
| `preferences`           | Opt-in tracking, pause, cloud-AI consent (`ask/allow/deny`), excerpt sharing, DEMO mode, accessibility response window, reading baseline | Tracking defaults to **off**                                                                                                                                  |
| `tracking_permissions`  | Approved origins (reserved; the extension is the source of truth)                                                                        |                                                                                                                                                               |
| `skills`                | Canonical skill records                                                                                                                  | `userLocked`                                                                                                                                                  |
| `skill_topics`          | Topics per skill, mapped to subskills                                                                                                    | `sourceIds`                                                                                                                                                   |
| `learning_sources`      | One per page or document (privacy-preserving `pageId`)                                                                                   | URL stored as origin+path only                                                                                                                                |
| `learning_sessions`     | Reconstructed session totals                                                                                                             | `eligibleMs, rawMs, unverifiedMs, revisionMs, coverageSec, eligibleIntervals, attributions, classificationStatus, classifiedBy{source,durationMs,model,mode}` |
| `learning_events`       | Raw audit log                                                                                                                            | Stable id `{sessionId}_{seq}`                                                                                                                                 |
| `reading_metrics`       | Per reading session                                                                                                                      | `observedWpm, credible, resets, revisits, consecutiveMissed`                                                                                                  |
| `playback_segments`     | Reserved for per-segment export                                                                                                          |                                                                                                                                                               |
| `engagement_checks`     | Every check: trigger, outcome, correctness (separate from time), dispute note                                                            |                                                                                                                                                               |
| `assessments`           | Deterministic results                                                                                                                    | `verificationLevel` is always `self_attempted_unproctored`                                                                                                    |
| `projects`              | One canonical record per project                                                                                                         | `skillNames[]`, `confirmedByUser`                                                                                                                             |
| `project_skill_links`   | Suggested or confirmed skill links                                                                                                       | `suggestedBy: github_languages / ai_suggestion / user`                                                                                                        |
| `project_work_sessions` | The **only** source of project hours                                                                                                     | provenance `self_reported` or `timer_recorded`                                                                                                                |
| `github_connections`    | Public username only; never a token                                                                                                      |                                                                                                                                                               |
| `github_milestones`     | Repo created, commits, last push, learner milestones                                                                                     | `durationMs: 0` always                                                                                                                                        |
| `passport_profiles`     | Passport header and summary                                                                                                              | `summarySource`                                                                                                                                               |
| `public_share_settings` | What is public                                                                                                                           | `publicSkills, publicProjectIds, showSources, showTimestamps, showAssessments`                                                                                |
| `inference_logs`        | Every AI call                                                                                                                            | `source` as reported by the SDK, `mode`, `durationMs`, `errorCode`                                                                                            |

## Provenance values

`auto_recorded`, `self_reported`, `timer_recorded`, `github_metadata`, `assessment_result`, `ai_suggestion`, `user_correction`, `sample_data`, `independently_verified`.

`independently_verified` is reserved. Security rules reject it from clients.

## Indexes

All queries read a single owner subcollection, so no composite indexes are needed (`firebase/firestore.indexes.json`).

## Size limits

Event batches are written in chunks of 400. Rules cap `eligibleIntervals` at 5,000 entries and the public passport at 50 skills and 50 projects.
