import { Application } from 'pixi.js';
import { Minari } from './pet/Minari';
import { Bubble } from './ui/Bubble';
import { CuriousPrompt } from './ui/CuriousPrompt';
import { runBirthScene } from './birth/runBirthScene';
import { runResumeScene } from './resume/runResumeScene';
import { makeVoiceProfile, primeAudio } from './sound/mumble';
import type { GrowthStage } from '../shared/snapshot';

const SPROUT_HIT_HALF_W = 30;
const SPROUT_HIT_TOP = -62;
const SPROUT_HIT_BOTTOM = 14;

const LONGPRESS_MS = 500;
const LONGPRESS_TOLERANCE_PX = 6;

type Mode = 'birth' | 'idle' | 'input';

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
  let stage: GrowthStage = 'babble';

  // Press-gesture state. `armed` covers the window between pointerdown and
  // the moment we've decided what kind of gesture this was — tap / long-press
  // (curious only) / window-drag. `lpTimer` fires only in curious; `dragging`
  // is set when motion past tolerance happens with the button still held.
  let lpTimer: ReturnType<typeof setTimeout> | null = null;
  let lpArmed = false;
  let lpFired = false;
  let lpStartX = 0;
  let lpStartY = 0;
  let dragging = false;
  let captureTarget: Element | null = null;

  const clearLongpress = () => {
    if (lpTimer) {
      clearTimeout(lpTimer);
      lpTimer = null;
    }
    lpArmed = false;
  };

  // Coalesce per-event move deltas to the frame boundary so we don't fan out
  // 120Hz IPC calls at setPosition.
  let pendingDx = 0;
  let pendingDy = 0;
  let moveRaf: number | null = null;
  const queueWindowMove = (dx: number, dy: number) => {
    pendingDx += dx;
    pendingDy += dy;
    if (moveRaf !== null) return;
    moveRaf = requestAnimationFrame(() => {
      moveRaf = null;
      const x = pendingDx;
      const y = pendingDy;
      pendingDx = 0;
      pendingDy = 0;
      if (x !== 0 || y !== 0) window.minari.moveWindow(x, y);
    });
  };

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

  const openCuriousPrompt = async () => {
    if (mode !== 'idle') return;
    mode = 'input';
    setClickThroughIfChanged(false);
    const prompt = new CuriousPrompt({
      fetchHistory: () => window.minari.getRecentMessages(20),
    });
    prompt.mount();

    const text = await prompt.awaitSubmit();
    if (text === null) {
      await prompt.dismiss();
      mode = 'idle';
      return;
    }
    prompt.setBusy(true);
    sprout.nudge();
    let fragment = '...';
    try {
      fragment = await window.minari.converse(text);
    } catch (err) {
      console.error('[curious] converse failed:', err);
    }
    await prompt.dismiss();
    mode = 'idle';
    bubble.show(fragment);
  };

  // Soft pings: dropped during birth, dropped while curious input is open,
  // dropped if a bubble is already visible or a click-triggered speak is in
  // flight (no escalation).
  window.minari.onPing((fragment) => {
    console.log(
      '[ping] received: ' +
        JSON.stringify(fragment) +
        ' mode=' + mode +
        ' generating=' + generating +
        ' bubbleVisible=' + bubble.isVisible(),
    );
    if (mode !== 'idle') {
      console.log('[ping] dropped: mode=' + mode);
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

  window.addEventListener('pointerdown', (e) => {
    primeAudio();
    if (mode !== 'idle') return;
    sprout.nudge();

    if (bubble.isVisible()) {
      bubble.dismiss();
      return;
    }
    if (generating) return;

    // Reset gesture state defensively — covers a missed pointerup off-window.
    dragging = false;
    lpFired = false;
    lpArmed = true;
    lpStartX = e.clientX;
    lpStartY = e.clientY;

    // Long-press timer only arms in curious; babble's tap path waits for
    // pointerup either way (so window-drag can still preempt it).
    if (stage === 'curious') {
      lpTimer = setTimeout(() => {
        if (!lpArmed) return;
        lpArmed = false;
        lpFired = true;
        lpTimer = null;
        void openCuriousPrompt();
      }, LONGPRESS_MS);
    }

    // Capture the pointer so a fast drag past the window edge still routes
    // pointermove/up back to us — otherwise we'd leak `dragging=true`.
    if (e.target instanceof Element) {
      try {
        e.target.setPointerCapture(e.pointerId);
        captureTarget = e.target;
      } catch {
        // Some targets (e.g. document) don't support capture; non-fatal.
      }
    }
  });

  window.addEventListener('pointerup', async (e) => {
    if (captureTarget) {
      try {
        captureTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore — capture may have already been released by the browser.
      }
      captureTarget = null;
    }
    if (mode !== 'idle') return;
    if (dragging) {
      dragging = false;
      return; // drag consumed — no tap-to-speak
    }
    if (lpFired) {
      lpFired = false;
      return;
    }
    if (!lpArmed) return;
    clearLongpress();
    if (bubble.isVisible() || generating) return;
    await speakAndShow();
  });

  let lastX: number | null = null;
  let lastT = performance.now();
  window.addEventListener('pointermove', (e) => {
    if (mode === 'birth') return;

    // Promote an armed press to either drag (motion + button held) or just
    // cancel (motion + button already up). Past LONGPRESS_TOLERANCE_PX we
    // commit to the new gesture and stop tracking the press as a tap.
    if (lpArmed) {
      const dx = e.clientX - lpStartX;
      const dy = e.clientY - lpStartY;
      if (dx * dx + dy * dy > LONGPRESS_TOLERANCE_PX * LONGPRESS_TOLERANCE_PX) {
        clearLongpress();
        if (e.buttons !== 0) {
          dragging = true;
        }
      }
    }

    if (dragging) {
      // Window-drag mode: forward delta to main, suppress everything else.
      queueWindowMove(e.movementX, e.movementY);
      return;
    }

    // While a mouse button is held over our window (e.buttons !== 0) and we
    // aren't dragging the window, the user is dragging *something else* in —
    // typically a file from outside. Force click-through off so
    // dragenter/over/drop reach us. pointermove keeps firing thanks to
    // forward:true; once buttons go back to 0 the hit-test branch below
    // takes over and restores passthrough.
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

    // While the curious prompt is open, keep click-through off so input keeps
    // focus regardless of cursor position.
    if (mode === 'input') {
      setClickThroughIfChanged(false);
      return;
    }
    setClickThroughIfChanged(!hitTest(e.clientX, e.clientY));
  });
  window.addEventListener('pointerleave', () => {
    if (mode === 'birth') return;
    clearLongpress();
    sprout.onPointerLeave();
    if (mode === 'input') return; // keep input clickable even if cursor strays
    setClickThroughIfChanged(true);
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (mode !== 'idle') return;
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

  // Stage drives long-press eligibility. Fetched once per session; flipping
  // the env var requires a restart.
  try {
    stage = await window.minari.getStage();
    console.log('[boot] stage=' + stage);
  } catch (err) {
    console.error('[boot] getStage failed:', err);
  }
}

boot();
