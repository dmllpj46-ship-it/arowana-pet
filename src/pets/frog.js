/*
 * pets/frog.js — 青蛙（陆地，平时蹲坐，dash=跳跃）
 *
 * 行为：hover=蹲坐不动（偶尔眨眼、喉囊鼓动）；dash=蹬腿跳跃（后腿伸展，
 *       身体离地画弧线，落地后立刻回到蹲姿）。这是五只里最有个性的。
 * 配色：3 套（绿叶蛙/树蛙/毒箭蛙）。
 */
(function (root) {
  'use strict';

  var C = root.PetCommon;
  var L = 120;

  var PALETTES = [
    { body: '#6aa83a', belly: '#d8e8a0', dark: '#4a7a24', eye: '#f0d040', iris: '#2a2a1a', spot: '#4a7a24' },
    { body: '#8ac84a', belly: '#e8f8c0', dark: '#5a9a2a', eye: '#e84a4a', iris: '#2a1a1a', spot: '#e85a5a' },
    { body: '#4a9ad8', belly: '#c0e0f0', dark: '#2a6aa0', eye: '#f0a040', iris: '#2a2a1a', spot: '#f0c040' }
  ];

  function pal(st) { return PALETTES[(st && st.palette) | 0] || PALETTES[0]; }

  function draw(ctx, st) {
    var P = pal(st);
    var speed = st.speed || 0;
    var hopping = st.mode === 'dash' && speed > 30;
    // 跳跃进度 0..1：dash 开始时身体离地
    var hopT = hopping ? Math.min(1, speed / 160) : 0;
    var crouch = hopping ? 1 - hopT : 1;   // 起跳瞬间蹲最低

    C.facingTransform(ctx, st);

    // 跳跃弧：hopT 大时身体上抬（y 负=上）
    // 跳跃弧：用 sin 曲线让身体"起跳-顶点-落下"更自然，而非线性抬升
    var arc = hopping ? Math.sin(hopT * Math.PI) : 0;   // 0->1->0
    var lift = -arc * L * 0.55;
    // 身体拉伸/压缩：起跳瞬间拉长，顶点恢复，落地压扁
    var stretch = hopping ? (hopT < 0.3 ? 1 + (0.3 - hopT) * 0.5 : 1 - arc * 0.18) : 1;
    ctx.translate(0, lift);

    // —— 后腿（大腿）：起跳时向后蹬直，空中收起 ——
    var legSwing = hopping ? hopT * 0.6 : 0;
    var thighY = L * (0.16 + crouch * 0.03 - hopT * 0.06);
    C.ellipse(ctx, -L * 0.16 + legSwing * L * 0.10, thighY, L * 0.20 * stretch, L * 0.11);
    ctx.fillStyle = P.body; ctx.fill();
    // —— 后脚（蹼，跳跃时大幅后伸）——
    var footX = -L * 0.34 - legSwing * L * 0.22;
    var footY = thighY + (hopping ? hopT * L * 0.10 : 0);
    ctx.beginPath();
    ctx.moveTo(footX, footY);
    ctx.quadraticCurveTo(footX - L * 0.12, footY - L * 0.07, footX - L * 0.20, footY);
    ctx.quadraticCurveTo(footX - L * 0.16, footY + L * 0.07, footX - L * 0.07, footY + L * 0.05);
    ctx.closePath();
    ctx.fillStyle = P.dark; ctx.fill();

    // —— 身体（矮胖，跳跃时拉伸）——
    var bodyH = L * (0.30 + crouch * 0.03 - hopT * 0.04);
    C.ellipse(ctx, 0, 0, L * 0.34, bodyH * 0.5 * stretch);
    ctx.fillStyle = P.body; ctx.fill();
    // 肚皮
    C.ellipse(ctx, L * 0.02, L * 0.06, L * 0.26, bodyH * 0.32);
    ctx.fillStyle = P.belly; ctx.fill();
    // 斑点（毒箭蛙）
    if (st.palette === 2) {
      ctx.fillStyle = P.spot;
      C.ellipse(ctx, -L * 0.10, -L * 0.06, L * 0.06, L * 0.05); ctx.fill();
      C.ellipse(ctx, L * 0.12, L * 0.02, L * 0.05, L * 0.04); ctx.fill();
    }

    // —— 前肢（撑地）——
    var armY = L * 0.18;
    C.limb(ctx, L * 0.20, L * 0.08, L * 0.28, armY, L * 0.06, P.body);
    // 前脚趾
    ctx.strokeStyle = P.dark;
    ctx.lineWidth = L * 0.022;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(L * 0.28, armY); ctx.lineTo(L * 0.36, armY - L * 0.02);
    ctx.moveTo(L * 0.28, armY); ctx.lineTo(L * 0.35, armY + L * 0.03);
    ctx.stroke();

    // —— 头（与身体连成一片，略上仰）——
    var headLift = hopping ? -hopT * L * 0.06 : 0;
    ctx.save();
    ctx.translate(L * 0.26, headLift - L * 0.06);
    // 头顶凸眼（青蛙灵魂）
    var eyeY = -L * 0.10;
    // 远侧眼
    C.ellipse(ctx, -L * 0.06, eyeY, L * 0.09, L * 0.09);
    ctx.fillStyle = P.body; ctx.fill();
    C.ellipse(ctx, -L * 0.05, eyeY, L * 0.065, L * 0.065);
    ctx.fillStyle = P.eye; ctx.fill();
    C.ellipse(ctx, -L * 0.05, eyeY, L * 0.028, L * 0.028);
    ctx.fillStyle = P.iris; ctx.fill();
    // 近侧眼（大）
    C.ellipse(ctx, L * 0.06, eyeY, L * 0.10, L * 0.10);
    ctx.fillStyle = P.body; ctx.fill();
    C.ellipse(ctx, L * 0.07, eyeY, L * 0.075, L * 0.075);
    ctx.fillStyle = P.eye; ctx.fill();
    C.ellipse(ctx, L * 0.07, eyeY, L * 0.032, L * 0.032);
    ctx.fillStyle = P.iris; ctx.fill();
    // 高光
    C.ellipse(ctx, L * 0.09, eyeY - L * 0.02, L * 0.014, L * 0.014);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    // 眨眼（眼皮下盖）
    if (st.blink > 0) {
      ctx.fillStyle = P.body;
      ctx.fillRect(L * 0.07 - L * 0.075, eyeY - L * 0.075, L * 0.15, L * 0.15 * st.blink);
    }
    // 嘴（宽微笑线）
    ctx.strokeStyle = '#3a5a20';
    ctx.lineWidth = L * 0.016;
    ctx.beginPath();
    ctx.moveTo(-L * 0.02, L * 0.06);
    ctx.quadraticCurveTo(L * 0.10, L * 0.12, L * 0.24, L * 0.04);
    ctx.stroke();
    // 喉囊（hover 时缓慢鼓动）
    if (!hopping && st.mode === 'hover') {
      var throat = 1 + Math.sin(st.phase * 1.4) * 0.15;
      C.ellipse(ctx, L * 0.06, L * 0.14, L * 0.07 * throat, L * 0.06 * throat);
      ctx.fillStyle = P.belly; ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }

  root.PetRegistry && root.PetRegistry.register({
    id: 'frog',
    name: '青蛙',
    L: L,
    palette: 0,
    profile: {
      speed: { wander: 18, hover: 1, dash: 150 },
      modeDur: { wander: [5, 10], hover: [4, 8], dash: [0.7, 1.2] },
      headingMode: 'horizontal',
      band: [0.72, 0.96],
      blink: [2, 6],
      particles: 'none'
    },
    draw: draw,
    drawIcon: null,
    PALETTES: PALETTES
  });
})(typeof window !== 'undefined' ? window : globalThis);
