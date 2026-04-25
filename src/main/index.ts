import { app, BrowserWindow } from 'electron';
import { createPetWindow } from './window';
import { openDb, closeDb } from './memory/db';
import { registerIpc } from './ipc';
import { flushSnapshot } from './snapshot';
import { startSoftPingScheduler, stopSoftPingScheduler } from './softPing';
import { maybeWriteDiary } from './diary';

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

// before-quit fires before windows close, while the renderer + DB are still
// alive — long enough for a synchronous Ollama round trip.
let diaryDone = false;
app.on('before-quit', async (event) => {
  if (diaryDone) return;
  event.preventDefault();
  // Stop the scheduler now so a ping can't race the diary write.
  stopSoftPingScheduler();
  try {
    await maybeWriteDiary();
  } catch (err) {
    console.error('[before-quit] diary failed:', err);
  } finally {
    diaryDone = true;
    app.quit();
  }
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
