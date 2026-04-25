import { ipcMain, BrowserWindow } from 'electron';
import { speakAsMinari } from './llm/speak';
import { BirthStateMachine } from './birth';
import { computeBootState, setCurrent } from './snapshot';
import { getState } from './memory/repo';
import type { BootState } from '../shared/snapshot';

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

  ipcMain.handle('minari:get-boot-state', (): BootState => {
    const computed = computeBootState();
    setCurrent(computed.activity, computed.mood);
    const result: BootState = {
      ...computed,
      nickname: getState('nickname'),
    };
    console.log('[ipc] get-boot-state → ' + JSON.stringify(result));
    return result;
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
