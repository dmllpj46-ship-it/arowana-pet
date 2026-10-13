const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  sendBox: (box) => ipcRenderer.send('fish-box', box),
  setTray: (dataUrl) => ipcRenderer.send('set-tray', dataUrl),
  quit: () => ipcRenderer.send('quit')
});
