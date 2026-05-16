import { BlurFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Mood } from '../../shared/snapshot';
import { POSTURE_PRESETS, type PosturePreset } from './postures';
import { FILE_FOR, loadSprite, type LoadedSprite, type SpriteName } from './sprites';
import { POSES, type Pose, type PoseConfig } from './poses';

// Hit-region math in index.ts (SPROUT_HIT_*) is anchored at this height, so
// keep the export stable when art is swapped — re-tune via SPRITE_SCALE below.
export const SPRITE_HEIGHT = 135;

const CANVAS_W = 1300;
const CANVAS_H = 2000;
// Render scale. Overridable on low-res displays via MINARI_SCALE (bridged as
// window.minari.scale); 0.1 when the env var is unset — unchanged default.
const SPRITE_SCALE = window.minari.scale;

// Breathing reads as a faint chest swell only — no float, scale-only.
const BREATH_PERIOD_S = 5;
const BREATH_Y_AMP_PX = 0;
const BREATH_SCALE_AMP = 0.005;

// Sprout sway: spring-driven so it lags a slow-moving target — gives elasticity
// rather than the mechanical sine the first pass had.
const SPROUT_SWAY_PERIOD_S = 2.5;
const SPROUT_SWAY_AMP_RAD = (3 * Math.PI) / 180; // ±3°
const SPROUT_SPRING_K = 18;
const SPROUT_SPRING_C = 3.5;

// Wobble (nudge/startle damped spring) — both face and body share K/C; body
// rides at 0.7× face amplitude so a click rocks the whole character lightly.
const WOBBLE_MAX_RAD = 0.02;
const WOBBLE_K = 80;
const WOBBLE_C = 10;
const NUDGE_IMPULSE = 0.55;
const STARTLE_IMPULSE = 1.4;
const BODY_WOBBLE_RATIO = 0.7;

// Auto-tilt cadence — purely time-driven, ignores cursor (cursor reactions read
// as twitchy on a small idle pet).
const TILT_INTERVAL_MIN_MS = 8000;
const TILT_INTERVAL_MAX_MS = 15000;
const TILT_DURATION_MS = 1800;
const TILT_FACE_ANG_RAD = 0.02;
const TILT_BODY_RATIO = 0.3;

// Blink: 50 ms crossfade with both layers at 0.5, then closed hold, then
// reverse fade. Tilts borrow the same machinery — eyes stay closed for the
// whole tilt duration so the head doesn't move with bug-eyed staring.
const BLINK_FADE_MS = 50;

// Foot shadow — flat oval under the feet, slightly wider than the body.
// Swells subtly with breath: amplifies the body's tiny scale change just
// enough to feel alive without reading as a separate animation.
// Vertical offset is per-pose (poses.ts shadowYOffset) — it lifts the ellipse
// to the visual feet/seat, which sits at a different height in standing vs
// sitting art.
const SHADOW_W = 60;
const SHADOW_H = 12;
const SHADOW_ALPHA = 0.15;
const SHADOW_BREATH_AMP = 0.03;
const SHADOW_BLUR_STRENGTH = 0.5;
const BLINK_CLOSED_MS_DEFAULT = 150;
const BLINK_CLOSED_MS_SLEEPY = 800;
const BLINK_INTERVAL_JITTER_MS = 1500;

type FaceDir = 'front' | 'tiltL' | 'tiltR';

const FACE_OPEN_FOR: Record<FaceDir, SpriteName> = {
  front: 'face_front_open',
  tiltL: 'face_front_tiltL',
  tiltR: 'face_front_tiltR',
};

const PLACEHOLDER = {
  body: { tint: 0xd9d1c3, width: CANVAS_W, height: CANVAS_H },
  face: { tint: 0xf0e8da, width: CANVAS_W, height: CANVAS_H },
  sprout: { tint: 0x7fb069, width: CANVAS_W, height: CANVAS_H },
};

type BlinkPhase = 'idle' | 'fade_close' | 'closed' | 'fade_open';

export class Minari extends Container {
  private shadow = new Graphics();
  private torso = new Container();
  private body = new Sprite(Texture.WHITE);
  // faceLayer wraps face sprites + sprout so tilt rotation applies once.
  // Open faces are stacked per direction (only one visible) so direction
  // changes are pure alpha toggles — no texture reassignment, no one-frame
  // blank while Pixi uploads a new texture to the GPU.
  private faceLayer = new Container();
  private faceOpenSprites: Record<FaceDir, Sprite> = {
    front: new Sprite(Texture.WHITE),
    tiltL: new Sprite(Texture.WHITE),
    tiltR: new Sprite(Texture.WHITE),
  };
  private faceClosed = new Sprite(Texture.WHITE);
  // Discrete mid-blink frame — used by the diary pose; alpha 0 otherwise.
  private faceHalf = new Sprite(Texture.WHITE);
  private sproutSprite = new Sprite(Texture.WHITE);

  private faceTextures: Partial<Record<SpriteName, LoadedSprite>> = {};
  private faceDir: FaceDir = 'front';
  private mood: Mood = 'calm';
  private posture: PosturePreset = POSTURE_PRESETS.idle;
  private readonly pose: Pose;
  private readonly poseConfig: PoseConfig;

  private elapsedMs = 0;

  // Blink state machine.
  private blinkPhase: BlinkPhase = 'idle';
  private blinkPhaseEndsAtMs = 0;
  private blinkClosedHoldMs = BLINK_CLOSED_MS_DEFAULT;
  private nextBlinkAtMs = 0;

  // Auto-tilt state — currentTiltDir non-null means we're holding a tilt now.
  private currentTiltDir: 'tiltL' | 'tiltR' | null = null;
  private tiltEndsAtMs = 0;
  private nextTiltAtMs = 0;

  // Wobble springs.
  private faceWobbleAng = 0;
  private faceWobbleVel = 0;
  private bodyWobbleAng = 0;
  private bodyWobbleVel = 0;

  // Sprout spring.
  private sproutAng = 0;
  private sproutVel = 0;

  // Cached alpha mask (composite of body+sprout+face_front_open) for
  // pixel-accurate hit testing from the renderer.
  private hitMask: { w: number; h: number; data: Uint8ClampedArray } | null = null;

  constructor(pose: Pose = 'idle') {
    super();
    this.pose = pose;
    this.poseConfig = POSES[pose];
    const openSprites = [
      this.faceOpenSprites.front,
      this.faceOpenSprites.tiltL,
      this.faceOpenSprites.tiltR,
    ];
    for (const s of [
      this.body,
      ...openSprites,
      this.faceClosed,
      this.faceHalf,
      this.sproutSprite,
    ]) {
      s.anchor.set(0.5, 1);
      s.y = 0;
    }
    // Per-art alignment: tilt PNGs drift sideways — nudge each back into place.
    this.faceOpenSprites.tiltL.x = -3;
    this.faceOpenSprites.tiltR.x = -2;

    applyPlaceholder(this.body, PLACEHOLDER.body);
    for (const s of openSprites) applyPlaceholder(s, PLACEHOLDER.face);
    applyPlaceholder(this.faceClosed, PLACEHOLDER.face);
    applyPlaceholder(this.faceHalf, PLACEHOLDER.face);
    applyPlaceholder(this.sproutSprite, PLACEHOLDER.sprout);

    // Sprout layer disabled — body.png already contains the drawn sprout, so a
    // separate overlay just duplicates it. Kept in the tree so the rotation
    // wiring/animation state can be re-enabled later without churn.
    this.sproutSprite.visible = false;

    this.faceClosed.alpha = 0;
    this.faceHalf.alpha = 0;
    this.faceOpenSprites.tiltL.alpha = 0;
    this.faceOpenSprites.tiltR.alpha = 0;
    // front starts visible.
    this.faceOpenSprites.front.alpha = 1;

    this.faceLayer.addChild(...openSprites, this.faceHalf, this.faceClosed, this.sproutSprite);
    this.torso.addChild(this.body, this.faceLayer);

    // Shadow sits at the feet (container origin = anchor bottom) and renders
    // below the torso. Drawn once; breathe() scales it horizontally each tick.
    this.shadow
      .ellipse(0, 0, SHADOW_W / 2, SHADOW_H / 2)
      .fill({ color: 0x000000, alpha: SHADOW_ALPHA });
    this.shadow.y = this.poseConfig.shadowYOffset;
    this.shadow.filters = [new BlurFilter({ strength: SHADOW_BLUR_STRENGTH })];
    this.addChild(this.shadow);
    this.addChild(this.torso);

    this.scheduleNextBlink();
    if (this.poseConfig.tilt) this.scheduleNextTilt();
    void this.loadAll();
    void this.loadHitMask();
  }

  // Composite alpha mask from body + sprout + face_front_open so the head/
  // sprout region (drawn in those layers, not in body.png alone) hit-tests.
  // Drawn into one offscreen 2D canvas — `source-over` blending gives an OR
  // semantics on alpha which is exactly what we need.
  private async loadHitMask(): Promise<void> {
    // Pose-driven: sit poses are wider/shorter, so the mask follows their art.
    const SOURCES = this.poseConfig.hitMaskSprites.map((n) => FILE_FOR[n]);
    try {
      const imgs = await Promise.all(
        SOURCES.map(
          (src) =>
            new Promise<HTMLImageElement | null>((resolve) => {
              const el = new Image();
              el.onload = () => resolve(el);
              el.onerror = () => resolve(null);
              el.src = src;
            }),
        ),
      );
      const ref = imgs.find((i): i is HTMLImageElement => i !== null);
      if (!ref) return;
      const canvas = document.createElement('canvas');
      canvas.width = ref.naturalWidth;
      canvas.height = ref.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      for (const img of imgs) if (img) ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
      this.hitMask = { w: canvas.width, h: canvas.height, data: id.data };
      console.log('[minari] hit mask composited ' + canvas.width + 'x' + canvas.height);
    } catch (err) {
      console.warn('[minari] hit mask load failed', err);
    }
  }

  // Pixel-accurate hit test. localX/localY are container-local (sprite
  // anchor 0.5, 1 → origin at the feet, centre horizontally).
  containsPoint(localX: number, localY: number): boolean {
    if (!this.hitMask) {
      // Pre-mask fallback: generous bounding box so cursor isn't dead during
      // the first frames.
      const halfW = (CANVAS_W * SPRITE_SCALE) / 2;
      const fullH = CANVAS_H * SPRITE_SCALE;
      return localX >= -halfW && localX <= halfW && localY >= -fullH && localY <= 14;
    }
    const cx = Math.floor(localX / SPRITE_SCALE + this.hitMask.w / 2);
    const cy = Math.floor(localY / SPRITE_SCALE + this.hitMask.h);
    if (cx < 0 || cy < 0 || cx >= this.hitMask.w || cy >= this.hitMask.h) return false;
    return this.hitMask.data[(cy * this.hitMask.w + cx) * 4 + 3] > 32;
  }

  private async loadAll(): Promise<void> {
    if (this.pose === 'idle') {
      await this.loadIdleLayers();
    } else {
      await this.loadPoseLayers();
    }
  }

  // Reading / diary: swap in the pose's body + face set. idle is left on its
  // own untouched path (loadIdleLayers) so its behaviour can't regress.
  private async loadPoseLayers(): Promise<void> {
    const cfg = this.poseConfig;
    const names: SpriteName[] = [cfg.body, cfg.faceDefault, cfg.faceClosed];
    if (cfg.faceHalf) names.push(cfg.faceHalf);
    const loaded = await Promise.all(
      names.map((n) => loadSprite(n, n === cfg.body ? PLACEHOLDER.body : PLACEHOLDER.face)),
    );
    const at = (n: SpriteName): LoadedSprite => loaded[names.indexOf(n)];
    applyLoaded(this.body, at(cfg.body));
    // The pose's resting face occupies the 'front' slot (sit poses never tilt).
    applyLoaded(this.faceOpenSprites.front, at(cfg.faceDefault));
    applyLoaded(this.faceClosed, at(cfg.faceClosed));
    if (cfg.faceHalf) applyLoaded(this.faceHalf, at(cfg.faceHalf));
    console.log(
      '[minari] pose=' +
        this.pose +
        ' layers loaded ' +
        names.map((n, i) => n + '=' + (loaded[i].isPlaceholder ? 'placeholder' : 'png')).join(' '),
    );
    this.updateFaceAlphas();
  }

  private async loadIdleLayers(): Promise<void> {
    const faceNames: SpriteName[] = [
      'face_front_open',
      'face_front_closed',
      'face_front_half',
      'face_front_smile',
      'face_front_surprise',
      'face_front_tiltL',
      'face_front_tiltR',
    ];

    const [body, sprout, ...faces] = await Promise.all([
      loadSprite('body', PLACEHOLDER.body),
      loadSprite('sprout', PLACEHOLDER.sprout),
      ...faceNames.map((n) => loadSprite(n, PLACEHOLDER.face)),
    ]);

    applyLoaded(this.body, body);
    applyLoaded(this.sproutSprite, sprout);
    faceNames.forEach((name, i) => {
      this.faceTextures[name] = faces[i];
    });

    // Bind each direction's open texture to its dedicated sprite — done once,
    // no further texture reassignments at runtime.
    const openMap: Record<FaceDir, SpriteName> = FACE_OPEN_FOR;
    (Object.keys(openMap) as FaceDir[]).forEach((dir) => {
      const loaded = this.faceTextures[openMap[dir]];
      if (loaded) applyLoaded(this.faceOpenSprites[dir], loaded);
    });
    const closedLoaded = this.faceTextures['face_front_closed'];
    if (closedLoaded) applyLoaded(this.faceClosed, closedLoaded);

    const summary = [
      ['body', body] as const,
      ['sprout', sprout] as const,
      ...faceNames.map((n, i) => [n, faces[i]] as const),
    ]
      .map(([n, s]) => `${n}=${s.isPlaceholder ? 'placeholder' : 'png'}`)
      .join(' ');
    console.log('[minari] sprite layers loaded ' + summary);

    this.updateFaceAlphas();
  }

  setMood(m: Mood): void {
    this.mood = m;
  }
  setPosture(preset: PosturePreset): void {
    this.posture = preset;
  }
  setStemGrowth(_p: number): void {}
  setLeafUnfold(_p: number): void {}
  notice(): void {}

  nudge(): void {
    this.faceWobbleVel += NUDGE_IMPULSE;
    this.bodyWobbleVel += NUDGE_IMPULSE * BODY_WOBBLE_RATIO;
  }
  startle(): void {
    this.faceWobbleVel += STARTLE_IMPULSE;
    this.bodyWobbleVel += STARTLE_IMPULSE * BODY_WOBBLE_RATIO;
    this.startBlink(BLINK_CLOSED_MS_DEFAULT);
  }

  // onPointerMove kept for interface compatibility; cursor no longer drives
  // direction — the auto-tilt timer below is the single source of truth.
  onPointerMove(_localX: number, _localY: number, _vx: number, _dt: number): void {}
  onPointerLeave(): void {}

  breathe(deltaMS: number): void {
    this.elapsedMs += deltaMS;
    const t = this.elapsedMs / 1000;
    const dt = Math.min(deltaMS / 1000, 1 / 30);

    // Torso breathing.
    const breath = Math.sin((t * 2 * Math.PI) / BREATH_PERIOD_S);
    this.torso.y = breath * BREATH_Y_AMP_PX;
    this.torso.scale.set(1 + breath * BREATH_SCALE_AMP);
    // Shadow follows the breath horizontally only — vertical scale on a floor
    // shadow reads as the shadow lifting off the ground.
    this.shadow.scale.x = 1 + breath * SHADOW_BREATH_AMP;

    // Sprout sway — spring chases a slow sine target. Two-frequency target gives
    // an organic, slightly irregular drift.
    const targetSway =
      Math.sin((t * 2 * Math.PI) / SPROUT_SWAY_PERIOD_S) * 0.75 * SPROUT_SWAY_AMP_RAD +
      Math.sin((t * 2 * Math.PI) / (SPROUT_SWAY_PERIOD_S * 1.7)) * 0.25 * SPROUT_SWAY_AMP_RAD;
    const sproutAccel =
      -SPROUT_SPRING_K * (this.sproutAng - targetSway) - SPROUT_SPRING_C * this.sproutVel;
    this.sproutVel += sproutAccel * dt;
    this.sproutAng += this.sproutVel * dt;
    this.sproutSprite.rotation = this.sproutAng;

    // Wobble springs (face + body, both damped).
    this.faceWobbleVel +=
      (-WOBBLE_K * this.faceWobbleAng - WOBBLE_C * this.faceWobbleVel) * dt;
    this.faceWobbleAng += this.faceWobbleVel * dt;
    this.faceWobbleAng = clampWithVel(
      this.faceWobbleAng,
      WOBBLE_MAX_RAD,
      this.faceWobbleVel,
      (v) => (this.faceWobbleVel = v),
    );

    this.bodyWobbleVel +=
      (-WOBBLE_K * this.bodyWobbleAng - WOBBLE_C * this.bodyWobbleVel) * dt;
    this.bodyWobbleAng += this.bodyWobbleVel * dt;
    this.bodyWobbleAng = clampWithVel(
      this.bodyWobbleAng,
      WOBBLE_MAX_RAD,
      this.bodyWobbleVel,
      (v) => (this.bodyWobbleVel = v),
    );

    // Auto-tilt scheduler — idle pose only (a sitting character tilting its
    // head reads as unnatural).
    if (this.poseConfig.tilt) {
      if (this.currentTiltDir !== null) {
        if (this.elapsedMs >= this.tiltEndsAtMs) {
          this.endTilt();
        }
      } else if (this.elapsedMs >= this.nextTiltAtMs) {
        this.startTilt();
      }
    }

    // Composite rotation: directional tilt + wobble spring.
    const dirAng =
      this.currentTiltDir === 'tiltL'
        ? -TILT_FACE_ANG_RAD
        : this.currentTiltDir === 'tiltR'
          ? TILT_FACE_ANG_RAD
          : 0;
    this.faceLayer.rotation = this.faceWobbleAng + dirAng;
    this.body.rotation = this.bodyWobbleAng + dirAng * TILT_BODY_RATIO;

    // Blink state machine.
    this.tickBlink();
    if (this.blinkPhase === 'idle' && this.currentTiltDir === null && this.elapsedMs >= this.nextBlinkAtMs) {
      this.startBlink(this.closedDurationMs());
    }
  }

  // ── Tilt ────────────────────────────────────────────────────────────────
  private startTilt(): void {
    this.currentTiltDir = Math.random() < 0.5 ? 'tiltL' : 'tiltR';
    this.tiltEndsAtMs = this.elapsedMs + TILT_DURATION_MS;
    this.faceDir = this.currentTiltDir;
    this.updateFaceAlphas();
    // No blink coupling: face_front_closed is the only closed asset, and a
    // front-facing closed face layered over a tilted head reads as a static
    // "front face" stuck behind. Tilt the open face only.
  }

  private endTilt(): void {
    this.currentTiltDir = null;
    this.faceDir = 'front';
    this.updateFaceAlphas();
    this.scheduleNextTilt();
  }

  private scheduleNextTilt(): void {
    const span = TILT_INTERVAL_MAX_MS - TILT_INTERVAL_MIN_MS;
    this.nextTiltAtMs = this.elapsedMs + TILT_INTERVAL_MIN_MS + Math.random() * span;
  }

  // ── Blink ───────────────────────────────────────────────────────────────
  private startBlink(closedHoldMs: number): void {
    this.blinkClosedHoldMs = closedHoldMs;
    this.blinkPhase = 'fade_close';
    this.blinkPhaseEndsAtMs = this.elapsedMs + BLINK_FADE_MS;
    this.updateFaceAlphas();
  }

  private tickBlink(): void {
    if (this.blinkPhase === 'idle') return;
    if (this.elapsedMs < this.blinkPhaseEndsAtMs) return;
    switch (this.blinkPhase) {
      case 'fade_close':
        this.blinkPhase = 'closed';
        this.blinkPhaseEndsAtMs = this.elapsedMs + this.blinkClosedHoldMs;
        break;
      case 'closed':
        this.blinkPhase = 'fade_open';
        this.blinkPhaseEndsAtMs = this.elapsedMs + BLINK_FADE_MS;
        break;
      case 'fade_open':
        this.blinkPhase = 'idle';
        this.scheduleNextBlink();
        break;
    }
    this.updateFaceAlphas();
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

  // Direction + blink reduce to alpha changes on already-loaded sprites — no
  // texture reassignment at runtime, so Pixi never has to re-upload during a
  // visible frame. The current-direction open sprite stays fully opaque
  // underneath so the closed sprite can fade *over* it without the composited
  // opacity dipping (0.5 + 0.5 only sums to 0.75 in alpha compositing — that
  // gap reads as a brightness flicker each blink, hence keep-open-1 instead).
  private updateFaceAlphas(): void {
    // Poses with a discrete mid-blink frame (diary) show that frame outright
    // during the fade phases; others crossfade default↔closed via alpha.
    const hasHalf = this.poseConfig.faceHalf !== null;
    let openAlpha = 1;
    let halfAlpha = 0;
    let closedAlpha = 0;
    switch (this.blinkPhase) {
      case 'idle':
        break;
      case 'fade_close':
      case 'fade_open':
        if (hasHalf) {
          openAlpha = 0;
          halfAlpha = 1;
        } else {
          closedAlpha = 0.5;
        }
        break;
      case 'closed':
        if (hasHalf) openAlpha = 0;
        closedAlpha = 1;
        break;
    }
    for (const dir of ['front', 'tiltL', 'tiltR'] as FaceDir[]) {
      this.faceOpenSprites[dir].alpha = dir === this.faceDir ? openAlpha : 0;
    }
    this.faceHalf.alpha = halfAlpha;
    this.faceClosed.alpha = closedAlpha;
  }
}

function clampWithVel(
  v: number,
  max: number,
  vel: number,
  setVel: (n: number) => void,
): number {
  if (v > max) {
    if (vel > 0) setVel(0);
    return max;
  }
  if (v < -max) {
    if (vel < 0) setVel(0);
    return -max;
  }
  return v;
}

function applyPlaceholder(
  sprite: Sprite,
  spec: { tint: number; width: number; height: number },
): void {
  sprite.texture = Texture.WHITE;
  sprite.scale.set(SPRITE_SCALE);
  sprite.width = spec.width * SPRITE_SCALE;
  sprite.height = spec.height * SPRITE_SCALE;
  sprite.tint = spec.tint;
}

function applyLoaded(sprite: Sprite, loaded: LoadedSprite): void {
  if (loaded.isPlaceholder && loaded.placeholder) {
    applyPlaceholder(sprite, loaded.placeholder);
    return;
  }
  sprite.texture = loaded.texture;
  sprite.tint = 0xffffff;
  sprite.scale.set(SPRITE_SCALE);
}
