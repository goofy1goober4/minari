import { Container, Sprite, Texture } from 'pixi.js';
import type { Mood } from '../../shared/snapshot';
import { POSTURE_PRESETS, type PosturePreset } from './postures';
import { loadSprite, type LoadedSprite, type SpriteName } from './sprites';

// Hit-region math in index.ts (SPROUT_HIT_*) is anchored at this height, so
// keep the export stable even when the sprite stack is taller/shorter.
export const SPRITE_HEIGHT = 135;

const FACE_BASE_Y = -55;
const SPROUT_BASE_Y = -110;

const BREATH_PERIOD_S = 5;
const BREATH_Y_AMP_PX = 3;
const BREATH_SCALE_AMP = 0.015;

const SPROUT_SWAY_PERIOD_S = 2.5;
const SPROUT_SWAY_AMP_RAD = 0.08;

const FACE_WOBBLE_MAX_RAD = 0.05;
const FACE_WOBBLE_K = 80;
const FACE_WOBBLE_C = 10;

const NUDGE_IMPULSE_RAD_PER_S = 0.55;
const STARTLE_IMPULSE_RAD_PER_S = 1.4;

// Cursor x (in container-local px) past this magnitude flips the face direction.
const FACE_DIR_DEAD_ZONE_PX = 30;

// Dev-only: swap face sprite to closed.png for this long when blinking.
const BLINK_CLOSED_MS_DEFAULT = 150;
const BLINK_CLOSED_MS_SLEEPY = 800;
const BLINK_INTERVAL_JITTER_MS = 1500;

type FaceDir = 'front' | '34left' | '34right';
type FaceTexKey =
  | 'face_front_open'
  | 'face_front_closed'
  | 'face_34left_open'
  | 'face_34left_closed'
  | 'face_34right_open'
  | 'face_34right_closed';

const PLACEHOLDER = {
  body: { tint: 0xd9d1c3, width: 90, height: 64 },
  face: { tint: 0xf0e8da, width: 76, height: 64 },
  sprout: { tint: 0x7fb069, width: 50, height: 44 },
};

export class Minari extends Container {
  private torso = new Container();
  private body = new Sprite(Texture.WHITE);
  private face = new Sprite(Texture.WHITE);
  private sproutSprite = new Sprite(Texture.WHITE);

  private faceTextures: Partial<Record<FaceTexKey, LoadedSprite>> = {};
  private faceDir: FaceDir = 'front';
  private mood: Mood = 'calm';
  private posture: PosturePreset = POSTURE_PRESETS.idle;

  private elapsedMs = 0;
  private nextBlinkAtMs = 0;
  private blinkStartedAtMs: number | null = null;

  private wobbleAng = 0;
  private wobbleVel = 0;

  constructor() {
    super();
    this.body.anchor.set(0.5, 1);
    this.face.anchor.set(0.5, 1);
    this.sproutSprite.anchor.set(0.5, 1);

    this.body.y = 0;
    this.face.y = FACE_BASE_Y;
    this.sproutSprite.y = SPROUT_BASE_Y;

    // Apply placeholder sizes/tints up front so the layout is visible before
    // any PNG resolves (and remains so if assets/sprites/* don't exist yet).
    applyPlaceholder(this.body, PLACEHOLDER.body);
    applyPlaceholder(this.face, PLACEHOLDER.face);
    applyPlaceholder(this.sproutSprite, PLACEHOLDER.sprout);

    this.torso.addChild(this.body, this.face, this.sproutSprite);
    this.addChild(this.torso);

    this.scheduleNextBlink();
    void this.loadAll();
  }

  private async loadAll(): Promise<void> {
    const [body, sprout, ...faces] = await Promise.all([
      loadSprite('body', PLACEHOLDER.body),
      loadSprite('sprout', PLACEHOLDER.sprout),
      loadSprite('face_front_open', PLACEHOLDER.face),
      loadSprite('face_front_closed', PLACEHOLDER.face),
      loadSprite('face_34left_open', PLACEHOLDER.face),
      loadSprite('face_34left_closed', PLACEHOLDER.face),
      loadSprite('face_34right_open', PLACEHOLDER.face),
      loadSprite('face_34right_closed', PLACEHOLDER.face),
    ]);

    applyLoaded(this.body, body, false);
    applyLoaded(this.sproutSprite, sprout, false);

    const keys: FaceTexKey[] = [
      'face_front_open',
      'face_front_closed',
      'face_34left_open',
      'face_34left_closed',
      'face_34right_open',
      'face_34right_closed',
    ];
    keys.forEach((key, i) => {
      this.faceTextures[key] = faces[i];
    });

    const summary = ([
      ['body', body],
      ['sprout', sprout],
      ...keys.map((k, i) => [k, faces[i]] as [string, LoadedSprite]),
    ] as Array<[string, LoadedSprite]>)
      .map(([n, s]) => `${n}=${s.isPlaceholder ? 'placeholder' : 'png'}`)
      .join(' ');
    console.log('[minari] sprite layers loaded ' + summary);

    this.applyFaceTexture();
  }

  setMood(m: Mood): void {
    this.mood = m;
  }

  setPosture(preset: PosturePreset): void {
    this.posture = preset;
  }

  // No-op stems/leaves — preserved for caller compatibility (birth scene grow,
  // resume posture). Sprite art has these baked in; no per-keyframe rig.
  setStemGrowth(_p: number): void {}
  setLeafUnfold(_p: number): void {}
  notice(): void {}

  nudge(): void {
    this.wobbleVel += NUDGE_IMPULSE_RAD_PER_S;
  }
  startle(): void {
    this.wobbleVel += STARTLE_IMPULSE_RAD_PER_S;
    // Punctuate with an immediate blink so the eyes "react" too.
    this.blinkStartedAtMs = this.elapsedMs;
    this.applyFaceTexture();
  }

  onPointerMove(localX: number, _localY: number, _vx: number, _dt: number): void {
    let next: FaceDir;
    if (localX < -FACE_DIR_DEAD_ZONE_PX) next = '34left';
    else if (localX > FACE_DIR_DEAD_ZONE_PX) next = '34right';
    else next = 'front';
    if (next !== this.faceDir) {
      this.faceDir = next;
      this.applyFaceTexture();
    }
  }

  onPointerLeave(): void {
    if (this.faceDir !== 'front') {
      this.faceDir = 'front';
      this.applyFaceTexture();
    }
  }

  breathe(deltaMS: number): void {
    this.elapsedMs += deltaMS;
    const t = this.elapsedMs / 1000;

    // Torso breathing — wraps body+face+sprout so the stack stays glued.
    const breath = Math.sin((t * 2 * Math.PI) / BREATH_PERIOD_S);
    this.torso.y = breath * BREATH_Y_AMP_PX;
    const s = 1 + breath * BREATH_SCALE_AMP;
    this.torso.scale.set(s);

    // Sprout sway — independent of nudge/startle.
    const sway = Math.sin((t * 2 * Math.PI) / SPROUT_SWAY_PERIOD_S);
    this.sproutSprite.rotation = sway * SPROUT_SWAY_AMP_RAD;

    // Face damped wobble (impulse-driven via nudge/startle).
    const dt = Math.min(deltaMS / 1000, 1 / 30);
    const a = -FACE_WOBBLE_K * this.wobbleAng - FACE_WOBBLE_C * this.wobbleVel;
    this.wobbleVel += a * dt;
    this.wobbleAng += this.wobbleVel * dt;
    if (this.wobbleAng > FACE_WOBBLE_MAX_RAD) {
      this.wobbleAng = FACE_WOBBLE_MAX_RAD;
      if (this.wobbleVel > 0) this.wobbleVel = 0;
    } else if (this.wobbleAng < -FACE_WOBBLE_MAX_RAD) {
      this.wobbleAng = -FACE_WOBBLE_MAX_RAD;
      if (this.wobbleVel < 0) this.wobbleVel = 0;
    }
    this.face.rotation = this.wobbleAng;

    // Blink scheduling.
    if (this.blinkStartedAtMs !== null) {
      if (this.elapsedMs - this.blinkStartedAtMs >= this.closedDurationMs()) {
        this.blinkStartedAtMs = null;
        this.scheduleNextBlink();
        this.applyFaceTexture();
      }
    } else if (this.elapsedMs >= this.nextBlinkAtMs) {
      this.blinkStartedAtMs = this.elapsedMs;
      this.applyFaceTexture();
    }
  }

  private blinkIntervalMs(): number {
    switch (this.mood) {
      case 'calm':
        return 6000;
      case 'curious':
        return 3000;
      case 'sleepy':
        return 5000;
      default:
        return 5000;
    }
  }

  private closedDurationMs(): number {
    return this.mood === 'sleepy' ? BLINK_CLOSED_MS_SLEEPY : BLINK_CLOSED_MS_DEFAULT;
  }

  private scheduleNextBlink(): void {
    const base = this.blinkIntervalMs();
    const jitter = (Math.random() - 0.5) * BLINK_INTERVAL_JITTER_MS;
    this.nextBlinkAtMs = this.elapsedMs + Math.max(1500, base + jitter);
  }

  private applyFaceTexture(): void {
    const closed = this.blinkStartedAtMs !== null;
    const key: FaceTexKey = `face_${this.faceDir}_${closed ? 'closed' : 'open'}`;
    const loaded = this.faceTextures[key];
    if (!loaded) {
      // Pre-load: leave the sprite on its current placeholder.
      // Still simulate a blink via tint darken so dev placeholders show it.
      applyPlaceholder(this.face, {
        ...PLACEHOLDER.face,
        tint: closed ? darken(PLACEHOLDER.face.tint, 0.55) : PLACEHOLDER.face.tint,
      });
      return;
    }
    applyLoaded(this.face, loaded, closed);
  }
}

function applyPlaceholder(
  sprite: Sprite,
  spec: { tint: number; width: number; height: number },
): void {
  sprite.texture = Texture.WHITE;
  sprite.scale.set(1);
  sprite.width = spec.width;
  sprite.height = spec.height;
  sprite.tint = spec.tint;
}

function applyLoaded(sprite: Sprite, loaded: LoadedSprite, closedDarken: boolean): void {
  if (loaded.isPlaceholder && loaded.placeholder) {
    const tint = closedDarken
      ? darken(loaded.placeholder.tint, 0.55)
      : loaded.placeholder.tint;
    applyPlaceholder(sprite, { ...loaded.placeholder, tint });
    return;
  }
  sprite.texture = loaded.texture;
  sprite.tint = 0xffffff;
  // Real texture: clear the explicit width/height so it renders at native size.
  sprite.scale.set(1);
}

function darken(rgb: number, factor: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((rgb >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((rgb >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((rgb & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}
