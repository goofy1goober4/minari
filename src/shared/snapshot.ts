export type Activity = 'sleeping' | 'dozing' | 'reading' | 'looking_out' | 'idle' | 'diary';
export type Mood = 'calm' | 'curious' | 'sleepy' | 'content' | 'grumpy' | 'quiet';
export type ElapsedBucket = 'same_moment' | 'quiet_shift' | 'new_cycle' | 'new_day';
export type GrowthStage = 'babble' | 'curious';
export const GROWTH_STAGES: readonly GrowthStage[] = ['babble', 'curious'];

export const ACTIVITIES: readonly Activity[] = [
  'sleeping',
  'dozing',
  'reading',
  'looking_out',
  'idle',
];

export const MOODS: readonly Mood[] = [
  'calm',
  'curious',
  'sleepy',
  'content',
  'grumpy',
  'quiet',
];

export interface Snapshot {
  lastActivity: Activity;
  lastMood: Mood;
  lastSeenAt: number;
  lastFragment: string;
}

export interface BootState {
  activity: Activity;
  mood: Mood;
  elapsedBucket: ElapsedBucket;
  nickname: string | null;
}

export const ELAPSED_TEN_MIN_MS = 10 * 60 * 1000;
export const ELAPSED_THREE_HR_MS = 3 * 60 * 60 * 1000;
export const ELAPSED_TWELVE_HR_MS = 12 * 60 * 60 * 1000;

export function bucketFor(elapsedMs: number): ElapsedBucket {
  if (elapsedMs < ELAPSED_TEN_MIN_MS) return 'same_moment';
  if (elapsedMs < ELAPSED_THREE_HR_MS) return 'quiet_shift';
  if (elapsedMs < ELAPSED_TWELVE_HR_MS) return 'new_cycle';
  return 'new_day';
}
