// Growth stage logic. Two stages today:
//   babble  — D+0 .. D+7 after hatch; only click + image gift, no text input
//   curious — D+8+; long-press opens a text-input overlay
//
// Source of truth is `hatched_at` (set on birth completion). Derived stage
// gets cached in the `state` table under `growth_stage` so callers can detect
// transitions cheaply, but the cache is overwritten whenever the derivation
// disagrees with it. MINARI_STAGE env var force-overrides everything (demo).

import { getState, setState } from './memory/repo';
import { GROWTH_STAGES, type GrowthStage } from '../shared/snapshot';

const KEY_HATCHED_AT = 'hatched_at';
const KEY_GROWTH_STAGE = 'growth_stage';
const BIRTH_KEY_COMPLETED = 'birth_completed';

const BABBLE_DAYS = 7;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const BABBLE_WINDOW_MS = (BABBLE_DAYS + 1) * ONE_DAY_MS; // <8d → babble; ≥8d → curious

export function setHatchedAt(now: number = Date.now()): void {
  setState(KEY_HATCHED_AT, String(now));
}

export function getHatchedAt(): number | null {
  const raw = getState(KEY_HATCHED_AT);
  return raw ? Number(raw) : null;
}

export function getCurrentStage(now: number = Date.now()): GrowthStage {
  const envOverride = parseStageEnv(process.env.MINARI_STAGE);
  if (envOverride) {
    cacheStage(envOverride);
    return envOverride;
  }

  let hatchedAt = getHatchedAt();
  if (hatchedAt === null) {
    // No hatched_at row. Backfill if the user has already completed birth in
    // an older build (so they don't get stuck pre-curious forever); otherwise
    // we're pre-birth, treat as babble.
    if (getState(BIRTH_KEY_COMPLETED) === 'true') {
      hatchedAt = now;
      setHatchedAt(hatchedAt);
    } else {
      cacheStage('babble');
      return 'babble';
    }
  }

  const stage: GrowthStage = now - hatchedAt < BABBLE_WINDOW_MS ? 'babble' : 'curious';
  cacheStage(stage);
  return stage;
}

function cacheStage(stage: GrowthStage): void {
  if (getState(KEY_GROWTH_STAGE) !== stage) {
    setState(KEY_GROWTH_STAGE, stage);
    console.log('[growth] stage cached → ' + stage);
  }
}

function parseStageEnv(raw: string | undefined): GrowthStage | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  return (GROWTH_STAGES as readonly string[]).includes(lower) ? (lower as GrowthStage) : null;
}
