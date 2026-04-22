import { Application } from 'pixi.js';
import { Sprout } from './pet/Sprout';
import { Bubble } from './ui/Bubble';

const SPROUT_HIT_HALF_W = 30;
const SPROUT_HIT_TOP = -62;
const SPROUT_HIT_BOTTOM = 14;

async function boot() {
  const app = new Application();
  await app.init({
    backgroundAlpha: 0,
    resizeTo: window,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  document.body.appendChild(app.canvas);

  const sprout = new Sprout();
  sprout.x = app.screen.width / 2;
  sprout.y = app.screen.height / 2 + 50;
  app.stage.addChild(sprout);

  const bubble = new Bubble();
  bubble.x = sprout.x;
  bubble.y = sprout.y - 70;
  app.stage.addChild(bubble);

  let generating = false;
  let clickThrough = true;

  const hitTest = (x: number, y: number): boolean => {
    const sdx = x - sprout.x;
    const sdy = y - sprout.y;
    if (
      sdx >= -SPROUT_HIT_HALF_W &&
      sdx <= SPROUT_HIT_HALF_W &&
      sdy >= SPROUT_HIT_TOP &&
      sdy <= SPROUT_HIT_BOTTOM
    ) {
      return true;
    }
    if (bubble.isVisible()) {
      const b = bubble.getBounds();
      if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) return true;
    }
    return false;
  };

  const setClickThroughIfChanged = (passThrough: boolean) => {
    if (passThrough !== clickThrough) {
      clickThrough = passThrough;
      window.minari.setClickThrough(passThrough);
    }
  };

  app.ticker.add((ticker) => {
    sprout.breathe(ticker.deltaMS);
    bubble.update(ticker.deltaMS);
  });

  window.addEventListener('pointerdown', async () => {
    sprout.nudge();

    if (bubble.isVisible()) {
      bubble.dismiss();
      return;
    }
    if (generating) return;

    generating = true;
    try {
      const fragment = await window.minari.speak();
      bubble.show(fragment);
    } finally {
      generating = false;
    }
  });

  let lastX: number | null = null;
  let lastT = performance.now();
  window.addEventListener('pointermove', (e) => {
    const now = performance.now();
    const dt = Math.max((now - lastT) / 1000, 1 / 240);
    const vx = lastX === null ? 0 : Math.max(-3000, Math.min(3000, (e.clientX - lastX) / dt));
    lastX = e.clientX;
    lastT = now;
    sprout.onPointerMove(e.clientX - sprout.x, e.clientY - sprout.y, vx, dt);

    setClickThroughIfChanged(!hitTest(e.clientX, e.clientY));
  });
  window.addEventListener('pointerleave', () => {
    sprout.onPointerLeave();
    setClickThroughIfChanged(true);
  });
}

boot();
