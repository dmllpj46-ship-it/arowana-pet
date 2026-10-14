/*
 * bubble.js — 气泡与尾流微粒
 * 气泡从吻端生成后独立上浮（不再跟随鱼），横向按正弦轻摆。
 * 尾流微粒只在速度较高时从尾部拖出，方向与游向相反。
 */
(function (root) {
  'use strict';

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function create() { return { bubbles: [], motes: [], bt: rnd(0.5, 2.5), mt: 0 }; }

  function mouthPt(st, L) {
    // 口部在身体中心沿 heading 的「前方」：局部坐标吻端在 x=0、质心在 0.42L，
    // 所以质心到吻端是 +0.42L 方向（与 heading 同向）。
    var d = 0.42 * L * st.scale;
    var px = -Math.sin(st.heading), py = Math.cos(st.heading); // 腹部法向
    var off = 0.035 * L * st.scale;
    return {
      x: st.x + Math.cos(st.heading) * d + px * off,
      y: st.y + Math.sin(st.heading) * d + py * off
    };
  }

  function update(bs, dt, st, L) {
    var i;
    bs.bt -= dt;
    if (bs.bt <= 0) {
      var m = mouthPt(st, L);
      // 大泡泡：基础 6~13px，25% 概率来颗 14~20px 的巨型泡
      var big = Math.random() < 0.25;
      var r0 = (big ? rnd(14, 20) : rnd(6, 13)) * st.scale;
      bs.bubbles.push({
        x: m.x, y: m.y, r: r0,
        vy: rnd(28, 58) + r0 * 1.2, seed: rnd(0, 6.283), life: 0,
        hue: rnd(0, 360)
      });
      bs.bt = rnd(0.9, 2.4);
    }
    for (i = bs.bubbles.length - 1; i >= 0; i--) {
      var b = bs.bubbles[i];
      b.life += dt;
      b.hue = (b.hue + dt * 25) % 360;
      b.y -= b.vy * dt;
      b.x += Math.sin(b.life * 2.4 + b.seed) * 14 * dt;
      b.r += dt * 1.2;
      if (b.y < -30 || b.life > 9) bs.bubbles.splice(i, 1);
    }

    bs.mt -= dt;
    // 尾流从尾部拖出：质心沿 heading 的反方向 0.55L 处（尾柄在后方）
    if (bs.mt <= 0 && st.speed > 90) {
      var tx = st.x - Math.cos(st.heading) * 0.55 * L * st.scale;
      var ty = st.y - Math.sin(st.heading) * 0.55 * L * st.scale;
      bs.motes.push({
        x: tx + rnd(-8, 8), y: ty + rnd(-8, 8),
        vx: -Math.cos(st.heading) * rnd(10, 32) + rnd(-8, 8),
        vy: -Math.sin(st.heading) * rnd(10, 32) + rnd(-8, 8),
        life: 0, max: rnd(0.7, 1.6), r: rnd(1, 2.4)
      });
      bs.mt = 0.05;
    }
    for (i = bs.motes.length - 1; i >= 0; i--) {
      var p = bs.motes[i];
      p.life += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.985; p.vy *= 0.985;
      if (p.life > p.max) bs.motes.splice(i, 1);
    }
  }

  function draw(ctx, bs) {
    var i, a;
    for (i = 0; i < bs.motes.length; i++) {
      var p = bs.motes[i];
      a = (1 - p.life / p.max) * 0.35;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
      ctx.arc(p.x, p.y, p.r, 0, 6.2832);
      ctx.fill();
    }
    for (i = 0; i < bs.bubbles.length; i++) {
      var b = bs.bubbles[i];
      var h = b.hue.toFixed(1);
      var h2 = ((b.hue + 60) % 360).toFixed(1);
      a = Math.max(0, 1 - b.life / 7) * 0.9;
      if (a <= 0) continue;
      var rimW = Math.max(1.5, b.r * 0.16);
      // 彩色泡体
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, 6.2832);
      ctx.fillStyle = 'hsla(' + h + ',85%,65%,' + (a * 0.22).toFixed(3) + ')';
      ctx.fill();
      // 彩色外圈
      ctx.strokeStyle = 'hsla(' + h + ',95%,68%,' + a.toFixed(3) + ')';
      ctx.lineWidth = rimW;
      ctx.stroke();
      // 虹彩高光弧（偏色邻近色，只画一段）
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.82, -2.4, -0.5);
      ctx.strokeStyle = 'hsla(' + h2 + ',95%,78%,' + (a * 0.9).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, b.r * 0.10);
      ctx.stroke();
      // 白色镜面高光点
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, Math.max(1, b.r * 0.20), 0, 6.2832);
      ctx.fillStyle = 'rgba(255,255,255,' + (a * 0.75).toFixed(3) + ')';
      ctx.fill();
    }
  }

  root.Bubbles = { create: create, update: update, draw: draw };
})(typeof window !== 'undefined' ? window : globalThis);
