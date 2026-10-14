/*
 * _common.js — 陆地/飞行宠物的共享绘制工具（纯几何，不依赖具体物种）
 *
 * 约定：所有陆地动物的 draw 在局部坐标里以「身体中心」为原点，
 *       +x 为前进方向（头朝 +x），+y 指向屏幕下方（腹部）。
 *       st.x/st.y 即身体中心；st.heading 决定朝向（陆地动物只有 0 或 π）。
 */
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /*
   * 通用朝向变换：任意 heading 下宠物都保持 upright（不会翻肚）。
   * 推导：facing = sign(cos h)；pitch = atan2(sin h * facing, |cos h|)；
   * 朝左时镜像 x。这样直线朝上/朝下/朝左都不会出现倒置突变。
   */
  function facingTransform(ctx, st) {
    var ch = Math.cos(st.heading), sh = Math.sin(st.heading);
    var facing = ch >= 0 ? 1 : -1;
    var pitch = Math.atan2(sh * facing, Math.max(0.15, Math.abs(ch)));
    ctx.save();
    ctx.translate(st.x, st.y);
    ctx.scale(st.scale, st.scale);
    ctx.rotate(pitch);
    if (facing < 0) ctx.scale(-1, 1);
  }

  function ellipse(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
  }

  /*
   * 眼睛：眼圈 + 瞳孔 + 高光；blink>0 时用体色"眼皮"从上往下盖。
   * cover 传该动物体色，盖下来才自然。
   */
  function drawEye(ctx, ex, ey, r, blink, iris, ring, cover) {
    ellipse(ctx, ex, ey, r, r);
    ctx.fillStyle = ring; ctx.fill();
    ellipse(ctx, ex, ey, r * 0.58, r * 0.58);
    ctx.fillStyle = iris; ctx.fill();
    if (blink > 0) {
      ctx.save();
      ellipse(ctx, ex, ey, r, r);
      ctx.clip();
      ctx.fillStyle = cover;
      ctx.fillRect(ex - r, ey - r, r * 2, r * 2 * clamp(blink, 0, 1));
      ctx.restore();
    } else {
      ellipse(ctx, ex + r * 0.16, ey - r * 0.24, r * 0.22, r * 0.22);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    }
  }

  // 对角步态（trot）相位偏移：前左/前右/后左/后右
  var TROT = [0, Math.PI, Math.PI, 0];

  // 单腿摆角：a = sin(gait + offset) * swing
  function legAngle(gait, offset, swing) { return Math.sin(gait + offset) * swing; }

  // 圆头粗线段（腿/尾/触须）
  function limb(ctx, x1, y1, x2, y2, w, color) {
    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.lineWidth = w;
    ctx.strokeStyle = color;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // 圆头二次曲线肢体（摇摆的尾巴）
  function limbCurve(ctx, x1, y1, cx, cy, x2, y2, w, color) {
    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.lineWidth = w;
    ctx.strokeStyle = color;
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.stroke();
  }

  // 两段式腿：髋->膝->爪，膝与爪随摆角横移，爪部落点贴地
  function drawLeg(ctx, hx, hy, gait, offset, swing, color, L) {
    var a = legAngle(gait, offset, swing);
    var kx = hx + a * 0.16 * L, ky = hy + 0.14 * L;
    var fx = hx + a * 0.30 * L, fy = hy + 0.27 * L;
    limb(ctx, hx, hy, kx, ky, 0.08 * L, color);
    limb(ctx, kx, ky, fx, fy, 0.062 * L, color);
    ellipse(ctx, fx, fy, 0.052 * L, 0.034 * L);
    ctx.fillStyle = color; ctx.fill();
  }

  /*
   * shadedEllipse：带体积光的椭圆——先铺实色底，再叠一层径向渐变
   * （左上受光变亮、右下转暗），让扁平色块立刻有球体/体积感。
   * 对任意 base 颜色都有效（用白/黑半透明叠加，无需预先算亮暗色）。
   * strength 默认 1，调小让光影更柔和。
   */
  function shadedEllipse(ctx, cx, cy, rx, ry, base, strength, rot) {
    var s = (strength == null) ? 1 : strength;
    ellipse(ctx, cx, cy, rx, ry, rot);
    ctx.fillStyle = base;
    ctx.fill();
    var m = Math.max(rx, ry);
    var g = ctx.createRadialGradient(
      cx - rx * 0.32, cy - ry * 0.42, m * 0.05,
      cx + rx * 0.04, cy + ry * 0.06, m * 1.18
    );
    g.addColorStop(0, 'rgba(255,255,255,' + (0.50 * s).toFixed(3) + ')');
    g.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + (0.30 * s).toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fill();
  }

  /*
   * groundShadow：贴在地面的软阴影椭圆。应在 facingTransform 之前调用，
   * 用屏幕坐标定位（不随宠物朝向旋转），给陆地动物"落地"的踏实感。
   */
  function groundShadow(ctx, x, y, rx, ry, alpha) {
    var a = (alpha == null) ? 0.16 : alpha;
    ellipse(ctx, x, y, rx, ry);
    ctx.fillStyle = 'rgba(0,0,0,' + a.toFixed(3) + ')';
    ctx.fill();
  }

  root.PetCommon = {
    TAU: TAU, clamp: clamp, lerp: lerp,
    facingTransform: facingTransform,
    ellipse: ellipse, drawEye: drawEye,
    TROT: TROT, legAngle: legAngle,
    limb: limb, limbCurve: limbCurve, drawLeg: drawLeg,
    shadedEllipse: shadedEllipse, groundShadow: groundShadow
  };
})(typeof window !== 'undefined' ? window : globalThis);
