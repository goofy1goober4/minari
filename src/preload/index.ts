import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import type { BootState, GrowthStage } from '../shared/snapshot';

export interface BirthState {
  completed: boolean;
  nickname: string | null;
  petName: string | null;
}

export interface BirthCompletion {
  nickname: string;
  petName: string;
  firstFragment: string;
}

export interface RecentMessage {
  role: 'user' | 'minari';
  content: string;
  createdAt: number;
}

contextBridge.exposeInMainWorld('minari', {
  // UI language for the renderer (birth-scene text etc.). Mirrors src/main/
  // llm/lang.ts — set via MINARI_LANG=ko (아버지 데모용).
  lang: (process.env.MINARI_LANG === 'ko' ? 'ko' : 'en') as 'en' | 'ko',
  // Forced body/face pose for the demo. MINARI_POSE=reading|diary; default idle.
  pose: ((p) => (p === 'reading' || p === 'diary' ? p : 'idle'))(
    process.env.MINARI_POSE,
  ) as 'idle' | 'reading' | 'diary',
  speak: (): Promise<string> => ipcRenderer.invoke('minari:speak'),
  setClickThrough: (passThrough: boolean): void => {
    ipcRenderer.send('minari:set-click-through', passThrough);
  },
  moveWindow: (dx: number, dy: number): void => {
    ipcRenderer.send('minari:move-window', dx, dy);
  },
  getBirthState: (): Promise<BirthState> => ipcRenderer.invoke('minari:get-birth-state'),
  completeBirth: (nickname: string, petName: string): Promise<BirthCompletion> =>
    ipcRenderer.invoke('minari:complete-birth', nickname, petName),
  getBootState: (): Promise<BootState> => ipcRenderer.invoke('minari:get-boot-state'),
  onPing: (callback: (fragment: string) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, fragment: string) => callback(fragment);
    ipcRenderer.on('minari:ping', listener);
    return () => ipcRenderer.removeListener('minari:ping', listener);
  },
  // Windows-only: main polls the OS cursor and pushes window-relative coords
  // here so the renderer can hit-test a click-through window. Never fires on
  // macOS (main does not start the poll there).
  onCursor: (callback: (pos: { x: number; y: number }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, pos: { x: number; y: number }) => callback(pos);
    ipcRenderer.on('minari:cursor', listener);
    return () => ipcRenderer.removeListener('minari:cursor', listener);
  },
  onWordQuestion: (
    callback: (payload: { wordId: number; question: string }) => void,
  ): (() => void) => {
    const listener = (_event: IpcRendererEvent, payload: { wordId: number; question: string }) =>
      callback(payload);
    ipcRenderer.on('minari:word-question', listener);
    return () => ipcRenderer.removeListener('minari:word-question', listener);
  },
  onAlarm: (
    callback: (payload: { kind: string; text: string; mood: string }) => void,
  ): (() => void) => {
    const listener = (
      _event: IpcRendererEvent,
      payload: { kind: string; text: string; mood: string },
    ) => callback(payload);
    ipcRenderer.on('minari:alarm', listener);
    return () => ipcRenderer.removeListener('minari:alarm', listener);
  },
  giftImage: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('minari:gift-image', filePath),
  // Electron 32+ removed File.path; webUtils.getPathForFile is the replacement.
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  getStage: (): Promise<GrowthStage> => ipcRenderer.invoke('minari:get-stage'),
  converse: (text: string): Promise<{ text: string; expectFollowup?: boolean }> =>
    ipcRenderer.invoke('minari:converse', text),
  getRecentMessages: (limit: number = 20): Promise<RecentMessage[]> =>
    ipcRenderer.invoke('minari:get-recent-messages', limit),
  getCuriousPos: (): Promise<{ x: number; y: number } | null> =>
    ipcRenderer.invoke('minari:get-curious-pos'),
  setCuriousPos: (x: number, y: number): void => {
    ipcRenderer.send('minari:set-curious-pos', x, y);
  },
  getCuriousHistoryHeight: (): Promise<number | null> =>
    ipcRenderer.invoke('minari:get-curious-history-h'),
  setCuriousHistoryHeight: (h: number): void => {
    ipcRenderer.send('minari:set-curious-history-h', h);
  },
  getCharacterPos: (): Promise<{ x: number; y: number } | null> =>
    ipcRenderer.invoke('minari:get-character-pos'),
  setCharacterPos: (x: number, y: number): void => {
    ipcRenderer.send('minari:set-character-pos', x, y);
  },
  getVolume: (): Promise<{ volume: number; muted: boolean }> =>
    ipcRenderer.invoke('minari:get-volume'),
  setVolume: (volume: number, muted: boolean): void => {
    ipcRenderer.send('minari:set-volume', volume, muted);
  },
  quitApp: (): void => {
    ipcRenderer.send('minari:quit-app');
  },
});
