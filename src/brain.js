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
  var MARGIN = 140;   // 距屏幕边缘多远开始往回打方向（陆地动物也会用）

  // 默认档案（无 profile 时等价于原金龙鱼行为，保证零回归）
  var DEFAULT_PROFILE = {
    speed: { wander: 62, hover: 8, dash: 235 },
    modeDur: { wander: [5, 11], hover: [3, 7], dash: [1.2, 2.6] },
    headingMode: 'free',   // 'free' 全屏任意方向 | 'horizontal' 只左右移动
    band: null,            // 陆地动物活动带 [y0比例, y1比例]，null=全屏
    blink: [2.5, 8],
    particles: 'none'      // 'bubbles' | 'motes' | 'none'
  };

  function mergeProfile(p) {
    p = p || {};
    var s = p.speed || {}, d = p.modeDur || {};
    return {
      speed: {
        wander: s.wander != null ? s.wander : DEFAULT_PROFILE.speed.wander,
        hover: s.hover != null ? s.hover : DEFAULT_PROFILE.speed.hover,
        dash: s.dash != null ? s.dash : DEFAULT_PROFILE.speed.dash
      },
      modeDur: {
        wander: d.wander || DEFAULT_PROFILE.modeDur.wander,
        hover: d.hover || DEFAULT_PROFILE.modeDur.hover,
        dash: d.dash || DEFAULT_PROFILE.modeDur.dash
      },
      headingMode: p.headingMode || DEFAULT_PROFILE.headingMode,
      band: p.band || null,
      blink: p.blink || DEFAULT_PROFILE.blink,
      particles: p.particles || DEFAULT_PROFILE.particles
    };
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function wrap(a) { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; }

  // horizontal 模式：把目标朝向夹到水平附近，陆地动物不会斜着走
  function flattenAngle(ang) {
    var c = Math.cos(ang), s = Math.sin(ang);
    if (Math.abs(c) < 0.92) {
      s = clamp(s, -0.40, 0.40);
      ang = Math.atan2(s, c >= 0 ? 1 : -1);
    }
    return ang;
  }

  function bandClamp(st, W, H) {
    if (!st.profile.band) return;
    st.y = clamp(st.y, st.profile.band[0] * H, st.profile.band[1] * H);
  }

  function pickTarget(st, W, H) {
    var m = Math.min(MARGIN, Math.min(W, H) * 0.35);
    var near = (st.x < m || st.x > W - m || st.y < m || st.y > H - m);
    var ang = near
      ? Math.atan2(H * 0.5 - st.y, W * 0.5 - st.x) + rnd(-0.8, 0.8)
      : rnd(-Math.PI, Math.PI);
    var d = rnd(Math.min(W, H) * 0.22, Math.min(W, H) * 0.55);
    st.tx = clamp(st.x + Math.cos(ang) * d, m, W - m);
    st.ty = clamp(st.y + Math.sin(ang) * d, m, H - m);
    if (st.profile.band) {
      st.ty = clamp(st.ty, st.profile.band[0] * H, st.profile.band[1] * H);
    }
  }

  function create(W, H, profile) {
    var P = mergeProfile(profile);
    var st = {
      x: W * 0.5, y: H * 0.5,
      heading: rnd(-Math.PI, Math.PI),
      scale: 1,
      speed: 55, targetSpeed: 55,
      phase: rnd(0, TAU),     // 行波累计相位
      curv: 0,                // 转弯曲率
      ampScale: 0.80,         // 摆幅系数
      finPhase: 0,
      mode: 'wander', modeT: 0, modeDur: rnd(P.modeDur.wander[0], P.modeDur.wander[1]),
      tx: 0, ty: 0,
      blink: 0, blinkT: rnd(P.blink[0], P.blink[1]),
      bobT: rnd(0, TAU),
      drag: false, dragOX: 0, dragOY: 0,
      palette: 0,
      profile: P
    };
    if (P.headingMode === 'horizontal') {
      st.heading = Math.random() < 0.5 ? 0 : Math.PI;
      if (P.band) st.y = clamp(H * 0.85, P.band[0] * H, P.band[1] * H);
    }
    pickTarget(st, W, H);
    return st;
  }

  function update(st, dt, W, H) {
    st.bobT += dt * 0.7;
    st.finPhase += dt * (1.6 + st.speed * 0.012);

    // 眨眼（频率走物种档案）
    st.blinkT -= dt;
    if (st.blinkT <= 0) {
      st.blink = 1;
      st.blinkT = rnd(st.profile.blink[0], st.profile.blink[1]);
    }
    if (st.blink > 0) st.blink = Math.max(0, st.blink - dt * 6);

    if (st.drag) {
      st.speed += (20 - st.speed) * Math.min(1, dt * 4);
      st.curv += (0 - st.curv) * Math.min(1, dt * 5);
      st.phase += TAU * 1.4 * dt;
      st.ampScale += (0.75 - st.ampScale) * Math.min(1, dt * 3);
      return;
    }

    // 状态切换（时长走物种档案）
    st.modeT += dt;
    if (st.modeT > st.modeDur) {
      st.modeT = 0;
      if (st.mode === 'wander') {
        if (Math.random() < 0.45) {
          st.mode = 'dash';
          st.modeDur = rnd(st.profile.modeDur.dash[0], st.profile.modeDur.dash[1]);
        } else {
          st.mode = 'hover';
          st.modeDur = rnd(st.profile.modeDur.hover[0], st.profile.modeDur.hover[1]);
        }
      } else {
        st.mode = 'wander';
        st.modeDur = rnd(st.profile.modeDur.wander[0], st.profile.modeDur.wander[1]);
        pickTarget(st, W, H);
      }
    }

    // 目标速度走物种档案
    var ts = st.mode === 'hover' ? st.profile.speed.hover
           : st.mode === 'dash' ? st.profile.speed.dash
           : st.profile.speed.wander;
    st.speed += (ts - st.speed) * Math.min(1, dt * 1.8);

    // 转向：角速度有上限，转弯因此是弧线而不是折线
    var want = Math.atan2(st.ty - st.y, st.tx - st.x);
    if (st.profile.headingMode === 'horizontal') want = flattenAngle(want);
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

    bandClamp(st, W, H);   // 陆地动物锁在活动带内

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
    st.drag = false; st.mode = 'wander'; st.modeT = 0;
    st.modeDur = rnd(st.profile.modeDur.wander[0], st.profile.modeDur.wander[1]);
    bandClamp(st, W, H);
    pickTarget(st, W, H);
  }

  root.Brain = {
    create: create, update: update, hit: hit,
    startDrag: startDrag, dragTo: dragTo, endDrag: endDrag
  };
})(typeof window !== 'undefined' ? window : globalThis);
