/*
 * pets/bird.js — 小鸟（全屏自由飞，侧视）
 *
 * 行为：与鱼同为 free 全屏飞行，但双翅连续扇动（finPhase 驱动）；
 *       hover=悬停滑翔（翅膀慢扇）；dash=疾飞（翅膀快扇+拉长的身体）。
 * 配色：3 套（蓝雀/黄鹂/红雀）。
 */
(function (root) {
  'use strict';

  var C = root.PetCommon;
  var L = 110;

  var PALETTES = [
    { body: '#5a9ad8', belly: '#c8e0f5', wing: '#3a6aa8', beak: '#f0b840', eye: '#2a2a1a', tail: '#3a6aa8' },
    { body: '#f0c93a', belly: '#fbf0c0', wing: '#d8a820', beak: '#e07830', eye: '#2a2a1a', tail: '#d8a820' },
    { body: '#e05a3a', belly: '#f8c8b0', wing: '#b83a20', beak: '#f0d040', eye: '#2a2a1a', tail: '#b83a20' }
  ];

  function pal(st) { return PALETTES[(st && st.palette) | 0] || PALETTES[0]; }

  function draw(ctx, st) {
    var P = pal(st);
    var speed = st.speed || 0;
    var flapSpeed = st.mode === 'dash' ? 5.5 : (speed < 20 ? 1.8 : 3.2);
    // 翅膀扇动角：finPhase 驱动，-1..1
    var flap = Math.sin(st.finPhase * flapSpeed);
    var wingSpan = st.mode === 'dash' ? 1.15 : 1.0;
    // 悬停滑翔：翅膀大幅展开、缓慢起伏，而不是快速扇动
    var gliding = st.mode === 'hover' && speed < 20;
    var glideLift = gliding ? Math.sin(st.finPhase * 0.8) * 0.35 : 0;

    C.facingTransform(ctx, st);
    // 滑翔时身体轻微抬头上扬
    if (gliding) ctx.rotate(-0.06);

    // —— 尾羽（随飞行方向后展）——
    var tailFan = Math.sin(st.finPhase * 0.5) * 0.1;
    ctx.fillStyle = P.tail;
    ctx.beginPath();
    ctx.moveTo(-L * 0.30, 0);
    ctx.lineTo(-L * 0.52, -L * 0.10 + tailFan * L);
    ctx.lineTo(-L * 0.46, 0);
    ctx.lineTo(-L * 0.52, L * 0.10 + tailFan * L);
    ctx.closePath();
    ctx.fill();

    // —— 远翅（先画，深色，在后；滑翔时大角度展开）——
    ctx.save();
    ctx.translate(-L * 0.02, -L * 0.04);
    ctx.rotate(gliding ? (0.9 + glideLift * 0.3) : flap * 0.5);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-L * 0.20, -L * 0.18 * wingSpan, -L * 0.34, -L * 0.08 * wingSpan);
    ctx.quadraticCurveTo(-L * 0.16, L * 0.02, 0, 0);
    ctx.closePath();
    ctx.fillStyle = P.wing; ctx.fill();
    ctx.restore();

    // —— 身体（流线型，带体积光）——
    C.shadedEllipse(ctx, 0, 0, L * 0.30, L * 0.20, P.body, 0.85);
    // 肚皮
    C.ellipse(ctx, L * 0.02, L * 0.08, L * 0.22, L * 0.10);
    ctx.fillStyle = P.belly; ctx.fill();

    // —— 头（带体积光）——
    C.shadedEllipse(ctx, L * 0.26, -L * 0.06, L * 0.16, L * 0.14, P.body, 0.85);

    // —— 喙 ——
    ctx.fillStyle = P.beak;
    ctx.beginPath();
    ctx.moveTo(L * 0.40, -L * 0.06);
    ctx.lineTo(L * 0.52, -L * 0.02);
    ctx.lineTo(L * 0.40, L * 0.02);
    ctx.closePath();
    ctx.fill();

    // —— 眼睛 ——
    C.drawEye(ctx, L * 0.30, -L * 0.09, L * 0.045, st.blink, P.eye, '#1a1a1a', P.body);

    // —— 近翅（后画，亮色，在前；滑翔时向上高举）——
    ctx.save();
    ctx.translate(L * 0.02, -L * 0.04);
    ctx.rotate(gliding ? (-1.1 + glideLift * 0.4) : flap * 0.7);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(L * 0.12, -L * 0.28 * wingSpan, L * 0.28, -L * 0.34 * wingSpan);
    ctx.quadraticCurveTo(L * 0.32, -L * 0.06, L * 0.16, L * 0.04);
    ctx.closePath();
    ctx.fillStyle = P.body; ctx.fill();
    // 翼缘深色
    ctx.strokeStyle = P.wing;
    ctx.lineWidth = L * 0.02;
    ctx.stroke();
    ctx.restore();

    // —— 小腿（飞行时收起，悬停时垂下）——
    if (speed < 30) {
      C.limb(ctx, L * 0.04, L * 0.14, L * 0.08, L * 0.24, L * 0.025, P.beak);
      C.limb(ctx, L * 0.08, L * 0.14, L * 0.12, L * 0.24, L * 0.025, P.beak);
    }

    ctx.restore();
  }

  root.PetRegistry && root.PetRegistry.register({
    id: 'bird',
    name: '小鸟',
    L: L,
    palette: 0,
    profile: {
      speed: { wander: 75, hover: 12, dash: 260 },
      modeDur: { wander: [4, 8], hover: [2, 5], dash: [1.0, 2.0] },
      headingMode: 'free',
      band: null,
      blink: [3, 8],
      particles: 'bubbles'
    },
    draw: draw,
    drawIcon: null,
    PALETTES: PALETTES
  });
})(typeof window !== 'undefined' ? window : globalThis);
