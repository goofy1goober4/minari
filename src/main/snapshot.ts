import { getState, setState } from './memory/repo';
import {
  ACTIVITIES,
  MOODS,
  type Activity,
  type ElapsedBucket,
  type Mood,
  type Snapshot,
} from '../shared/snapshot';

const KEY_ACTIVITY = 'last_activity';
const KEY_MOOD = 'last_mood';
const KEY_SEEN = 'last_seen_at';
const KEY_FRAGMENT = 'last_fragment';

const TEN_MIN = 10 * 60 * 1000;
const THREE_HR = 3 * 60 * 60 * 1000;
const TWELVE_HR = 12 * 60 * 60 * 1000;

const FRESH_AWAKE_ACTIVITIES: readonly Activity[] = ['idle', 'looking_out', 'reading'];
const FRESH_DAY_MOODS: readonly Mood[] = ['calm', 'curious', 'content'];

// Quiet shift = closely related activities. Pick a near-neighbour, not random.
const QUIET_SHIFT_TRANSITIONS: Record<Activity, readonly Activity[]> = {
  sleeping: ['dozing', 'idle'],
  dozing: ['idle', 'reading'],
  reading: ['idle', 'looking_out'],
  looking_out: ['idle', 'reading'],
  idle: ['reading', 'looking_out', 'dozing'],
};

let currentActivity: Activity = 'idle';
let currentMood: Mood = 'calm';

export function loadSnapshot(): Snapshot | null {
  const seen = getState(KEY_SEEN);
  if (!seen) return null;
  return {
    lastActivity: (getState(KEY_ACTIVITY) as Activity | null) ?? 'idle',
    lastMood: (getState(KEY_MOOD) as Mood | null) ?? 'calm',
    lastSeenAt: Number(seen),
    lastFragment: getState(KEY_FRAGMENT) ?? '...',
  };
}

export function saveInitialSnapshot(firstFragment: string) {
  currentActivity = 'idle';
  currentMood = 'calm';
  persist(firstFragment);
  console.log('[snapshot] saveInitial: activity=idle mood=calm fragment=', JSON.stringify(firstFragment));
}

export function noteSpoken(fragment: string) {
  persist(fragment);
  console.log(
    '[snapshot] noteSpoken: activity=' +
      currentActivity +
      ' mood=' +
      currentMood +
      ' fragment=' +
      JSON.stringify(fragment),
  );
}

export function flushSnapshot() {
  setState(KEY_ACTIVITY, currentActivity);
  setState(KEY_MOOD, currentMood);
  setState(KEY_SEEN, String(Date.now()));
  console.log(
    '[snapshot] flush (will-quit): activity=' + currentActivity + ' mood=' + currentMood,
  );
}

export function getCurrentMood(): Mood {
  return currentMood;
}

export function setCurrent(activity: Activity, mood: Mood) {
  currentActivity = activity;
  currentMood = mood;
}

export function computeBootState(now = Date.now()): {
  activity: Activity;
  mood: Mood;
  elapsedBucket: ElapsedBucket;
} {
  const snapshot = loadSnapshot();
  if (!snapshot) {
    console.log('[snapshot] computeBootState: no prior snapshot → new_day idle/calm');
    return { activity: 'idle', mood: 'calm', elapsedBucket: 'new_day' };
  }
  const elapsed = now - snapshot.lastSeenAt;
  const bucket = bucketFor(elapsed);

  let activity: Activity;
  let mood: Mood;
  switch (bucket) {
    case 'same_moment':
      activity = snapshot.lastActivity;
      mood = snapshot.lastMood;
      break;
    case 'quiet_shift':
      activity = pick(QUIET_SHIFT_TRANSITIONS[snapshot.lastActivity]);
      mood = Math.random() < 0.7 ? snapshot.lastMood : pick(MOODS);
      break;
    case 'new_cycle':
      activity = pick(ACTIVITIES);
      mood = pick(MOODS);
      break;
    case 'new_day':
      activity = pick(FRESH_AWAKE_ACTIVITIES);
      mood = pick(FRESH_DAY_MOODS);
      break;
  }
  console.log(
    '[snapshot] computeBootState: saved={activity:' +
      snapshot.lastActivity +
      ', mood:' +
      snapshot.lastMood +
      '} elapsed=' +
      formatElapsed(elapsed) +
      ' bucket=' +
      bucket +
      ' → {activity:' +
      activity +
      ', mood:' +
      mood +
      '}',
  );
  return { activity, mood, elapsedBucket: bucket };
}

function formatElapsed(ms: number): string {
  if (ms < 60_000) return Math.round(ms / 1000) + 's';
  if (ms < 3_600_000) return Math.round(ms / 60_000) + 'min';
  if (ms < 86_400_000) return (ms / 3_600_000).toFixed(1) + 'h';
  return (ms / 86_400_000).toFixed(1) + 'd';
}

function persist(fragment: string) {
  setState(KEY_ACTIVITY, currentActivity);
  setState(KEY_MOOD, currentMood);
  setState(KEY_SEEN, String(Date.now()));
  setState(KEY_FRAGMENT, fragment);
}

function bucketFor(elapsedMs: number): ElapsedBucket {
  if (elapsedMs < TEN_MIN) return 'same_moment';
  if (elapsedMs < THREE_HR) return 'quiet_shift';
  if (elapsedMs < TWELVE_HR) return 'new_cycle';
  return 'new_day';
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
