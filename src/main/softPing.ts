import { app, type WebContents } from 'electron';
import { recordMessage, getState, setState } from './memory/repo';
import { getCurrentMood, getLastInteractionAt, noteSpoken } from './snapshot';
import { generateNoticingFragment } from './llm/pingFragment';

// Dev mode shrinks every gate so a session can actually exercise pings.
// Quiet hours are disabled in dev (QUIET_END_HOUR=0) so 2 a.m. testing works.
// Production values match the soft-ping spec.
const IS_DEV = !app.isPackaged;

const TICK_MS = IS_DEV ? 30 * 1000 : 5 * 60 * 1000;
const BOOT_GRACE_MS = IS_DEV ? 10 * 1000 : 60 * 1000;
const QUIET_END_HOUR = IS_DEV ? 0 : 7;
const QUIET_END_GRACE_MIN = IS_DEV ? 0 : 10;
const MIN_SPACING_MS = IS_DEV ? 2 * 60 * 1000 : 90 * 60 * 1000;
const INTERACTION_COOLDOWN_MS = IS_DEV ? 30 * 1000 : 10 * 60 * 1000;
const DAILY_CAP = IS_DEV ? 10 : 2;
const FIRE_PROB = IS_DEV ? 0.5 : 0.18;

const KEY_PINGS_TODAY = 'pings_today';
const KEY_PING_DAY = 'ping_day';
const KEY_LAST_PING_AT = 'last_ping_at';

type SuppressReason =
  | 'boot-grace'
  | 'quiet-hours'
  | 'quiet-end-grace'
  | 'daily-cap'
  | 'min-spacing'
  | 'interaction-cooldown';

let timer: NodeJS.Timeout | null = null;
let bootAt = 0;
let getWebContents: (() => WebContents | null) | null = null;
let lastLoggedSuppression: SuppressReason | null = null;

export function startSoftPingScheduler(webContentsGetter: () => WebContents | null) {
  bootAt = Date.now();
  getWebContents = webContentsGetter;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    void tick().catch((err) => console.error('[soft-ping] tick failed:', err));
  }, TICK_MS);
  console.log(
    '[soft-ping] scheduler started (' +
      (IS_DEV ? 'DEV accelerated' : 'production') +
      '): tick=' +
      TICK_MS / 1000 +
      's boot_grace=' +
      BOOT_GRACE_MS / 1000 +
      's min_spacing=' +
      MIN_SPACING_MS / 60000 +
      'min interaction_cooldown=' +
      INTERACTION_COOLDOWN_MS / 1000 +
      's daily_cap=' +
      DAILY_CAP +
      ' fire_prob=' +
      FIRE_PROB +
      ' quiet_end_hour=' +
      QUIET_END_HOUR,
  );
}

export function stopSoftPingScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  getWebContents = null;
}

async function tick() {
  const now = Date.now();
  const reason = checkSuppression(now);
  if (reason) {
    if (reason !== lastLoggedSuppression) {
      console.log('[soft-ping] tick suppressed: ' + reason);
      lastLoggedSuppression = reason;
    }
    return;
  }
  lastLoggedSuppression = null;
  if (Math.random() >= FIRE_PROB) {
    console.log('[soft-ping] tick eligible, dice missed');
    return;
  }
  await emitPing(now);
}

function checkSuppression(now: number): SuppressReason | null {
  if (now - bootAt < BOOT_GRACE_MS) return 'boot-grace';
  const d = new Date(now);
  const hour = d.getHours();
  const minute = d.getMinutes();
  if (hour < QUIET_END_HOUR) return 'quiet-hours';
  if (hour === QUIET_END_HOUR && minute < QUIET_END_GRACE_MIN) return 'quiet-end-grace';
  rolloverDayIfNeeded(d);
  if (getPingsToday() >= DAILY_CAP) return 'daily-cap';
  const lastPing = Number(getState(KEY_LAST_PING_AT) || 0);
  if (now - lastPing < MIN_SPACING_MS) return 'min-spacing';
  const lastInteraction = getLastInteractionAt();
  if (lastInteraction && now - lastInteraction < INTERACTION_COOLDOWN_MS) {
    return 'interaction-cooldown';
  }
  return null;
}

function rolloverDayIfNeeded(d: Date) {
  const today = formatDate(d);
  const stored = getState(KEY_PING_DAY);
  if (stored !== today) {
    setState(KEY_PING_DAY, today);
    setState(KEY_PINGS_TODAY, '0');
  }
}

function getPingsToday(): number {
  return Number(getState(KEY_PINGS_TODAY) || 0);
}

function formatDate(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return yy + '-' + mm + '-' + dd;
}

async function emitPing(now: number) {
  const mood = getCurrentMood();
  let fragment: string;
  try {
    fragment = await generateNoticingFragment(mood);
  } catch (err) {
    console.error('[soft-ping] generate failed:', err);
    return;
  }
  recordMessage('minari', fragment);
  noteSpoken(fragment);
  setState(KEY_LAST_PING_AT, String(now));
  setState(KEY_PINGS_TODAY, String(getPingsToday() + 1));
  console.log(
    '[soft-ping] emit: mood=' +
      mood +
      ' pings_today=' +
      getPingsToday() +
      ' fragment=' +
      JSON.stringify(fragment),
  );
  const wc = getWebContents?.();
  if (!wc) {
    console.log('[soft-ping] no webContents → drop');
    return;
  }
  if (wc.isDestroyed()) {
    console.log('[soft-ping] webContents destroyed → drop');
    return;
  }
  wc.send('minari:ping', fragment);
  console.log('[soft-ping] sent to renderer');
}
