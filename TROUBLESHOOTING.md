# 排查记录：进程还活着，宠物却不见了（透明窗口偶发不上屏）

> 现场时间：2026-10-16 · 机器：Windows / 主屏 1280×800 + 副屏 1920×1080

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

- `painted% > 0` 且 rAF 正常，但屏幕上是空白 → **画了，没上屏**（就是本例）
- `painted% == 0` → 才是渲染/状态问题

## 修复 / 处理

目前只能「重启恢复」：

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

- 冷启动仍有约 1/4 概率还是空白 → **重试直到像素判据通过**（vivid > 10000）
- 宠物只画在**主显示器**（当前 1280×800）；副屏 1920×1080 永远没有宠物。
  在副屏工作时容易误判成「宠物没了」
- 用户会话进程，不是 Windows 服务：注销 / 重启即结束；`sc stop` / `Stop-Service` 无效
- **不要**加自启动注册表项 / 计划任务，除非用户明确要求

## 根治建议（尚未实施）

1. **main.js 硬化**：周期性重申置顶 + 强制重绘，让空白自愈：

   ```js
   setInterval(() => {
     if (!win || win.isDestroyed()) return;
     win.setAlwaysOnTop(true, 'screen-saver');
     win.webContents.invalidate();      // 或 win.hide(); win.show();
   }, 60 * 1000);
   ```

2. **看门狗脚本**：每 N 分钟跑一次上面的像素判据，空白就 kill-first 重启。
   不装机自启，手动跑。

暂不实施 —— 现状可用重启绕过，等复现频率变高再做。

## 排除项（不要往这些方向改）

- ❌ **换宠 / 轮换逻辑**：66 次轮换压测全程正常
- ❌ **brain 越界**：`brain.js` 每帧把位置 clamp 在 `[30, W-30]`，出不了窗口
- ❌ **启动 IPC 丢消息**：`pet:set-active` 虽然只发一次，但轮换会重发；且实测轮换后必然上屏
- ❌ **GPU 崩溃**：renderer 进程 PID 全程未变（未重启过）；`disable-gpu` 是刻意设计（软件渲染）

## 一条弱线索（存疑，勿当修复）

启动时带 `--remote-debugging-port=9222` 的 3 次**都正常上屏**，不带的出现过空白。
样本太小（N=3），且该参数会暴露本地调试端口，**不建议当作修复手段**。留待后人验证。

## 涉及文件

- `main.js` —— `createWindow()` / `fitWindow()` / `ready-to-show` 里的 `win.show()`
- `src/renderer.js` —— `frame()` 渲染循环、`setActivePet()`
- `src/brain.js` —— 边界 clamp（是正常的，别改）
