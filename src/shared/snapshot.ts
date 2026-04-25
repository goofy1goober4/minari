export type Activity = 'sleeping' | 'dozing' | 'reading' | 'looking_out' | 'idle';
export type Mood = 'calm' | 'curious' | 'sleepy' | 'content' | 'grumpy' | 'quiet';
export type ElapsedBucket = 'same_moment' | 'quiet_shift' | 'new_cycle' | 'new_day';

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
