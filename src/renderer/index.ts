import { Application } from 'pixi.js';
import { Minari } from './pet/Minari';
import { Bubble } from './ui/Bubble';
import { runBirthScene } from './birth/runBirthScene';
import { runResumeScene } from './resume/runResumeScene';
import { makeVoiceProfile, primeAudio } from './sound/mumble';

const SPROUT_HIT_HALF_W = 30;
const SPROUT_HIT_TOP = -62;
const SPROUT_HIT_BOTTOM = 14;

type Mode = 'birth' | 'idle';

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

  const sprout = new Minari();
  sprout.x = app.screen.width / 2;
  sprout.y = app.screen.height / 2 + 50;
  app.stage.addChild(sprout);

  const bubble = new Bubble();
  bubble.x = sprout.x;
  bubble.y = sprout.y - 70;
  app.stage.addChild(bubble);

  let generating = false;
  let clickThrough = true;
  let mode: Mode = 'idle';

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

  // Shared speak path used by both click and the resume notice beat.
  const speakAndShow = async () => {
    if (generating || bubble.isVisible()) return;
    generating = true;
    try {
      const fragment = await window.minari.speak();
      bubble.show(fragment);
    } finally {
      generating = false;
    }
  };

  // Soft pings: dropped during birth, dropped if a bubble is already visible
  // or a click-triggered speak is in flight (no escalation).
  window.minari.onPing((fragment) => {
    console.log(
      '[ping] received: ' +
        JSON.stringify(fragment) +
        ' mode=' + mode +
        ' generating=' + generating +
        ' bubbleVisible=' + bubble.isVisible(),
    );
    if (mode === 'birth') {
      console.log('[ping] dropped: birth mode');
      return;
    }
    if (generating || bubble.isVisible()) {
      console.log('[ping] dropped: busy');
      return;
    }
    sprout.nudge();
    bubble.show(fragment);
    console.log('[ping] shown');
  });
  console.log('[boot] onPing handler registered');

  app.ticker.add((ticker) => {
    sprout.breathe(ticker.deltaMS);
    bubble.update(ticker.deltaMS);
  });

  window.addEventListener('pointerdown', async () => {
    primeAudio();
    if (mode === 'birth') return;
    sprout.nudge();

    if (bubble.isVisible()) {
      bubble.dismiss();
      return;
    }
    await speakAndShow();
  });

  let lastX: number | null = null;
  let lastT = performance.now();
  window.addEventListener('pointermove', (e) => {
    if (mode === 'birth') return;

    // While a mouse button is held over our window (e.buttons !== 0), the user
    // is dragging — either inside our window or a drag-from-outside passing
    // over us. Force click-through off so dragenter/over/drop reach us.
    // pointermove keeps firing thanks to forward:true; once buttons go back
    // to 0 the hit-test branch below takes over and restores passthrough.
    if (e.buttons !== 0) {
      setClickThroughIfChanged(false);
      return;
    }

    const now = performance.now();
    const dt = Math.max((now - lastT) / 1000, 1 / 240);
    const vx = lastX === null ? 0 : Math.max(-3000, Math.min(3000, (e.clientX - lastX) / dt));
    lastX = e.clientX;
    lastT = now;
    sprout.onPointerMove(e.clientX - sprout.x, e.clientY - sprout.y, vx, dt);

    setClickThroughIfChanged(!hitTest(e.clientX, e.clientY));
  });
  window.addEventListener('pointerleave', () => {
    if (mode === 'birth') return;
    sprout.onPointerLeave();
    setClickThroughIfChanged(true);
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (mode === 'birth') return;
    if (generating || bubble.isVisible()) return;
    const file = e.dataTransfer?.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const path = window.minari.getPathForFile(file);
    if (!path) return;
    console.log('[gift] dropped: ' + path);
    generating = true;
    sprout.nudge();
    try {
      const fragment = await window.minari.giftImage(path);
      bubble.show(fragment);
    } catch (err) {
      console.error('[gift] failed:', err);
    } finally {
      generating = false;
    }
  });

  const birthState = await window.minari.getBirthState();
  if (!birthState.completed) {
    mode = 'birth';
    try {
      await runBirthScene({ app, sprout, bubble });
    } catch (err) {
      console.error('[boot] birth scene failed:', err);
      sprout.setStemGrowth(1);
      sprout.setLeafUnfold(1);
    } finally {
      mode = 'idle';
      // Reset to pass-through; pointermove will re-enable when cursor enters hit region.
      clickThrough = true;
      window.minari.setClickThrough(true);
    }
  } else {
    const bootState = await window.minari.getBootState();
    console.log('[boot] resume:', bootState);
    if (bootState.nickname) {
      bubble.setVoice(makeVoiceProfile(bootState.nickname, bootState.mood));
    }
    runResumeScene({ sprout, activity: bootState.activity, speakAndShow });
  }
}

boot();
