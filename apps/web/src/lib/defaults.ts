import type {
  PassportProfile,
  Preferences,
  PublicShareSettings,
  UserProfile,
} from '@skilltrace/shared';
import { envelope, randomId } from '@skilltrace/shared';
import { DEFAULT_BASELINE_WPM } from '@skilltrace/tracking-engine';

export function defaultPreferences(uid: string): Preferences {
  return {
    ...envelope('preferences', uid, 'self_reported'),
    trackingEnabled: false, // opt-in only
    trackingPaused: false,
    cloudAIConsent: 'ask',
    allowCloudExcerpts: false,
    demoMode: false,
    responseWindowMultiplier: 1,
    readingBaselineWpm: DEFAULT_BASELINE_WPM,
    creditHiddenVideo: false,
  };
}

export function defaultProfile(uid: string, displayName = ''): UserProfile {
  return {
    ...envelope('profile', uid, 'self_reported'),
    displayName,
    headline: '',
    interests: [],
    targetCareer: '',
    onboardingComplete: false,
  };
}

export function defaultShareSettings(uid: string): PublicShareSettings {
  return {
    ...envelope('share', uid, 'self_reported'),
    shareId: randomId('pp').slice(0, 19),
    enabled: false,
    publicSkills: [],
    publicProjectIds: [],
    showSources: false,
    showTimestamps: false,
    showAssessments: true,
  };
}

export function defaultPassportProfile(uid: string, displayName = ''): PassportProfile {
  return {
    ...envelope('passport', uid, 'self_reported'),
    displayName,
    headline: '',
    githubUrl: '',
    portfolioUrl: '',
    summary: '',
    summarySource: 'user',
  };
}
