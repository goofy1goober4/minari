import { app, BrowserWindow, protocol } from 'electron';
import { join, extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createPetWindow } from './window';
import { openDb, closeDb } from './memory/db';
import { getState } from './memory/repo';
import { registerIpc } from './ipc';
import { flushSnapshot } from './snapshot';
import { startSoftPingScheduler, stopSoftPingScheduler } from './softPing';
import { startAlarmServer, stopAlarmServer } from './alarm/server';
import { maybeWriteDiary } from './diary';
import { setPetName, setUserNickname } from './llm/identity';

// Custom standard scheme for the renderer's own bundled assets. The production
// renderer is served from app:// instead of file://, because file:// blocks
// fetch() and resolves absolute paths (/sprites/*.png) to the filesystem root
// — which left every sprite as an empty placeholder box on the packaged build.
// registerSchemesAsPrivileged must run before app 'ready', so it sits here at
// module top level.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

function getCurrentWebContents() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) return w.webContents;
  }
  return null;
}

// MIME map for the app:// handler. content-type matters: the sprite loader
// rejects any response whose type is not image/*.
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
};

app.whenReady().then(() => {
  // Serve app://bundle/<path> from the packed renderer directory (reads inside
  // the asar fine). fs.readFile rather than net.fetch — net.fetch's file:
  // support is unreliable and silently 404'd every sub-resource fetch.
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url);
    const rel = pathname === '/' ? '/index.html' : pathname;
    const file = join(__dirname, '../renderer', decodeURIComponent(rel));
    try {
      const data = await readFile(file);
      return new Response(new Uint8Array(data), {
        headers: { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' },
      });
    } catch {
      console.error('[protocol] 404 ' + request.method + ' ' + pathname + ' -> ' + file);
      return new Response('not found', { status: 404 });
    }
  });

  openDb();
  loadIdentity();
  registerIpc();
  createPetWindow();
  startSoftPingScheduler(getCurrentWebContents);
  startAlarmServer(getCurrentWebContents);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
  });
});

// Sync the persisted nickname / pet_name into the in-memory identity cache
// the prompt builders read from.
function loadIdentity() {
  const nickname = getState('nickname');
  const petName = getState('pet_name');
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
  stopAlarmServer();
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
  stopAlarmServer();
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
