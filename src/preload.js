const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  sendBox: (box) => ipcRenderer.send('pet-box', box),
  // 主进程 -> 渲染：光标位置（窗口坐标），宠物据此主动躲开鼠标
  onCursor: (cb) => ipcRenderer.on('pet:cursor', (_e, c) => cb(c)),
  setTray: (dataUrl) => ipcRenderer.send('set-tray', dataUrl),
  // 渲染 -> 主：渲染循环心跳。主进程看门狗靠它判断「画面还在动吗」，
  // 心跳断掉就重申置顶 / 重绘，必要时重建窗口。
  heartbeat: () => ipcRenderer.send('pet-frame'),
  quit: () => ipcRenderer.send('quit'),
  swap: () => ipcRenderer.send('swap-pet'),
  // 主进程 -> 渲染：当前激活的宠物 id（启动时 + 每次轮换）
  setActive: (cb) => ipcRenderer.on('pet:set-active', (_e, id) => cb(id))
});

