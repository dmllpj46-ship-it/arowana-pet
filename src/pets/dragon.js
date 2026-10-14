/*
 * dragon.js — 五彩金龙（Canvas 2D，程序化，无美术资源）
 *
 * 骨架与 fish.js 同源：中轴是一条沿 x 传播的行波
 *     y(s, t) = A(s)·sin(k·s − ω·t)  +  curv·s^1.7
 * 但体型拉长、波数压低 —— 长蛇身的低频大摆才是龙的身段。
 * curv 转弯偏置照旧由 Brain 写入，所以它和金龙鱼一样是拐弯游而不是硬转 180°。
 *
 * 局部坐标：吻端在 x=0，尾柄在 x=L，+y 指向腹部；法线 n 指向腹部（-n 即背部）。
 *
 * 五彩的做法：
 *   1) 体色不是单色渐变，而是沿体轴在 5 段色相之间连续过渡（赤→橙→金→青→紫），
 *      插值走最短色环方向，所以没有硬色带；
 *   2) 上面叠一层「背暗腹亮」的竖向体积光，长圆柱身立刻有厚度；
 *   3) 鳞片按所在体段的色相分 5 组批量描边，游动时五色随体段流转；
 *   4) 一条虹彩反光带沿体轴来回滑动 —— 这是「金龙」的光。
 */
(function (root) {
  'use strict';

  var L = 320;                    // 基准体长（比金龙鱼长一截，蛇身才好看）
  var N = 56;                     // 中轴采样段数（体长方向）
  var M = Math.round(N * 1.20);   // 含尾鳍外推的采样上限
  var K = 4.2;                    // 波数（沿体长的周期数 × 2π）：低频大摆

  // 体型剖面：s -> 体高/体长（龙身胸厚、颈收、尾极细长）
  var HEIGHT = [
    [0.00, 0.050], [0.04, 0.098], [0.10, 0.138], [0.18, 0.166],
    [0.28, 0.178], [0.40, 0.170], [0.52, 0.148], [0.64, 0.118],
    [0.76, 0.086], [0.88, 0.056], [0.96, 0.034], [1.00, 0.022]
  ];

  /*
   * 三套配色。hues 是沿体轴的 5 段色相（五彩），其余是角/爪/须等局部色。
   */
  var PALETTES = [
    { // 五彩金龙：赤橙金青紫 + 米白腹
      hues: [352, 28, 46, 190, 272], sat: 84, belly: '#fff7e6',
      bellyGlow: 'rgba(255,255,255,0.52)', scaleA: 0.22,
      horn: '#f7e7c2', claw: '#ffd977', whisker: 'rgba(255,228,168,0.85)',
      mane: 'rgba(255,206,120,0.90)', ribbon: 'rgba(255,214,140,0.80)',
      fin: 'rgba(255,203,118,0.86)', finEdge: 'rgba(158,84,22,0.55)',
      eye: '#241202', eyeRing: '#ffe9b8', eyeIris: 46,
      line: 'rgba(58,28,8,0.50)', mouth: 'rgba(96,46,12,0.72)'
    },
    { // 碧海青龙：青碧金白紫 + 冰白腹
      hues: [188, 162, 48, 206, 258], sat: 74, belly: '#eefcff',
      bellyGlow: 'rgba(255,255,255,0.48)', scaleA: 0.22,
      horn: '#e6f6f8', claw: '#bff0f6', whisker: 'rgba(198,244,250,0.85)',
      mane: 'rgba(150,232,240,0.88)', ribbon: 'rgba(160,236,246,0.80)',
      fin: 'rgba(158,232,242,0.86)', finEdge: 'rgba(24,92,110,0.55)',
      eye: '#0a1e24', eyeRing: '#d8f6fb', eyeIris: 186,
      line: 'rgba(10,54,66,0.50)', mouth: 'rgba(18,72,86,0.72)'
    },
    { // 赤焰龙：绯红橙金洋红 + 暖白腹
      hues: [354, 18, 44, 322, 32], sat: 88, belly: '#fff1de',
      bellyGlow: 'rgba(255,255,255,0.50)', scaleA: 0.22,
      horn: '#f9ddc0', claw: '#ffc46a', whisker: 'rgba(255,196,150,0.85)',
      mane: 'rgba(255,150,90,0.90)', ribbon: 'rgba(255,170,110,0.80)',
      fin: 'rgba(255,158,96,0.86)', finEdge: 'rgba(140,34,20,0.55)',
      eye: '#220a04', eyeRing: '#ffd9bd', eyeIris: 18,
      line: 'rgba(74,20,10,0.50)', mouth: 'rgba(112,32,16,0.72)'
    }
  ];

  function pal(st) { return PALETTES[(st && st.palette) | 0] || PALETTES[0]; }

  function smooth(u) { return u * u * (3 - 2 * u); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  // hsla 构造器：色相自动归一到 [0,360)，保证交给 canvas 的永远是合法颜色串
  function hsl(h, s, l, a) {
    h = ((h % 360) + 360) % 360;
    return 'hsla(' + h.toFixed(1) + ',' + Math.round(s) + '%,' + Math.round(l) + '%,'
         + (a == null ? 1 : a).toFixed(3) + ')';
  }

  // 5 段色相的连续插值（走最短色环），u∈[0,1] 沿体轴
  function mixHue(hues, u) {
    var x = clamp01(u) * (hues.length - 1);
    var i = Math.min(hues.length - 2, Math.floor(x));
    var f = smooth(x - i);
    var d = ((hues[i + 1] - hues[i] + 540) % 360) - 180;
    return hues[i] + d * f;
  }

  // 体段序号 0..4（鳞片分组取色用）
  function hueIdx(s) { return Math.min(4, Math.max(0, Math.floor(clamp01(s) * 5))); }

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
  function ampAt(s) { return (0.012 + 0.105 * Math.pow(s, 1.8)) * L; }

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
      if (i === 0) ctx.moveTo(p.x - n.x * hh, p.y - n.y * hh);
      else ctx.lineTo(p.x - n.x * hh, p.y - n.y * hh);
    }
    for (i = N; i >= 0; i--) {
      s = i / N; hh = halfH(s); p = g.pts[i]; n = g.nor[i];
      ctx.lineTo(p.x + n.x * hh, p.y + n.y * hh);
    }
    ctx.closePath();
  }

  // 尾鳍：火焰状 plume，方向由中轴外推段决定，天然带相位滞后
  function tailPath(ctx, g) {
    var p0 = g.pts[N], p1 = g.pts[M];
    var dx = p1.x - p0.x, dy = p1.y - p0.y;
    var dl = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= dl; dy /= dl;
    var px = -dy, py = dx;
    var fl = L * 0.30, sw = fl * 0.85;
    var bx = p0.x, by = p0.y;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + dx * fl * 0.50 + px * sw * 0.20, by + dy * fl * 0.50 + py * sw * 0.20,
                         bx + dx * fl + px * sw * 0.55, by + dy * fl + py * sw * 0.55);
    ctx.quadraticCurveTo(bx + dx * fl * 0.80, by + dy * fl * 0.80,
                         bx + dx * fl * 0.92, by + dy * fl * 0.92);
    ctx.quadraticCurveTo(bx + dx * fl * 0.80, by + dy * fl * 0.80,
                         bx + dx * fl - px * sw * 0.55, by + dy * fl - py * sw * 0.55);
    ctx.quadraticCurveTo(bx + dx * fl * 0.50 - px * sw * 0.20, by + dy * fl * 0.50 - py * sw * 0.20,
                         bx, by);
    ctx.closePath();
  }

  /*
   * 背鳍棘 / 腹鳍棘：一排后倾的三角棘刺，整条拼成一个 path 只 fill 一次。
   * side=-1 背部，+1 腹部。sway 让棘刺跟着行波抖，而不是焊死在身上。
   */
  function spikeRidge(ctx, g, s0, s1, H, side, phase, count) {
    var steps = count || 13, j, u, s, idx, p, n, t, hh, h, sway, bx, by, tx, ty;
    ctx.beginPath();
    for (j = 0; j <= steps; j++) {
      u = j / steps;
      s = s0 + (s1 - s0) * u;
      idx = Math.min(N, Math.round(s * N));
      p = g.pts[idx]; n = g.nor[idx]; t = g.tan[idx]; hh = halfH(s);
      h = H * (0.50 + 0.50 * Math.sin(Math.PI * Math.pow(u, 0.75)));
      sway = Math.sin(phase - u * 3.4) * h * 0.30;
      bx = p.x + n.x * side * hh; by = p.y + n.y * side * hh;
      tx = bx + n.x * side * (h + sway) - t.x * h * 0.30;
      ty = by + n.y * side * (h + sway) - t.y * h * 0.30;
      ctx.moveTo(bx + t.x * h * 0.34, by + t.y * h * 0.34);
      ctx.lineTo(tx, ty);
      ctx.lineTo(bx - t.x * h * 0.34, by - t.y * h * 0.34);
      ctx.closePath();
    }
  }

  // 龙爪腿：髋->膝->爪，向后飘，爪尖三趾
  function drawLeg(ctx, g, s, P, phase, len) {
    var idx = Math.min(N, Math.round(s * N));
    var p = g.pts[idx], n = g.nor[idx], t = g.tan[idx], hh = halfH(s);
    var swing = Math.sin(phase - s * 5.0) * 0.35;
    var hx = p.x + n.x * hh * 0.55, hy = p.y + n.y * hh * 0.55;
    var kx = hx - t.x * len * 0.50 + n.x * len * 0.58;
    var ky = hy - t.y * len * 0.50 + n.y * len * 0.58;
    var fx = kx - t.x * len * 0.55 + n.x * len * 0.26 + swing * len;
    var fy = ky - t.y * len * 0.55 + n.y * len * 0.26 + swing * len;
    var k, a, w;

    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx, hy); ctx.lineTo(kx, ky);
    ctx.strokeStyle = P.horn; ctx.lineWidth = L * 0.030; ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(kx, ky); ctx.lineTo(fx, fy);
    ctx.strokeStyle = P.horn; ctx.lineWidth = L * 0.022; ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = P.claw; ctx.lineWidth = L * 0.012;
    for (k = 0; k < 3; k++) {
      a = Math.atan2(t.y, t.x) + Math.PI - 0.55 + k * 0.55;
      w = len * (0.34 - Math.abs(k - 1) * 0.06);
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + Math.cos(a) * w, fy + Math.sin(a) * w);
    }
    ctx.stroke();
  }

  // 龙角：主干 + 两岔，末端外挑（鹿角感）
  function drawHorn(ctx, bx, by, ang, len, w, color) {
    var dx = Math.cos(ang), dy = Math.sin(ang);
    var tipx = bx + dx * len, tipy = by + dy * len;
    var mx = bx + dx * len * 0.5 - dy * len * 0.16;
    var my = by + dy * len * 0.5 + dx * len * 0.16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(mx, my, tipx, tipy);
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
    for (var k = 0; k < 2; k++) {
      var u = 0.42 + k * 0.30;
      var px = bx + dx * len * u - dy * len * 0.10;
      var py = by + dy * len * u + dx * len * 0.10;
      var a2 = ang - 0.80 - k * 0.30;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(a2) * len * 0.32, py + Math.sin(a2) * len * 0.32);
      ctx.lineWidth = w * 0.62; ctx.stroke();
    }
  }

  // 尾后飘带：两条彩带随 finPhase 甩动
  function drawRibbons(ctx, g, st, P) {
    var p0 = g.pts[N], p1 = g.pts[M];
    var dx = p1.x - p0.x, dy = p1.y - p0.y;
    var dl = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= dl; dy /= dl;
    var px = -dy, py = dx;
    var fl = L * 0.30, sw = fl * 0.55;
    var k, side, bx, by, w1, w2, ex, ey;
    ctx.lineCap = 'round';
    for (k = 0; k < 2; k++) {
      side = k === 0 ? 1 : -1;
      bx = p0.x + px * sw * 0.30 * side;
      by = p0.y + py * sw * 0.30 * side;
      w1 = Math.sin(st.finPhase * 1.25 + k * 1.9) * L * 0.075;
      w2 = Math.sin(st.finPhase * 1.25 + k * 1.9 - 0.9) * L * 0.11;
      ex = bx + dx * fl * 1.5 + px * w2 * side;
      ey = by + dy * fl * 1.5 + py * w2 * side;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + dx * fl * 0.7 + px * w1 * side,
                           by + dy * fl * 0.7 + py * w1 * side, ex, ey);
      ctx.strokeStyle = P.ribbon;
      ctx.lineWidth = L * (k === 0 ? 0.017 : 0.013);
      ctx.stroke();
    }
  }

  // 体色：沿体轴 5 段色相连续过渡 + 背暗腹亮体积光
  function paintBody(ctx, g, P) {
    var i, u, gg = ctx.createLinearGradient(0, 0, L, 0);
    for (i = 0; i <= 9; i++) {
      u = i / 9;
      gg.addColorStop(u, hsl(mixHue(P.hues, u), P.sat, 52));
    }
    bodyPath(ctx, g);
    ctx.fillStyle = gg;
    ctx.fill();

    // 体积光：背暗腹亮，让长圆柱身有厚度
    var vol = ctx.createLinearGradient(0, -L * 0.10, 0, L * 0.10);
    vol.addColorStop(0, 'rgba(0,0,0,0.46)');
    vol.addColorStop(0.40, 'rgba(0,0,0,0.04)');
    vol.addColorStop(0.56, 'rgba(255,255,255,0.08)');
    vol.addColorStop(1, P.bellyGlow);
    ctx.fillStyle = vol;
    ctx.fill();
  }

  // 鳞片：按体段色相分 5 组批量描边，五色随体段流转
  function paintScales(ctx, g, P) {
    ctx.save();
    bodyPath(ctx, g);
    ctx.clip();
    for (var grp = 0; grp < 5; grp++) {
      ctx.beginPath();
      for (var ci = 2; ci < N - 1; ci += 3) {
        var s = ci / N;
        if (hueIdx(s) !== grp) continue;
        var p = g.pts[ci], n = g.nor[ci], t = g.tan[ci], hh = halfH(s);
        for (var r = 0; r < 5; r++) {
          var f = -0.8 + 1.6 * (r / 4);
          var oy = f * hh * 0.86, sh = hh * 0.34;
          var ax = p.x + n.x * (oy - sh * 0.5), ay = p.y + n.y * (oy - sh * 0.5);
          var bx = p.x + n.x * (oy + sh * 0.5), by = p.y + n.y * (oy + sh * 0.5);
          var cx = p.x + n.x * oy + t.x * sh * 0.9, cy = p.y + n.y * oy + t.y * sh * 0.9;
          ctx.moveTo(ax, ay);
          ctx.quadraticCurveTo(cx, cy, bx, by);
        }
      }
      ctx.strokeStyle = hsl(P.hues[grp], Math.min(96, P.sat + 10), 76, P.scaleA);
      ctx.lineWidth = L * 0.0065;
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw(ctx, st) {
    var g = build(st);
    var P = pal(st);
    var i, p, n, hh, s;

    ctx.save();
    ctx.translate(st.x, st.y);
    ctx.scale(st.scale, st.scale);
    ctx.rotate(st.heading);
    if (Math.cos(st.heading) < 0) ctx.scale(1, -1);  // 朝左游时上下镜像，避免翻肚
    // 沿体轴镜像：局部坐标是「吻端 x=0 -> 尾柄 x=L」，镜像后吻端才指向 heading（前进方向）。
    // 只翻 x，法线（背/腹）不受影响，所以行波方向、curv 转弯、背鳍位置都不变。
    ctx.scale(-1, 1);
    ctx.translate(-0.45 * L, 0);                     // 旋转中心放在质心（s≈0.45）

    // —— 尾后飘带（最底层）——
    drawRibbons(ctx, g, st, P);

    // —— 尾鳍 ——
    ctx.fillStyle = P.fin;
    tailPath(ctx, g);
    ctx.fill();
    ctx.strokeStyle = P.finEdge; ctx.lineWidth = 1; ctx.stroke();

    // —— 背鳍棘 / 腹鳍棘（先画，根部被身体盖住）——
    ctx.fillStyle = P.fin;
    spikeRidge(ctx, g, 0.22, 0.95, L * 0.052, -1, st.phase, 14);
    ctx.fill();
    spikeRidge(ctx, g, 0.34, 0.84, L * 0.038, 1, st.phase * 1.1, 11);
    ctx.fill();

    // —— 四爪（前肢 s≈0.30，后肢 s≈0.66，两腿反相）——
    drawLeg(ctx, g, 0.30, P, st.finPhase, L * 0.105);
    drawLeg(ctx, g, 0.66, P, st.finPhase + Math.PI * 0.6, L * 0.098);

    // —— 龙身 + 体积光 + 鳞片 ——
    paintBody(ctx, g, P);
    paintScales(ctx, g, P);

    // —— 虹彩反光带：沿体轴滑动，颜色跟着所在体段的色相走 ——
    var gp = 0.5 + 0.42 * Math.sin(st.phase * 0.6);
    ctx.save();
    bodyPath(ctx, g);
    ctx.clip();
    var sh = mixHue(P.hues, clamp01(gp));
    var sheen = ctx.createLinearGradient(-L * 0.1, 0, L * 1.1, 0);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(clamp01(gp - 0.20), 'rgba(255,255,255,0)');
    sheen.addColorStop(clamp01(gp), hsl(sh, 95, 78, 0.44));
    sheen.addColorStop(clamp01(gp + 0.20), 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(-L * 0.25, -L * 0.35, L * 1.7, L * 0.7);
    ctx.restore();

    // —— 体轮廓 ——
    bodyPath(ctx, g);
    ctx.strokeStyle = P.line; ctx.lineWidth = 1.1; ctx.stroke();

    // —— 鬃毛（头后一撮，画在背线之上）——
    ctx.fillStyle = P.mane;
    spikeRidge(ctx, g, 0.15, 0.28, L * 0.070, -1, st.phase * 1.3, 5);
    ctx.fill();

    // —— 鳃裂 ——
    s = 0.145; i = Math.round(s * N); p = g.pts[i]; n = g.nor[i]; hh = halfH(s);
    ctx.beginPath();
    ctx.moveTo(p.x - n.x * hh * 0.92, p.y - n.y * hh * 0.92);
    ctx.quadraticCurveTo(p.x + n.x * hh * 0.05, p.y + n.y * hh * 0.05,
                         p.x + n.x * hh * 0.80, p.y + n.y * hh * 0.80);
    ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.stroke();

    // —— 龙角（两支，从颅顶向后上长出）——
    s = 0.05; i = Math.round(s * N); p = g.pts[i]; n = g.nor[i]; hh = halfH(s);
    var hbx = p.x - n.x * hh * 0.82, hby = p.y - n.y * hh * 0.82;
    var upAng = Math.atan2(-n.y, -n.x) - 0.55;
    drawHorn(ctx, hbx, hby, upAng, L * 0.150, L * 0.019, P.horn);
    drawHorn(ctx, hbx, hby, upAng - 0.34, L * 0.105, L * 0.015, P.horn);

    // —— 口裂 + 獠牙 ——
    var mp = g.pts[0], mn = g.nor[0], mhh = halfH(0) * 1.05;
    ctx.beginPath();
    ctx.moveTo(mp.x + L * 0.014, mp.y + mn.y * mhh * 1.05);
    ctx.quadraticCurveTo(mp.x + L * 0.052, mp.y + mn.y * mhh * 1.95,
                         mp.x + L * 0.105, mp.y + mn.y * mhh * 1.15);
    ctx.strokeStyle = P.mouth; ctx.lineWidth = L * 0.010; ctx.stroke();
    ctx.fillStyle = P.belly;
    for (var tk = 0; tk < 2; tk++) {
      var txx = mp.x + L * (0.030 + tk * 0.030);
      var tyy = mp.y + mn.y * mhh * (1.30 + tk * 0.28);
      ctx.beginPath();
      ctx.moveTo(txx, tyy);
      ctx.lineTo(txx + L * 0.012, tyy + mn.y * mhh * 0.55);
      ctx.lineTo(txx + L * 0.024, tyy);
      ctx.closePath();
      ctx.fill();
    }

    // —— 鼻孔 ——
    var ni = Math.round(0.022 * N);
    var np = g.pts[ni], nn = g.nor[ni], nhh = halfH(0.022) * 0.55;
    ctx.beginPath();
    ctx.arc(np.x - nn.x * nhh, np.y - nn.y * nhh, L * 0.0075, 0, 6.2832);
    ctx.fillStyle = P.mouth; ctx.fill();

    // —— 眼（金眶竖瞳）——
    s = 0.085; i = Math.round(s * N); p = g.pts[i]; n = g.nor[i]; hh = halfH(s);
    var ex = p.x - n.x * hh * 0.42, ey = p.y - n.y * hh * 0.42;
    var er = L * 0.024;
    ctx.beginPath(); ctx.arc(ex, ey, er, 0, 6.2832);
    ctx.fillStyle = P.eyeRing; ctx.fill();
    ctx.strokeStyle = P.line; ctx.lineWidth = 0.8; ctx.stroke();
    if (st.blink > 0) {
      ctx.save();
      ctx.beginPath(); ctx.arc(ex, ey, er, 0, 6.2832); ctx.clip();
      ctx.fillStyle = P.horn;
      ctx.fillRect(ex - er, ey - er, er * 2, er * 2 * clamp01(st.blink));
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.ellipse(ex, ey, er * 0.52, er * 0.78, 0, 0, 6.2832);
      ctx.fillStyle = hsl(P.eyeIris, 92, 58); ctx.fill();
      ctx.beginPath();
      ctx.ellipse(ex, ey, er * 0.17, er * 0.62, 0, 0, 6.2832);
      ctx.fillStyle = P.eye; ctx.fill();
      ctx.beginPath();
      ctx.arc(ex - er * 0.28, ey - er * 0.38, er * 0.20, 0, 6.2832);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    }

    // —— 龙须：两根长须，随行波飘（最上层，会拂过身体）——
    ctx.strokeStyle = P.whisker;
    ctx.lineCap = 'round';
    for (var wk = 0; wk < 2; wk++) {
      var sg = wk === 0 ? 1 : -1;
      var sway = Math.sin(st.phase * 0.85 + wk * 1.7) * L * 0.055;
      var sx = mp.x + L * 0.035;
      var sy = mp.y + mn.y * mhh * (0.35 + wk * 1.15);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx - L * 0.16, sy + mn.y * L * 0.075 * sg + sway,
                           sx - L * 0.32, sy + mn.y * L * 0.115 * sg + sway * 2);
      ctx.quadraticCurveTo(sx - L * 0.44, sy + mn.y * L * 0.130 * sg + sway * 2.6,
                           sx - L * 0.52, sy + mn.y * L * 0.055 * sg + sway * 3);
      ctx.lineWidth = L * (wk === 0 ? 0.0085 : 0.0065);
      ctx.stroke();
    }

    ctx.restore();
  }

  // 行为档案：与金龙鱼同为全屏自由游动 + 气泡（同权同级，行为也同源）
  var DRAGON_PROFILE = {
    speed: { wander: 62, hover: 8, dash: 235 },
    modeDur: { wander: [5, 11], hover: [3, 7], dash: [1.2, 2.6] },
    headingMode: 'free',      // 全屏任意方向游动
    band: null,               // 无活动带限制
    blink: [2.5, 8],
    particles: 'bubbles'
  };

  root.Dragon = {
    L: L, draw: draw, PROFILE: DRAGON_PROFILE, PALETTES: PALETTES
  };

  // 自注册进宠物池（registry 已加载时才有效）
  if (root.PetRegistry) {
    root.PetRegistry.register({
      id: 'dragon',
      name: '五彩金龙',
      L: L,
      palette: 0,
      iconScale: 0.15,
      profile: DRAGON_PROFILE,
      PALETTES: PALETTES,
      draw: draw,
      drawIcon: null
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
