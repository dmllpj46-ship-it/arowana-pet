/*
 * renderer.js — 渲染循环、拖拽、与主进程通信（单只 active pet 版）
 *
 * 架构：
 *   - PetRegistry 里注册了所有物种（src/pets/*.js）
 *   - 主进程通过 IPC 'pet:set-active' 告诉本进程当前该显示哪只
 *   - 切换时旧宠物淡出(TRANSITION_MS/2) -> 销毁 -> 新宠物淡入(TRANSITION_MS/2)
 *   - 拖拽命中、包围盒回报、托盘图标都基于当前 active 宠物
 *
 * 没有 Electron（直接双击 index.html）时自动兜底：显示注册表第一只，进入预览模式。
 */
(function () {
  'use strict';

  var CFG = window.PetConfig || { TRANSITION_MS: 500 };
  var FADE_MS = CFG.TRANSITION_MS / 2;

  var api = window.pet || {
    sendBox: function () {}, setTray: function () {}, quit: function () {},
    setActive: null
  };
  var cvs = document.getElementById('c');
  var ctx = cvs.getContext('2d');
  var W = 0, H = 0, DPR = 1;

  // 当前激活的宠物：{ def, st, bs, alpha, dying }
  var active = null;
  var pendingSpawn = null;   // 淡出完成后要登场的新宠物 def
  var dragPet = null;
  var boxT = 0;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cvs.width = Math.round(W * DPR);
    cvs.height = Math.round(H * DPR);
    cvs.style.width = W + 'px';
    cvs.style.height = H + 'px';
    if (active && active.st) {
      active.st.x = Math.max(30, Math.min(active.st.x, W - 30));
      active.st.y = Math.max(30, Math.min(active.st.y, H - 30));
    }
  }

  function baseScale() {
    return Math.max(0.75, Math.min(1.6, Math.min(W, H) / 1080));
  }

  // 根据物种 L 反推 scale：让不同体型的宠物在屏幕上大小协调
  function fitScale(def) {
    return baseScale() * (240 / def.L);
  }

  function makeTrayIcon(def) {
    var c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    var g = c.getContext('2d');
    def.draw(g, {
      x: 32, y: 32, scale: def.iconScale || 0.20, heading: 0, phase: 1.1,
      curv: 0, ampScale: 0.9, finPhase: 0, blink: 0, palette: def.palette || 0,
      profile: def.profile
    });
    return c.toDataURL('image/png');
  }

  function spawn(def) {
    var st = Brain.create(W, H, def.profile);
    // 每次登场随机选一个配色变体，增加新鲜感（回退到 def.palette）
    st.palette = (def.PALETTES && def.PALETTES.length)
      ? Math.floor(Math.random() * def.PALETTES.length)
      : (def.palette || 0);
    st.scale = fitScale(def);
    // 陆地动物：出生点在活动带中下部；鱼类：随机
    if (def.profile.band) {
      st.y = H * (def.profile.band[0] + def.profile.band[1]) / 2;
    }
    return { def: def, st: st, bs: Bubbles.create(), alpha: 0, dying: false };
  }

  function sendBoxes() {
    if (!active || active.dying) return;
    var st = active.st, L = active.def.L;
    api.sendBox([{ x: st.x, y: st.y, r: 0.6 * L * st.scale }]);
  }

  function setActivePet(id) {
    var def = window.PetRegistry.get(id);
    if (!def) return;
    if (active && active.def.id === id && !active.dying) return; // 已是当前
    if (active) {
      active.dying = true;   // 旧的进入淡出，frame 里到 0 后销毁
      pendingSpawn = def;
    } else {
      active = spawn(def);
      active.alpha = 0;
    }
    try { api.setTray(makeTrayIcon(def)); } catch (err) { /* 预览模式无托盘 */ }
  }

  function frame(now) {
    var dt = Math.min((now - (frame.last || now)) / 1000, 0.05);
    frame.last = now;

    // 淡入淡出管理
    if (active) {
      if (active.dying) {
        active.alpha -= dt * 1000 / FADE_MS;
        if (active.alpha <= 0) {
          active = pendingSpawn ? spawn(pendingSpawn) : null;
          pendingSpawn = null;
        }
      } else if (active.alpha < 1) {
        active.alpha = Math.min(1, active.alpha + dt * 1000 / FADE_MS);
      }
    }

    if (active && !active.dying) {
      Brain.update(active.st, dt, W, H);
      if (active.def.profile.particles !== 'none') {
        Bubbles.update(active.bs, dt, active.st, active.def.L);
      }
    }

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (active) {
      ctx.globalAlpha = Math.max(0, Math.min(1, active.alpha));
      if (!active.dying && active.def.profile.particles !== 'none') {
        Bubbles.draw(ctx, active.bs);
      }
      active.def.draw(ctx, active.st);
      ctx.globalAlpha = 1;
    }

    boxT += dt;
    if (boxT > 0.2) { boxT = 0; sendBoxes(); }
    requestAnimationFrame(frame);
  }

  function init() {
    if (!window.pet) document.body.className = 'preview';
    resize();

    window.addEventListener('resize', resize);

    cvs.addEventListener('mousedown', function (e) {
      if (!active || active.dying) return;
      if (Brain.hit(active.st, e.clientX, e.clientY, active.def.L)) {
        dragPet = active.st;
        Brain.startDrag(dragPet, e.clientX, e.clientY);
      }
    });
    window.addEventListener('mousemove', function (e) {
      if (dragPet) {
        Brain.dragTo(dragPet, e.clientX, e.clientY);
        sendBoxes();
      }
    });
    window.addEventListener('mouseup', function () {
      if (dragPet) { Brain.endDrag(dragPet, W, H); dragPet = null; }
    });

    // Electron：主进程接管；预览：兜底显示注册表第一只
    if (window.pet && api.setActive) {
      api.setActive(setActivePet);
      // 光标位置：每帧喂给 brain，让宠物主动避开鼠标。
      // 拖拽中不跟随，否则会把宠物从手里拽走。
      if (api.onCursor) {
        api.onCursor(function (c) {
          if (dragPet) return;
          if (active && active.st) Brain.setCursor(active.st, c);
        });
      }
    } else {
      var ids = window.PetRegistry.ids();
      if (ids.length) setActivePet(ids[0]);
    }
    requestAnimationFrame(frame);
  }

  init();
})();
