/*
 * fish.js — 金龙鱼体轴行波绘制（Canvas 2D，程序化，无美术资源）
 *
 * 核心：鱼体中轴是一条沿 x 传播的行波
 *     y(s, t) = A(s) · sin(k·s − ω·t)  +  curv · s^1.7
 * A(s) 从头部的 ~0 递增到尾部的最大值，相位随 x 滞后 —— 只要这条波在跑，
 * 人眼就会判定成"在游"。curv 是转弯偏置，让身体弯出弧度而不是硬转 180°。
 *
 * 局部坐标：吻端在 x=0，尾柄在 x=L，+y 指向腹部。
 */
(function (root) {
  'use strict';

  var L = 240;          // 基准体长（像素）
  var N = 44;           // 中轴采样段数（体长方向）
  var M = Math.round(N * 1.28); // 含尾鳍外推的采样上限
  var K = 7.2;          // 波数（沿体长的周期数 × 2π）

  // 体型剖面：s -> 体高/体长
  var HEIGHT = [
    [0.00, 0.070], [0.05, 0.150], [0.12, 0.205], [0.22, 0.230],
    [0.35, 0.228], [0.50, 0.200], [0.65, 0.155], [0.80, 0.105],
    [0.92, 0.060], [1.00, 0.038]
  ];

  var PALETTES = [
    {
      back: '#7a4d10', mid: '#d99a2e', sheenMid: '#f6dc8c', belly: '#fdf6da',
      fin0: 'rgba(214,150,48,0.88)', fin1: 'rgba(246,214,124,0.80)', fin2: 'rgba(206,140,44,0.78)',
      fin: 'rgba(243,196,96,0.86)', finEdge: 'rgba(168,102,26,0.65)',
      scale: 'rgba(146,92,22,0.26)', scaleHi: 'rgba(255,244,205,0.30)',
      eye: '#2b1a08', eyeRing: '#f6e3b4', blinkCover: '#d99a2e',
      line: 'rgba(120,72,18,0.55)', gill: 'rgba(120,72,18,0.45)',
      mouth: 'rgba(90,54,14,0.75)', whisker: 'rgba(150,100,30,0.8)'
    },
    {
      back: '#7a2410', mid: '#d94f2e', sheenMid: '#f6b48c', belly: '#fdf0da',
      fin0: 'rgba(190,60,30,0.88)', fin1: 'rgba(246,150,110,0.80)', fin2: 'rgba(200,70,35,0.78)',
      fin: 'rgba(243,120,80,0.86)', finEdge: 'rgba(140,40,20,0.65)',
      scale: 'rgba(146,40,22,0.28)', scaleHi: 'rgba(255,244,205,0.30)',
      eye: '#2b1a08', eyeRing: '#f6d8b4', blinkCover: '#d94f2e',
      line: 'rgba(120,40,18,0.55)', gill: 'rgba(120,40,18,0.45)',
      mouth: 'rgba(90,30,14,0.75)', whisker: 'rgba(150,60,30,0.8)'
    }
  ];

  function pal(st) { return PALETTES[(st && st.palette) | 0] || PALETTES[0]; }

  function smooth(u) { return u * u * (3 - 2 * u); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  function tableAt(t, s) {
    var last = t.length - 1;
    if (s <= t[0][0]) return t[0][1];
    if (s >= t[last][0]) return t[last][1];
    for (var i = 1; i <= last; i++) {
      if (s <= t[i][0]) {
        var a = t[i - 1], b = t[i];
        return a[1] + (b[1] - a[1]) * smooth((s - a[0]) / (b[0] - a[0]));
      }
    }
    return t[last][1];
  }

  function halfH(s) { return tableAt(HEIGHT, s) * L * 0.5; }
  function ampAt(s) { return (0.012 + 0.112 * Math.pow(s, 1.8)) * L; }

  // 采样中轴 + 切线 + 法线（法线指向腹部）
  function build(st) {
    var pts = new Array(M + 1), tan = new Array(M + 1), nor = new Array(M + 1);
    var i, s, sc, a, b, tx, ty, len;
    for (i = 0; i <= M; i++) {
      s = i / N;
      sc = s > 1 ? 1 : s;
      pts[i] = {
        x: s * L,
        y: ampAt(sc) * st.ampScale * Math.sin(K * s - st.phase) +
           st.curv * Math.pow(sc, 1.7) * L * 0.20
      };
    }
    for (i = 0; i <= M; i++) {
      a = pts[i > 0 ? i - 1 : 0];
      b = pts[i < M ? i + 1 : M];
      tx = b.x - a.x; ty = b.y - a.y;
      len = Math.sqrt(tx * tx + ty * ty) || 1;
      tx /= len; ty /= len;
      tan[i] = { x: tx, y: ty };
      nor[i] = { x: -ty, y: tx };
    }
    return { pts: pts, tan: tan, nor: nor };
  }

  function bodyPath(ctx, g) {
    var i, s, hh, p, n;
    ctx.beginPath();
    for (i = 0; i <= N; i++) {
      s = i / N; hh = halfH(s); p = g.pts[i]; n = g.nor[i];
      var tx = p.x - n.x * hh, ty = p.y - n.y * hh;
      if (i === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty);
    }
    for (i = N; i >= 0; i--) {
      s = i / N; hh = halfH(s); p = g.pts[i]; n = g.nor[i];
      ctx.lineTo(p.x + n.x * hh, p.y + n.y * hh);
    }
    ctx.closePath();
  }

  // 尾鳍：方向由中轴外推段决定，天然带上相位滞后
  function caudalPath(ctx, g) {
    var p0 = g.pts[N], p1 = g.pts[M];
    var dx = p1.x - p0.x, dy = p1.y - p0.y;
    var dl = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= dl; dy /= dl;
    var px = -dy, py = dx;
    var fl = L * 0.34, sw = fl * 0.80;
    var bx = p0.x, by = p0.y;
    var ux = bx + dx * fl + px * sw, uy = by + dy * fl + py * sw;
    var lx = bx + dx * fl - px * sw, ly = by + dy * fl - py * sw;
    var mx = bx + dx * fl * 0.70, my = by + dy * fl * 0.70;
    var cu = bx + dx * fl * 0.90 + px * sw * 0.18;
    var cv = by + dy * fl * 0.90 + py * sw * 0.18;
    var cl = bx + dx * fl * 0.90 - px * sw * 0.18;
    var cw = by + dy * fl * 0.90 - py * sw * 0.18;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(cu, cv, ux, uy);
    ctx.quadraticCurveTo(bx + dx * fl * 0.86, by + dy * fl * 0.86, mx, my);
    ctx.quadraticCurveTo(bx + dx * fl * 0.86, by + dy * fl * 0.86, lx, ly);
    ctx.quadraticCurveTo(cl, cw, bx, by);
    ctx.closePath();
  }

  // 背鳍 / 臀鳍：沿体表长出的低平鳍条，side=-1 背部，+1 腹部
  function ridgePath(ctx, g, s0, s1, H, side) {
    var steps = 14, i, u, s, idx, p, n, hh, h, bx, by, ox, oy;
    var base = [], outer = [];
    for (i = 0; i <= steps; i++) {
      u = i / steps;
      s = s0 + (s1 - s0) * u;
      idx = Math.min(N, Math.round(s * N));
      p = g.pts[idx]; n = g.nor[idx]; hh = halfH(s);
      h = H * Math.sin(Math.PI * Math.pow(u, 1.5));
      bx = p.x + n.x * side * hh; by = p.y + n.y * side * hh;
      ox = bx + n.x * side * h; oy = by + n.y * side * h;
      base.push([bx, by]); outer.push([ox, oy]);
    }
    ctx.beginPath();
    ctx.moveTo(base[0][0], base[0][1]);
    for (i = 0; i <= steps; i++) ctx.lineTo(outer[i][0], outer[i][1]);
    for (i = steps; i >= 0; i--) ctx.lineTo(base[i][0], base[i][1]);
    ctx.closePath();
  }

  // 叶片状鳍（胸鳍 / 腹鳍）
  function leaf(ctx, bx, by, ang, len, wid) {
    var dx = Math.cos(ang), dy = Math.sin(ang);
    var px = -dy, py = dx;
    var tx = bx + dx * len, ty = by + dy * len;
    var c1x = bx + dx * len * 0.45 + px * wid, c1y = by + dy * len * 0.45 + py * wid;
    var c2x = bx + dx * len * 0.45 - px * wid, c2y = by + dy * len * 0.45 - py * wid;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(c1x, c1y, tx, ty);
    ctx.quadraticCurveTo(c2x, c2y, bx, by);
    ctx.closePath();
  }

  function draw(ctx, st) {
    var g = build(st);
    var i, p, n, t, hh, s;
    var P = pal(st);

    ctx.save();
    ctx.translate(st.x, st.y);
    ctx.scale(st.scale, st.scale);
    ctx.rotate(st.heading);
    if (Math.cos(st.heading) < 0) ctx.scale(1, -1); // 朝左游时镜像，避免翻肚
    ctx.translate(-0.42 * L, 0);                    // 旋转中心放在质心（s≈0.42）

    var finGrad = ctx.createLinearGradient(0, -L * 0.2, 0, L * 0.2);
    finGrad.addColorStop(0, P.fin0);
    finGrad.addColorStop(0.5, P.fin1);
    finGrad.addColorStop(1, P.fin2);

    // 尾鳍
    ctx.fillStyle = finGrad;
    caudalPath(ctx, g);
    ctx.fill();
    ctx.strokeStyle = P.finEdge; ctx.lineWidth = 1; ctx.stroke();

    // 背鳍 / 臀鳍（金龙鱼两鳍都靠后）
    ctx.fillStyle = finGrad;
    ridgePath(ctx, g, 0.50, 0.96, L * 0.058, -1); ctx.fill();
    ridgePath(ctx, g, 0.62, 0.94, L * 0.042, 1); ctx.fill();

    // 腹鳍
    i = Math.round(0.46 * N); p = g.pts[i]; n = g.nor[i]; hh = halfH(0.46);
    leaf(ctx, p.x + n.x * hh * 0.9, p.y + n.y * hh * 0.9,
         Math.atan2(g.tan[i].y, g.tan[i].x) + 2.35, L * 0.10, L * 0.022);
    ctx.fill();

    // 鱼体
    var bodyGrad = ctx.createLinearGradient(0, -L * 0.17, 0, L * 0.17);
    bodyGrad.addColorStop(0, P.back);
    bodyGrad.addColorStop(0.30, P.mid);
    bodyGrad.addColorStop(0.62, P.sheenMid);
    bodyGrad.addColorStop(1, P.belly);
    bodyPath(ctx, g);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // 鳞片（一次性批量成路径，只 stroke 一次）
    ctx.save();
    bodyPath(ctx, g);
    ctx.clip();
    ctx.beginPath();
    for (var ci = 2; ci < N - 1; ci += 3) {
      s = ci / N;
      p = g.pts[ci]; n = g.nor[ci]; t = g.tan[ci]; hh = halfH(s);
      for (var r = 0; r < 5; r++) {
        var f = -0.8 + 1.6 * (r / 4);
        var oy = f * hh * 0.88, sh = hh * 0.36;
        var ax = p.x + n.x * (oy - sh * 0.5), ay = p.y + n.y * (oy - sh * 0.5);
        var bx = p.x + n.x * (oy + sh * 0.5), by = p.y + n.y * (oy + sh * 0.5);
        var cx = p.x + n.x * oy + t.x * sh * 0.85;
        var cy = p.y + n.y * oy + t.y * sh * 0.85;
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(cx, cy, bx, by);
      }
    }
    ctx.strokeStyle = P.scale;
    ctx.lineWidth = L * 0.008;
    ctx.stroke();

    // 金属反光带：随波形沿体轴滑动，这是金龙鱼的灵魂
    var gp = 0.5 + 0.42 * Math.sin(st.phase * 0.6);
    var sheen = ctx.createLinearGradient(-L * 0.1, 0, L * 1.1, 0);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(clamp01(gp - 0.22), 'rgba(255,255,255,0)');
    sheen.addColorStop(clamp01(gp), 'rgba(255,255,255,0.42)');
    sheen.addColorStop(clamp01(gp + 0.22), 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(-L * 0.25, -L * 0.35, L * 1.7, L * 0.7);
    ctx.restore();

    // 体轮廓
    bodyPath(ctx, g);
    ctx.strokeStyle = P.line; ctx.lineWidth = 1.1; ctx.stroke();

    // 胸鳍：高频小幅扇动，悬停时最明显
    i = Math.round(0.22 * N); p = g.pts[i]; n = g.nor[i]; hh = halfH(0.22);
    var flap = Math.sin(st.finPhase * 3.1) * 0.42;
    var baseAng = Math.atan2(g.tan[i].y, g.tan[i].x) + 2.15;
    leaf(ctx, p.x + n.x * hh * 0.75, p.y + n.y * hh * 0.75,
         baseAng + flap, L * 0.155, L * 0.040);
    ctx.fillStyle = finGrad; ctx.fill();
    ctx.strokeStyle = P.finEdge; ctx.lineWidth = 0.8; ctx.stroke();

    // 鳃盖
    i = Math.round(0.17 * N); p = g.pts[i]; n = g.nor[i]; hh = halfH(0.17);
    var gx1 = p.x - n.x * hh, gy1 = p.y - n.y * hh;
    var gx2 = p.x + n.x * hh, gy2 = p.y + n.y * hh;
    ctx.beginPath();
    ctx.moveTo(gx1, gy1);
    ctx.quadraticCurveTo(p.x - L * 0.035, p.y, gx2, gy2);
    ctx.strokeStyle = P.gill; ctx.lineWidth = 1; ctx.stroke();

    // 口裂（上位口，微微上翘）
    var hp = g.pts[0], hn = g.nor[0], hhh = halfH(0) * 0.6;
    ctx.beginPath();
    ctx.moveTo(hp.x + L * 0.012, hp.y + hn.y * hhh);
    ctx.quadraticCurveTo(hp.x + L * 0.045, hp.y + hn.y * hhh * 1.5,
                         hp.x + L * 0.085, hp.y + hn.y * hhh * 0.4);
    ctx.strokeStyle = P.mouth; ctx.lineWidth = 1.2; ctx.stroke();

    // 龙须：两根，随身体摆动飘动
    ctx.strokeStyle = P.whisker; ctx.lineWidth = 1.3;
    for (var k = 0; k < 2; k++) {
      var sway = Math.sin(st.phase * 0.9 + k * 1.3) * L * 0.022;
      var sx = hp.x + L * 0.02 + k * L * 0.012;
      var sy = hp.y + hn.y * hhh * 1.2 + k * hhh * 0.35;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx - L * 0.075, sy + hn.y * L * 0.045 + sway,
                           sx - L * 0.150, sy + hn.y * L * 0.070 + sway * 1.8);
      ctx.stroke();
    }

    // 眼
    i = Math.round(0.075 * N); p = g.pts[i]; n = g.nor[i]; hh = halfH(0.075);
    var ex = p.x - n.x * hh * 0.32, ey = p.y - n.y * hh * 0.32;
    var er = L * 0.0175;
    ctx.beginPath(); ctx.arc(ex, ey, er, 0, 6.2832);
    ctx.fillStyle = P.eyeRing; ctx.fill();
    ctx.strokeStyle = P.line; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); ctx.arc(ex, ey, er * 0.52, 0, 6.2832);
    ctx.fillStyle = P.eye; ctx.fill();
    if (st.blink > 0) {
      ctx.save();
      ctx.beginPath(); ctx.arc(ex, ey, er, 0, 6.2832); ctx.clip();
      ctx.fillStyle = P.blinkCover;
      ctx.fillRect(ex - er, ey - er, er * 2, er * 2 * st.blink);
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(ex - er * 0.3, ey - er * 0.35, er * 0.22, 0, 6.2832);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    }

    ctx.restore();
  }

  root.Fish = { L: L, draw: draw };
})(typeof window !== 'undefined' ? window : globalThis);
