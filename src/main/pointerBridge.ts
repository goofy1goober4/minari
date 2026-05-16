import { BrowserWindow, screen } from 'electron';

// Click-through bridging. macOS forwards hover events to a click-through
// window via setIgnoreMouseEvents(true, { forward: true }) — Windows ignores
// the `forward` option entirely, so a click-through window there receives no
// mousemove at all and the renderer can never hit-test its way back to
// interactive. applyClickThrough keeps the platform branch in one place;
// startCursorPoll fills the Windows gap with a main-process cursor poll.

export function applyClickThrough(win: BrowserWindow, passThrough: boolean): void {
  if (win.isDestroyed()) return;
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

// Windows/Linux only: poll the OS cursor and push window-relative coords to the
// renderer, which hit-tests them against the alpha mask. macOS is left alone —
// forward:true already delivers the hover events there.
export function startCursorPoll(win: BrowserWindow): void {
  if (process.platform === 'darwin') return;

  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = () => {
    if (win.isDestroyed() || win.isMinimized() || !win.isVisible()) return;
    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    win.webContents.send('minari:cursor', {
      x: cursor.x - bounds.x,
      y: cursor.y - bounds.y,
    });
  };

  const start = (): void => {
    if (!timer) timer = setInterval(tick, POLL_MS);
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

  if (win.isVisible() && !win.isMinimized()) start();
}
