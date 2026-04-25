import { Container, Graphics } from 'pixi.js';

export class Seed extends Container {
  constructor() {
    super();
    this.alpha = 0;

    const shadow = new Graphics()
      .ellipse(0, 8, 18, 4)
      .fill({ color: 0x000000, alpha: 0.18 });
    const body = new Graphics()
      .ellipse(0, 0, 8, 5.5)
      .fill({ color: 0x4a3a28 });
    const highlight = new Graphics()
      .ellipse(-2, -1.5, 2.5, 1.6)
      .fill({ color: 0xb89a7a, alpha: 0.6 });

    this.addChild(shadow, body, highlight);
  }

  setProgress(p: number) {
    this.alpha = Math.max(0, Math.min(1, p));
  }
}
