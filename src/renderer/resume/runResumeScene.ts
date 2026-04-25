import type { Sprout } from '../pet/Sprout';
import { POSTURE_PRESETS } from '../pet/postures';
import type { Activity } from '../../shared/snapshot';

const NOTICE_DELAY_BASE_MS = 1500;
const NOTICE_DELAY_JITTER_MS = 600;
const NOTICE_FRAGMENT_PROB = 0.3;

export interface ResumeSceneDeps {
  sprout: Sprout;
  activity: Activity;
  // Shared with the click handler so we don't double-speak.
  speakAndShow: () => Promise<void>;
}

// Fire-and-forget: applies posture immediately, schedules the notice beat.
// Boot continues without awaiting the notice — Minari is "already there"
// and the noticing happens 1.5s±jitter later.
export function runResumeScene({ sprout, activity, speakAndShow }: ResumeSceneDeps): void {
  sprout.setPosture(POSTURE_PRESETS[activity]);
  console.log('[resume] posture applied for activity=', activity);

  const delay = NOTICE_DELAY_BASE_MS + Math.random() * NOTICE_DELAY_JITTER_MS;
  setTimeout(() => {
    sprout.notice();
    if (Math.random() < NOTICE_FRAGMENT_PROB) {
      console.log('[resume] notice + fragment');
      void speakAndShow();
    } else {
      console.log('[resume] notice (silent)');
    }
  }, delay);
}
