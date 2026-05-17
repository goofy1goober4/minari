import { Container, Graphics } from 'pixi.js';

export class Seed extends Container {
  // Body + highlight twitch (rotate) together; the ground shadow stays put —
  // a shadow that swung with the seed would read as the light moving.
  private bodyGroup = new Container();

  constructor() {
    super();
    this.alpha = 0;

    const shadow = new Graphics()
      .ellipse(0, 7, 13.5, 3)
      .fill({ color: 0x000000, alpha: 0.18 });
    const body = new Graphics()
      .ellipse(0, 0, 8, 5.5)
      .fill({ color: 0x4a3a28 });
    const highlight = new Graphics()
      .ellipse(-2, -1.5, 2.5, 1.6)
      .fill({ color: 0xb89a7a, alpha: 0.6 });

    this.bodyGroup.addChild(body, highlight);
    // Pivot at the seed's base so a twitch rocks it on the ground — rotating
    // the near-symmetric ellipse about its centre barely shows. position is
    // offset to match so the seed sits unchanged at rotation 0.
    this.bodyGroup.pivot.set(0, 5.5);
    this.bodyGroup.position.set(0, 5.5);
    // Shadow sits under the twitching body group.
    this.addChild(shadow, this.bodyGroup);
  }

  setProgress(p: number) {
    this.alpha = Math.max(0, Math.min(1, p));
  }

  // "까딱" twitch — tilt the seed body; the ground shadow stays fixed.
  setTwitch(angle: number) {
    this.bodyGroup.rotation = angle;
  }
}
