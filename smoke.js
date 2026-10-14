// 离屏冒烟：遍历 PetRegistry 全部物种，检查无 NaN、坐标量级正常；并验证 PetPool 机制
global.window = globalThis;
require('./src/registry.js');
require('./src/brain.js');
require('./src/bubble.js');
const PetPool = require('./src/petpool.js');

// 注册所有宠物（与 main.js 的注册顺序保持一致）
require('./src/pets/fish.js');
require('./src/pets/_common.js');
require('./src/pets/cat.js');
require('./src/pets/dog.js');
require('./src/pets/turtle.js');
require('./src/pets/frog.js');
require('./src/pets/bird.js');

const Registry = globalThis.PetRegistry;
const ids = Registry.ids();
if (ids.length === 0) {
  console.error('SMOKE FAIL — 注册表为空');
  process.exit(1);
}

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
  ellipse: (x, y, rx, ry, rot, s, e) => { num('ellipse', [x, y, rx, ry, rot, s, e]); if (rx < 0 || ry < 0) { bad++; console.error('负椭圆半径', rx, ry); } },
  fillRect: (...a) => num('fillRect', a),
  clearRect: noop,
  createLinearGradient: (...a) => { num('gradient', a); return grad; },
  fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1
};

const W = 1920, H = 1080;
const dt = 1 / 60;

// 每个物种跑 800 帧：update + particles + draw，校验状态与包围盒
for (const id of ids) {
  const def = Registry.get(id);
  const st = Brain.create(W, H, def.profile);
  st.palette = def.palette || 0;
  st.scale = 1;
  if (def.profile.band) {
    st.y = H * (def.profile.band[0] + def.profile.band[1]) / 2;
  }
  const bs = Bubbles.create();

  for (let i = 0; i < 800; i++) {
    Brain.update(st, dt, W, H);
    if (def.profile.particles !== 'none') Bubbles.update(bs, dt, st, def.L);
    if (i % 10 === 0) def.draw(ctx, st);
    if (def.profile.particles !== 'none') Bubbles.draw(ctx, bs);
    if (!isFinite(st.x) || !isFinite(st.y) || !isFinite(st.heading) || !isFinite(st.phase)) {
      bad++; console.error(id, '状态出现 NaN'); break;
    }
    if (st.x < 0 || st.x > W || st.y < 0 || st.y > H) {
      bad++; console.error(id, '游出屏幕', st.x.toFixed(1), st.y.toFixed(1)); break;
    }
    // 陆地动物必须留在活动带
    if (def.profile.band) {
      if (st.y < def.profile.band[0] * H - 1 || st.y > def.profile.band[1] * H + 1) {
        bad++; console.error(id, '越出活动带', st.y.toFixed(1)); break;
      }
    }
  }

  // 拖拽路径
  Brain.startDrag(st, st.x, st.y);
  Brain.dragTo(st, 200, 200);
  for (let i = 0; i < 60; i++) Brain.update(st, dt, W, H);
  Brain.endDrag(st, W, H);
  for (let i = 0; i < 120; i++) Brain.update(st, dt, W, H);
  def.draw(ctx, st);

  // 托盘小图标
  def.draw(ctx, {
    x: 30, y: 32, scale: def.iconScale || 0.20, heading: 0, phase: 1.1,
    curv: 0, ampScale: 0.9, finPhase: 0, blink: 1, palette: def.palette || 0,
    profile: def.profile
  });

  console.log(`  [${id}] L=${def.L} 气泡=${def.profile.particles !== 'none' ? bs.bubbles.length : '-'} 末位置=(${st.x.toFixed(0)},${st.y.toFixed(0)})`);
}

// PetPool 机制：多成员时永不选到 exclude 且均匀覆盖
if (ids.length > 1) {
  for (let i = 0; i < 2000; i++) {
    const p = PetPool.pick(ids, ids[0]);
    if (p === ids[0]) { bad++; console.error('PetPool 选到了当前宠物'); break; }
    if (ids.indexOf(p) === -1) { bad++; console.error('PetPool 选出了池外 id:', p); break; }
  }
  const counts = {};
  for (let i = 0; i < 2000; i++) {
    const p = PetPool.pick(ids, ids[0]);
    counts[p] = (counts[p] || 0) + 1;
  }
  const covered = Object.keys(counts).length;
  if (covered !== ids.length - 1) {
    bad++; console.error('PetPool 覆盖不全，期望', ids.length - 1, '实得', covered);
  }
}
// 单成员退化：exclude 唯一成员时返回它自身（等价"池里只有它，只能还是它"）
if (PetPool.pick(['solo'], 'solo') !== 'solo') { bad++; console.error('PetPool 单成员退化异常'); }
// 空池兜底
if (PetPool.pick([], 'x') !== 'x') { bad++; console.error('PetPool 空池兜底异常'); }

console.log('注册物种:', ids.join(', '));
console.log('绘制包围盒(局部坐标):', JSON.stringify(bbox, (k, v) => typeof v === 'number' ? +v.toFixed(1) : v));
console.log(bad === 0 ? 'SMOKE OK — 全部物种无 NaN，PetPool 机制正确' : 'SMOKE FAIL — ' + bad + ' 处问题');
process.exit(bad === 0 ? 0 : 1);
