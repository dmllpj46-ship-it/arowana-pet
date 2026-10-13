/*
 * brain.js — 行为状态机
 *
 * wander  巡游：朝噪声目标点慢速游动，随时转向
 * hover   悬停：几乎不动，只靠胸鳍扇动 + 身体微摆保持平衡
 * dash    冲刺：短时加速，摆幅与摆频同步拉高
 *
 * 转弯不靠硬转 heading，而是把角速度写进 curv 交给 fish.js 弯出身体弧度。
 */
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;
  var MARGIN = 140;   // 距屏幕边缘多远开始往回打方向

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function wrap(a) { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; }

  function pickTarget(st, W, H) {
    var m = Math.min(MARGIN, Math.min(W, H) * 0.35);
    var near = (st.x < m || st.x > W - m || st.y < m || st.y > H - m);
    var ang = near
      ? Math.atan2(H * 0.5 - st.y, W * 0.5 - st.x) + rnd(-0.8, 0.8)
      : rnd(-Math.PI, Math.PI);
    var d = rnd(Math.min(W, H) * 0.22, Math.min(W, H) * 0.55);
    st.tx = clamp(st.x + Math.cos(ang) * d, m, W - m);
    st.ty = clamp(st.y + Math.sin(ang) * d, m, H - m);
  }

  function create(W, H) {
    var st = {
      x: W * 0.5, y: H * 0.5,
      heading: rnd(-Math.PI, Math.PI),
      scale: 1,
      speed: 55, targetSpeed: 55,
      phase: rnd(0, TAU),     // 行波累计相位
      curv: 0,                // 转弯曲率
      ampScale: 0.80,         // 摆幅系数
      finPhase: 0,
      mode: 'wander', modeT: 0, modeDur: rnd(5, 11),
      tx: 0, ty: 0,
      blink: 0, blinkT: rnd(2, 7),
      bobT: rnd(0, TAU),
      drag: false, dragOX: 0, dragOY: 0
    };
    pickTarget(st, W, H);
    return st;
  }

  function update(st, dt, W, H) {
    st.bobT += dt * 0.7;
    st.finPhase += dt * (1.6 + st.speed * 0.012);

    // 眨眼
    st.blinkT -= dt;
    if (st.blinkT <= 0) { st.blink = 1; st.blinkT = rnd(2.5, 8); }
    if (st.blink > 0) st.blink = Math.max(0, st.blink - dt * 6);

    if (st.drag) {
      st.speed += (20 - st.speed) * Math.min(1, dt * 4);
      st.curv += (0 - st.curv) * Math.min(1, dt * 5);
      st.phase += TAU * 1.4 * dt;
      st.ampScale += (0.75 - st.ampScale) * Math.min(1, dt * 3);
      return;
    }

    // 状态切换
    st.modeT += dt;
    if (st.modeT > st.modeDur) {
      st.modeT = 0;
      if (st.mode === 'wander') {
        if (Math.random() < 0.45) { st.mode = 'dash'; st.modeDur = rnd(1.2, 2.6); }
        else { st.mode = 'hover'; st.modeDur = rnd(3, 7); }
      } else {
        st.mode = 'wander'; st.modeDur = rnd(5, 11);
        pickTarget(st, W, H);
      }
    }

    var ts = st.mode === 'hover' ? 8 : (st.mode === 'dash' ? 235 : 62);
    st.speed += (ts - st.speed) * Math.min(1, dt * 1.8);

    // 转向：角速度有上限，转弯因此是弧线而不是折线
    var want = Math.atan2(st.ty - st.y, st.tx - st.x);
    var diff = wrap(want - st.heading);
    if (st.mode === 'hover') diff *= 0.25;
    // 转弯半径 ≈ speed / maxTurn，太小会原地打转
    var maxTurn = 1.05;
    var step = clamp(diff, -maxTurn * dt, maxTurn * dt);
    st.heading = wrap(st.heading + step);

    var ct = dt > 0 ? clamp((step / dt) / maxTurn, -1, 1) : 0;
    st.curv += (ct - st.curv) * Math.min(1, dt * 5);

    if (Math.hypot(st.tx - st.x, st.ty - st.y) < 70) pickTarget(st, W, H);

    // 游速 -> 摆频 / 摆幅
    st.phase += TAU * Math.min(0.45 + st.speed / 95, 3.2) * dt;
    var targetAmp = Math.min(0.55 + st.speed / 210, 1.7);
    st.ampScale += (targetAmp - st.ampScale) * Math.min(1, dt * 2.5);

    // 位移（含轻微上下浮沉）
    st.x += Math.cos(st.heading) * st.speed * dt;
    st.y += (Math.sin(st.heading) * st.speed + Math.cos(st.bobT) * 7) * dt;

    if (st.x < 30 || st.x > W - 30 || st.y < 30 || st.y > H - 30) {
      st.x = clamp(st.x, 30, W - 30);
      st.y = clamp(st.y, 30, H - 30);
      pickTarget(st, W, H);
    }
  }

  function hit(st, mx, my, L) {
    var r = 0.55 * L * st.scale;
    var dx = mx - st.x, dy = my - st.y;
    return dx * dx + dy * dy < r * r;
  }

  function startDrag(st, mx, my) { st.drag = true; st.dragOX = st.x - mx; st.dragOY = st.y - my; }
  function dragTo(st, mx, my) { st.x = mx + st.dragOX; st.y = my + st.dragOY; }
  function endDrag(st, W, H) {
    st.drag = false; st.mode = 'wander'; st.modeT = 0; st.modeDur = rnd(5, 11);
    pickTarget(st, W, H);
  }

  root.Brain = {
    create: create, update: update, hit: hit,
    startDrag: startDrag, dragTo: dragTo, endDrag: endDrag
  };
})(typeof window !== 'undefined' ? window : globalThis);
