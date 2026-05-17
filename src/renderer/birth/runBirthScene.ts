import type { Application } from 'pixi.js';
import type { Minari } from '../pet/Minari';
import type { Bubble } from '../ui/Bubble';
import { Seed } from './Seed';
import { BirthSprout } from './BirthSprout';
import { NicknamePrompt } from './NicknamePrompt';
import { makeVoiceProfile } from '../sound/mumble';

const SEED_FADE_IN_MS = 700;
const SEED_HOLD_MS = 350;
// The seed's little "까딱" twitch right before it cracks open.
const SEED_WOBBLE_MS = 600;
const SEED_SQUASH_AMP = 0.16;

// Stage 1: stem rises out of the seed (slow start, accelerates).
// Seed cracks/fades over the first part of this stage as the stem pushes through.
const STEM_GROW_MS = 2500;
const SEED_FADE_FRAC = 0.6;

// Stage 2: leaves unfold from the bud with a damped spring — the ease
// overshoots ~13% so they dip past horizontal then wobble to rest.
const LEAF_UNFOLD_MS = 1500;

// Stage 4: the germinated vector sprout cross-fades into the full Minari PNG.
const CHARACTER_REVEAL_MS = 900;
const POST_BIRTH_BEAT_MS = 500;

export interface BirthSceneDeps {
  app: Application;
  sprout: Minari;
  bubble: Bubble;
}

export async function runBirthScene({ app, sprout, bubble }: BirthSceneDeps): Promise<void> {
  console.log('[birth] scene start; sprout at', sprout.x, sprout.y);
  // Minari stays hidden — the seed and germinating sprout own the screen until
  // the character reveal. index.ts already set visible=false; belt-and-braces.
  sprout.visible = false;
  sprout.alpha = 1;

  const seed = new Seed();
  seed.x = sprout.x;
  seed.y = sprout.y;

  const bsprout = new BirthSprout();
  bsprout.x = sprout.x;
  bsprout.y = sprout.y;

  // bsprout goes in below the seed: the seed sits in front at the base, then
  // fades as the stem pushes up through it.
  app.stage.addChild(bsprout);
  app.stage.addChild(seed);
  console.log('[birth] seed + sprout added; children:', app.stage.children.length);

  // Seed appears, holds a beat, then a small squash-stretch "까딱".
  await tween(SEED_FADE_IN_MS, (p) => seed.setProgress(easeOutCubic(p)));
  console.log('[birth] seed fade-in done');
  await delay(SEED_HOLD_MS);
  await tween(SEED_WOBBLE_MS, (p) => {
    const s = dampedWobble(p) * SEED_SQUASH_AMP;
    seed.scale.set(1 + s, 1 - s);
  });
  seed.scale.set(1, 1);

  // Stage 1: stem rises (ease-in: slow then accelerating) while the seed
  // cracks open and fades.
  console.log('[birth] stage1 stem growth start');
  await tween(STEM_GROW_MS, (p) => {
    bsprout.setStemGrowth(easeInCubic(p));
    const fadeP = Math.min(1, p / SEED_FADE_FRAC);
    seed.setProgress(1 - easeInCubic(fadeP));
  });
  bsprout.setStemGrowth(1);
  app.stage.removeChild(seed);
  seed.destroy({ children: true });
  console.log('[birth] stage1 done; stem at full height');

  // Stage 2: leaves unfold from the bud with a damped wobble settle.
  console.log('[birth] stage2 leaf unfold start');
  await tween(LEAF_UNFOLD_MS, (p) => {
    bsprout.setLeafUnfold(easeOutSpring(p));
  });
  bsprout.setLeafUnfold(1);
  console.log('[birth] stage2 done; leaves unfolded');

  // Stage 4: the full Minari cross-fades in over the germinated sprout.
  console.log('[birth] character reveal start');
  sprout.visible = true;
  // Re-add to bring Minari above the now-fading germination sprout.
  app.stage.addChild(sprout);
  await tween(CHARACTER_REVEAL_MS, (p) => {
    const e = easeOutCubic(p);
    sprout.alpha = e;
    sprout.scale.set(0.92 + 0.08 * e);
    bsprout.alpha = 1 - e;
  });
  sprout.alpha = 1;
  sprout.scale.set(1);
  app.stage.removeChild(bsprout);
  bsprout.destroy({ children: true });
  console.log('[birth] character reveal done');

  await delay(POST_BIRTH_BEAT_MS);

  // Nickname overlays need real cursor + keyboard, so disable click-through.
  window.minari.setClickThrough(false);

  const isKo = window.minari.lang === 'ko';

  // Q1 — what should I (Minari, the toddler-sprout) call you?
  const userPrompt = new NicknamePrompt({
    question: isKo ? '너... 이름?' : 'you... name?',
    placeholder: '...',
    anchor: { x: sprout.x, y: sprout.y },
  });
  userPrompt.mount();
  const nickname = await userPrompt.awaitInput();
  await userPrompt.dismiss();

  // Q2 — what should you (the human) call me?
  const petPrompt = new NicknamePrompt({
    question: isKo ? '나... 이름?' : 'me... name?',
    placeholder: '...',
    anchor: { x: sprout.x, y: sprout.y },
  });
  petPrompt.mount();
  const petName = await petPrompt.awaitInput();
  petPrompt.setBusy(true);

  let firstFragment: string;
  let resolvedNickname = nickname;
  try {
    const result = await window.minari.completeBirth(nickname, petName);
    firstFragment = result.firstFragment;
    resolvedNickname = result.nickname;
  } catch (err) {
    console.error('[birth] completeBirth failed:', err);
    firstFragment = '...';
  }

  bubble.setVoice(makeVoiceProfile(resolvedNickname, 'calm'));
  await petPrompt.dismiss();
  bubble.show(firstFragment);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tween(durationMs: number, onUpdate: (p: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = () => {
      const elapsed = performance.now() - start;
      const p = Math.min(1, elapsed / durationMs);
      onUpdate(p);
      if (p >= 1) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

function easeInCubic(x: number): number {
  return x * x * x;
}

// Damped oscillator settling at 1: starts at 0, overshoots ~13%, wobbles,
// converges to 1 by t=1. BirthSprout.setLeafUnfold accepts the overshoot, so
// the leaves dip slightly past horizontal then spring back — "wobble settle".
function easeOutSpring(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const damping = 5;
  const frequency = 8;
  return 1 - Math.exp(-damping * t) * Math.cos(frequency * t);
}

// Damped oscillation over p∈[0,1]: starts and ends at ~0, a couple of quick
// shivers in between. Drives the seed's squash-stretch twitch.
function dampedWobble(p: number): number {
  return Math.exp(-4 * p) * Math.sin(p * Math.PI * 3);
}
