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
