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

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}
