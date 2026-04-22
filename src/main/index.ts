import { app, BrowserWindow } from 'electron';
import { createPetWindow } from './window';
import { openDb, closeDb } from './memory/db';

app.whenReady().then(() => {
  openDb();
  createPetWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
  });
});

app.on('will-quit', () => {
  closeDb();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
