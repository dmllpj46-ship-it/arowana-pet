// 离屏冒烟：遍历 PetRegistry 全部物种，检查无 NaN、坐标量级正常；并验证 PetPool 机制
global.window = globalThis;
require('./src/registry.js');
require('./src/brain.js');
require('./src/bubble.js');
const PetPool = require('./src/petpool.js');
const CFG = require('./src/config.js');

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
  createRadialGradient: (...a) => { num('radialGradient', a); return grad; },
  fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1
};

const W = 1920, H = 1080;
const dt = 1 / 60;

// 每个物种跑 800 帧：update + particles + draw，校验状态与包围盒
// 遍历该物种全部配色变体（验证随机配色不会引入 NaN/非法色）
for (const id of ids) {
  const def = Registry.get(id);
  const variants = (def.PALETTES && def.PALETTES.length) ? def.PALETTES.length : 1;
  for (let pv = 0; pv < variants; pv++) {
  const st = Brain.create(W, H, def.profile);
  st.palette = pv;
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

  console.log(`  [${id}] L=${def.L} 变体=${variants} 气泡=${def.profile.particles !== 'none' ? bs.bubbles.length : '-'} 末位置=(${st.x.toFixed(0)},${st.y.toFixed(0)})`);
  }
}

// ---- 主动避让光标 ----
// 用同一物种跑对照：有光标 / 无光标，验证
//   1) 光标压上来时，宠物与光标的距离最终 > AVOID_R（躲开了）
//   2) 同一随机序列下，没有光标时宠物允许靠近（避让真的生效，不是巧合）
//   3) 躲开后仍留在屏幕内 / 活动带内，且无 NaN
const AVOID_R = CFG.AVOID_R;
{
  function seeded(seed) {
    Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  }
  const def = Registry.get('fish');

  // 光标固定在屏幕中心，宠物从中心出发（初始距离 0，最坏情况）。
  // 期望：最终稳定在 AVOID_R 之外，且不会逃到天边（说明躲开了，但没panic）。
  const cur = { x: W * 0.5, y: H * 0.5 };
  seeded(12345);
  const st = Brain.create(W, H, def.profile);
  st.scale = 1;
  st.x = cur.x; st.y = cur.y;
  let min = Infinity, end = null;
  for (let i = 0; i < 2400; i++) {
    Brain.setCursor(st, cur);
    Brain.update(st, dt, W, H);
    const d = Math.hypot(st.x - cur.x, st.y - cur.y);
    if (d < min) min = d;
    if (i > 1800) end = { d: d, x: st.x, y: st.y };
    if (!isFinite(st.x) || !isFinite(st.y) || !isFinite(st.heading)) {
      bad++; console.error('避让过程中状态 NaN'); break;
    }
    if (st.x < 0 || st.x > W || st.y < 0 || st.y > H) {
      bad++; console.error('避让过程中游出屏幕', st.x.toFixed(1), st.y.toFixed(1)); break;
    }
  }
  console.log(`避让: AVOID_R=${AVOID_R}px  瞬时最近=${min.toFixed(0)}px  稳定距离=${end.d.toFixed(0)}px  稳定位置=(${end.x.toFixed(0)},${end.y.toFixed(0)})`);

  // 稳定后必须待在避让圈外（0.9 倍余量：允许它擦边绕行，但不压上去）
  if (end.d < AVOID_R * 0.9) {
    bad++; console.error('宠物没躲开光标，稳定距离', end.d.toFixed(0), '期望 >', (AVOID_R * 0.9).toFixed(0));
  }
  // 也不能逃到屏幕角落装死
  const margin = 120;
  if (end.x < margin || end.x > W - margin || end.y < margin || end.y > H - margin) {
    bad++; console.error('宠物躲到了屏幕边缘不回来了', end.x.toFixed(0), end.y.toFixed(0));
  }

  // 对照：光标在角落时，宠物应当能正常游到那一带（避让不是「永远不敢靠近」）
  {
    seeded(999);
    const s2 = Brain.create(W, H, def.profile);
    s2.scale = 1;
    const far = { x: W * 0.5, y: H - 140 };
    let minFar = Infinity;
    for (let i = 0; i < 3600; i++) {
      Brain.setCursor(s2, far);
      Brain.update(s2, dt, W, H);
      const d = Math.hypot(s2.x - far.x, s2.y - far.y);
      if (d < minFar) minFar = d;
    }
    console.log(`对照(光标在下方): 最近=${minFar.toFixed(0)}px  期望能进到 ${(AVOID_R * 1.2).toFixed(0)}px 内`);
    if (minFar > AVOID_R * 1.2) {
      bad++; console.error('宠物从不靠近光标（躲避过头，疑似一直在跑）', minFar.toFixed(0));
    }
  }

  // 陆地物种：光标在正上方也必须横向躲开，且不能越出活动带
  for (const id of ['cat', 'dog', 'turtle', 'frog']) {
    const d2 = Registry.get(id);
    seeded(4242);
    const st2 = Brain.create(W, H, d2.profile);
    st2.scale = 1;
    if (d2.profile.band) st2.y = H * (d2.profile.band[0] + d2.profile.band[1]) / 2;
    const above = { x: st2.x, y: st2.y - 90 };
    for (let i = 0; i < 1800; i++) {
      Brain.setCursor(st2, above);
      Brain.update(st2, dt, W, H);
      if (st2.y < d2.profile.band[0] * H - 1 || st2.y > d2.profile.band[1] * H + 1) {
        bad++; console.error(id, '避让时越出活动带', st2.y.toFixed(1)); break;
      }
    }
    const dx = Math.abs(st2.x - above.x);
    if (dx < 150) {
      bad++; console.error(id, '光标在正上方时没有横向躲开 (dx=' + dx.toFixed(0) + ')');
    }
    console.log(`  [${id}] 光标在正上方 -> 横向躲开了 ${dx.toFixed(0)}px`);
  }
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

// 加权选取：不选 exclude、不越界；权重高的命中率应明显更高
const WEIGHTS = CFG.WEIGHTS;
{
  const wCounts = {};
  for (let i = 0; i < 6000; i++) {
    const p = PetPool.pickWeighted(ids, 'fish', WEIGHTS);
    if (p === 'fish') { bad++; console.error('pickWeighted 选到了 exclude'); break; }
    if (ids.indexOf(p) === -1) { bad++; console.error('pickWeighted 选出池外 id:', p); break; }
    wCounts[p] = (wCounts[p] || 0) + 1;
  }
  // 排除 fish 后，其余应等概率（权重全为1）。检查无成员为 0（都出现过）
  for (const id of ids) {
    if (id === 'fish') continue;
    if (!wCounts[id]) { bad++; console.error('pickWeighted 漏掉了', id); }
  }
  // fish 权重5：从不带 exclude 的抽取里，fish 命中率应 ≈ 5/10 = 50%
  const fc = {}; for (let i = 0; i < 6000; i++) { const p = PetPool.pickWeighted(ids, null, WEIGHTS); fc[p] = (fc[p] || 0) + 1; }
  const fishRate = (fc.fish || 0) / 6000;
  console.log('加权命中率: fish=' + (fishRate * 100).toFixed(1) + '% (期望≈50%)');
  if (fishRate < 0.42 || fishRate > 0.58) { bad++; console.error('fish 加权命中率偏离期望:', (fishRate * 100).toFixed(1) + '%'); }
}

console.log('注册物种:', ids.join(', '));
console.log('绘制包围盒(局部坐标):', JSON.stringify(bbox, (k, v) => typeof v === 'number' ? +v.toFixed(1) : v));
console.log(bad === 0 ? 'SMOKE OK — 全部物种无 NaN，PetPool 机制正确' : 'SMOKE FAIL — ' + bad + ' 处问题');
process.exit(bad === 0 ? 0 : 1);
