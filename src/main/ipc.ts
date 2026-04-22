import { ipcMain, BrowserWindow } from 'electron';
import { speakAsMinari } from './llm/speak';

export function registerIpc() {
  ipcMain.handle('minari:speak', async () => {
    try {
      return await speakAsMinari();
    } catch (err) {
      console.error('[minari:speak] failed:', err);
      return '...';
    }
  });

  ipcMain.on('minari:set-click-through', (event, passThrough: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (passThrough) {
      win.setIgnoreMouseEvents(true, { forward: true });
    } else {
      win.setIgnoreMouseEvents(false);
    }
  });
}
