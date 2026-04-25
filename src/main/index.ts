import { app, BrowserWindow } from 'electron';
import { createPetWindow } from './window';
import { openDb, closeDb } from './memory/db';
import { registerIpc } from './ipc';
import { flushSnapshot } from './snapshot';
import { startSoftPingScheduler, stopSoftPingScheduler } from './softPing';

function getCurrentWebContents() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) return w.webContents;
  }
  return null;
}

app.whenReady().then(() => {
  openDb();
  registerIpc();
  createPetWindow();
  startSoftPingScheduler(getCurrentWebContents);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
  });
});

app.on('will-quit', () => {
  stopSoftPingScheduler();
  try {
    flushSnapshot();
  } catch (err) {
    console.error('[will-quit] flushSnapshot failed:', err);
  }
  closeDb();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
