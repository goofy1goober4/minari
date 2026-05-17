import { Application } from 'pixi.js';
import { Minari } from './pet/Minari';
import { Bubble } from './ui/Bubble';
import { CuriousPrompt } from './ui/CuriousPrompt';
import { runBirthScene } from './birth/runBirthScene';
import { runResumeScene } from './resume/runResumeScene';
import { makeVoiceProfile, primeAudio, setGlobalVolume, setGlobalMuted } from './sound/mumble';
import type { BootState, GrowthStage } from '../shared/snapshot';

const LONGPRESS_MS = 500;
const LONGPRESS_TOLERANCE_PX = 6;
// Diary peek — ms the startled face is held before the flustered fast-blink.
const DIARY_PEEK_SURPRISE_MS = 900;
// Diary peek — a peek shows a random line from this many most-recent entries.
const DIARY_PEEK_POOL = 5;
// Diary hover hint — dwell before it appears, retired after this many shows
// (session-local count).
const DIARY_HINT_DELAY_MS = 200;
const DIARY_HINT_MAX = 3;
// Idle hover hint — a "hold to talk" nudge; same dwell + retire rules.
const IDLE_HINT_DELAY_MS = 200;
const IDLE_HINT_MAX = 3;

type Mode = 'birth' | 'idle' | 'input';

async function boot() {
  // Window opts include autoplayPolicy: 'no-user-gesture-required', so we
  // can spin up the AudioContext + sample load at boot. Without this the
  // first ping/alarm fires silently because nobody clicked the sprout yet.
  primeAudio();

  // Resolve the body/face pose before constructing Minari. MINARI_POSE env
  // wins; otherwise a completed-birth resume uses the reading or diary pose
  // when its activity matches. birthState/bootState are fetched once here.
  const birthState = await window.minari.getBirthState();
  let bootState: BootState | null = null;
  let pose = window.minari.pose;
  if (birthState.completed) {
    bootState = await window.minari.getBootState();
    if (pose === 'idle' && bootState.activity === 'reading') pose = 'reading';
    if (pose === 'idle' && bootState.activity === 'diary') pose = 'diary';
  }

  const app = new Application();
  await app.init({
    backgroundAlpha: 0,
    resizeTo: window,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  document.body.appendChild(app.canvas);

  const sprout = new Minari(pose);
  // Spawn anchor — 5px left / 10px up of the prior spot. The birth seed,
  // sprout and Minari all derive from this, and syncBubble() picks it up.
  sprout.x = app.screen.width - 505;
  sprout.y = app.screen.height - 90;
  // During D+0 birth the seed + germinating sprout own the screen; the full
  // character is revealed by runBirthScene. Hidden here so it never flashes.
  if (!birthState.completed) sprout.visible = false;
  app.stage.addChild(sprout);

  const bubble = new Bubble();
  // Bubble follows the character; positioning is recomputed via syncBubble().
  const syncBubble = () => {
    bubble.x = sprout.x;
    bubble.y = sprout.y + sprout.bubbleAnchorY();
  };
  syncBubble();
  // Bubble is a DOM overlay (mounted in its constructor); not a stage child.

  // Restore saved character position (sprite + bubble follow it).
  void window.minari.getCharacterPos().then((pos) => {
    if (!pos) return;
    sprout.x = pos.x;
    sprout.y = pos.y;
    syncBubble();
  });

  // Restore saved volume + mute so audio reflects user settings from boot.
  void window.minari.getVolume().then((vol) => {
    setGlobalVolume(vol.volume);
    setGlobalMuted(vol.muted);
  });

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
  let lpDownTime = 0;
  let dragging = false;
  let captureTarget: Element | null = null;
  // While a press is in progress the cursor poll must not touch click-through:
  // a poll-driven setIgnoreMouseEvents toggle drops the held pointer
  // (pointerleave/cancel) and kills the long-press timer.
  let isPointerDown = false;

  const clearLongpress = () => {
    if (lpTimer) {
      clearTimeout(lpTimer);
      lpTimer = null;
    }
    lpArmed = false;
  };

  // Character drag moves the sprite WITHIN the full-screen window. Position is
  // saved on drag end (debounce isn't needed — IPC fires once per release).
  const dragCharacter = (dx: number, dy: number) => {
    const minX = 65;
    const maxX = app.screen.width - 65;
    const minY = 30;
    const maxY = app.screen.height - 10;
    sprout.x = Math.max(minX, Math.min(maxX, sprout.x + dx));
    sprout.y = Math.max(minY, Math.min(maxY, sprout.y + dy));
    syncBubble();
  };

  const hitTest = (x: number, y: number): boolean => {
    if (sprout.containsPoint(x - sprout.x, y - sprout.y)) return true;
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

  // ── Diary peek ───────────────────────────────────────────────────────────
  // A tap on Minari in the diary pose shows one of her recent diary lines —
  // a random pick from the last few entries, never the one shown on the
  // immediately preceding peek. She startles (wide-eyed surprise), then blinks
  // fast in a flustered flurry, settling once the bubble fades. No diary entry
  // yet → no reaction; with only one entry, a repeat peek stays quiet.
  let diaryPeekActive = false;
  let lastPeekedDiary: string | null = null;
  const peekDiary = async () => {
    let entries: string[] = [];
    try {
      entries = await window.minari.getRecentDiaries(DIARY_PEEK_POOL);
    } catch (err) {
      console.error('[diary-peek] failed:', err);
    }
    if (entries.length === 0) {
      console.log('[diary-peek] no diary entry — no reaction');
      return;
    }
    // Drop the line shown on the previous peek so two taps never repeat. With
    // a single entry that was just shown, the pool empties → stay quiet.
    const pool = entries.filter((e) => e !== lastPeekedDiary);
    if (pool.length === 0) {
      console.log('[diary-peek] only entry already shown — no reaction');
      return;
    }
    const entry = pool[Math.floor(Math.random() * pool.length)];
    lastPeekedDiary = entry;
    console.log('[diary-peek] peeking diary (' + pool.length + ' candidate(s))');
    hideDiaryHint();
    sprout.startle();
    sprout.setPeekFace('surprise');
    sprout.pausePencil();
    bubble.show(entry);
    diaryPeekActive = true;
    // Hold the startled face briefly, then drop into a flustered fast-blink.
    window.setTimeout(() => {
      if (!diaryPeekActive) {
        sprout.resumePencil();
        return;
      }
      sprout.setPeekFace(null);
      sprout.flusterBlink();
    }, DIARY_PEEK_SURPRISE_MS);
  };

  // Hover hint — a tiny "📖" above Minari for the first few diary-pose hovers,
  // then retired. 200 ms dwell so a passing cursor doesn't flash it.
  let diaryHintShows = 0;
  let diaryHovering = false;
  let diaryHintTimer: number | null = null;
  const diaryHintEl = document.createElement('div');
  diaryHintEl.textContent = '📖';
  diaryHintEl.style.cssText =
    'position:fixed;z-index:999;pointer-events:none;font-size:15px;' +
    'padding:3px 9px;border-radius:999px;background:rgba(248,252,255,0.9);' +
    'border:1px solid rgba(215,234,244,0.9);box-shadow:0 2px 8px rgba(53,84,104,0.12);' +
    'opacity:0;transition:opacity 160ms ease-out;transform:translate(-50%,-100%);';
  document.body.appendChild(diaryHintEl);
  const showDiaryHint = () => {
    diaryHintEl.style.left = sprout.x + 'px';
    diaryHintEl.style.top = sprout.y + sprout.bubbleAnchorY() + 'px';
    diaryHintEl.style.opacity = '1';
  };
  function hideDiaryHint() {
    diaryHintEl.style.opacity = '0';
  }
  const updateDiaryHover = (active: boolean) => {
    if (active === diaryHovering) return;
    diaryHovering = active;
    if (active) {
      if (diaryHintShows >= DIARY_HINT_MAX) return;
      diaryHintTimer = window.setTimeout(() => {
        diaryHintTimer = null;
        if (!diaryHovering) return;
        showDiaryHint();
        diaryHintShows++;
      }, DIARY_HINT_DELAY_MS);
    } else {
      if (diaryHintTimer !== null) {
        clearTimeout(diaryHintTimer);
        diaryHintTimer = null;
      }
      hideDiaryHint();
    }
  };

  // Idle hover hint — a "hold to talk" nudge above Minari for the first few
  // idle-pose hovers, then retired. Mirrors the diary hint above; `pose` is
  // fixed per session so the two hints never overlap.
  let idleHintShows = 0;
  let idleHovering = false;
  let idleHintTimer: number | null = null;
  const idleHintEl = document.createElement('div');
  idleHintEl.textContent = window.minari.lang === 'ko' ? '꾹 누르면 대화' : 'hold to talk';
  idleHintEl.style.cssText =
    'position:fixed;z-index:999;pointer-events:none;font-size:12px;' +
    'color:#5a7a8c;white-space:nowrap;' +
    'padding:3px 9px;border-radius:999px;background:rgba(248,252,255,0.9);' +
    'border:1px solid rgba(215,234,244,0.9);box-shadow:0 2px 8px rgba(53,84,104,0.12);' +
    'opacity:0;transition:opacity 160ms ease-out;transform:translate(-50%,-100%);';
  document.body.appendChild(idleHintEl);
  const showIdleHint = () => {
    idleHintEl.style.left = sprout.x + 'px';
    idleHintEl.style.top = sprout.y + sprout.bubbleAnchorY() + 'px';
    idleHintEl.style.opacity = '1';
  };
  const hideIdleHint = () => {
    idleHintEl.style.opacity = '0';
  };
  const updateIdleHover = (active: boolean) => {
    if (active === idleHovering) return;
    idleHovering = active;
    if (active) {
      if (idleHintShows >= IDLE_HINT_MAX) return;
      idleHintTimer = window.setTimeout(() => {
        idleHintTimer = null;
        if (!idleHovering) return;
        showIdleHint();
        idleHintShows++;
      }, IDLE_HINT_DELAY_MS);
    } else {
      if (idleHintTimer !== null) {
        clearTimeout(idleHintTimer);
        idleHintTimer = null;
      }
      hideIdleHint();
    }
  };

  // Inner shared by both curious entry points. Tracks the converse result so
  // teaching's "pizza?" can re-open the input without us tracking it twice.
  const runCuriousTurn = async (logTag: string) => {
    const prompt = new CuriousPrompt({
      fetchHistory: () => window.minari.getRecentMessages(20),
      petAnchor: () => ({ x: sprout.x, y: sprout.y }),
    });
    prompt.mount();
    let expectFollowup = false;
    // Stay open across turns — the prompt only closes when the user dismisses
    // (Esc / outside click), not after each submission.
    while (true) {
      const text = await prompt.awaitSubmit();
      if (text === null) {
        await prompt.dismiss();
        mode = 'idle';
        return { dismissed: true as const, expectFollowup };
      }
      if (text === '') {
        // Empty Enter → "." trigger; speak without closing the prompt.
        await speakAndShow();
        prompt.clearInput();
        continue;
      }
      prompt.setBusy(true);
      sprout.nudge();
      let result: { text: string; expectFollowup?: boolean } = { text: '...' };
      try {
        result = await window.minari.converse(text);
      } catch (err) {
        console.error('[' + logTag + '] converse failed:', err);
      }
      bubble.show(result.text);
      expectFollowup = !!result.expectFollowup;
      prompt.setBusy(false);
      prompt.clearInput();
      // Refresh history live so the user sees the new exchange immediately
      // without having to reopen the panel.
      void prompt.refreshHistory();
    }
  };

  const openCuriousPrompt = async () => {
    if (mode !== 'idle') return;
    mode = 'input';
    setClickThroughIfChanged(false);
    const r = await runCuriousTurn('curious');
    if (!r.dismissed && r.expectFollowup) void openCuriousPromptForced();
  };

  // Force-open the curious prompt when Minari herself starts the turn — the
  // bubble pops with the question and the input slides up beneath it so the
  // user can answer immediately.
  const openCuriousPromptForced = async () => {
    if (mode === 'birth' || mode === 'input') return;
    if (generating) return;
    mode = 'input';
    setClickThroughIfChanged(false);
    const r = await runCuriousTurn('word-question');
    if (!r.dismissed && r.expectFollowup) void openCuriousPromptForced();
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

  window.minari.onAlarm((payload) => {
    console.log(
      '[alarm] received: ' +
        JSON.stringify(payload) +
        ' mode=' + mode +
        ' bubbleVisible=' + bubble.isVisible(),
    );
    // Birth scene is non-interruptible — the sprout-grow / nickname beats
    // would visually fight with a startle wobble. Drop the bubble; the DB
    // row was already written in main, so it's not lost.
    if (mode === 'birth') {
      console.log('[alarm] dropped: birth in progress');
      return;
    }
    // Alarm is interrupt-y by nature — preempt any existing bubble so the
    // user sees Minari react in the moment.
    if (bubble.isVisible()) bubble.dismiss();
    if (payload.kind === 'startled_jump') {
      sprout.startle();
    } else {
      sprout.nudge();
    }
    bubble.show(payload.text);
  });

  window.minari.onWordQuestion((payload) => {
    console.log(
      '[word-question] received: ' +
        JSON.stringify(payload) +
        ' mode=' + mode +
        ' generating=' + generating,
    );
    if (mode === 'birth' || mode === 'input') {
      console.log('[word-question] dropped: mode=' + mode);
      return;
    }
    if (generating) {
      console.log('[word-question] dropped: busy');
      return;
    }
    sprout.nudge();
    bubble.show(payload.question);
    void openCuriousPromptForced();
  });

  // Windows cursor poll. macOS forwards hover via forward:true; Windows does
  // not, so a click-through window gets no pointermove and the hit-test below
  // never runs. Main polls the cursor and pushes coords here. This acts only
  // as the entry detector — it flips click-through OFF when the cursor lands
  // on Minari. Once click-through is off the real pointermove/leave handlers
  // are authoritative (they know about drag + input mode), so we stay out
  // while clickThrough is false. Never fires on macOS (no poll there).
  let cursorMsgs = 0;
  window.minari.onCursor((pos) => {
    cursorMsgs++;
    if (cursorMsgs === 1) console.log('[cursor] first poll message received');
    if (isPointerDown || !clickThrough || mode !== 'idle' || generating) return;
    if (hitTest(pos.x, pos.y)) {
      console.log('[cursor] hit ' + Math.round(pos.x) + ',' + Math.round(pos.y) + ' → interactive');
      setClickThroughIfChanged(false);
    }
  });

  app.ticker.add((ticker) => {
    sprout.breathe(ticker.deltaMS);
    bubble.update(ticker.deltaMS);
    // Diary peek — revert Minari's expression once the diary bubble fades.
    if (diaryPeekActive && !bubble.isVisible()) {
      diaryPeekActive = false;
      sprout.setPeekFace(null);
    }
  });

  window.addEventListener('pointerdown', (e) => {
    isPointerDown = true;
    updateDiaryHover(false);
    updateIdleHover(false);
    if (window.minari.devtools) console.log(
      '[gesture] pointerdown at ' +
        Math.round(e.clientX) + ',' + Math.round(e.clientY) + ' mode=' + mode,
    );
    primeAudio();
    if (mode !== 'idle') {
      if (window.minari.devtools) console.log('[gesture] timer skipped: reason=mode=' + mode);
      return;
    }
    sprout.nudge();

    if (bubble.isVisible()) {
      if (window.minari.devtools) console.log('[gesture] timer skipped: reason=bubble-visible');
      bubble.dismiss();
      return;
    }
    if (generating) {
      if (window.minari.devtools) console.log('[gesture] timer skipped: reason=generating');
      return;
    }

    // Reset gesture state defensively — covers a missed pointerup off-window.
    dragging = false;
    lpFired = false;
    lpArmed = true;
    lpStartX = e.clientX;
    lpStartY = e.clientY;
    lpDownTime = performance.now();

    // Long-press timer only arms in curious; babble's tap path waits for
    // pointerup either way (so window-drag can still preempt it).
    if (stage === 'curious') {
      lpTimer = setTimeout(() => {
        if (!lpArmed) return;
        lpArmed = false;
        lpFired = true;
        lpTimer = null;
        if (window.minari.devtools) console.log('[gesture] longpress fired');
        void openCuriousPrompt();
      }, LONGPRESS_MS);
      if (window.minari.devtools) console.log('[gesture] longpress timer started');
    } else {
      if (window.minari.devtools) console.log('[gesture] timer skipped: reason=stage=' + stage);
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
    isPointerDown = false;
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
      window.minari.setCharacterPos(sprout.x, sprout.y);
      return; // drag consumed — no tap-to-speak
    }
    if (lpFired) {
      lpFired = false;
      return;
    }
    if (!lpArmed) return;
    clearLongpress();
    if (window.minari.devtools) console.log(
      '[gesture] pointerup before longpress (duration=' +
        Math.round(performance.now() - lpDownTime) + 'ms)',
    );
    if (bubble.isVisible() || generating) return;
    if (pose === 'diary') await peekDiary();
    else await speakAndShow();
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
      // Character drag — move the sprite within the window. The OS window
      // itself stays full-screen.
      dragCharacter(e.movementX, e.movementY);
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
    const overMinari = hitTest(e.clientX, e.clientY);
    setClickThroughIfChanged(!overMinari);
    updateDiaryHover(
      overMinari && pose === 'diary' && mode === 'idle' && !bubble.isVisible(),
    );
    updateIdleHover(
      overMinari && pose === 'idle' && mode === 'idle' && !bubble.isVisible(),
    );
  });
  window.addEventListener('pointerleave', () => {
    isPointerDown = false;
    updateDiaryHover(false);
    updateIdleHover(false);
    if (mode === 'birth') return;
    clearLongpress();
    sprout.onPointerLeave();
    if (mode === 'input') return; // keep input clickable even if cursor strays
    setClickThroughIfChanged(true);
  });

  // A pointercancel during a press would otherwise leave isPointerDown stuck.
  // Logged so we can see whether the OS is cancelling the press on Windows.
  window.addEventListener('pointercancel', () => {
    if (window.minari.devtools) console.log('[gesture] pointercancel');
    isPointerDown = false;
    clearLongpress();
  });

  let sawDragEnter = false;
  window.addEventListener('dragenter', () => {
    if (!sawDragEnter) {
      sawDragEnter = true;
      console.log('[gift] dragenter — a drag reached the window');
    }
  });
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    console.log('[gift] drop event fired');
    if (mode !== 'idle') {
      console.log('[gift] drop ignored: mode=' + mode);
      return;
    }
    if (generating || bubble.isVisible()) {
      console.log('[gift] drop ignored: busy (generating=' + generating + ' bubble=' + bubble.isVisible() + ')');
      return;
    }
    const file = e.dataTransfer?.files[0];
    if (!file || !file.type.startsWith('image/')) {
      console.log('[gift] drop ignored: no image file (file=' + (file ? file.type : 'none') + ')');
      return;
    }
    const path = window.minari.getPathForFile(file);
    if (!path) {
      console.log('[gift] drop ignored: getPathForFile empty');
      return;
    }
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

  if (!birthState.completed) {
    mode = 'birth';
    try {
      await runBirthScene({ app, sprout, bubble });
    } catch (err) {
      console.error('[boot] birth scene failed:', err);
      // Failsafe — make sure Minari is on screen even if the scene threw.
      sprout.visible = true;
      sprout.alpha = 1;
      sprout.scale.set(1);
    } finally {
      mode = 'idle';
      // Reset to pass-through; pointermove will re-enable when cursor enters hit region.
      clickThrough = true;
      window.minari.setClickThrough(true);
    }
  } else if (bootState) {
    console.log('[boot] resume:', bootState);
    if (bootState.nickname) {
      bubble.setVoice(makeVoiceProfile(bootState.nickname, bootState.mood));
    }
    sprout.setMood(bootState.mood);
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
