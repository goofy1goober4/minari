import { Container, Graphics } from 'pixi.js';

// Vector germination sprout for the D+0 birth scene. Restored from the
// original pre-Minari Sprout (git 5970bcd^) — drawn entirely with Graphics
// (bezier stem + two leaves), no art assets. It grows via setStemGrowth /
// setLeafUnfold and is used ONLY during runBirthScene; the full Minari PNG
// cross-fades in over it once germination finishes, and this is destroyed.

// Folded-bud angle: leaves rotated this much toward the stem at leafProgress=0.
// ~80° → tips meet near-vertical above the stem.
const FOLD_ANGLE = 1.4;
// Native vector art is ~41 px tall; scaled up so the seedling reads against
// the full-screen window.
const SPROUT_SCALE = 1.7;

export class BirthSprout extends Container {
  private body = new Container();
  private shadow: Graphics;
  private leaves = new Container();
  private leafLeft: Graphics;
  private leafRight: Graphics;

  // 0 = no stem (seed-only), 1 = full-height stem.
  private stemProgress = 0;
  // 0 = leaves folded into a bud, 1 = fully spread. May exceed 1 for spring
  // overshoot.
  private leafProgress = 0;

  constructor() {
    super();
    this.scale.set(SPROUT_SCALE);

    this.shadow = new Graphics().ellipse(0, 6, 30, 5).fill({ color: 0x000000, alpha: 0.08 });
    this.addChild(this.shadow);

    const stem = new Graphics()
      .moveTo(0, 0)
      .bezierCurveTo(4, -15, -4, -29, 0, -41)
      .stroke({ width: 3.5, color: 0x7a9a65, cap: 'round' });
    this.body.addChild(stem);

    // Leaves ride at the stem tip — child of body so they rise with it.
    this.leaves.y = -41;
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

    this.render();
  }

  // 0 = seed-only, 1 = full-height stem.
  setStemGrowth(p: number): void {
    this.stemProgress = Math.max(0, Math.min(1, p));
    this.render();
  }

  // 0 = leaves folded, 1 = fully spread. Accepts values past 1 so callers can
  // pass a spring ease — the leaves dip past horizontal then settle.
  setLeafUnfold(p: number): void {
    this.leafProgress = p;
    this.render();
  }

  private render(): void {
    const stem = this.stemProgress;
    const leaf = this.leafProgress;
    const leafVisible = Math.max(0, Math.min(1, leaf));

    // Stem extends in Y as it grows; X stays full width so it reads as a
    // thin line rising, not a dot scaling up uniformly.
    this.body.scale.y = stem;
    this.body.scale.x = 1;
    this.body.alpha = stem;
    this.shadow.alpha = stem;

    this.leaves.alpha = leafVisible;
    // Fold: leaves rotate toward the stem (bud) at leaf→0 and outward to rest
    // at leaf→1; leaf>1 dips them past horizontal for the wobble-settle.
    // Left leaf folds with +rotation, right mirrors with -rotation.
    const foldFactor = 1 - leaf;
    this.leafLeft.rotation = FOLD_ANGLE * foldFactor;
    this.leafRight.rotation = -FOLD_ANGLE * foldFactor;
  }
}
