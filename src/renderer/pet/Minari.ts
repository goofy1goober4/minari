import { Container, Graphics, Sprite, Assets, type Texture } from 'pixi.js';
import { POSTURE_PRESETS, type PosturePreset } from './postures';

const LEAVES_Y = -41;
const LEAF_BAND_TOP = -58;
const LEAF_BAND_BOTTOM = -32;
const LEAF_X_HALF = 28;

// Sprite swap. The async loader hides the Graphics fallback once the texture
// is in. Path resolves against electron-vite's publicDir (assets/), so this
// works in dev and in the packaged build.
const SPRITE_PATH = 'sprites/minari.png';
export const SPRITE_HEIGHT = 135;
// Sprite anchor is bottom-centre at body (0,0); offset down a few px so feet
// sit *into* the shadow ellipse instead of floating above it.
const SPRITE_BASE_Y = 10;

// Per-leaf spring — underdamped for elastic pop-up.
// C_crit = 2*sqrt(K) = 12.65 → ζ=0.40, ~25% overshoot.
const LEAF_K = 40;
const LEAF_C = 5;
const PRESS_DEPTH = 0.35;
const LEAF_COUPLING = 0.3;

// Whole-crown horizontal sway — overdamped, subtle.
const SWAY_K = 4;
const SWAY_C = 5;
const SWAY_GAIN = 0.015;
const SWAY_MAX = 0.55;

// Folded-bud angle: leaves rotated this much toward the stem at leafProgress=0.
// ~80° → tips meet near-vertical above the stem.
const FOLD_ANGLE = 1.4;

export class Minari extends Container {
  private body: Container;
  private shadow: Graphics;
  // Graphics fallback — kept around in case the sprite asset is missing.
  private fallback: Container;
  private stem: Graphics;
  private leaves: Container;
  private leafLeft: Graphics;
  private leafRight: Graphics;
  // Filled async by loadSprite(); when present, the fallback is hidden.
  private sprite: Sprite | null = null;
  private t = 0;
  private nudgeT: number | null = null;
  private noticeT: number | null = null;
  private posture: PosturePreset = POSTURE_PRESETS.idle;

  // angle > 0 means leaf is pressed DOWN (tip drops).
  private leftAngle = 0;
  private leftVel = 0;
  private rightAngle = 0;
  private rightVel = 0;

  private handOverLeft = false;
  private handOverRight = false;

  private swayAngle = 0;
  private swayVel = 0;

  // 0 = no stem (seed-only), 1 = full-height stem.
  private stemProgress = 1;
  // 0 = leaves folded into a bud, 1 = leaves fully spread.
  private leafProgress = 1;

  constructor() {
    super();

    this.shadow = new Graphics()
      .ellipse(0, 6, 23, 3)
      .fill({ color: 0x000000, alpha: 0.10 });
    this.addChild(this.shadow);

    this.body = new Container();
    this.fallback = new Container();

    this.stem = new Graphics()
      .moveTo(0, 0)
      .bezierCurveTo(4, -15, -4, -29, 0, -41)
      .stroke({ width: 3.5, color: 0x7a9a65, cap: 'round' });
    this.fallback.addChild(this.stem);

    this.leaves = new Container();
    this.leaves.y = LEAVES_Y;

    this.leafLeft = new Graphics()
      .moveTo(0, -2)
      .bezierCurveTo(-4, -11, -15, -12, -22, -5)
      .bezierCurveTo(-16, 3, -5, 4, 0, 2)
      .closePath()
      .fill(0x9bbf7d);
    this.leafRight = new Graphics()
      .moveTo(0, -2)
      .bezierCurveTo(4, -11, 15, -12, 22, -5)
      .bezierCurveTo(16, 3, 5, 4, 0, 2)
      .closePath()
      .fill(0x8fb36d);
    this.leaves.addChild(this.leafLeft, this.leafRight);
    this.fallback.addChild(this.leaves);

    this.body.addChild(this.fallback);
    this.addChild(this.body);

    void this.loadSprite();
  }

  // Async-load the bitmap sprout. On success, hide the Graphics fallback —
  // breathe()/nudge()/notice()/posture transforms are applied to `body`,
  // which contains the sprite, so all existing physics keep working.
  // Per-leaf petting press-down and the birth-time leaf fold-in only affect
  // the (now hidden) leaf Graphics, so they no-op in sprite mode.
  private async loadSprite(): Promise<void> {
    try {
      const texture = (await Assets.load(SPRITE_PATH)) as Texture;
      const sprite = new Sprite(texture);
      // bottom-centre pivot so the sprite "stands" at body (0, SPRITE_BASE_Y),
      // a few px into the shadow ellipse rather than floating above it.
      sprite.anchor.set(0.5, 1);
      sprite.y = SPRITE_BASE_Y;
      const scale = SPRITE_HEIGHT / texture.height;
      sprite.scale.set(scale);
      this.fallback.visible = false;
      this.body.addChild(sprite);
      this.sprite = sprite;
      console.log(
        '[minari] sprite loaded ' +
          texture.width +
          'x' +
          texture.height +
          ' → render scale=' +
          scale.toFixed(3),
      );
    } catch (err) {
      console.error('[minari] sprite load failed, keeping fallback:', err);
    }
  }

  nudge() {
    this.nudgeT = 0;
  }

  // Single-tilt "noticed you" beat: leans out then returns over 0.6s.
  notice() {
    this.noticeT = 0;
  }

  setPosture(preset: PosturePreset) {
    this.posture = preset;
  }

  setStemGrowth(p: number) {
    this.stemProgress = Math.max(0, Math.min(1, p));
  }

  // Accepts values slightly past [0,1] so callers can pass elastic/spring eases
  // for an overshoot-and-settle motion on the leaves.
  setLeafUnfold(p: number) {
    this.leafProgress = p;
  }

  onPointerMove(localX: number, localY: number, vx: number, eventDt: number) {
    const onLeaves =
      localY >= LEAF_BAND_TOP &&
      localY <= LEAF_BAND_BOTTOM &&
      Math.abs(localX) < LEAF_X_HALF;
    this.handOverLeft = onLeaves && localX < 0;
    this.handOverRight = onLeaves && localX >= 0;
    if (onLeaves) {
      this.swayVel += vx * SWAY_GAIN * Math.min(eventDt, 0.033);
    }
  }

  onPointerLeave() {
    this.handOverLeft = false;
    this.handOverRight = false;
  }

  private nudgeAngle(): number {
    if (this.nudgeT === null) return 0;
    const t = this.nudgeT;
    const duration = 0.85;
    if (t >= duration) {
      this.nudgeT = null;
      return 0;
    }
    const amplitude = 0.2;
    const omega = (Math.PI * 2) / 0.7;
    const damping = 4;
    return amplitude * Math.exp(-damping * t) * Math.sin(omega * t);
  }

  // Half-cycle sine: 0 → peak → 0 over `duration`. Single-direction tilt.
  private noticeAngle(): number {
    if (this.noticeT === null) return 0;
    const t = this.noticeT;
    const duration = 0.6;
    if (t >= duration) {
      this.noticeT = null;
      return 0;
    }
    const amplitude = 0.12;
    return amplitude * Math.sin((t / duration) * Math.PI);
  }

  breathe(deltaMS: number) {
    const dt = Math.min(deltaMS / 1000, 0.05);
    this.t += dt;
    if (this.nudgeT !== null) this.nudgeT += dt;
    if (this.noticeT !== null) this.noticeT += dt;

    const targetL = this.handOverLeft ? PRESS_DEPTH : 0;
    const targetR = this.handOverRight ? PRESS_DEPTH : 0;
    const accL = LEAF_K * (targetL - this.leftAngle) - LEAF_C * this.leftVel;
    const accR = LEAF_K * (targetR - this.rightAngle) - LEAF_C * this.rightVel;
    this.leftVel += (accL - LEAF_COUPLING * accR) * dt;
    this.rightVel += (accR - LEAF_COUPLING * accL) * dt;
    this.leftAngle += this.leftVel * dt;
    this.rightAngle += this.rightVel * dt;

    const swayAcc = -SWAY_K * this.swayAngle - SWAY_C * this.swayVel;
    this.swayVel += swayAcc * dt;
    this.swayAngle += this.swayVel * dt;
    if (this.swayAngle > SWAY_MAX) {
      this.swayAngle = SWAY_MAX;
      if (this.swayVel > 0) this.swayVel = 0;
    } else if (this.swayAngle < -SWAY_MAX) {
      this.swayAngle = -SWAY_MAX;
      if (this.swayVel < 0) this.swayVel = 0;
    }

    const phase = Math.sin((this.t / this.posture.breathPeriodSec) * Math.PI * 2);
    const stem = Math.max(0, Math.min(1, this.stemProgress));
    const leaf = this.leafProgress;
    const leafVisible = Math.max(0, Math.min(1, leaf));

    if (this.sprite) {
      // Sprite mode: subtle uniform pulse + tiny vertical bob (no x/y split,
      // so the sprite doesn't read as "stretching upward"). Scale.y is still
      // multiplied by stem so the birth grow-from-ground animation holds.
      const pulse = 1 + phase * 0.01;
      this.body.scale.x = pulse;
      this.body.scale.y = pulse * stem;
      this.body.position.y = phase * stem * 1.0;
    } else {
      // Graphics fallback: legacy stem-stretch breathing.
      this.body.scale.y = (1 + phase * 0.03) * stem;
      this.body.scale.x = 1 - phase * 0.015;
      this.body.position.y = 0;
    }
    this.body.alpha = stem;
    this.shadow.alpha = stem;
    this.body.rotation =
      this.nudgeAngle() + this.noticeAngle() + this.swayAngle * 0.3 + this.posture.leanRad;

    this.leaves.rotation = this.swayAngle * 0.7 + phase * 0.05;
    this.leaves.alpha = leafVisible;

    // Fold: leaves rotate toward the stem (bud) when leafProgress→0,
    // and outward to rest when →1. Overshoot (leaf>1) lets them dip past
    // horizontal for a wobble-settle.
    const foldFactor = 1 - leaf;
    // Pressed-down convention: +angle → tip drops.
    // Left leaf: tip-down requires negative rotation; right leaf: positive rotation.
    // Folded (foldFactor=1): leafLeft tip up → +FOLD_ANGLE; mirror for leafRight.
    // Posture leaf bases use the same per-leaf sign convention as press-down.
    this.leafLeft.rotation =
      -this.leftAngle + FOLD_ANGLE * foldFactor + this.posture.leafBaseLeft;
    this.leafRight.rotation =
      this.rightAngle - FOLD_ANGLE * foldFactor + this.posture.leafBaseRight;
  }
}
