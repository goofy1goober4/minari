import { Container, Graphics } from 'pixi.js';

const LEAVES_Y = -41;
const LEAF_BAND_TOP = -58;
const LEAF_BAND_BOTTOM = -32;
const LEAF_X_HALF = 28;

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

export class Sprout extends Container {
  private body: Container;
  private leaves: Container;
  private leafLeft: Graphics;
  private leafRight: Graphics;
  private t = 0;
  private nudgeT: number | null = null;

  // angle > 0 means leaf is pressed DOWN (tip drops).
  private leftAngle = 0;
  private leftVel = 0;
  private rightAngle = 0;
  private rightVel = 0;

  private handOverLeft = false;
  private handOverRight = false;

  private swayAngle = 0;
  private swayVel = 0;

  constructor() {
    super();

    const shadow = new Graphics()
      .ellipse(0, 6, 30, 5)
      .fill({ color: 0x000000, alpha: 0.08 });
    this.addChild(shadow);

    this.body = new Container();

    const stem = new Graphics()
      .moveTo(0, 0)
      .bezierCurveTo(4, -15, -4, -29, 0, -41)
      .stroke({ width: 3.5, color: 0x7a9a65, cap: 'round' });
    this.body.addChild(stem);

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

    this.body.addChild(this.leaves);
    this.addChild(this.body);
  }

  nudge() {
    this.nudgeT = 0;
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

  breathe(deltaMS: number) {
    const dt = Math.min(deltaMS / 1000, 0.05);
    this.t += dt;
    if (this.nudgeT !== null) this.nudgeT += dt;

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

    const phase = Math.sin((this.t / 5) * Math.PI * 2);
    this.body.scale.y = 1 + phase * 0.03;
    this.body.scale.x = 1 - phase * 0.015;
    this.body.rotation = this.nudgeAngle() + this.swayAngle * 0.3;

    this.leaves.rotation = this.swayAngle * 0.7 + phase * 0.05;

    // Pressed-down convention: +angle → tip drops.
    // Left leaf: tip-down requires negative rotation; right leaf: positive rotation.
    this.leafLeft.rotation = -this.leftAngle;
    this.leafRight.rotation = this.rightAngle;
  }
}
