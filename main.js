const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('node:path');

// 关掉可聚焦，鼠标点到鱼的时候不会把你正在用的窗口焦点抢走。
// 如果发现拖拽点不动，把这里改成 true 重启即可。
const FOCUSABLE = false;
const PROXIMITY_PAD = 26;   // 光标进入鱼身外扩多少像素时恢复可交互
const POLL_MS = 40;

let win = null;
let tray = null;
let box = null;             // 渲染进程报上来的鱼身包围圆（窗口坐标）
let interactive = false;
let origin = { x: 0, y: 0 };

function fitWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  origin = { x: wa.x, y: wa.y };
  if (win) win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height });
}

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  origin = { x: wa.x, y: wa.y };

  win = new BrowserWindow({
    x: wa.x, y: wa.y, width: wa.width, height: wa.height,
    transparent: true,
    frame: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    resizable: false, movable: false, minimizable: false, maximizable: false,
    closable: false, fullscreenable: false,
    skipTaskbar: true,
    focusable: FOCUSABLE,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  win.setIgnoreMouseEvents(true, { forward: true });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
}

// 没有任何原生依赖的鼠标 proximity：轮询系统光标坐标即可
function startProximityPolling() {
  setInterval(() => {
    if (!win || !box) return;
    const p = screen.getCursorScreenPoint();
    const dx = p.x - origin.x - box.x;
    const dy = p.y - origin.y - box.y;
    const r = box.r + PROXIMITY_PAD;
    const near = dx * dx + dy * dy < r * r;
    if (near !== interactive) {
      interactive = near;
      win.setIgnoreMouseEvents(!near, { forward: true });
    }
  }, POLL_MS);
}

function buildTray(dataUrl) {
  if (tray) return;
  const icon = nativeImage.createFromDataURL(dataUrl);
  tray = new Tray(icon.resize({ width: 32, height: 32 }));
  tray.setToolTip('金龙鱼');
  const menu = Menu.buildFromTemplate([
    { label: '退出', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => win && win.show());
}

// 纯 Canvas 2D 绘制，用软件渲染即可：省显存，也避开少数机器上 GPU 进程崩溃。
// 若你机器显卡没问题、想更省 CPU，可以把这三行注释掉。
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    createWindow();
    startProximityPolling();
    globalShortcut.register('Control+Alt+Q', () => app.quit());
    screen.on('display-metrics-changed', fitWindow);
    screen.on('display-added', fitWindow);
    screen.on('display-removed', fitWindow);
  });

  ipcMain.on('fish-box', (_e, b) => { box = b; });
  ipcMain.on('set-tray', (_e, url) => { try { buildTray(url); } catch (err) { /* 图标生成失败不影响主功能 */ } });
  ipcMain.on('quit', () => app.quit());

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { globalShortcut.unregisterAll(); });
}
