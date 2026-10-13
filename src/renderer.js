/*
 * renderer.js — 渲染循环、拖拽、与主进程通信
 * 没有 Electron 时（直接双击 index.html）也能跑，只少了置顶/穿透/托盘。
 */
(function () {
  'use strict';

  var api = window.pet || { sendBox: function () {}, setTray: function () {}, quit: function () {} };
  var cvs = document.getElementById('c');
  var ctx = cvs.getContext('2d');
  var W = 0, H = 0, DPR = 1;
  var st = null, bs = null, dragging = false;
  var L = Fish.L;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cvs.width = Math.round(W * DPR);
    cvs.height = Math.round(H * DPR);
    cvs.style.width = W + 'px';
    cvs.style.height = H + 'px';
    if (st) {
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
      curv: 0, ampScale: 0.9, finPhase: 0, blink: 0
    });
    return c.toDataURL('image/png');
  }

  var boxT = 0;
  function frame(now) {
    var dt = Math.min((now - (frame.last || now)) / 1000, 0.05);
    frame.last = now;

    Brain.update(st, dt, W, H);
    Bubbles.update(bs, dt, st, L);

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    Bubbles.draw(ctx, bs);
    Fish.draw(ctx, st);

    boxT += dt;
    if (boxT > 0.2) {
      boxT = 0;
      api.sendBox({ x: st.x, y: st.y, r: 0.6 * L * st.scale });
    }
    requestAnimationFrame(frame);
  }

  function init() {
    if (!window.pet) document.body.className = 'preview';
    resize();
    st = Brain.create(W, H);
    st.scale = Math.max(0.75, Math.min(1.6, Math.min(W, H) / 1080));
    bs = Bubbles.create();
    window.addEventListener('resize', resize);

    cvs.addEventListener('mousedown', function (e) {
      if (st && Brain.hit(st, e.clientX, e.clientY, L)) {
        dragging = true;
        Brain.startDrag(st, e.clientX, e.clientY);
      }
    });
    window.addEventListener('mousemove', function (e) {
      if (dragging) {
        Brain.dragTo(st, e.clientX, e.clientY);
        api.sendBox({ x: st.x, y: st.y, r: 0.6 * L * st.scale });
      }
    });
    window.addEventListener('mouseup', function () {
      if (dragging) { dragging = false; Brain.endDrag(st, W, H); }
    });

    try { api.setTray(makeTrayIcon()); } catch (err) { /* 预览模式无托盘 */ }
    requestAnimationFrame(frame);
  }

  init();
})();
