/*
 * pets/dog.js — 小狗（陆地行走，侧视，全程序化 Canvas 2D）
 *
 * 行为：与小猫同为 horizontal 行走，但体型更壮、摇尾频率更高、
 *       dash 冲刺更快（狗比猫爱跑）。hover=站立喘气吐舌。
 * 配色：3 套（金毛/柯基/哈士奇）。
 */
(function (root) {
  'use strict';

  var C = root.PetCommon;
  var L = 165;

  var PALETTES = [
    { fur: '#e0b060', furDark: '#b8862c', belly: '#f5e6c8', ear: '#a87028', nose: '#2a2020', eye: '#3a2a18', spot: '#8a5a20' },
    { fur: '#e8c890', furDark: '#c0a060', belly: '#fff4e0', ear: '#d8a860', nose: '#2a2020', eye: '#3a2a18', spot: '#c09050' },
    { fur: '#8a94a6', furDark: '#6a7488', belly: '#eef2f8', ear: '#5a6478', nose: '#1a1a20', eye: '#4aa8d8', spot: '#3a4250' }
  ];

  function pal(st) { return PALETTES[(st && st.palette) | 0] || PALETTES[0]; }

  function draw(ctx, st) {
    var P = pal(st);
    var speed = st.speed || 0;
    var moving = speed > 12;
    var gait = moving ? st.phase * 1.5 : 0;
    var swing = Math.min(0.55, 0.12 + speed / 280);

    C.facingTransform(ctx, st);

    var bounce = moving ? Math.sin(gait * 2) * L * 0.014 : 0;
    ctx.translate(0, bounce);

    // —— 尾巴（上翘，快速摇摆）——
    var wag = Math.sin(st.phase * (moving ? 4.2 : 1.6)) * L * 0.07;
    ctx.strokeStyle = P.fur;
    ctx.lineWidth = L * 0.07;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-L * 0.42, -L * 0.04);
    ctx.quadraticCurveTo(-L * 0.56, -L * 0.16 + wag * 0.3, -L * 0.58, -L * 0.24 + wag);
    ctx.stroke();

    // —— 后腿（远侧）——
    C.drawLeg(ctx, -L * 0.22, L * 0.10, gait, C.TROT[2], swing, P.furDark, L);
    // —— 前腿（远侧）——
    C.drawLeg(ctx, L * 0.20, L * 0.10, gait, C.TROT[0], swing, P.furDark, L);

    // —— 身体 ——
    C.ellipse(ctx, 0, 0, L * 0.46, L * 0.28);
    ctx.fillStyle = P.fur; ctx.fill();
    // 肚皮
    C.ellipse(ctx, L * 0.02, L * 0.13, L * 0.36, L * 0.13);
    ctx.fillStyle = P.belly; ctx.fill();
    // 背斑（哈士奇）
    if (st.palette === 2) {
      ctx.fillStyle = P.spot;
      C.ellipse(ctx, -L * 0.10, -L * 0.16, L * 0.20, L * 0.10);
      ctx.fill();
    }

    // —— 前腿（近侧）——
    C.drawLeg(ctx, L * 0.24, L * 0.10, gait, Math.PI, swing, P.fur, L);
    // —— 后腿（近侧）——
    C.drawLeg(ctx, -L * 0.16, L * 0.10, gait, 0, swing, P.fur, L);

    // —— 头 ——
    ctx.save();
    ctx.translate(L * 0.46, -L * 0.06);
    ctx.rotate(moving ? 0 : 0.03);

    // 垂耳（远侧）
    ctx.save();
    ctx.translate(-L * 0.10, -L * 0.16);
    ctx.rotate(0.3 + Math.sin(st.phase * 2) * 0.08 * (moving ? 1 : 0.3));
    C.ellipse(ctx, 0, L * 0.12, L * 0.07, L * 0.16);
    ctx.fillStyle = P.ear; ctx.fill();
    ctx.restore();
    // 垂耳（近侧）
    ctx.save();
    ctx.translate(L * 0.06, -L * 0.16);
    ctx.rotate(-0.15 + Math.sin(st.phase * 2 + 1) * 0.08 * (moving ? 1 : 0.3));
    C.ellipse(ctx, 0, L * 0.13, L * 0.075, L * 0.17);
    ctx.fillStyle = P.furDark; ctx.fill();
    ctx.restore();

    // 头
    C.ellipse(ctx, 0, 0, L * 0.27, L * 0.25);
    ctx.fillStyle = P.fur; ctx.fill();
    // 口鼻部
    C.ellipse(ctx, L * 0.18, L * 0.10, L * 0.16, L * 0.12);
    ctx.fillStyle = P.belly; ctx.fill();

    // 眼睛
    C.drawEye(ctx, L * 0.12, -L * 0.05, L * 0.05, st.blink, P.eye, '#1a1a1a', P.fur);
    // 鼻子
    C.ellipse(ctx, L * 0.30, L * 0.04, L * 0.04, L * 0.03);
    ctx.fillStyle = P.nose; ctx.fill();
    // 嘴 + 舌头（hover 喘气时伸出）
    ctx.strokeStyle = '#3a2a20';
    ctx.lineWidth = L * 0.013;
    ctx.beginPath();
    ctx.moveTo(L * 0.30, L * 0.07);
    ctx.lineTo(L * 0.30, L * 0.11);
    ctx.moveTo(L * 0.30, L * 0.11);
    ctx.quadraticCurveTo(L * 0.24, L * 0.14, L * 0.20, L * 0.11);
    ctx.moveTo(L * 0.30, L * 0.11);
    ctx.quadraticCurveTo(L * 0.36, L * 0.14, L * 0.40, L * 0.11);
    ctx.stroke();
    if (!moving) {
      var pant = Math.abs(Math.sin(st.phase * 1.2)) * L * 0.02;
      C.ellipse(ctx, L * 0.30, L * 0.13 + pant * 0.3, L * 0.035, L * 0.05 + pant * 0.5);
      ctx.fillStyle = '#e06a7a'; ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }

  root.PetRegistry && root.PetRegistry.register({
    id: 'dog',
    name: '小狗',
    L: L,
    palette: 0,
    profile: {
      speed: { wander: 85, hover: 4, dash: 300 },
      modeDur: { wander: [4, 8], hover: [2, 4], dash: [1.0, 2.0] },
      headingMode: 'horizontal',
      band: [0.68, 0.94],
      blink: [2.5, 6],
      particles: 'none'
    },
    draw: draw,
    drawIcon: null
  });
})(typeof window !== 'undefined' ? window : globalThis);
