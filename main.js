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
const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, globalShortcut, powerMonitor } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const PetRegistry = require('./src/registry.js');
require('./src/pets/fish.js');           // 注册 'fish'
require('./src/pets/dragon.js');         // 注册 'dragon' 五彩金龙（权重同 fish）
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

const HEARTBEAT_MS = 3000;    // 超过这么久没收到渲染心跳 = 渲染循环停摆（画面必消失）
const WATCHDOG_MS = 2000;     // 看门狗检查间隔
const REASSERT_MS = 30000;    // 周期性重申置顶（顺带唤醒被打断的渲染循环）

let win = null;
let tray = null;
let boxes = [];           // 渲染进程报上来的宠物包围圆数组（窗口坐标）
let interactive = false;
let origin = { x: 0, y: 0 };

// ---- 看门狗状态（见 startWatchdog）----
let lastBeat = 0;         // 最近一次渲染心跳时间
let stalls = 0;           // 连续判定停摆次数，够 3 次就整窗重建
let rebuilding = false;   // 正在重建窗口：期间「无窗口」是预期状态，别让 window-all-closed 把 App 退掉

// ---- Pet Pool 状态 ----
let poolIds = [];         // 池内可用物种 id（CONFIG.POOL ∩ 已注册）
let currentId = null;     // 当前激活的物种 id
let rotateTimer = null;
let stateFile = '';

function refreshPool() {
  poolIds = PetRegistry.ids().filter((id) => CFG.POOL.indexOf(id) !== -1);
  if (poolIds.length === 0) poolIds = PetRegistry.ids(); // 配置为空则全用
}

// ---- 指定宠物（PET_ID / --pet=）----
// 校验放在 petpool.resolveForced：必须是「已注册 且 在 POOL 内」的 id。
// 写错就退回加权随机并明确告知，不猜用户想要哪只。
function resolveForcedPet() {
  var r = PetPool.resolveForced(poolIds, CFG.PET_ID, PetRegistry.ids());
  if (r.id) return r.id;
  if (r.reason) {
    // 用 console.warn 而不是 throw：宠物是桌搭，参数写错不该让整个应用起不来
    console.warn('[pet] ' + r.reason + ' —— 已退回随机选取');
  }
  return null;
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
  // PET_ID 优先级最高：用户明确指定了就无视 pet-state.json（那个文件只服务于随机轮换）
  var forced = resolveForcedPet();
  var delayMs = CFG.ROTATE_MS;

  if (forced) {
    currentId = forced;
    saveState();
    console.log('[pet] 已按指定启动：' + petName(forced) + (CFG.PET_PIN ? '（已锁定）' : ''));
  } else if (s && poolIds.indexOf(s.current) !== -1 && elapsed < CFG.ROTATE_MS) {
    // 沿用当前宠物，只排剩余时间
    currentId = s.current;
    delayMs = CFG.ROTATE_MS - elapsed;
  } else {
    // 过期/首次：加权随机选一只（排除刚显示过的，避免连续一样）
    currentId = PetPool.pickWeighted(poolIds, s ? s.current : null, CFG.WEIGHTS);
    saveState();
  }

  // PET_PIN：完全不排轮换定时器，这只就是最终的宠物
  if (CFG.PET_PIN) {
    console.log('[pet] 已锁定 ' + petName(currentId) + '，不再自动轮换');
  } else {
    scheduleRotation(delayMs);
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
  win.loadFile(path.join(__dirname, 'index.html'));
  reassertTop();
  win.once('ready-to-show', () => {
    win.show();
    rebuilding = false;   // 新窗已就绪，重建结束
    reassertTop();
  });
  // pet:set-active 只在 ready-to-show 发一次是不够的：重建窗口 / 重载页面后
  // 渲染进程要重新收到当前宠物，否则一直空着不画。
  win.webContents.on('did-finish-load', () => {
    lastBeat = Date.now();   // 给新页面一点启动宽限，别把启动当停摆
    if (currentId) win.webContents.send('pet:set-active', currentId);
  });
  win.on('closed', () => { win = null; });
}

// 重申置顶 + 请求重绘。实测「进程、托盘都在，画面却没了」这一步（等价于
// SetWindowPos(HWND_TOPMOST)）能让渲染循环立刻恢复：renderer CPU 0% -> 20%+，
// 宠物重新上屏。也用于周期性兜底未识别的停摆。
function reassertTop() {
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (win.webContents && !win.webContents.isDestroyed()) win.webContents.invalidate();
}

// 兜底大招：合成层彻底坏了就整体重建窗口。比杀进程温和 —— 托盘、快捷键、
// 轮换状态都还在，pet-state.json 也让当前宠物保持不变。
function rebuildWindow() {
  console.warn('[pet] 透明窗口重建以恢复上屏');
  rebuilding = true;   // 关键：销毁旧窗到新窗就绪之间会有「零窗口」瞬间，
                       // 不设这个标记，window-all-closed 会顺手 app.quit()，
                       // 整只宠物（含托盘）就没了。
  if (win && !win.isDestroyed()) win.destroy();
  createWindow();
  // 新窗口已同步建好；即便 ready-to-show 没能触发，也要有个兜底解除标记。
  setTimeout(() => { rebuilding = false; }, 1500);
}

// 看门狗：渲染进程逐帧报心跳（preload.js 转发 'pet-frame'）。
// 心跳断了 = 渲染循环停摆（画面必然消失）：先温和唤醒，连续 3 次就重建窗口。
function startWatchdog() {
  lastBeat = Date.now();
  setInterval(reassertTop, REASSERT_MS);
  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    if (Date.now() - lastBeat <= HEARTBEAT_MS) { stalls = 0; return; }
    stalls++;
    console.warn('[pet] 渲染循环无心跳 ' + stalls + ' 次，尝试唤醒');
    reassertTop();
    if (stalls >= 3) { stalls = 0; rebuildWindow(); }
  }, WATCHDOG_MS);
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
  var label = petName(currentId);
  tray.setToolTip('桌面宠物 - ' + label + (CFG.PET_PIN ? '（已锁定）' : ''));
  // PET_PIN 时把「换一只」置灰：留着它点得动，锁就是假的
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '当前宠物：' + label, enabled: false },
    { type: 'separator' },
    {
      label: '换一只',
      enabled: !CFG.PET_PIN,
      click: () => { rotateTo(pickNext()); scheduleRotation(CFG.ROTATE_MS); }
    },
    { label: '修复显示', click: () => reassertTop() },
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
// 透明置顶窗在休眠/唤醒后偶发「渲染循环整段停摆」：Chromium 收回 BeginFrame，
// rAF 不再回调，画面彻底消失（进程、托盘都还在，只有画面没了）。这几条禁掉
// 渲染进程的后台化 / 遮挡判定，从源头降低概率；停摆仍有看门狗兜底。
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    initPool();
    createWindow();
    startProximityPolling();
    startWatchdog();
    globalShortcut.register('Control+Alt+Q', () => app.quit());
    screen.on('display-metrics-changed', fitWindow);
    screen.on('display-added', fitWindow);
    screen.on('display-removed', fitWindow);
    // 休眠/待机唤醒是已知诱因：唤醒后合成器可能不再出帧，宠物就此「消失」。
    // 醒来先重申一次置顶，1 秒后再补一次（首次可能太早，窗口还没就绪）。
    ['resume', 'unlock-screen', 'user-did-become-active'].forEach((ev) => {
      powerMonitor.on(ev, () => { reassertTop(); setTimeout(reassertTop, 1000); });
    });
    screen.on('display-metrics-changed', reassertTop);
  });

  ipcMain.on('pet-box', (_e, b) => {
    if (Array.isArray(b)) boxes = b;
    else if (b && Array.isArray(b.boxes)) boxes = b.boxes;
    else if (b && isFinite(b.x)) boxes = [b];
  });
  // 渲染循环心跳：看门狗据此判断画面是否还在动
  ipcMain.on('pet-frame', () => { lastBeat = Date.now(); });
  ipcMain.on('set-tray', (_e, url) => { try { buildTray(url); } catch (err) { /* 图标失败不影响主功能 */ } });
  ipcMain.on('quit', () => app.quit());
  ipcMain.on('swap-pet', () => {
    rotateTo(pickNext());
    scheduleRotation(CFG.ROTATE_MS);
  });

  // 只有用户真的关掉（托盘「退出」/ Ctrl+Alt+Q）才退 App；
  // 看门狗重建窗口时的瞬时零窗口不能算数。
  app.on('window-all-closed', () => { if (!rebuilding) app.quit(); });
  app.on('will-quit', () => {
    if (rotateTimer) clearTimeout(rotateTimer);
    globalShortcut.unregisterAll();
  });
}

