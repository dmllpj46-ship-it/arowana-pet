/*
 * renderer.js — 渲染循环、拖拽、与主进程通信
 * 双鱼版：两条独立行为状态机 + 独立气泡，颜色见 fish.js PALETTES。
 * 没有 Electron 时（直接双击 index.html）也能跑，只少了置顶/穿透/托盘。
 */
(function () {
  'use strict';

  var api = window.pet || { sendBox: function () {}, setTray: function () {}, quit: function () {} };
  var cvs = document.getElementById('c');
  var ctx = cvs.getContext('2d');
  var W = 0, H = 0, DPR = 1;
  var fishes = [];
  var dragFish = null;
  var L = Fish.L;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cvs.width = Math.round(W * DPR);
    cvs.height = Math.round(H * DPR);
    cvs.style.width = W + 'px';
    cvs.style.height = H + 'px';
    for (var i = 0; i < fishes.length; i++) {
      var st = fishes[i].st;
      st.x = Math.max(30, Math.min(st.x, W - 30));
      st.y = Math.max(30, Math.min(st.y, H - 30));
    }
  }

  function makeTrayIcon() {
    var c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    var g = c.getContext('2d');
    Fish.draw(g, {
      x: 30, y: 32, scale: 0.20, heading: 0, phase: 1.1,
      curv: 0, ampScale: 0.9, finPhase: 0, blink: 0, palette: 0
    });
    return c.toDataURL('image/png');
  }

  function sendBoxes() {
    var boxes = [];
    for (var i = 0; i < fishes.length; i++) {
      var st = fishes[i].st;
      boxes.push({ x: st.x, y: st.y, r: 0.6 * L * st.scale });
    }
    api.sendBox(boxes);
  }

  var boxT = 0;
  function frame(now) {
    var dt = Math.min((now - (frame.last || now)) / 1000, 0.05);
    frame.last = now;

    var i;
    for (i = 0; i < fishes.length; i++) {
      Brain.update(fishes[i].st, dt, W, H);
      Bubbles.update(fishes[i].bs, dt, fishes[i].st, L);
    }

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (i = 0; i < fishes.length; i++) {
      Bubbles.draw(ctx, fishes[i].bs);
      Fish.draw(ctx, fishes[i].st);
    }

    boxT += dt;
    if (boxT > 0.2) {
      boxT = 0;
      sendBoxes();
    }
    requestAnimationFrame(frame);
  }

  function init() {
    if (!window.pet) document.body.className = 'preview';
    resize();
    var base = Math.max(0.75, Math.min(1.6, Math.min(W, H) / 1080));

    var st1 = Brain.create(W, H);
    st1.palette = 0;
    st1.scale = base;
    st1.x = W * 0.40; st1.y = H * 0.45;

    var st2 = Brain.create(W, H);
    st2.palette = 1;
    st2.scale = base * 0.85;
    st2.x = Math.max(30, Math.min(W * 0.62, W - 30));
    st2.y = Math.max(30, Math.min(H * 0.58, H - 30));
    st2.phase += 2.1;
    st2.modeT = Math.random() * st2.modeDur;

    fishes = [
      { st: st1, bs: Bubbles.create() },
      { st: st2, bs: Bubbles.create() }
    ];
    window.addEventListener('resize', resize);

    cvs.addEventListener('mousedown', function (e) {
      for (var i = fishes.length - 1; i >= 0; i--) {
        if (fishes[i].st && Brain.hit(fishes[i].st, e.clientX, e.clientY, L)) {
          dragFish = fishes[i].st;
          Brain.startDrag(dragFish, e.clientX, e.clientY);
          break;
        }
      }
    });
    window.addEventListener('mousemove', function (e) {
      if (dragFish) {
        Brain.dragTo(dragFish, e.clientX, e.clientY);
        sendBoxes();
      }
    });
    window.addEventListener('mouseup', function () {
      if (dragFish) { Brain.endDrag(dragFish, W, H); dragFish = null; }
    });

    try { api.setTray(makeTrayIcon()); } catch (err) { /* 预览模式无托盘 */ }
    requestAnimationFrame(frame);
  }

  init();
})();
