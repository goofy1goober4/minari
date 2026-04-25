import { ipcMain, BrowserWindow } from 'electron';
import { speakAsMinari } from './llm/speak';
import { BirthStateMachine } from './birth';

export function registerIpc() {
  const birth = new BirthStateMachine();

  ipcMain.handle('minari:speak', async () => {
    try {
      return await speakAsMinari();
    } catch (err) {
      console.error('[minari:speak] failed:', err);
      return '...';
    }
  });

  ipcMain.handle('minari:get-birth-state', () => {
    return birth.getState();
  });

  ipcMain.handle('minari:complete-birth', async (_event, rawNickname: string) => {
    try {
      return await birth.completeBirth(rawNickname);
    } catch (err) {
      console.error('[minari:complete-birth] failed:', err);
      throw err;
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
