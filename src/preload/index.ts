import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('minari', {
  speak: (): Promise<string> => ipcRenderer.invoke('minari:speak'),
  setClickThrough: (passThrough: boolean): void => {
    ipcRenderer.send('minari:set-click-through', passThrough);
  },
});
