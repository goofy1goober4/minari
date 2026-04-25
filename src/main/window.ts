import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';

export function createPetWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 320;
  const height = 320;

  const win = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 40,
    y: workArea.y + workArea.height - height - 40,
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
    },
  });

  // Default: all clicks pass through. Renderer toggles this off when cursor
  // enters a hit region (sprout / bubble) and back on when it leaves.
  win.setIgnoreMouseEvents(true, { forward: true });

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
