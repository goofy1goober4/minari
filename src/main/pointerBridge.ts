import { BrowserWindow, screen } from 'electron';

// Click-through bridging. setIgnoreMouseEvents(true, { forward: true })
// forwards mousemove (hover) but NOT OS-level drag-enter, and Windows ignores
// `forward` entirely — so on both platforms a click-through window can't see
// a file being dragged in. startCursorPoll covers that gap.

export function applyClickThrough(win: BrowserWindow, passThrough: boolean): void {
  if (win.isDestroyed()) return;
  console.log('[click-through] ' + (passThrough ? 'pass-through' : 'interactive'));
  if (!passThrough) {
    win.setIgnoreMouseEvents(false);
  } else if (process.platform === 'darwin') {
    win.setIgnoreMouseEvents(true, { forward: true });
  } else {
    win.setIgnoreMouseEvents(true);
  }
}

// 30 ms ≈ 33 fps — enough to track a cursor entering the sprite without the
// renderer feeling laggy; no need to chase 16 ms.
const POLL_MS = 30;

// Poll the OS cursor and push window-relative coords to the renderer, which
// hit-tests them against the alpha mask. Runs on every platform: Windows
// never forwards hover to a click-through window, and on macOS forward:true
// forwards mousemove but NOT OS-level drag-enter — so without this an external
// file drag never reaches dragover/drop (df5ffb6 removed the original
// startCursorWatch and silently broke image drops).
export function startCursorPoll(win: BrowserWindow): void {
  if (process.env['MINARI_DEVTOOLS'] === '1') console.log('[cursor-poll] startCursorPoll platform=' + process.platform);

  let timer: ReturnType<typeof setInterval> | null = null;
  let ticks = 0;

  const tick = () => {
    if (win.isDestroyed() || win.isMinimized() || !win.isVisible()) return;
    ticks++;
    if (ticks === 1 || ticks % 100 === 0) {
      if (process.env['MINARI_DEVTOOLS'] === '1') console.log('[cursor-poll] tick #' + ticks);
    }
    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    win.webContents.send('minari:cursor', {
      x: cursor.x - bounds.x,
      y: cursor.y - bounds.y,
    });
  };

  const start = (): void => {
    if (!timer) {
      timer = setInterval(tick, POLL_MS);
      if (process.env['MINARI_DEVTOOLS'] === '1') console.log('[cursor-poll] timer started');
    }
  };
  const stop = (): void => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  // Pause the poll while the window is hidden/minimized; resume on return.
  win.on('minimize', stop);
  win.on('hide', stop);
  win.on('restore', start);
  win.on('show', start);
  win.on('closed', stop);

  if (process.env['MINARI_DEVTOOLS'] === '1') console.log(
    '[cursor-poll] initial visible=' + win.isVisible() + ' minimized=' + win.isMinimized(),
  );
  if (win.isVisible() && !win.isMinimized()) start();
}
