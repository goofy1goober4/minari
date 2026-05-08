import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { getState, setState } from './memory/repo';

export function createPetWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 320;
  const height = 320;

  const defaultX = workArea.x + workArea.width - width - 40;
  const defaultY = workArea.y + workArea.height - height - 40;
  const { x, y } = readSavedPosition(width, height, defaultX, defaultY);

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

  // Default: all clicks pass through. Renderer toggles this off when cursor
  // enters a hit region (sprout / bubble) and back on when it leaves.
  win.setIgnoreMouseEvents(true, { forward: true });

  // macOS Electron quirk: setIgnoreMouseEvents(true, {forward:true}) forwards
  // mousemove but NOT OS-level drag-enter. So an external file drag never
  // triggers our dragover/drop handlers until something else (a wiggle, a
  // right-click) forces click-through off first. Poll the cursor in the main
  // process and flip click-through off the moment the cursor enters the
  // window bounds — drag-enter then arrives normally. The trade-off is that
  // the window area (320×320) blocks click-through on hover, but the area is
  // small, anchored to a desktop corner, and the renderer's sprout-area hit
  // testing is now redundant rather than load-bearing.
  startCursorWatch(win);

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
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

function startCursorWatch(win: BrowserWindow) {
  let lastInside: boolean | null = null;
  const interval = setInterval(() => {
    if (win.isDestroyed()) {
      clearInterval(interval);
      return;
    }
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const inside =
      p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
    if (inside === lastInside) return;
    lastInside = inside;
    if (inside) {
      win.setIgnoreMouseEvents(false);
    } else {
      win.setIgnoreMouseEvents(true, { forward: true });
    }
  }, 50);
  win.on('closed', () => clearInterval(interval));
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
