/*
 * pets/turtle.js — 乌龟（陆地，极慢，侧视）
 *
 * 行为：速度极慢（wander 只有 14，比鱼 hover 还慢）；悬停=伸头张望；
 *       dash=受惊缩壳小快步（缩头）。壳上有六边形花纹，龟龄感。
 * 配色：2 套（绿壳/黄壳）。
 */
(function (root) {
  'use strict';

  var C = root.PetCommon;
  var L = 150;

  var PALETTES = [
    { shell: '#5a8a3a', shellDark: '#3a5f24', shellRim: '#7aa84a', skin: '#9ab86a', belly: '#c8d8a0', eye: '#2a2a1a' },
    { shell: '#b89a4a', shellDark: '#8a6f2a', shellRim: '#d4b860', skin: '#c8b878', belly: '#e0d0a0', eye: '#2a2a1a' }
  ];

  function pal(st) { return PALETTES[(st && st.palette) | 0] || PALETTES[0]; }

  function draw(ctx, st) {
    var P = pal(st);
    var speed = st.speed || 0;
    var moving = speed > 5;
    var gait = moving ? st.phase * 1.1 : 0;
    var swing = Math.min(0.4, 0.1 + speed / 220);

    C.facingTransform(ctx, st);

    var bounce = moving ? Math.sin(gait * 2) * L * 0.008 : Math.sin(st.phase * 0.6) * L * 0.006;
    ctx.translate(0, bounce);

    // —— 后腿（远侧）——
    C.drawLeg(ctx, -L * 0.24, L * 0.14, gait, C.TROT[2], swing, P.skin, L);
    // —— 前腿（远侧）——
    C.drawLeg(ctx, L * 0.22, L * 0.14, gait, C.TROT[0], swing, P.skin, L);

    // —— 龟壳（大圆顶）——
    C.ellipse(ctx, 0, -L * 0.04, L * 0.44, L * 0.34);
    ctx.fillStyle = P.shell; ctx.fill();
    // 壳缘深色
    C.ellipse(ctx, 0, -L * 0.04, L * 0.44, L * 0.34);
    ctx.strokeStyle = P.shellDark; ctx.lineWidth = L * 0.03; ctx.stroke();
    // 壳内高光
    C.ellipse(ctx, -L * 0.10, -L * 0.16, L * 0.20, L * 0.12, -0.3);
    ctx.fillStyle = P.shellRim; ctx.fill();

    // —— 六边形花纹（中心一块大 + 周围放射）——
    ctx.strokeStyle = P.shellDark;
    ctx.lineWidth = L * 0.016;
    // 中央六边形
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var a = i / 6 * Math.PI * 2 + 0.3;
      var hx = Math.cos(a) * L * 0.13;
      var hy = -L * 0.04 + Math.sin(a) * L * 0.11;
      if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
    }
    ctx.closePath(); ctx.stroke();
    // 周围 6 块小六边形
    for (var j = 0; j < 6; j++) {
      var ang = j / 6 * Math.PI * 2 + 0.3;
      var ccx = Math.cos(ang) * L * 0.29, ccy = -L * 0.04 + Math.sin(ang) * L * 0.23;
      var rr = L * 0.075;
      ctx.beginPath();
      for (var k = 0; k < 6; k++) {
        var a2 = k / 6 * Math.PI * 2 + ang;
        var px = ccx + Math.cos(a2) * rr, py = ccy + Math.sin(a2) * rr * 0.85;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
    }

    // —— 腹甲（壳下沿）——
    C.ellipse(ctx, L * 0.02, L * 0.22, L * 0.30, L * 0.10);
    ctx.fillStyle = P.belly; ctx.fill();

    // —— 前腿（近侧）——
    C.drawLeg(ctx, L * 0.26, L * 0.14, gait, Math.PI, swing, P.skin, L);
    // —— 后腿（近侧）——
    C.drawLeg(ctx, -L * 0.20, L * 0.14, gait, 0, swing, P.skin, L);

    // —— 头（dash 时缩进壳里）——
    var headOut = st.mode === 'dash' ? 0.4 : 1;   // dash 缩头
    var headExt = L * 0.30 * headOut;
    ctx.save();
    ctx.translate(L * 0.40, L * 0.02);
    // 脖子
    ctx.strokeStyle = P.skin;
    ctx.lineWidth = L * 0.14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-L * 0.10, 0);
    ctx.lineTo(headExt - L * 0.10, 0);
    ctx.stroke();
    // 头
    C.ellipse(ctx, headExt, 0, L * 0.13, L * 0.10);
    ctx.fillStyle = P.skin; ctx.fill();
    if (st.mode !== 'dash') {
      // 眼睛
      C.drawEye(ctx, headExt + L * 0.04, -L * 0.02, L * 0.035, st.blink, P.eye, '#1a1a1a', P.skin);
      // 嘴
      ctx.strokeStyle = '#3a4a2a';
      ctx.lineWidth = L * 0.01;
      ctx.beginPath();
      ctx.moveTo(headExt + L * 0.08, L * 0.02);
      ctx.lineTo(headExt + L * 0.13, L * 0.02);
      ctx.stroke();
    }
    ctx.restore();

    // —— 短尾 ——
    ctx.strokeStyle = P.skin;
    ctx.lineWidth = L * 0.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-L * 0.42, L * 0.06);
    ctx.lineTo(-L * 0.48, L * 0.10);
    ctx.stroke();

    ctx.restore();
  }

  root.PetRegistry && root.PetRegistry.register({
    id: 'turtle',
    name: '乌龟',
    L: L,
    palette: 0,
    profile: {
      speed: { wander: 14, hover: 2, dash: 60 },
      modeDur: { wander: [6, 12], hover: [3, 7], dash: [0.8, 1.4] },
      headingMode: 'horizontal',
      band: [0.70, 0.95],
      blink: [3, 9],
      particles: 'bubbles'
    },
    draw: draw,
    drawIcon: null,
    PALETTES: PALETTES
  });
})(typeof window !== 'undefined' ? window : globalThis);
