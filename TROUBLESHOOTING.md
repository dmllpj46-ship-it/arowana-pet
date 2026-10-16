# 排查记录：进程还活着，宠物却不见了（透明窗口偶发不上屏）

> 现场时间：2026-10-16 · 机器：Windows / 主屏 1280×800 + 副屏 1920×1080
>
> **2026-10-16 二次复现并已修复**：找到了真正机理（渲染循环停摆，不是「画了没上屏」），
> 并已落地自愈看门狗。见下方「结论（第二次复现，已修正）」「修复（已实施）」。
> 原「根治建议（尚未实施）」一节作废。

## 症状

用户报「桌宠停了 / 不见了」。现场检查却是另一个样子：

- Electron 进程树完整（主进程 + GPU + utility + renderer），主进程已连续运行 **101 分钟**
- 主进程窗口 `Arowana Pet`：`Responding = True`、`IsWindowVisible = True`、
  `WS_EX_TOPMOST = True`、rect `(0,0)-(1280,752)`
- Application / System 事件日志里**没有任何**该进程的崩溃、错误或显示器相关事件
- 但全屏截图里**一个宠物像素都没有**

**进程没死，是画面没了。**

## 结论

**不是崩溃，也不是行为 / 换宠逻辑的 bug，** 而是「透明 + 置顶的 Electron 窗口偶发不上屏」：

> 渲染进程仍在正常逐帧绘制，窗口自身的几何、置顶层级、可见性全部正确，
> 但窗口内容没有被合成到桌面上。

- 冷启动就会偶发：实测 8 次启动中 **2 次直接空白**
- 长时间运行也可能出现：首次报告的那次是跑到 ~100 分钟后才变空白
- **重启即恢复**；进程从未退出 ⇒ 托盘、换宠、私信等**非画面功能全程正常**，
  只有视觉消失

## 结论（第二次复现，已修正）

第一次的「画了，没上屏（合成器丢弃了 layer）」判断是**错的**——当时用的是
**DPI 不感知**的截图，把宠物窗口所在的坐标切没了（见「关键陷阱」）。第二次复现时
用 `SetProcessDPIAware()` 重新取证，结论反过来了：

> **渲染循环（`requestAnimationFrame`）真的停了。** 进程、GPU、托盘全活，
> 但 renderer 一帧都不再画；一个「透明」窗口不画东西 = 屏幕上一片空白，
> 看起来就像宠物「跑到别的窗口后面去了」。

**停摆判据（最硬的一条）**：采样 renderer 进程的 `TotalProcessorTime`，
6 秒 / 25 秒内增量**精确为 0 s**（正常 ≈ 1–2 s / 6 s）。这比看 canvas 更可靠：
循环停了，CPU 就是零。

**诱因（有事件日志佐证）**：机器在 `11:54:37` 进入 Modern Standby，
`12:49:54` 唤醒（`Microsoft-Windows-Kernel-Power` 事件 506/507/566）。唤醒瞬间
**待触发的换宠定时器到点复命**，正好撞上合成器/渲染器还没恢复 →
循环就此停住，之后一直是空白。

**恢复手段（实测有效）**：对窗口做一次
`SetWindowPos(HWND_TOPMOST, SWP_NOSIZE|SWP_NOMOVE|SWP_NOACTIVATE)`
（等价于 Electron 的 `win.setAlwaysOnTop(true,'screen-saver')`）就能把循环唤醒：
renderer CPU 立刻从 0% → 22–26%，气泡和宠物重新上屏。**这已内建为自愈机制。**

## 关键词别混淆：画布是对的，CPU 是零

| 现象 | 说明 |
|---|---|
| canvas 里有宠物像素（CDP 读得到） | 停摆**之前**画的那一帧还在；不代表现在还在画 |
| `document.hidden=false`、`visibilityState=visible` | 都正常，不是被当作后台页 |
| **renderer CPU 增量为 0** | ✅ 这才是停摆的铁证 |
| DPI 感知截图里有宠物 | 循环活着时确实上了屏 |

## 关键陷阱（第一次误判的元凶，务必记住）

DPI 不感知的 PowerShell `CopyFromScreen` / `GetWindowRect` 会产出一张
**混合、被裁剪的虚拟化合成图**（本机曾报 3200×1083），宠物窗口所在的真实坐标被切掉，
于是「截图里没有宠物」→ 进而误判成「没上屏」。**任何屏幕证据都必须先
`SetProcessDPIAware()`**（见 `capture-dpi.ps1`）。

本机真实几何（DPI 感知后）：主屏 `\\.\DISPLAY1` 1920×1200 @(0,0)；
副屏 `\\.\DISPLAY2` **2880×1620** @(-2880,-425)；物理虚拟屏 4800×1625。
宠物窗口（DIP 0,0 1280×752）只覆盖主屏。

## 证据

| # | 手段 | 关键结果 |
|---|---|---|
| 1 | `Get-CimInstance` + `tasklist /V` + `Get-WinEvent` | 4 个进程存活 101 分钟，无崩溃事件 |
| 2 | `GetWindowRect` / `GetWindowLong(GWL_EXSTYLE)` / z-order 遍历 | rect `(0,0)-(1280,752)`、`TOPMOST=true`、`visible=true`；z 序仅次于一个 1×1 的 shell helper，**在终端窗口之上** |
| 3 | DevTools 协议采样**渲染真值** | canvas `painted%` 0.7–2.6、`requestAnimationFrame` ≈19 次/300ms（≈63fps）、`visibilityState=visible`、**零 uncaught 异常** |
| 4 | `CopyFromScreen` + 像素判据 | 真有宠物 ≈ **1.8 万–3.0 万** vivid 像素；空白 ≈ **1.0 千–1.6 千** |
| 5 | 换宠压测 `PET_ROTATE_MS=3000`，200 秒 ≈66 次轮换 | 全程从未空白 ⇒ **轮换不是诱因** |
| 6 | 事件日志（Application + System，08:50–10:40） | 无显示器 / UAC / 崩溃事件（只有 WorkBuddy 09:47 退出） |

### 像素判据（判断「宠物到底在不在屏幕上」）

```
vivid = 满足 ( max(R,G,B) > 120 且 max−min > 90 ) 的像素数
```

- 真有宠物：≥ ~18000
- 空白：≤ ~1600
- **判定阈值取 10000**

### 渲染真值探针（区分「没画」还是「画了没上屏」）

用 `--remote-debugging-port=9222` 启动，然后连 DevTools 协议采样 canvas：

```js
// 采样：canvas 有多少像素被画了
const c = document.getElementById('c');
const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
let nz = 0, tot = 0;
for (let i = 0; i < d.length; i += 4 * 53) { tot++; if (d[i + 3] > 10) nz++; }
// 再加一条：数 300ms 内 rAF 回调次数，0 表示渲染循环/合成已停
new Promise(res => { let n = 0; const t0 = performance.now();
  const f = () => { n++; performance.now() - t0 < 300 ? requestAnimationFrame(f) : res(n); };
  requestAnimationFrame(f); });
```

判定逻辑：

- `painted% > 0` 且 rAF 正常，但屏幕上是空白 → 第一次以为是这样，**实际不是**
- `painted% == 0` → 渲染/状态问题

> 更正：第二次复现证明**看 canvas 不够**——停摆前一帧的内容还留在 canvas 里，
> CDP 读得到、屏幕却不动。**停摆要认 renderer 的 CPU 增量是否为零**（见上）。
> canvas 读值只适合区分「从没画过」和「画过」。

## 修复（已实施）

三管齐下：**预防 + 自愈 + 手动兜底**。核心是主进程看门狗，因为渲染进程一旦
停摆就再也发不出求救信号，必须由主进程从外面救。

### 1. 渲染循环加固（`src/renderer.js`）

- `requestAnimationFrame(frame)` **挪到 `frame()` 开头**：任何一帧里 `draw` 抛异常，
  都不会把整个循环永久掐断（原来排在函数末尾，一次异常 = 循环就此结束）
- 整帧包 `try/catch`；出错时复位 `ctx.globalAlpha` / 变换（残留的半透明状态会让画面
  看着像「宠物消失」），并**限流**打日志（`[pet] 绘制异常：`，2 秒最多一条）
- 每帧（约 250ms 节流一次）通过 `api.heartbeat()` 向主进程报心跳

### 2. 主进程看门狗（`main.js`）

| 机制 | 参数 | 作用 |
|---|---|---|
| 渲染心跳 | 渲染进程 ~4 次/秒发 `pet-frame` | 主进程据此判断循环死活 |
| 停摆检测 | `HEARTBEAT_MS=3000`，每 `WATCHDOG_MS=2000` 查一次 | 超 3 秒没心跳 = 停摆 |
| 温和唤醒 | `reassertTop()` | `setAlwaysOnTop(true,'screen-saver')` + `invalidate()`，实测能把循环唤醒 |
| 周期重申 | `REASSERT_MS=30000` | 无感兜底，压住未识别的零星停摆 |
| 重建窗口 | 连续 3 次停摆 → `rebuildWindow()` | 合成层真坏了就整窗重建（保留托盘/轮换/当前宠物） |

其它预防与唤醒点：

- Chromium 开关：`disable-renderer-backgrounding`、
  `disable-backgrounding-occluded-windows`、`disable-features=CalculateNativeWinOcclusion`
- `powerMonitor` 的 `resume` / `unlock-screen` / `user-did-become-active`
  → 各重申一次置顶，1 秒后再补一次（休眠唤醒正是诱因）
- `screen` 的 `display-metrics-changed` / `display-added` / `display-removed` → 重申置顶
- 托盘菜单新增**「修复显示」**（一键 `reassertTop()`），手动兜底
- `did-finish-load` 重发 `pet:set-active`：重建窗口后新页面能立刻拿到当前宠物

### 3. `window-all-closed` 的坑（重建时会把 App 退掉）

`rebuildWindow()` 里 `win.destroy()` 到 `createWindow()` 之间有一瞬**零窗口**，
会触发 `window-all-closed` → 原本的 `app.quit()` 会**把整只宠物（含托盘）退掉**。
已加 `rebuilding` 标记：重建期间不退出，新窗 `ready-to-show`（或 1.5s 兜底）后解除。

> 实测：冻住 renderer（`NtSuspendProcess`）模拟停摆 → 看门狗打 3 条告警 →
> 重建窗口（renderer PID 变化）→ **App 存活**、新 renderer CPU 非零、宠物重新上屏。

### 仍然保留的手动恢复（看门狗没救回来时）

```powershell
# 0. 防止 ELECTRON_RUN_AS_NODE 降级（嵌入式终端会设它，会让 electron.exe 退化成 node 并崩）
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

# 1. 先杀旧实例（有单实例锁，必须先杀，否则新实例静默退出）
Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |
  Where-Object { $_.CommandLine -like '*arowana-pet*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

# 2. 重新拉起（游离后台，不留 console 窗口）
Start-Process `
  -FilePath 'C:\Users\WaterZhong\REPOS-LOCAL\arowana-pet\node_modules\electron\dist\electron.exe' `
  -ArgumentList '.' `
  -WorkingDirectory 'C:\Users\WaterZhong\REPOS-LOCAL\arowana-pet'
```

注意事项：

- 宠物只画在**主显示器**（当前 1920×1200）；副屏 2880×1620 永远没有宠物。
  在副屏工作时容易误判成「宠物没了」
- 用户会话进程，不是 Windows 服务：注销 / 重启即结束；`sc stop` / `Stop-Service` 无效
- **不要**加自启动注册表项 / 计划任务，除非用户明确要求

## 排除项（不要往这些方向改）

- ❌ **换宠 / 轮换逻辑**：66 次轮换压测全程正常；轮换只是**诱因的触发器**（唤醒瞬间到点），
  逻辑本身没 bug
- ❌ **brain 越界**：`brain.js` 每帧把位置 clamp 在 `[30, W-30]`，出不了窗口
- ❌ **GPU 崩溃**：renderer 进程 PID 在停摆期间**未变**；`disable-gpu` 是刻意设计（软件渲染）
- ❌ **DPI 不感知截图**：会漏掉宠物，别拿它当证据

## 涉及文件

- `main.js` —— `createWindow()` / `reassertTop()` / `rebuildWindow()` / `startWatchdog()` /
  `powerMonitor` 钩子 / 托盘「修复显示」/ `window-all-closed` 守卫
- `src/renderer.js` —— `frame()` 渲染循环（rAF 前置、try/catch、心跳）
- `src/preload.js` —— `heartbeat()` 桥
- `src/brain.js` —— 边界 clamp（是正常的，别改）
