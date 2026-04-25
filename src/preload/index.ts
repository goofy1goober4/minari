import { contextBridge, ipcRenderer } from 'electron';
import type { BootState } from '../shared/snapshot';

export interface BirthState {
  completed: boolean;
  nickname: string | null;
}

export interface BirthCompletion {
  nickname: string;
  firstFragment: string;
}

contextBridge.exposeInMainWorld('minari', {
  speak: (): Promise<string> => ipcRenderer.invoke('minari:speak'),
  setClickThrough: (passThrough: boolean): void => {
    ipcRenderer.send('minari:set-click-through', passThrough);
  },
  getBirthState: (): Promise<BirthState> => ipcRenderer.invoke('minari:get-birth-state'),
  completeBirth: (nickname: string): Promise<BirthCompletion> =>
    ipcRenderer.invoke('minari:complete-birth', nickname),
  getBootState: (): Promise<BootState> => ipcRenderer.invoke('minari:get-boot-state'),
});
