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
  giftImage: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('minari:gift-image', filePath),
  // Electron 32+ removed File.path; webUtils.getPathForFile is the replacement.
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  getStage: (): Promise<GrowthStage> => ipcRenderer.invoke('minari:get-stage'),
  converse: (text: string): Promise<string> =>
    ipcRenderer.invoke('minari:converse', text),
  getRecentMessages: (limit: number = 20): Promise<RecentMessage[]> =>
    ipcRenderer.invoke('minari:get-recent-messages', limit),
});
