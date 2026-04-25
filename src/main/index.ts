import { app, BrowserWindow } from 'electron';
import { createPetWindow } from './window';
import { openDb, closeDb } from './memory/db';
import { registerIpc } from './ipc';
import { flushSnapshot } from './snapshot';

app.whenReady().then(() => {
  openDb();
  registerIpc();
  createPetWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
  });
});

app.on('will-quit', () => {
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
