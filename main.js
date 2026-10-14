/*
 * main.js — Electron 主进程（pet pool 版）
 *
 * 职责：
 *   1. 透明穿透置顶窗口 + 光标 proximity（与旧版一致）
 *   2. Pet Pool：启动随机选一只 -> IPC 通知渲染进程显示
 *   3. 每 ROTATE_MS（默认1h，可用 PET_ROTATE_MS 覆盖）自动轮换：
 *      从池子里随机选一只 != 当前的，旧的回收
 *   4. 状态持久化到 userData/pet-state.json：重启后沿用当前宠物与剩余时间
 *   5. 托盘菜单：显示当前宠物 + 手动「换一只」
 *
 * 物种定义来自 src/pets/*.js，经 PetRegistry 注册（require 顺序即注册顺序）。
 */
const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const PetRegistry = require('./src/registry.js');
require('./src/pets/fish.js');           // 注册 'fish'
require('./src/pets/_common.js');        // 陆地/飞行宠物共享工具
require('./src/pets/cat.js');            // 注册 'cat'
require('./src/pets/dog.js');            // 注册 'dog'
require('./src/pets/turtle.js');         // 注册 'turtle'
require('./src/pets/frog.js');           // 注册 'frog'
require('./src/pets/bird.js');           // 注册 'bird'
const PetPool = require('./src/petpool.js');
const CFG = require('./src/config.js');

// 关掉可聚焦，鼠标点到宠物的时候不会把你正在用的窗口焦点抢走。
const FOCUSABLE = false;
const PROXIMITY_PAD = 26;   // 光标进入宠物包围圆外扩多少像素时恢复可交互
const POLL_MS = 40;

let win = null;
let tray = null;
let boxes = [];           // 渲染进程报上来的宠物包围圆数组（窗口坐标）
let interactive = false;
let origin = { x: 0, y: 0 };

// ---- Pet Pool 状态 ----
let poolIds = [];         // 池内可用物种 id（CONFIG.POOL ∩ 已注册）
let currentId = null;     // 当前激活的物种 id
let rotateTimer = null;
let stateFile = '';

function refreshPool() {
  poolIds = PetRegistry.ids().filter((id) => CFG.POOL.indexOf(id) !== -1);
  if (poolIds.length === 0) poolIds = PetRegistry.ids(); // 配置为空则全用
}

function petName(id) {
  var def = PetRegistry.get(id);
  return def ? def.name : id;
}

// ---- 状态持久化 ----
function loadState() {
  try {
    var raw = fs.readFileSync(stateFile, 'utf8');
    var s = JSON.parse(raw);
    if (s && typeof s.current === 'string' && typeof s.since === 'number') return s;
  } catch (err) { /* 首次运行无文件 */ }
  return null;
}

function saveState() {
  try {
    fs.writeFileSync(stateFile, JSON.stringify({ current: currentId, since: Date.now() }));
  } catch (err) { /* 写失败不影响主功能 */ }
}

// ---- 轮换 ----
// 统一加权选取入口：排除当前宠物，按 CFG.WEIGHTS 加权随机
function pickNext() {
  return PetPool.pickWeighted(poolIds, currentId, CFG.WEIGHTS);
}

function scheduleRotation(delayMs) {
  if (rotateTimer) clearTimeout(rotateTimer);
  rotateTimer = setTimeout(() => {
    rotateTo(pickNext());
    scheduleRotation(CFG.ROTATE_MS);
  }, Math.max(1000, delayMs));
}

function rotateTo(id) {
  if (!id) return;
  currentId = id;
  saveState();
  if (win && !win.isDestroyed()) {
    win.webContents.send('pet:set-active', id);
  }
  refreshTray();
}

function initPool() {
  stateFile = path.join(app.getPath('userData'), CFG.STATE_FILE);
  refreshPool();
  var s = loadState();
  var elapsed = s ? Date.now() - s.since : Infinity;
  if (s && poolIds.indexOf(s.current) !== -1 && elapsed < CFG.ROTATE_MS) {
    // 沿用当前宠物，只排剩余时间
    currentId = s.current;
    scheduleRotation(CFG.ROTATE_MS - elapsed);
  } else {
    // 过期/首次：加权随机选一只（排除刚显示过的，避免连续一样）
    currentId = PetPool.pickWeighted(poolIds, s ? s.current : null, CFG.WEIGHTS);
    saveState();
    scheduleRotation(CFG.ROTATE_MS);
  }
}

// ---- 窗口 ----
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
      preload: path.join(__dirname, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  win.setIgnoreMouseEvents(true, { forward: true });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
    if (currentId) win.webContents.send('pet:set-active', currentId);
  });
  win.on('closed', () => { win = null; });
}

// 没有任何原生依赖的鼠标 proximity：轮询系统光标坐标即可。
//
// 「抓取意图」判定（避免抢用户点击）：
//   光标落在宠物附近 *且* 已经停稳一段时间，才把鼠标事件交给宠物。
//   只要光标在动（说明你正在操作别的窗口 / 拖东西），一律穿透。
// 这样宠物停在按钮上时不会把点击吃掉，移动鼠标时也不会突然抢焦点。
function startProximityPolling() {
  let last = null;        // 上一轮光标坐标
  let settleAt = 0;      // 光标连续停在宠物附近的起始时刻
  let wasNear = false;

  setInterval(() => {
    if (!win || win.isDestroyed()) return;

    const p = screen.getCursorScreenPoint();

    // 光标在动？用两点位移和轮询间隔算速度（px/ms）
    let moving = false;
    if (last) {
      const d = Math.hypot(p.x - last.x, p.y - last.y);
      moving = d > CFG.GRAB_MOVE_EPS * POLL_MS;
    }
    last = { x: p.x, y: p.y };

    // 无论抓不抓得到，光标位置都推给渲染进程：宠物靠它主动躲开
    if (win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send('pet:cursor', { x: p.x - origin.x, y: p.y - origin.y });
    }

    if (boxes.length === 0) {
      if (interactive) { interactive = false; win.setIgnoreMouseEvents(true, { forward: true }); }
      return;
    }

    const near = boxes.some((box) => {
      if (!box || !isFinite(box.x) || !isFinite(box.y) || !isFinite(box.r)) return false;
      const dx = p.x - origin.x - box.x;
      const dy = p.y - origin.y - box.y;
      const r = box.r + PROXIMITY_PAD;
      return dx * dx + dy * dy < r * r;
    });

    const now = Date.now();
    if (near) {
      if (!wasNear) settleAt = now;      // 刚进范围，从现在开始计时
    } else {
      settleAt = 0;
    }
    wasNear = near;

    const wantInteractive = near && !moving && (now - settleAt) >= CFG.GRAB_SETTLE_MS;
    if (wantInteractive !== interactive) {
      interactive = wantInteractive;
      win.setIgnoreMouseEvents(!interactive, { forward: true });
    }
  }, POLL_MS);
}

// ---- 托盘 ----
function refreshTray() {
  if (!tray) return;
  tray.setToolTip('桌面宠物 - ' + petName(currentId));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '当前宠物：' + petName(currentId), enabled: false },
    { type: 'separator' },
    { label: '换一只', click: () => { rotateTo(pickNext()); scheduleRotation(CFG.ROTATE_MS); } },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]));
}

function buildTray(dataUrl) {
  if (tray) return;
  const icon = nativeImage.createFromDataURL(dataUrl);
  tray = new Tray(icon.resize({ width: 32, height: 32 }));
  tray.on('click', () => win && win.show());
  refreshTray();
}

// 纯 Canvas 2D 绘制，用软件渲染即可：省显存，也避开少数机器上 GPU 进程崩溃。
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    initPool();
    createWindow();
    startProximityPolling();
    globalShortcut.register('Control+Alt+Q', () => app.quit());
    screen.on('display-metrics-changed', fitWindow);
    screen.on('display-added', fitWindow);
    screen.on('display-removed', fitWindow);
  });

  ipcMain.on('pet-box', (_e, b) => {
    if (Array.isArray(b)) boxes = b;
    else if (b && Array.isArray(b.boxes)) boxes = b.boxes;
    else if (b && isFinite(b.x)) boxes = [b];
  });
  ipcMain.on('set-tray', (_e, url) => { try { buildTray(url); } catch (err) { /* 图标失败不影响主功能 */ } });
  ipcMain.on('quit', () => app.quit());
  ipcMain.on('swap-pet', () => {
    rotateTo(pickNext());
    scheduleRotation(CFG.ROTATE_MS);
  });

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    if (rotateTimer) clearTimeout(rotateTimer);
    globalShortcut.unregisterAll();
  });
}

