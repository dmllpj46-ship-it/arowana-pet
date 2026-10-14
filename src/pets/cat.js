/*
 * pets/cat.js — 小猫（陆地行走，侧视，全程序化 Canvas 2D）
 *
 * 行为：底部活动带 horizontal 行走；hover=蜷坐不动（尾巴轻晃）；
 *       dash=炸毛小跑；拖拽时四肢下垂。
 * 配色：3 套（橘猫/奶牛/黑猫），st.palette 选择。
 */
(function (root) {
  'use strict';

  var C = root.PetCommon;
  var L = 150;   // 参考体长

  var PALETTES = [
    { fur: '#e8a04c', furDark: '#c47a2c', belly: '#f7e3c0', ear: '#e89a8a', inner: '#d96a6a', nose: '#e07b7b', line: '#a8641f', eye: '#3a6b2a' },
    { fur: '#f2ede4', furDark: '#cfc6b8', belly: '#ffffff', ear: '#e8b8a8', inner: '#d98a80', nose: '#e08a8a', line: '#8a8070', eye: '#2e7d32' },
    { fur: '#4a4a52', furDark: '#33333a', belly: '#6a6a74', ear: '#5a5a64', inner: '#8a5a6a', nose: '#c98a9a', line: '#26262c', eye: '#d4b830' }
  ];

  function pal(st) { return PALETTES[(st && st.palette) | 0] || PALETTES[0]; }

  function draw(ctx, st) {
    var P = pal(st);
    var speed = st.speed || 0;
    var moving = speed > 12;
    // 步态相位：行走时随 phase 走；站立时冻结（蹲坐）
    var gait = moving ? st.phase * 1.6 : 0;
    var swing = Math.min(0.55, 0.12 + speed / 300);

    // 地面软阴影（屏幕坐标，先画垫底）——跳跃/冲刺时阴影变小变淡
    var sc = st.scale || 1;
    var air = moving ? Math.min(1, speed / 240) : 0;
    C.groundShadow(ctx, st.x, st.y + L * sc * 0.30,
      L * sc * (0.46 - air * 0.12), L * sc * (0.10 - air * 0.03),
      0.16 - air * 0.06);

    C.facingTransform(ctx, st);

    // 待机呼吸：站立时身体随慢周期轻微起伏；行走时是步态弹跳
    var breathe = moving ? 0 : Math.sin(st.phase * 0.8) * L * 0.010;
    var bounce = moving ? Math.sin(gait * 2) * L * 0.012 : breathe;
    ctx.translate(0, bounce);

    // 耳朵偶尔抖动：用 finPhase 造一个稀疏的抽动
    var earTwitch = Math.max(0, Math.sin(st.finPhase * 1.7) - 0.86) * 3.2;
    // 东张西望：待机时头部缓慢左右张望（行走时朝前）
    var look = moving ? 0 : Math.sin(st.phase * 0.35) * 0.18;

    // —— 尾巴（S 形，随相位摇摆）——
    var tailSway = Math.sin(st.phase * 0.9) * L * 0.06;
    var tailLift = moving ? L * 0.05 : -L * 0.02; // 跑时尾巴翘起
    ctx.strokeStyle = P.fur;
    ctx.lineWidth = L * 0.075;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-L * 0.42, 0);
    ctx.quadraticCurveTo(-L * 0.58, tailLift - tailSway * 0.5, -L * 0.62, tailLift - L * 0.14 - tailSway);
    ctx.stroke();
    // 尾巴尖深色
    ctx.strokeStyle = P.furDark;
    ctx.lineWidth = L * 0.075;
    ctx.beginPath();
    ctx.moveTo(-L * 0.56, tailLift - L * 0.10 - tailSway * 0.8);
    ctx.quadraticCurveTo(-L * 0.60, tailLift - L * 0.13 - tailSway * 0.9, -L * 0.62, tailLift - L * 0.14 - tailSway);
    ctx.stroke();

    // —— 后腿（远侧，深色）——
    C.drawLeg(ctx, -L * 0.22, L * 0.10, gait, C.TROT[2], swing, P.furDark, L);
    // —— 前腿（远侧）——
    C.drawLeg(ctx, L * 0.20, L * 0.10, gait, C.TROT[0], swing, P.furDark, L);

    // —— 身体（带体积光）——
    C.shadedEllipse(ctx, 0, 0, L * 0.44, L * 0.26, P.fur, 0.9);
    // 肚皮
    C.ellipse(ctx, L * 0.02, L * 0.12, L * 0.34, L * 0.13);
    ctx.fillStyle = P.belly; ctx.fill();
    // 条纹（橘猫等）
    ctx.strokeStyle = P.line;
    ctx.lineWidth = L * 0.028;
    ctx.lineCap = 'round';
    for (var i = 0; i < 3; i++) {
      var sx = -L * 0.18 + i * L * 0.16;
      ctx.beginPath();
      ctx.moveTo(sx, -L * 0.22);
      ctx.quadraticCurveTo(sx + L * 0.02, -L * 0.05, sx, L * 0.10);
      ctx.stroke();
    }

    // —— 前腿（近侧）——
    C.drawLeg(ctx, L * 0.24, L * 0.10, gait, Math.PI, swing, P.fur, L);
    // —— 后腿（近侧）——
    C.drawLeg(ctx, -L * 0.16, L * 0.10, gait, 0, swing, P.fur, L);

    // —— 头（略前倾 + 待机张望）——
    ctx.save();
    ctx.translate(L * 0.44, -L * 0.05);
    ctx.rotate((moving ? 0 : -0.05) + look);

    // 耳朵（远侧深色）
    C.ellipse(ctx, -L * 0.13, -L * 0.30 - earTwitch * 0.3, L * 0.10, L * 0.13, -0.25);
    ctx.fillStyle = P.furDark; ctx.fill();
    // 耳朵（近侧）
    C.ellipse(ctx, L * 0.10, -L * 0.30 - earTwitch * 0.4, L * 0.11, L * 0.14, 0.2 + earTwitch * 0.05);
    ctx.fillStyle = P.fur; ctx.fill();
    C.ellipse(ctx, L * 0.11, -L * 0.29 - earTwitch * 0.4, L * 0.055, L * 0.075, 0.2 + earTwitch * 0.05);
    ctx.fillStyle = P.inner; ctx.fill();

    // 头（带体积光）
    C.shadedEllipse(ctx, 0, 0, L * 0.26, L * 0.24, P.fur, 0.9);
    // 面部亮区
    C.ellipse(ctx, L * 0.05, L * 0.08, L * 0.16, L * 0.12);
    ctx.fillStyle = P.belly; ctx.fill();

    // 眼睛
    C.drawEye(ctx, L * 0.12, -L * 0.04, L * 0.055, st.blink, P.eye, '#1a1a1a', P.fur);
    // 鼻子 + 嘴
    C.ellipse(ctx, L * 0.24, L * 0.02, L * 0.028, L * 0.02);
    ctx.fillStyle = P.nose; ctx.fill();
    ctx.strokeStyle = P.line;
    ctx.lineWidth = L * 0.012;
    ctx.beginPath();
    ctx.moveTo(L * 0.24, L * 0.04);
    ctx.quadraticCurveTo(L * 0.24, L * 0.09, L * 0.18, L * 0.09);
    ctx.moveTo(L * 0.24, L * 0.04);
    ctx.quadraticCurveTo(L * 0.24, L * 0.09, L * 0.30, L * 0.09);
    ctx.stroke();
    // 胡须
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = L * 0.008;
    for (var w = -1; w <= 1; w++) {
      ctx.beginPath();
      ctx.moveTo(L * 0.22, L * 0.04);
      ctx.lineTo(L * 0.40, L * 0.04 + w * L * 0.05);
      ctx.stroke();
    }
    ctx.restore();

    ctx.restore();
  }

  root.PetRegistry && root.PetRegistry.register({
    id: 'cat',
    name: '小猫',
    L: L,
    palette: 0,
    profile: {
      speed: { wander: 70, hover: 4, dash: 240 },
      modeDur: { wander: [4, 9], hover: [2, 5], dash: [0.9, 1.8] },
      headingMode: 'horizontal',
      band: [0.68, 0.94],
      blink: [2.5, 7],
      particles: 'bubbles'
    },
    draw: draw,
    drawIcon: null,
    PALETTES: PALETTES
  });
})(typeof window !== 'undefined' ? window : globalThis);
