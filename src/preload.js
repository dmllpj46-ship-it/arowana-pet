const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  sendBox: (box) => ipcRenderer.send('pet-box', box),
  setTray: (dataUrl) => ipcRenderer.send('set-tray', dataUrl),
  quit: () => ipcRenderer.send('quit'),
  swap: () => ipcRenderer.send('swap-pet'),
  // 主进程 -> 渲染：当前激活的宠物 id（启动时 + 每次轮换）
  setActive: (cb) => ipcRenderer.on('pet:set-active', (_e, id) => cb(id))
});

