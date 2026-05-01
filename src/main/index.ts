import { app, BrowserWindow } from 'electron';
import { createPetWindow } from './window';
import { openDb, closeDb } from './memory/db';
import { getState, setState } from './memory/repo';
import { registerIpc } from './ipc';
import { flushSnapshot } from './snapshot';
import { startSoftPingScheduler, stopSoftPingScheduler } from './softPing';
import { maybeWriteDiary } from './diary';
import { setPetName, setUserNickname } from './llm/identity';

function getCurrentWebContents() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) return w.webContents;
  }
  return null;
}

app.whenReady().then(() => {
  openDb();
  loadIdentity();
  registerIpc();
  createPetWindow();
  startSoftPingScheduler(getCurrentWebContents);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
  });
});

// Sync the persisted nickname / pet_name into the in-memory identity cache
// the prompt builders read from. Backfill pet_name='minari' for users who
// completed birth before the two-stage prompt landed.
function loadIdentity() {
  const nickname = getState('nickname');
  let petName = getState('pet_name');
  const completed = getState('birth_completed') === 'true';
  if (completed && !petName) {
    petName = 'minari';
    setState('pet_name', petName);
    console.log('[boot] backfilled pet_name=minari');
  }
  setUserNickname(nickname);
  setPetName(petName);
  console.log(
    '[boot] identity loaded: nickname=' +
      JSON.stringify(nickname) +
      ' petName=' +
      JSON.stringify(petName),
  );
}

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
