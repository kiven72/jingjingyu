const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('companionStartup', {
  get: () => ipcRenderer.invoke('companion:startup:get'),
  set: (enabled) => ipcRenderer.invoke('companion:startup:set', enabled),
});
