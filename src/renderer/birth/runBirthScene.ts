import type { Application } from 'pixi.js';
import type { Minari } from '../pet/Minari';
import type { Bubble } from '../ui/Bubble';
import { Seed } from './Seed';
import { NicknamePrompt } from './NicknamePrompt';
import { makeVoiceProfile } from '../sound/mumble';

const SEED_FADE_IN_MS = 700;
const SEED_HOLD_MS = 500;

// Stage 1: stem rises out of the seed (slow start, accelerates).
// Seed cracks/fades over the first ~60% of this stage as the stem pushes through.
const STEM_GROW_MS = 2500;
const SEED_FADE_FRAC = 0.6;

// Stage 2: leaves unfold from the bud with a damped wobble settle.
const LEAF_UNFOLD_MS = 1500;

const POST_GERMINATE_BEAT_MS = 600;

export interface BirthSceneDeps {
  app: Application;
  sprout: Minari;
  bubble: Bubble;
}

export async function runBirthScene({ app, sprout, bubble }: BirthSceneDeps): Promise<void> {
  console.log('[birth] scene start; sprout at', sprout.x, sprout.y);
  sprout.setStemGrowth(0);
  sprout.setLeafUnfold(0);

  const seed = new Seed();
  seed.x = sprout.x;
  seed.y = sprout.y;
  app.stage.addChild(seed);
  console.log('[birth] seed added to stage; children:', app.stage.children.length);

  await tween(SEED_FADE_IN_MS, (p) => seed.setProgress(easeOutCubic(p)));
  console.log('[birth] seed fade-in done');
  await delay(SEED_HOLD_MS);

  // Stage 1: stem rises (ease-in: slow then accelerating) while the seed cracks open.
  console.log('[birth] stage1 stem growth start');
  await tween(STEM_GROW_MS, (p) => {
    sprout.setStemGrowth(easeInCubic(p));
    const fadeP = Math.min(1, p / SEED_FADE_FRAC);
    seed.setProgress(1 - easeInCubic(fadeP));
  });
  app.stage.removeChild(seed);
  seed.destroy({ children: true });
  console.log('[birth] stage1 done; seed gone, stem at full height');

  // Stage 2: leaves unfold from the bud with a damped wobble settle.
  console.log('[birth] stage2 leaf unfold start');
  await tween(LEAF_UNFOLD_MS, (p) => {
    sprout.setLeafUnfold(easeOutSpring(p));
  });
  sprout.setLeafUnfold(1);
  console.log('[birth] stage2 done; leaves unfolded');

  await delay(POST_GERMINATE_BEAT_MS);

  // Nickname overlays need real cursor + keyboard, so disable click-through.
  window.minari.setClickThrough(false);

  const isKo = window.minari.lang === 'ko';

  // Q1 — what should I (Minari, the toddler-sprout) call you?
  const userPrompt = new NicknamePrompt({
    question: isKo ? '너... 이름?' : 'you... name?',
    placeholder: '...',
  });
  userPrompt.mount();
  const nickname = await userPrompt.awaitInput();
  await userPrompt.dismiss();

  // Q2 — what should you (the human) call me?
  const petPrompt = new NicknamePrompt({
    question: isKo ? '나... 이름?' : 'me... name?',
    placeholder: '...',
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
// converges to 1 by t=1. Drives leaf unfold past the rest position so the
// leaves dip slightly past horizontal then spring back — "wobble settle".
function easeOutSpring(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const damping = 5;
  const frequency = 8;
  return 1 - Math.exp(-damping * t) * Math.cos(frequency * t);
}
