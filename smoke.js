// 离屏冒烟：假 canvas 跑 1200 帧（双鱼），检查无 NaN、坐标量级正常
global.window = globalThis;
require('./src/fish.js');
require('./src/brain.js');
require('./src/bubble.js');

let bad = 0;
const bbox = { minX: 1e9, minY: 1e9, maxX: -1e9, maxY: -1e9 };

function num(name, args) {
  for (const v of args) {
    if (typeof v !== 'number' || !isFinite(v)) {
      bad++;
      if (bad < 5) console.error('NaN/非法参数:', name, args);
      return false;
    }
  }
  return true;
}
function pt(name, x, y) {
  if (!num(name, [x, y])) return;
  bbox.minX = Math.min(bbox.minX, x); bbox.maxX = Math.max(bbox.maxX, x);
  bbox.minY = Math.min(bbox.minY, y); bbox.maxY = Math.max(bbox.maxY, y);
}

const grad = {
  addColorStop(o, c) {
    if (!isFinite(o) || o < 0 || o > 1) { bad++; console.error('非法渐变 stop:', o); }
    if (typeof c !== 'string' || /NaN|undefined/.test(c)) { bad++; console.error('非法颜色:', c); }
  }
};
const noop = () => {};
const ctx = {
  save: noop, restore: noop,
  translate: (...a) => num('translate', a),
  scale: (...a) => num('scale', a),
  rotate: (...a) => num('rotate', a),
  setTransform: (...a) => num('setTransform', a),
  beginPath: noop, closePath: noop, clip: noop, fill: noop, stroke: noop,
  moveTo: (x, y) => pt('moveTo', x, y),
  lineTo: (x, y) => pt('lineTo', x, y),
  quadraticCurveTo: (a, b, c, d) => { num('quad', [a, b, c, d]); pt('quadEnd', c, d); },
  arc: (x, y, r, s, e) => { num('arc', [x, y, r, s, e]); if (r < 0) { bad++; console.error('负半径', r); } },
  fillRect: (...a) => num('fillRect', a),
  clearRect: noop,
  createLinearGradient: (...a) => { num('gradient', a); return grad; },
  fillStyle: '', strokeStyle: '', lineWidth: 1
};

const W = 1920, H = 1080;
const st1 = Brain.create(W, H);
st1.scale = 1; st1.palette = 0; st1.x = W * 0.40; st1.y = H * 0.45;
const st2 = Brain.create(W, H);
st2.scale = 0.85; st2.palette = 1; st2.x = W * 0.62; st2.y = H * 0.58;
st2.phase += 2.1;
const bs1 = Bubbles.create();
const bs2 = Bubbles.create();
const dt = 1 / 60;

function checkBounds(st, tag) {
  if (!isFinite(st.x) || !isFinite(st.y) || !isFinite(st.heading) || !isFinite(st.phase)) {
    bad++; console.error(tag, '状态出现 NaN'); return false;
  }
  if (st.x < 0 || st.x > W || st.y < 0 || st.y > H) {
    bad++; console.error(tag, '游出屏幕', st.x.toFixed(1), st.y.toFixed(1)); return false;
  }
  return true;
}

for (let i = 0; i < 1200; i++) {
  Brain.update(st1, dt, W, H);
  Brain.update(st2, dt, W, H);
  Bubbles.update(bs1, dt, st1, Fish.L);
  Bubbles.update(bs2, dt, st2, Fish.L);
  if (i % 10 === 0) { Fish.draw(ctx, st1); Fish.draw(ctx, st2); }
  Bubbles.draw(ctx, bs1);
  Bubbles.draw(ctx, bs2);
  if (!checkBounds(st1, '鱼1') || !checkBounds(st2, '鱼2')) break;
}

// 拖拽路径（鱼1）
Brain.startDrag(st1, st1.x, st1.y);
Brain.dragTo(st1, 100, 100);
for (let i = 0; i < 60; i++) Brain.update(st1, dt, W, H);
Brain.endDrag(st1, W, H);
for (let i = 0; i < 120; i++) Brain.update(st1, dt, W, H);
Fish.draw(ctx, st1);
Fish.draw(ctx, st2);

// 托盘图标参数（小尺寸，双色各画一次）
Fish.draw(ctx, { x: 30, y: 32, scale: 0.20, heading: 0, phase: 1.1, curv: 0, ampScale: 0.9, finPhase: 0, blink: 1, palette: 0 });
Fish.draw(ctx, { x: 30, y: 32, scale: 0.20, heading: 0, phase: 1.1, curv: 0, ampScale: 0.9, finPhase: 0, blink: 0, palette: 1 });

console.log('绘制包围盒(鱼局部坐标):', JSON.stringify(bbox, (k, v) => typeof v === 'number' ? +v.toFixed(1) : v));
console.log('体长 L =', Fish.L, '| 鱼1气泡 =', bs1.bubbles.length, '| 鱼2气泡 =', bs2.bubbles.length);
console.log(bad === 0 ? 'SMOKE OK — 无 NaN，坐标量级正常' : 'SMOKE FAIL — ' + bad + ' 处问题');
process.exit(bad === 0 ? 0 : 1);
