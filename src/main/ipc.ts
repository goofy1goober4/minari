import { ipcMain, BrowserWindow, app } from 'electron';
import { speakAsMinari } from './llm/speak';
import { handleUserInput } from './llm/converse';
import { BirthStateMachine } from './birth';
import { computeBootState, setCurrent, markInteraction, noteSpoken } from './snapshot';
import { getState, setState, recordMessage, getRecentHistory } from './memory/repo';
import { reactToImage, readImageAsBase64 } from './llm/imageReact';
import { getCurrentStage } from './growth';
import {
  exitTeachingMode,
  exitConfirmingMode,
  getTeachingWordId,
  getConfirmingWord,
} from './wordLearning/teachingState';
import {
  findBestMatch,
  insertUnknown,
  listLearned,
  bumpUseCount,
  mergeVisionRaw,
} from './wordLearning/repo';
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

  ipcMain.handle(
    'minari:complete-birth',
    async (_event, rawNickname: string, rawPetName: string) => {
      try {
        return await birth.completeBirth(rawNickname, rawPetName);
      } catch (err) {
        console.error('[minari:complete-birth] failed:', err);
        throw err;
      }
    },
  );

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
    // Image trumps any pending teaching dialog — drop it so the next text
    // input doesn't get hijacked by a stale word.
    if (getTeachingWordId() !== null) exitTeachingMode();
    if (getConfirmingWord() !== null) exitConfirmingMode();
    try {
      const base64 = await readImageAsBase64(filePath);
      console.log('[ipc] gift-image: ' + filePath + ' (' + base64.length + ' base64 chars)');
      const t0 = Date.now();
      const visionRaw = await reactToImage(base64);
      const ms = Date.now() - t0;

      const learned = listLearned();
      const match = findBestMatch(visionRaw, learned);
      let fragment: string;
      if (match && match.learnedName) {
        fragment = `${match.learnedName}!`;
        bumpUseCount(match.id);
        mergeVisionRaw(match.id, visionRaw);
        console.log(
          '[gift] match → id=' + match.id + ' name=' + JSON.stringify(match.learnedName),
        );
      } else {
        fragment = visionRaw;
        const id = insertUnknown({
          babyDescription: visionRaw,
          visionRaw,
          imagePath: filePath,
        });
        console.log('[gift] new unknown → id=' + id + ' desc=' + JSON.stringify(visionRaw));
      }

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

  ipcMain.handle(
    'minari:converse',
    async (_event, userText: string): Promise<{ text: string; expectFollowup?: boolean }> => {
      markInteraction();
      try {
        const result = await handleUserInput(userText);
        console.log(
          '[ipc] converse: ' +
            JSON.stringify(userText.slice(0, 80)) +
            ' → ' +
            JSON.stringify(result.text) +
            (result.expectFollowup ? ' (expect-followup)' : ''),
        );
        return result;
      } catch (err) {
        console.error('[ipc] converse failed:', err);
        return { text: '...' };
      }
    },
  );

  ipcMain.handle(
    'minari:get-recent-messages',
    (_event, limit: number = 20): RecentMessage[] => {
      return getRecentHistory(limit);
    },
  );

  ipcMain.on('minari:move-window', (event, dx: number, dy: number) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + dx), Math.round(y + dy), false);
  });

  ipcMain.handle('minari:get-curious-pos', (): { x: number; y: number } | null => {
    const rawX = getState('curious_x');
    const rawY = getState('curious_y');
    if (rawX === null || rawY === null) return null;
    const x = Number(rawX);
    const y = Number(rawY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  });

  ipcMain.on('minari:set-curious-pos', (_event, x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    setState('curious_x', String(Math.round(x)));
    setState('curious_y', String(Math.round(y)));
  });

  ipcMain.handle('minari:get-character-pos', (): { x: number; y: number } | null => {
    const rawX = getState('character_x');
    const rawY = getState('character_y');
    if (rawX === null || rawY === null) return null;
    const x = Number(rawX);
    const y = Number(rawY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  });

  ipcMain.on('minari:set-character-pos', (_event, x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    setState('character_x', String(Math.round(x)));
    setState('character_y', String(Math.round(y)));
  });

  ipcMain.handle('minari:get-volume', (): { volume: number; muted: boolean } => {
    const raw = getState('volume');
    const mraw = getState('muted');
    const v = raw === null ? 1 : Number(raw);
    return {
      volume: Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1,
      muted: mraw === '1',
    };
  });
  ipcMain.on('minari:set-volume', (_event, volume: number, muted: boolean) => {
    if (Number.isFinite(volume)) {
      setState('volume', String(Math.max(0, Math.min(1, volume))));
    }
    setState('muted', muted ? '1' : '0');
  });

  ipcMain.on('minari:quit-app', () => {
    app.quit();
  });

  ipcMain.handle('minari:get-curious-history-h', (): number | null => {
    const raw = getState('curious_history_h');
    if (raw === null) return null;
    const h = Number(raw);
    return Number.isFinite(h) ? h : null;
  });

  ipcMain.on('minari:set-curious-history-h', (_event, h: number) => {
    if (!Number.isFinite(h)) return;
    setState('curious_history_h', String(Math.round(h)));
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
