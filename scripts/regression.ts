// Vertical-slice regression. Runs against pure helpers extracted from main/.
// Skips anything that needs Electron, SQLite, or Ollama.
// Run: npm run test:regression
//
// Manual checklist for D+0 interrupt/re-entry is printed at the end.

import {
  bucketFor,
  ELAPSED_TEN_MIN_MS,
  ELAPSED_THREE_HR_MS,
  ELAPSED_TWELVE_HR_MS,
  type ElapsedBucket,
} from '../src/shared/snapshot.ts';
import {
  evaluateSuppression,
  PROD_SUPPRESSION_CONFIG,
  type SuppressReason,
  type SuppressionConfig,
} from '../src/shared/softPingSuppression.ts';
import { filterGuardrails } from '../src/main/llm/guardrails.ts';

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];

function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
}

function eq<T>(name: string, actual: T, expected: T) {
  const ok = actual === expected;
  check(name, ok, ok ? undefined : `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

// ─────────────────────────────────────────────────────────────────────
// Test 2: snapshot resume bucket boundaries
// Spec from user: 5분/3시간/12시간+. Code uses 10분/3시간/12시간 — see note.
// ─────────────────────────────────────────────────────────────────────
console.log('\n[test 2] snapshot resume bucket boundaries');

const FIVE_MIN = 5 * 60 * 1000;
const TEN_MIN = ELAPSED_TEN_MIN_MS;
const THREE_HR = ELAPSED_THREE_HR_MS;
const TWELVE_HR = ELAPSED_TWELVE_HR_MS;

// 5min should still be same_moment (under 10min boundary).
eq<ElapsedBucket>('5min → same_moment', bucketFor(FIVE_MIN), 'same_moment');

// 10min boundary
eq<ElapsedBucket>('10min−1ms → same_moment', bucketFor(TEN_MIN - 1), 'same_moment');
eq<ElapsedBucket>('10min exact → quiet_shift', bucketFor(TEN_MIN), 'quiet_shift');
eq<ElapsedBucket>('10min+1ms → quiet_shift', bucketFor(TEN_MIN + 1), 'quiet_shift');

// 3hr boundary
eq<ElapsedBucket>('3hr−1ms → quiet_shift', bucketFor(THREE_HR - 1), 'quiet_shift');
eq<ElapsedBucket>('3hr exact → new_cycle', bucketFor(THREE_HR), 'new_cycle');
eq<ElapsedBucket>('3hr+1ms → new_cycle', bucketFor(THREE_HR + 1), 'new_cycle');

// 12hr boundary
eq<ElapsedBucket>('12hr−1ms → new_cycle', bucketFor(TWELVE_HR - 1), 'new_cycle');
eq<ElapsedBucket>('12hr exact → new_day', bucketFor(TWELVE_HR), 'new_day');
eq<ElapsedBucket>('12hr+1ms → new_day', bucketFor(TWELVE_HR + 1), 'new_day');
eq<ElapsedBucket>('24hr → new_day', bucketFor(24 * 60 * 60 * 1000), 'new_day');

// ─────────────────────────────────────────────────────────────────────
// Test 3: soft ping suppression (boot grace + interaction cooldown)
// ─────────────────────────────────────────────────────────────────────
console.log('\n[test 3] soft ping suppression');

const cfg: SuppressionConfig = PROD_SUPPRESSION_CONFIG;
// Pin "now" to 2026-04-28 14:00 local — well past quiet hours so they don't fire.
const NOW = new Date(2026, 3, 28, 14, 0, 0).getTime();

function suppress(overrides: Partial<{
  bootAt: number;
  lastPingAt: number;
  lastInteractionAt: number | null;
  pingsToday: number;
}>): SuppressReason | null {
  return evaluateSuppression({
    now: NOW,
    bootAt: overrides.bootAt ?? NOW - 24 * 60 * 60 * 1000,
    lastPingAt: overrides.lastPingAt ?? 0,
    lastInteractionAt: overrides.lastInteractionAt ?? null,
    pingsToday: overrides.pingsToday ?? 0,
    config: cfg,
  });
}

// 부팅 직후: bootAt = now → boot-grace
eq<SuppressReason | null>(
  'boot-grace (bootAt=now)',
  suppress({ bootAt: NOW }),
  'boot-grace',
);
eq<SuppressReason | null>(
  'boot-grace boundary −1ms (still suppressed)',
  suppress({ bootAt: NOW - cfg.bootGraceMs + 1 }),
  'boot-grace',
);
eq<SuppressReason | null>(
  'boot-grace exact (released)',
  suppress({ bootAt: NOW - cfg.bootGraceMs }),
  null,
);

// 대화 직후: lastInteractionAt within cooldown → interaction-cooldown
eq<SuppressReason | null>(
  'interaction-cooldown (just talked)',
  suppress({ lastInteractionAt: NOW - 1000 }),
  'interaction-cooldown',
);
eq<SuppressReason | null>(
  'interaction-cooldown boundary −1ms',
  suppress({ lastInteractionAt: NOW - cfg.interactionCooldownMs + 1 }),
  'interaction-cooldown',
);
eq<SuppressReason | null>(
  'interaction-cooldown exact (released)',
  suppress({ lastInteractionAt: NOW - cfg.interactionCooldownMs }),
  null,
);
eq<SuppressReason | null>(
  'no last interaction → not suppressed',
  suppress({ lastInteractionAt: null }),
  null,
);

// daily-cap and min-spacing as sanity
eq<SuppressReason | null>(
  'daily-cap reached',
  suppress({ pingsToday: cfg.dailyCap }),
  'daily-cap',
);
eq<SuppressReason | null>(
  'min-spacing (recent ping)',
  suppress({ lastPingAt: NOW - 1000 }),
  'min-spacing',
);

// quiet hours — pin to 06:30 local, before quietEndHour=7
{
  const quietNow = new Date(2026, 3, 28, 6, 30, 0).getTime();
  const reason = evaluateSuppression({
    now: quietNow,
    bootAt: quietNow - 24 * 60 * 60 * 1000,
    lastPingAt: 0,
    lastInteractionAt: null,
    pingsToday: 0,
    config: cfg,
  });
  eq<SuppressReason | null>('quiet-hours (06:30 < 07:00)', reason, 'quiet-hours');
}
// quiet-end-grace — pin to 07:05, hour=quietEndHour but minute<grace
{
  const graceNow = new Date(2026, 3, 28, 7, 5, 0).getTime();
  const reason = evaluateSuppression({
    now: graceNow,
    bootAt: graceNow - 24 * 60 * 60 * 1000,
    lastPingAt: 0,
    lastInteractionAt: null,
    pingsToday: 0,
    config: cfg,
  });
  eq<SuppressReason | null>('quiet-end-grace (07:05 < 07:10)', reason, 'quiet-end-grace');
}

// ─────────────────────────────────────────────────────────────────────
// Test 4: guardrails forbidden words
// ─────────────────────────────────────────────────────────────────────
console.log('\n[test 4] guardrails forbidden words');

const FORBIDDEN = [
  'therapy',
  'therapist',
  'heal',
  'cure',
  'diagnose',
  'diagnosis',
  'treatment',
  'medication',
  'recommend',
  'should',
  'must',
  'need to',
];

for (const word of FORBIDDEN) {
  const sentence = `you ${word} a hug`;
  eq(`forbidden "${word}" → fallback`, filterGuardrails(sentence), '...');
}

// Case-insensitivity
eq('forbidden "THERAPY" (uppercase) → fallback', filterGuardrails('THERAPY now'), '...');
eq('forbidden "Heal" (mixed case) → fallback', filterGuardrails('Heal yourself'), '...');

// Allowed phrasing should pass through (within length cap).
eq('allowed: "...oh."', filterGuardrails('...oh.'), '...oh.');
eq('allowed: "warm."', filterGuardrails('warm.'), 'warm.');
eq('allowed: "soft light"', filterGuardrails('soft light'), 'soft light');

// Strip wrapping quotes.
eq('strip double quotes', filterGuardrails('"hi."'), 'hi.');
eq('strip single quotes', filterGuardrails("'hi.'"), 'hi.');

// Multi-line → first line only.
eq('multi-line keeps first line', filterGuardrails('hi.\nmore stuff'), 'hi.');

// Length cap.
const longInput = 'a'.repeat(100);
const longResult = filterGuardrails(longInput);
check(
  'length cap applied',
  longResult.length <= 61 && longResult.endsWith('…'),
  `got len=${longResult.length} ends="${longResult.slice(-3)}"`,
);

// Empty / whitespace falls back.
eq('empty → fallback', filterGuardrails(''), '...');
eq('whitespace → fallback', filterGuardrails('   '), '...');

// ─────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────
console.log('\n──────── results ────────');
let pass = 0;
let fail = 0;
for (const r of results) {
  if (r.ok) {
    pass++;
    console.log(`  PASS  ${r.name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${r.name}  (${r.detail})`);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);

// ─────────────────────────────────────────────────────────────────────
// Test 1: D+0 중단/재진입 — manual checklist (needs Electron + Ollama)
// ─────────────────────────────────────────────────────────────────────
console.log(`
──────── manual: D+0 interrupt/re-entry (needs running app) ────────
BirthStateMachine touches SQLite + Ollama, so it can't be exercised
from plain Node. Run this checklist in dev mode (npm run dev):

  Reset state once before starting:
    rm -rf ~/Library/Application\\ Support/minari/minari.db*

  Round 1 (interrupt before completing):
    - [ ] Boot app → seed/birth scene appears
    - [ ] Type a nickname but quit (Cmd+Q) BEFORE the bubble shows
    - [ ] Re-launch → birth scene appears again (KEY_COMPLETED still false)

  Round 2 (interrupt during LLM call):
    - [ ] Boot, type nickname, quit while waiting on first fragment
    - [ ] Re-launch → birth scene STILL appears (LLM never set KEY_COMPLETED)

  Round 3 (interrupt at the very end, accept whatever you typed):
    - [ ] Boot, type nickname, let bubble appear briefly, then quit
    - [ ] Re-launch → resume scene this time (KEY_COMPLETED=true)
          and the most recent nickname is what's stored.

  Final attempt (success path):
    - [ ] Reset state, boot, complete birth normally → bubble shows fragment,
          quit cleanly, re-launch → resume scene (no birth replay).

  Logs to watch:
    [snapshot] saveInitial: ...
    [ipc] get-boot-state → {... nickname:"..." ...}
`);

if (fail > 0) process.exit(1);
