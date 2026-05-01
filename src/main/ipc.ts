import { ipcMain, BrowserWindow } from 'electron';
import { speakAsMinari } from './llm/speak';
import { converseWithMinari } from './llm/converse';
import { BirthStateMachine } from './birth';
import { computeBootState, setCurrent, markInteraction, noteSpoken } from './snapshot';
import { getState, recordMessage, getRecentHistory } from './memory/repo';
import { reactToImage, readImageAsBase64 } from './llm/imageReact';
import { getCurrentStage } from './growth';
import type { BootState, GrowthStage } from '../shared/snapshot';

export interface RecentMessage {
  role: 'user' | 'minari';
  content: string;
  createdAt: number;
}

export function registerIpc() {
  const birth = new BirthStateMachine();

  ipcMain.handle('minari:speak', async () => {
    markInteraction();
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

  ipcMain.handle('minari:gift-image', async (_event, filePath: string): Promise<string> => {
    markInteraction();
    try {
      const base64 = await readImageAsBase64(filePath);
      console.log('[ipc] gift-image: ' + filePath + ' (' + base64.length + ' base64 chars)');
      const t0 = Date.now();
      const fragment = await reactToImage(base64);
      const ms = Date.now() - t0;
      recordMessage('user', '[image gift]');
      recordMessage('minari', fragment);
      noteSpoken(fragment);
      console.log('[ipc] gift-image → ' + JSON.stringify(fragment) + '  (' + ms + 'ms)');
      return fragment;
    } catch (err) {
      console.error('[ipc] gift-image failed:', err);
      return '...';
    }
  });

  ipcMain.handle('minari:get-stage', (): GrowthStage => {
    const stage = getCurrentStage();
    return stage;
  });

  ipcMain.handle('minari:converse', async (_event, userText: string): Promise<string> => {
    markInteraction();
    try {
      const fragment = await converseWithMinari(userText);
      console.log(
        '[ipc] converse: ' +
          JSON.stringify(userText.slice(0, 80)) +
          ' → ' +
          JSON.stringify(fragment),
      );
      return fragment;
    } catch (err) {
      console.error('[ipc] converse failed:', err);
      return '...';
    }
  });

  ipcMain.handle(
    'minari:get-recent-messages',
    (_event, limit: number = 20): RecentMessage[] => {
      return getRecentHistory(limit);
    },
  );

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
