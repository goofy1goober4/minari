import type { Application } from 'pixi.js';
import type { Minari } from '../pet/Minari';
import type { Bubble } from '../ui/Bubble';
import { Seed } from './Seed';
import { BirthSprout } from './BirthSprout';
import { NicknamePrompt } from './NicknamePrompt';
import { makeVoiceProfile, playMumble } from '../sound/mumble';

// Seed stage: fade-in, a long anticipatory hold, then two little "까딱"
// twitches — the third beat (germination) cracks the seed open.
const SEED_FADE_IN_MS = 700;
const SEED_HOLD_MS = 3700;
const SEED_WOBBLE_MS = 600;
const SEED_WOBBLE_GAP_MS = 400;
// Each "까딱" twitch rocks the seed body this far and back (radians), pivoted
// at its base. Negative tilts it to the right.
const SEED_TWITCH_ANGLE = -0.4;
// Seed + sprout sit this many px above Minari's resting spot.
const SEED_SPROUT_RISE_PX = 2;

// Sprout stage — a slow, deliberate germination (~14 s), split ~5:3 like the
// original pacing, then the grown sprout is held a beat before the reveal.
// Stage 1: stem rises out of the seed (slow start, accelerates). Seed
// cracks/fades over the first part of this stage as the stem pushes through.
const STEM_GROW_MS = 8750;
const SEED_FADE_FRAC = 0.6;

// Stage 2: leaves unfold from the bud with a damped spring — the ease
// overshoots ~13% so they dip past horizontal then wobble to rest.
const LEAF_UNFOLD_MS = 5250;

// Stage 3: the fully grown sprout holds on screen before the character reveal.
const SPROUT_HOLD_MS = 6000;

// Stage 4: the germinated vector sprout cross-fades into the full Minari PNG —
// a long, gentle ease-in-out so she emerges softly rather than popping in.
const CHARACTER_REVEAL_MS = 2000;
const POST_BIRTH_BEAT_MS = 500;
// Minari's first breath — eyes shut, deep + slow — held this long after the
// character reveal.
const FIRST_BREATH_MS = 8000;
// Pause after she opens her eyes from the first breath, before the first
// nickname question — lets the moment settle.
const PRE_NAME_PAUSE_MS = 5000;
// How long Minari holds a name echo ("<name>.") before the scene moves on —
// long enough to read as savouring the just-heard word.
const NAME_ECHO_HOLD_MS = 1600;

export interface BirthSceneDeps {
  app: Application;
  sprout: Minari;
  bubble: Bubble;
}

export async function runBirthScene({ app, sprout, bubble }: BirthSceneDeps): Promise<void> {
  if (window.minari.devtools) console.log('[birth] scene start; sprout at', sprout.x, sprout.y);
  // Minari stays hidden — the seed and germinating sprout own the screen until
  // the character reveal. index.ts already set visible=false; belt-and-braces.
  sprout.visible = false;
  sprout.alpha = 1;

  const seed = new Seed();
  seed.x = sprout.x;
  seed.y = sprout.y - SEED_SPROUT_RISE_PX;

  const bsprout = new BirthSprout();
  bsprout.x = sprout.x;
  bsprout.y = sprout.y - SEED_SPROUT_RISE_PX;

  // bsprout goes in below the seed: the seed sits in front at the base, then
  // fades as the stem pushes up through it.
  app.stage.addChild(bsprout);
  app.stage.addChild(seed);
  if (window.minari.devtools) console.log('[birth] seed + sprout added; children:', app.stage.children.length);

  // Seed appears, holds a long beat, then twitches twice — "까딱, 까딱" — the
  // third beat being germination itself (stage 1 pushing the stem through).
  await tween(SEED_FADE_IN_MS, (p) => seed.setProgress(easeOutCubic(p)));
  if (window.minari.devtools) console.log('[birth] seed fade-in done');
  await delay(SEED_HOLD_MS);
  for (let twitch = 0; twitch < 2; twitch++) {
    await tween(SEED_WOBBLE_MS, (p) => {
      // Tilt the body to the right and back — a little "까딱" nod.
      seed.setTwitch(Math.sin(p * Math.PI) * SEED_TWITCH_ANGLE);
    });
    seed.setTwitch(0);
    await delay(SEED_WOBBLE_GAP_MS);
  }

  // Stage 1: stem rises (ease-in: slow then accelerating) while the seed
  // cracks open and fades.
  if (window.minari.devtools) console.log('[birth] stage1 stem growth start');
  await tween(STEM_GROW_MS, (p) => {
    bsprout.setStemGrowth(easeInCubic(p));
    const fadeP = Math.min(1, p / SEED_FADE_FRAC);
    seed.setProgress(1 - easeInCubic(fadeP));
  });
  bsprout.setStemGrowth(1);
  app.stage.removeChild(seed);
  seed.destroy({ children: true });
  if (window.minari.devtools) console.log('[birth] stage1 done; stem at full height');

  // Stage 2: leaves unfold from the bud with a damped wobble settle.
  if (window.minari.devtools) console.log('[birth] stage2 leaf unfold start');
  await tween(LEAF_UNFOLD_MS, (p) => {
    bsprout.setLeafUnfold(easeOutSpring(p));
  });
  bsprout.setLeafUnfold(1);
  if (window.minari.devtools) console.log('[birth] stage2 done; leaves unfolded');

  // Stage 3: hold the fully grown sprout a beat before the character reveal.
  await delay(SPROUT_HOLD_MS);

  // Stage 4: the full Minari cross-fades in over the germinated sprout. Her
  // eyes are shut *before* the fade begins — so she is born already
  // mid-first-breath and never flashes her eyes open; firstBreath also
  // suspends the idle head-tilt for the duration.
  if (window.minari.devtools) console.log('[birth] character reveal start');
  sprout.firstBreath(true);
  sprout.visible = true;
  // Re-add to bring Minari above the now-fading germination sprout.
  app.stage.addChild(sprout);
  await tween(CHARACTER_REVEAL_MS, (p) => {
    const e = easeInOutCubic(p);
    sprout.alpha = e;
    sprout.scale.set(0.96 + 0.04 * e);
    bsprout.alpha = 1 - e;
  });
  sprout.alpha = 1;
  sprout.scale.set(1);
  app.stage.removeChild(bsprout);
  bsprout.destroy({ children: true });
  if (window.minari.devtools) console.log('[birth] character reveal done');

  // She was revealed already breathing deep with her eyes shut — hold that
  // first breath a beat, then open her eyes.
  await delay(FIRST_BREATH_MS);
  sprout.firstBreath(false);

  await delay(PRE_NAME_PAUSE_MS);

  // Nickname overlays stay non-blocking: NicknamePrompt toggles window
  // click-through by cursor position, so the desktop stays usable while the
  // prompt waits, and the prompt survives focus loss.
  const isKo = window.minari.lang === 'ko';
  // One mumble voice for every birth beat — Minari while she's still a
  // toddler-sprout. Calm mood carries no mood-endRise, so the name echoes
  // settle flat while the "?" questions get their rise from playMumble's own
  // question handling. The real post-birth voice is restored at the end.
  const birthVoice = makeVoiceProfile('minari', 'calm');
  bubble.setVoice(birthVoice);

  // Q1 — what should I (Minari, the toddler-sprout) call you?
  const userQuestion = isKo ? '너... 이름?' : 'you... name?';
  const userPrompt = new NicknamePrompt({
    question: userQuestion,
    placeholder: '...',
    anchor: { x: sprout.x, y: sprout.y },
  });
  userPrompt.mount();
  void playMumble(userQuestion, birthVoice);
  const nickname = await userPrompt.awaitInput();
  await userPrompt.dismiss();

  // Minari mouths the name back, chewing the new word over.
  await echoName(bubble, nickname);
  bubble.dismiss();
  await delay(POST_BIRTH_BEAT_MS);

  // Q2 — what should you (the human) call me?
  const petQuestion = isKo ? '나... 이름?' : 'me... name?';
  const petPrompt = new NicknamePrompt({
    question: petQuestion,
    placeholder: '...',
    anchor: { x: sprout.x, y: sprout.y },
  });
  petPrompt.mount();
  void playMumble(petQuestion, birthVoice);
  const petName = await petPrompt.awaitInput();
  petPrompt.setBusy(true);

  // completeBirth still generates + persists the first fragment and the
  // initial snapshot; we just don't surface that fragment any more — the
  // birth now closes on Minari mouthing her own new name.
  let resolvedNickname = nickname;
  try {
    const result = await window.minari.completeBirth(nickname, petName);
    resolvedNickname = result.nickname;
  } catch (err) {
    console.error('[birth] completeBirth failed:', err);
  }

  await petPrompt.dismiss();
  await echoName(bubble, petName);
  // Restore the real post-birth voice for any later pings this session.
  bubble.setVoice(makeVoiceProfile(resolvedNickname, 'calm'));
}

// Minari mouths a just-heard name back to herself — "<name>." shown in the
// bubble (Bubble.show plays the mumble through the voice set on it) and held
// a beat so it reads as savouring the new word.
async function echoName(bubble: Bubble, name: string): Promise<void> {
  bubble.show(`${name}.`);
  await delay(NAME_ECHO_HOLD_MS);
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

// Gentle S-curve — slow start and slow end — for a soft, un-abrupt reveal.
function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
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
