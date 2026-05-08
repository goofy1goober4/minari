import { app, BrowserWindow, type WebContents } from 'electron';
import { recordMessage, getState, setState } from './memory/repo';
import { getCurrentMood, getLastInteractionAt, noteSpoken } from './snapshot';
import { generateNoticingFragment } from './llm/pingFragment';
import {
  DEV_SUPPRESSION_CONFIG,
  PROD_SUPPRESSION_CONFIG,
  evaluateSuppression,
  type SuppressReason,
} from '../shared/softPingSuppression';
import { getCurrentStage } from './growth';
import { getOldestUnknown, markCurious } from './wordLearning/repo';
import { enterTeachingMode } from './wordLearning/teachingState';
import { generateCuriosityQuestion } from './wordLearning/keywords';

// Dev mode shrinks every gate so a session can actually exercise pings.
// Quiet hours are disabled in dev (QUIET_END_HOUR=0) so 2 a.m. testing works.
// Production values match the soft-ping spec.
const IS_DEV = !app.isPackaged;

const SUPPRESSION_CONFIG = IS_DEV ? DEV_SUPPRESSION_CONFIG : PROD_SUPPRESSION_CONFIG;
const TICK_MS = IS_DEV ? 30 * 1000 : 5 * 60 * 1000;
const FIRE_PROB = IS_DEV ? 0.5 : 0.18;

// word_curiosity has its own clock independent of the noticing-ping rhythm:
// after an unknown word has aged this long Minari is allowed to ask about it,
// and once asked the same channel cools down before another word can fire.
const CURIOSITY_DELAY_S = IS_DEV ? 30 : 3 * 86400;
const CURIOSITY_COOLDOWN_MS = IS_DEV ? 60 * 1000 : 86400 * 1000;

const KEY_PINGS_TODAY = 'pings_today';
const KEY_PING_DAY = 'ping_day';
const KEY_LAST_PING_AT = 'last_ping_at';
const KEY_LAST_WORD_CURIOSITY_AT = 'last_word_curiosity_at';

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
      SUPPRESSION_CONFIG.bootGraceMs / 1000 +
      's min_spacing=' +
      SUPPRESSION_CONFIG.minSpacingMs / 60000 +
      'min interaction_cooldown=' +
      SUPPRESSION_CONFIG.interactionCooldownMs / 1000 +
      's daily_cap=' +
      SUPPRESSION_CONFIG.dailyCap +
      ' fire_prob=' +
      FIRE_PROB +
      ' quiet_end_hour=' +
      SUPPRESSION_CONFIG.quietEndHour,
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
  // daily-cap only gates noticing pings — word_curiosity has its own clock
  // and shouldn't get starved by a noisy afternoon. Other suppression
  // reasons (boot-grace, quiet-hours, interaction-cooldown, min-spacing)
  // still block both.
  if (reason && reason !== 'daily-cap') {
    if (reason !== lastLoggedSuppression) {
      console.log('[soft-ping] tick suppressed: ' + reason);
      lastLoggedSuppression = reason;
    }
    return;
  }
  lastLoggedSuppression = null;
  // word_curiosity is deterministic — if conditions are met, fire it instead
  // of the random noticing ping. Only one outbound bubble per tick.
  if (await tryEmitWordCuriosity(now)) return;
  if (reason === 'daily-cap') {
    if (lastLoggedSuppression !== 'daily-cap') {
      console.log('[soft-ping] tick suppressed: daily-cap (noticing only)');
      lastLoggedSuppression = 'daily-cap';
    }
    return;
  }
  if (Math.random() >= FIRE_PROB) {
    console.log('[soft-ping] tick eligible, dice missed');
    return;
  }
  await emitPing(now);
}

async function tryEmitWordCuriosity(now: number): Promise<boolean> {
  if (getCurrentStage() !== 'curious') return false;

  const lastAsk = Number(getState(KEY_LAST_WORD_CURIOSITY_AT) || 0);
  if (now - lastAsk < CURIOSITY_COOLDOWN_MS) return false;

  const word = getOldestUnknown(CURIOSITY_DELAY_S);
  if (!word) return false;

  const wc = getWebContents?.();
  if (!wc || wc.isDestroyed()) {
    console.log('[soft-ping] word_curiosity: no webContents → drop');
    return false;
  }

  const question = generateCuriosityQuestion(word.babyDescription);
  markCurious(word.id);
  enterTeachingMode(word.id);
  recordMessage('minari', question);
  noteSpoken(question);
  // word_curiosity has its own clock (KEY_LAST_WORD_CURIOSITY_AT) and is a
  // teaching channel, not a noticing fragment — keep it out of the noticing
  // ping budget (pings_today) so a chatty afternoon of soft pings never
  // blocks a learning moment. We still bump last_ping_at so this and the
  // next noticing ping respect min-spacing against each other.
  setState(KEY_LAST_WORD_CURIOSITY_AT, String(now));
  setState(KEY_LAST_PING_AT, String(now));

  console.log(
    '[soft-ping] word_curiosity emit: word_id=' +
      word.id +
      ' desc=' +
      JSON.stringify(word.babyDescription) +
      ' question=' +
      JSON.stringify(question),
  );
  // Forced-open input needs OS focus, otherwise the Minari window stays
  // backgrounded and the prompt's blur handler trips immediately. Bring
  // app + window to the front before dispatching the renderer event.
  const win = BrowserWindow.fromWebContents(wc);
  if (win && !win.isDestroyed()) {
    if (!win.isVisible()) win.show();
    win.focus();
  }
  if (process.platform === 'darwin') app.focus({ steal: true });
  wc.send('minari:word-question', { wordId: word.id, question });
  return true;
}

function checkSuppression(now: number): SuppressReason | null {
  rolloverDayIfNeeded(new Date(now));
  return evaluateSuppression({
    now,
    bootAt,
    lastPingAt: Number(getState(KEY_LAST_PING_AT) || 0),
    lastInteractionAt: getLastInteractionAt(),
    pingsToday: getPingsToday(),
    config: SUPPRESSION_CONFIG,
  });
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
