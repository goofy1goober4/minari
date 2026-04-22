import { Application } from 'pixi.js';
import { Sprout } from './pet/Sprout';

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

  app.ticker.add((ticker) => {
    sprout.breathe(ticker.deltaMS);
  });

  window.addEventListener('pointerdown', () => {
    sprout.nudge();
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
  });
  window.addEventListener('pointerleave', () => {
    sprout.onPointerLeave();
  });
}

boot();
