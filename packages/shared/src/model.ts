/**
 * SkillTrace data model.
 *
 * Three kinds of evidence are kept apart on purpose and never summed into one number:
 *   1. Learning activity   (automatically recorded, deterministic tracking engine)
 *   2. Project work        (self-reported or explicitly timer-recorded by the learner)
 *   3. Demonstrated skill  (assessment results)
 * GitHub metadata is a fourth, zero-duration kind: milestones, never hours.
 */

export const SCHEMA_VERSION = 1;

/** How a record came to exist. Shown next to every public claim. */
export type Provenance =
  | 'auto_recorded' // deterministic tracking of real activity (extension or first-party Learning Lab)
  | 'self_reported' // the learner typed it in
  | 'timer_recorded' // the learner explicitly started/stopped a project timer
  | 'github_metadata' // fetched from the GitHub API
  | 'assessment_result' // deterministic grading of an attempt
  | 'ai_suggestion' // produced by Firebase AI Logic; needs user confirmation where it matters
  | 'user_correction' // the learner overrode an AI suggestion
  | 'sample_data' // clearly labelled demonstration data
  | 'independently_verified'; // reserved: only when a third party genuinely verified it

export const EVIDENCE_LABELS: Record<Provenance, string> = {
  auto_recorded: 'Automatically recorded activity',
  self_reported: 'Self-reported',
  timer_recorded: 'Self-reported (timer)',
  github_metadata: 'GitHub metadata',
  assessment_result: 'Assessment result',
  ai_suggestion: 'AI suggestion',
  user_correction: 'Learner correction',
  sample_data: 'Sample data (demo)',
  independently_verified: 'Independently verified',
};

export interface BaseRecord {
  id: string;
  userId: string;
  createdAt: string; // ISO UTC
  updatedAt: string; // ISO UTC
  provenance: Provenance;
  schemaVersion: number;
}

export type ContentType = 'video' | 'audio' | 'reading' | 'practical' | 'unknown';

export type CloudAIConsent = 'ask' | 'allow' | 'deny';

export interface UserProfile extends BaseRecord {
  displayName: string;
  headline: string;
  interests: string[];
  targetCareer: string;
  onboardingComplete: boolean;
}

export interface Preferences extends BaseRecord {
  trackingEnabled: boolean;
  trackingPaused: boolean;
  cloudAIConsent: CloudAIConsent;
  /** Send page excerpts (not just titles) to the cloud model when cloud is allowed. */
  allowCloudExcerpts: boolean;
  demoMode: boolean;
  /** Accessibility: multiplier on engagement response windows (1 = 30 s video / 60 s reading). */
  responseWindowMultiplier: number;
  readingBaselineWpm: number;
  creditHiddenVideo: boolean;
}

export interface TrackingPermission extends BaseRecord {
  origin: string; // e.g. https://docs.python.org
  enabled: boolean;
  grantedVia: 'extension' | 'first_party';
}

export interface Skill extends BaseRecord {
  name: string; // canonical, e.g. "JavaScript"
  aliases: string[];
  category: string;
  firstDetectedAt: string;
  lastStudiedAt: string;
  /** User-pinned name/visibility that later inference must not overwrite. */
  userLocked: boolean;
}

export interface SkillTopic extends BaseRecord {
  skillId: string;
  name: string;
  subskill: string;
  firstSeenAt: string;
  lastSeenAt: string;
  sourceIds: string[];
}

export interface LearningSource extends BaseRecord {
  pageId: string; // privacy-preserving hash of origin+path
  title: string;
  url: string; // origin+path only, empty when the user hides sources
  origin: string;
  contentType: ContentType;
  wordCount: number;
  durationSec: number; // media duration, 0 for reading
  excerpt: string; // short, permitted excerpt used for classification
}

export type ClassificationStatus = 'pending' | 'queued_offline' | 'classified' | 'corrected' | 'failed';

export interface SkillAttribution {
  skill: string; // canonical skill name
  weight: number; // 0..1, weights per session sum to 1
  topics: string[];
}

export interface LearningSession extends BaseRecord {
  sourceId: string;
  pageId: string;
  contentType: ContentType;
  startedAt: string;
  endedAt: string;
  /** Wall-clock intervals (epoch ms) that earned eligible credit; used for cross-tab de-duplication. */
  eligibleIntervals: { start: number; end: number }[];
  rawMs: number;
  eligibleMs: number;
  unverifiedMs: number;
  revisionMs: number;
  coverageSec: number; // unique media seconds or reading-equivalent seconds
  coverageRatio: number; // 0..1
  pausedMs: number;
  classificationStatus: ClassificationStatus;
  attributions: SkillAttribution[];
  summary: string;
  /** Only set when an AI result exists; source is exactly what the SDK response reported. */
  classifiedBy: { source: InferenceSourceLabel; durationMs: number; model: string; mode: string; at: string } | null;
  device: 'extension' | 'learning_lab';
}

export interface LearningEventRecord extends BaseRecord {
  sessionId: string;
  seq: number;
  type: string;
  t: number;
  payload: Record<string, unknown>;
}

export interface ReadingMetrics extends BaseRecord {
  pageId: string;
  wordCount: number;
  expectedMs: number;
  progressRatio: number;
  creditedMs: number;
  rawMs: number;
  observedWpm: number | null;
  credible: boolean;
  resets: number;
  revisits: number;
}

export interface PlaybackSegmentRecord extends BaseRecord {
  sessionId: string;
  fromPos: number;
  toPos: number;
  start: number;
  end: number;
  rate: number;
  status: 'eligible' | 'unverified' | 'hidden' | 'pending_verification';
}

export interface EngagementCheckRecord extends BaseRecord {
  sessionId: string;
  pageId: string;
  kind: 'video_presence' | 'reading_question';
  trigger: string;
  issuedAt: number;
  respondedAt: number | null;
  outcome: 'responded' | 'missed';
  answerCorrect: boolean | null;
  question: string;
  disputed: boolean;
  disputeNote: string;
}

export type AssessmentType = 'multiple_choice' | 'short_explanation' | 'code_output' | 'debugging';

export interface AssessmentRecord extends BaseRecord {
  skill: string;
  title: string;
  attemptedAt: string;
  questions: { id: string; prompt: string; type: AssessmentType; answer: string; correct: boolean | null }[];
  score: number; // objectively graded questions only
  maxScore: number;
  assistancePolicy: 'closed_book' | 'open_book' | 'ai_assisted_allowed';
  verificationLevel: 'self_attempted_unproctored' | 'independently_proctored';
  gradedBy: 'deterministic' | 'ai_feedback_only';
}

export type ProjectStatus = 'suggested' | 'active' | 'completed' | 'archived' | 'dismissed';

export interface Project extends BaseRecord {
  title: string;
  description: string;
  skillNames: string[]; // canonical skill references, one record per project
  githubUrl: string;
  startedAt: string; // user-confirmed
  status: ProjectStatus;
  technologies: string[];
  evidenceLinks: { label: string; url: string }[];
  /** Set for GitHub-discovered projects until the learner confirms. */
  confirmedByUser: boolean;
}

export interface ProjectSkillLink extends BaseRecord {
  projectId: string;
  skill: string;
  suggestedBy: 'ai_suggestion' | 'github_languages' | 'user';
  confirmed: boolean;
}

export interface ProjectWorkSession extends BaseRecord {
  projectId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  description: string;
  evidenceUrl: string;
  skillNames: string[];
  /** 'self_reported' (manual entry) or 'timer_recorded'. Nothing else may carry project hours. */
  provenance: 'self_reported' | 'timer_recorded';
}

export interface GithubConnection extends BaseRecord {
  /** Public username used for unauthenticated discovery. No token is ever stored. */
  username: string;
  mode: 'public_url_import' | 'public_username_discovery';
  connectedAt: string;
}

export interface GithubMilestone extends BaseRecord {
  projectId: string;
  kind: 'repo_created' | 'commit' | 'pull_request' | 'release' | 'last_push';
  title: string;
  occurredAt: string;
  url: string;
  /** Milestones are evidence markers. They never carry duration. */
  durationMs: 0;
}

export interface PublicShareSettings extends BaseRecord {
  shareId: string;
  enabled: boolean;
  publicSkills: string[];
  publicProjectIds: string[];
  showSources: boolean;
  showTimestamps: boolean;
  showAssessments: boolean;
}

export type InferenceSourceLabel = 'on_device' | 'in_cloud' | 'unknown';

export interface InferenceLog extends BaseRecord {
  task: string;
  source: InferenceSourceLabel;
  mode: string;
  model: string;
  durationMs: number;
  ok: boolean;
  errorCode: string;
  at: string;
}

/** Private collection names under users/{uid}/. Mirrors the Firestore rules allow-list. */
export const PRIVATE_COLLECTIONS = [
  'profile',
  'preferences',
  'tracking_permissions',
  'skills',
  'skill_topics',
  'learning_sources',
  'learning_sessions',
  'learning_events',
  'reading_metrics',
  'playback_segments',
  'engagement_checks',
  'assessments',
  'projects',
  'project_skill_links',
  'project_work_sessions',
  'github_connections',
  'github_milestones',
  'passport_profiles',
  'public_share_settings',
  'inference_logs',
] as const;

export type PrivateCollection = (typeof PRIVATE_COLLECTIONS)[number];

export interface CollectionTypes {
  profile: UserProfile;
  preferences: Preferences;
  tracking_permissions: TrackingPermission;
  skills: Skill;
  skill_topics: SkillTopic;
  learning_sources: LearningSource;
  learning_sessions: LearningSession;
  learning_events: LearningEventRecord;
  reading_metrics: ReadingMetrics;
  playback_segments: PlaybackSegmentRecord;
  engagement_checks: EngagementCheckRecord;
  assessments: AssessmentRecord;
  projects: Project;
  project_skill_links: ProjectSkillLink;
  project_work_sessions: ProjectWorkSession;
  github_connections: GithubConnection;
  github_milestones: GithubMilestone;
  passport_profiles: PassportProfile;
  public_share_settings: PublicShareSettings;
  inference_logs: InferenceLog;
}

export interface PassportProfile extends BaseRecord {
  displayName: string;
  headline: string;
  githubUrl: string;
  portfolioUrl: string;
  summary: string; // optional AI-drafted, user-edited
  summarySource: InferenceSourceLabel | 'user';
}

/** Shape stored at public_passports/{shareId}. Only explicitly selected, already-aggregated data. */
export interface PublicPassport {
  shareId: string;
  ownerUid: string;
  visibility: 'public';
  schemaVersion: number;
  publishedAt: string;
  displayName: string;
  headline: string;
  githubUrl: string;
  portfolioUrl: string;
  summary: string;
  skills: PublicSkillEvidence[];
  projects: PublicProjectEvidence[];
  limitations: string[];
}

export interface PublicSkillEvidence {
  name: string;
  learningStart: string | null; // null when timestamps are hidden
  eligibleHours: number;
  revisionHours: number;
  topics: string[];
  sourceCount: number;
  sources: { title: string; contentType: ContentType }[]; // empty when sources are hidden
  assessments: { title: string; score: number; maxScore: number; verificationLevel: string; date: string | null }[];
  linkedProjects: string[];
  evidence: Provenance[];
}

export interface PublicProjectEvidence {
  title: string;
  description: string;
  technologies: string[];
  skills: string[];
  githubUrl: string;
  selfReportedHours: number;
  milestones: { title: string; kind: string; date: string | null }[];
  evidenceLinks: { label: string; url: string }[];
  evidence: Provenance[];
}
