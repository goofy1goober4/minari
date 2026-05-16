import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { getState, setState } from './memory/repo';
import { applyClickThrough, startCursorPoll } from './pointerBridge';

export function createPetWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();
  // Full-screen transparent overlay covering the entire work area — gives the
  // curious prompt unlimited drag space (left or right of the character).
  // Saved window positions from earlier corner-pet builds are intentionally
  // ignored.
  const width = workArea.width;
  const height = workArea.height;
  const x = workArea.x;
  const y = workArea.y;

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Soft pings + resume notice fire without a prior gesture, so we need
      // the AudioContext to start unsuspended. We render in our own pet window
      // only, so this can't accidentally autoplay arbitrary external media.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  // Default: all clicks pass through. Renderer flips this off via IPC when
  // the cursor sits on an opaque sprite pixel (alpha hit test on body +
  // sprout + face_front_open). No window-bounds poll — that would catch
  // transparent area too.
  applyClickThrough(win, true);

  // Windows can't forward hover to a click-through window — poll the cursor
  // in main and let the renderer hit-test it. No-op on macOS.
  startCursorPoll(win);

  // On Windows the constructor's alwaysOnTop lets a click-through window slip
  // behind whatever the user clicks next. A higher level + a re-assert on
  // blur keeps Minari pinned. macOS keeps the plain constructor flag.
  if (process.platform === 'win32') {
    win.setAlwaysOnTop(true, 'screen-saver');
    win.on('blur', () => {
      if (!win.isDestroyed()) win.setAlwaysOnTop(true, 'screen-saver');
    });
  }

  // Persist position 500 ms after the last move so a drag survives a crash
  // and we don't depend on the will-quit hook (windows may be destroyed by
  // then). Debounce so a single drag doesn't fan out hundreds of writes.
  let saveTimer: NodeJS.Timeout | null = null;
  win.on('move', () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (win.isDestroyed()) return;
      const [px, py] = win.getPosition();
      setState('window_x', String(px));
      setState('window_y', String(py));
    }, 500);
  });

  // Forward our [tagged] renderer console.log lines to main stdout so we can
  // diagnose without DevTools (which has been crashing). Filters by tag prefix
  // so we don't drown in DevTools-internal noise.
  win.webContents.on('console-message', (_event, _level, message) => {
    if (/^\[[a-z-]+\]/i.test(message)) {
      console.log('[renderer] ' + message);
    }
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    // app:// (custom standard scheme registered in index.ts) — not file://,
    // so the renderer can fetch its own /sprites, /sounds, etc.
    win.loadURL('app://bundle/index.html');
  }

  // Diagnostics on the packaged build: MINARI_DEVTOOLS=1 pops DevTools in a
  // detached window. The pet window is click-through, so the usual shortcut
  // is unreliable — this gives a dependable way in.
  if (process.env['MINARI_DEVTOOLS'] === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  return win;
}

// Restore saved position if it still intersects any connected display;
// otherwise fall back to the bottom-right of the primary work area.
function readSavedPosition(
  width: number,
  height: number,
  defaultX: number,
  defaultY: number,
): { x: number; y: number } {
  const rawX = getState('window_x');
  const rawY = getState('window_y');
  if (rawX === null || rawY === null) return { x: defaultX, y: defaultY };
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: defaultX, y: defaultY };
  const displays = screen.getAllDisplays();
  const intersects = displays.some(
    (d) =>
      x + width > d.bounds.x &&
      x < d.bounds.x + d.bounds.width &&
      y + height > d.bounds.y &&
      y < d.bounds.y + d.bounds.height,
  );
  if (!intersects) {
    console.log(
      '[window] saved position (' + x + ',' + y + ') is off-screen; using default',
    );
    return { x: defaultX, y: defaultY };
  }
  return { x, y };
}
