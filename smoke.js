// 离屏冒烟：遍历 PetRegistry 全部物种，检查无 NaN、坐标量级正常；并验证 PetPool 机制
global.window = globalThis;
require('./src/registry.js');
require('./src/brain.js');
require('./src/bubble.js');
const PetPool = require('./src/petpool.js');
const CFG = require('./src/config.js');

// 注册所有宠物（与 main.js 的注册顺序保持一致）
require('./src/pets/fish.js');
require('./src/pets/dragon.js');
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

// 加权选取：不选 exclude、不越界；命中率应严格符合 CFG.WEIGHTS 的比例
const WEIGHTS = CFG.WEIGHTS;
{
  const wCounts = {};
  for (let i = 0; i < 6000; i++) {
    const p = PetPool.pickWeighted(ids, 'fish', WEIGHTS);
    if (p === 'fish') { bad++; console.error('pickWeighted 选到了 exclude'); break; }
    if (ids.indexOf(p) === -1) { bad++; console.error('pickWeighted 选出池外 id:', p); break; }
    wCounts[p] = (wCounts[p] || 0) + 1;
  }
  // 排除 fish 后每个成员都必须出现过（漏了说明权重表写错 id）
  for (const id of ids) {
    if (id === 'fish') continue;
    if (!wCounts[id]) { bad++; console.error('pickWeighted 漏掉了', id); }
  }

  // 命中率期望 = 自身权重 / 总权重（按 POOL 实际在池内的成员算，别拿注册表全集）
  const poolIds = ids.filter((id) => CFG.POOL.indexOf(id) !== -1);
  const totalW = poolIds.reduce((s, id) => s + (WEIGHTS[id] > 0 ? WEIGHTS[id] : 1), 0);
  const N = 20000;
  const fc = {};
  for (let i = 0; i < N; i++) {
    const p = PetPool.pickWeighted(poolIds, null, WEIGHTS);
    fc[p] = (fc[p] || 0) + 1;
  }
  for (const id of poolIds) {
    const w = WEIGHTS[id] > 0 ? WEIGHTS[id] : 1;
    const exp = w / totalW;
    const got = (fc[id] || 0) / N;
    console.log(`加权命中率: ${id}=${(got * 100).toFixed(1)}% (期望≈${(exp * 100).toFixed(1)}%)`);
    if (Math.abs(got - exp) > 0.02) {
      bad++; console.error('加权命中率偏离期望:', id, (got * 100).toFixed(1) + '% vs', (exp * 100).toFixed(1) + '%');
    }
  }
  // 金龙鱼与五彩金龙必须同权：两者命中率差异在采样噪声内
  if (WEIGHTS.fish !== WEIGHTS.dragon) {
    bad++; console.error('dragon 权重应与 fish 相同，实得', WEIGHTS.fish, '/', WEIGHTS.dragon);
  }
  if (Math.abs((fc.fish || 0) - (fc.dragon || 0)) > N * 0.02) {
    bad++; console.error('fish 与 dragon 同权但命中率差太多');
  }
}

// ---- 前向移动验证：鱼/龙的「头」必须朝 heading 前方，「尾」拖在后方 ----
// smoke 用的 mock canvas 不维护变换矩阵，测不了朝向，所以这里另用一个维护矩阵的迷你 canvas：
// 记录每个路径点的「局部坐标 + 世界坐标」。判据（不依赖具体画法细节）：
//   - 局部 x 最小的点是须尖/口裂（龙须是全身唯一伸到吻端 x<0 之外的东西）-> 必须投影到 heading 前方
//   - 局部 x 最大的点是尾鳍/飘带尖端 -> 必须投影到 heading 后方
// 两条同时成立 = 头朝前游；任一不成立 = 在倒退。
{
  const ID = [1, 0, 0, 1, 0, 0];   // [a,b,c,d,e,f]：x' = a·x + c·y + e, y' = b·x + d·y + f
  const mmul = (p, q) => [
    p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1],
    p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]
  ];
  const mapply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const noop = () => {};

  function makeCapCtx(pts) {
    const stack = [];
    let cur = ID.slice();
    // 只在「已应用变换」时采集：陆地动物在 facingTransform 之前会用屏幕坐标画
    // groundShadow，那些点是世界坐标，混进来会污染局部 x 的比较。
    const isId = () => cur === ID || (cur[0] === 1 && cur[1] === 0 && cur[2] === 0 &&
                                      cur[3] === 1 && cur[4] === 0 && cur[5] === 0);
    const put = (x, y) => { if (!isId()) pts.push({ lx: x, ly: y, w: mapply(cur, x, y) }); };
    return {
      save: () => stack.push(cur.slice()),
      restore: () => { cur = stack.length ? stack.pop() : ID.slice(); },
      translate: (tx, ty) => { cur = mmul(cur, [1, 0, 0, 1, tx, ty]); },
      scale: (sx, sy) => { cur = mmul(cur, [sx, 0, 0, sy, 0, 0]); },
      rotate: (r) => { cur = mmul(cur, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]); },
      setTransform: (a, b, c, d, e, f) => { cur = [a, b, c, d, e, f]; },
      moveTo: (x, y) => put(x, y),
      lineTo: (x, y) => put(x, y),
      quadraticCurveTo: (a, b, c, d) => put(c, d),
      arc: (x, y) => put(x, y),
      ellipse: (x, y) => put(x, y),
      beginPath: noop, closePath: noop, clip: noop, fill: noop, stroke: noop,
      fillRect: noop, clearRect: noop,
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
      fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, lineCap: ''
    };
  }

  // 鱼类（体轴行波 + 局部「吻端 x=0」）必须头朝前
  for (const id of ['fish', 'dragon']) {
    const d2 = Registry.get(id);
    if (!d2) { bad++; console.error('朝向验证：找不到物种', id); continue; }
    // 四个朝向：右 / 下 / 左 / 右上，覆盖 cos(heading) 正负与镜像分支
    for (const h of [0, Math.PI / 2, Math.PI, -Math.PI * 0.75]) {
      const pts = [];
      const st2 = Brain.create(W, H, d2.profile);
      st2.scale = 1; st2.palette = 0;
      st2.x = W * 0.5; st2.y = H * 0.5;
      st2.heading = h; st2.phase = 1.1; st2.curv = 0;
      st2.ampScale = 0.95; st2.finPhase = 0.4; st2.blink = 0;
      d2.draw(makeCapCtx(pts), st2);

      // 下限放低：小鸟（L=110）一帧只有 ~19 个路径点，但判断首尾极值不需要很多点
      if (pts.length < 12) {
        bad++; console.error(id, '朝向验证：采集到的点太少', pts.length); continue;
      }
      let head = pts[0], tail = pts[0];
      for (const p of pts) { if (p.lx < head.lx) head = p; if (p.lx > tail.lx) tail = p; }
      const ux = Math.cos(h), uy = Math.sin(h);
      const hp = (head.w[0] - st2.x) * ux + (head.w[1] - st2.y) * uy;
      const tp = (tail.w[0] - st2.x) * ux + (tail.w[1] - st2.y) * uy;
      const okFwd = hp > 0 && tp < 0;
      console.log(`  [${id}] heading=${h.toFixed(2)} 头投影=${hp.toFixed(1)}px 尾投影=${tp.toFixed(1)}px ${okFwd ? '前向 OK' : '倒退!!'}`);
      if (!okFwd) {
        bad++; console.error(id, '朝向错误（在倒退）：heading=' + h.toFixed(2),
          '头投影', hp.toFixed(1), '尾投影', tp.toFixed(1));
      }
    }
  }

  // 陆地/飞行动物走的是 _common.js 的 facingTransform 约定：「+x 为前进方向」，
  // 与鱼类相反（鱼类是「吻端 x=0」），所以头是局部 x 最大、尾是局部 x 最小。
  for (const id of ['cat', 'dog', 'turtle', 'frog', 'bird']) {
    const d2 = Registry.get(id);
    if (!d2) { bad++; console.error('朝向验证：找不到物种', id); continue; }
    for (const h of [0, Math.PI / 2, Math.PI, -Math.PI * 0.75]) {
      const pts = [];
      const st2 = Brain.create(W, H, d2.profile);
      st2.scale = 1; st2.palette = 0;
      st2.x = W * 0.5; st2.y = H * 0.5;
      st2.heading = h; st2.phase = 1.1; st2.curv = 0;
      st2.ampScale = 0.95; st2.finPhase = 0.4; st2.blink = 0;
      if (d2.profile.band) st2.y = H * (d2.profile.band[0] + d2.profile.band[1]) / 2;
      d2.draw(makeCapCtx(pts), st2);

      // 下限放低：小鸟（L=110）一帧只有 ~19 个路径点，但判断首尾极值不需要很多点
      if (pts.length < 12) {
        bad++; console.error(id, '朝向验证：采集到的点太少', pts.length); continue;
      }
      let head = pts[0], tail = pts[0];
      for (const p of pts) { if (p.lx > head.lx) head = p; if (p.lx < tail.lx) tail = p; }
      const ux = Math.cos(h), uy = Math.sin(h);
      const hp = (head.w[0] - st2.x) * ux + (head.w[1] - st2.y) * uy;
      const tp = (tail.w[0] - st2.x) * ux + (tail.w[1] - st2.y) * uy;
      const okFwd = hp > 0 && tp < 0;
      console.log(`  [${id}] heading=${h.toFixed(2)} 头投影=${hp.toFixed(1)}px 尾投影=${tp.toFixed(1)}px ${okFwd ? '前向 OK' : '倒退!!'}`);
      if (!okFwd) {
        bad++; console.error(id, '朝向错误（在倒退）：heading=' + h.toFixed(2),
          '头投影', hp.toFixed(1), '尾投影', tp.toFixed(1));
      }
    }
  }
}

// ---- 指定宠物参数：PET_ID / PET_PIN / --pet= / --pin ----
// config.js 在 require 时就固化读 argv/env，所以用子进程隔离各种入参组合。
{
  const { execFileSync } = require('node:child_process');
  const IDS = ['fish', 'dragon', 'cat', 'dog', 'turtle', 'frog', 'bird'];
  const POOL = IDS;

  // 在干净进程里读 config，返回 PET_ID / PET_PIN
  function cfgOf(args, env) {
    const code = 'var c=require(' + JSON.stringify(require.resolve('./src/config.js')) + ');'
      + 'process.stdout.write(JSON.stringify({id:c.PET_ID,pin:c.PET_PIN}));';
    const out = execFileSync(process.execPath, ['-e', code, '--'].concat(args), {
      cwd: __dirname, env: Object.assign({}, process.env, env), encoding: 'utf8'
    });
    return JSON.parse(out);
  }
  const chk = (label, got, want) => {
    const ok = got.id === want.id && got.pin === want.pin;
    console.log(`  [参数] ${label} -> PET_ID=${JSON.stringify(got.id)} PET_PIN=${got.pin} ${ok ? 'OK' : 'FAIL'}`);
    if (!ok) {
      bad++; console.error('  期望', JSON.stringify(want), '实得', JSON.stringify(got));
    }
  };

  chk('默认（无参）', cfgOf([]), { id: null, pin: false });
  chk('PET_ID=dragon', cfgOf([], { PET_ID: 'dragon' }), { id: 'dragon', pin: false });
  chk('PET_ID 带空白', cfgOf([], { PET_ID: '  dragon  ' }), { id: 'dragon', pin: false });
  chk('PET_ID 空串 -> 忽略', cfgOf([], { PET_ID: '' }), { id: null, pin: false });
  chk('PET_ID 纯空白 -> 忽略', cfgOf([], { PET_ID: '   ' }), { id: null, pin: false });
  chk('--pet=dragon', cfgOf(['--pet=dragon']), { id: 'dragon', pin: false });
  chk('--pet dragon', cfgOf(['--pet', 'dragon']), { id: 'dragon', pin: false });
  chk('环境变量优先于命令行', cfgOf(['--pet=cat'], { PET_ID: 'dragon' }), { id: 'dragon', pin: false });
  chk('PET_PIN=1', cfgOf([], { PET_PIN: '1' }), { id: null, pin: true });
  chk('PET_PIN=true', cfgOf([], { PET_PIN: 'true' }), { id: null, pin: true });
  chk('PET_PIN=0 -> 不锁', cfgOf([], { PET_PIN: '0' }), { id: null, pin: false });
  chk('--pin', cfgOf(['--pin']), { id: null, pin: true });
  chk('PET_ID+PET_PIN', cfgOf([], { PET_ID: 'dragon', PET_PIN: '1' }), { id: 'dragon', pin: true });
  // 指定 + 轮询同时给：两者互不干扰（锁的是"不再轮换"，不是"改变间隔"）
  chk('PET_ID + PET_ROTATE_MS', cfgOf([], { PET_ID: 'fish', PET_ROTATE_MS: '10000' }),
    { id: 'fish', pin: false });

  // resolveForced 校验：拼错/池外必须拒绝并给出解释，绝不静默换一只
  const rf = PetPool.resolveForced;
  if (rf(POOL, 'dragon', IDS).id !== 'dragon') { bad++; console.error('resolveForced 拒绝了合法 id'); }
  if (rf(POOL, null, IDS).id !== null) { bad++; console.error('resolveForced 对空值应返回 null'); }
  if (rf(POOL, '   ', IDS).id !== null) { bad++; console.error('resolveForced 对纯空白应返回 null'); }
  {
    const r = rf(POOL, 'drago', IDS);   // 拼错
    if (r.id !== null || !r.reason) { bad++; console.error('拼错 id 应被拒绝并给 reason'); }
    else console.log('  拼错 drago -> 拒绝：' + r.reason);
  }
  {
    // 注册了但不在 POOL：模拟 POOL 少了 cat
    const pool2 = POOL.filter((x) => x !== 'cat');
    const r = rf(pool2, 'cat', IDS);
    if (r.id !== null || !r.reason) { bad++; console.error('池外 id 应被拒绝并给 reason'); }
    else console.log('  池外 cat -> 拒绝：' + r.reason);
  }
  // 合法 id 不该带 reason
  if (rf(POOL, 'bird', IDS).reason) { bad++; console.error('合法 id 不该附带 reason'); }
  // allIds 省略时退化为用 pool 判断
  if (rf(POOL, 'bird').id !== 'bird') { bad++; console.error('resolveForced 省略 allIds 时应退化正常'); }
}

console.log('注册物种:', ids.join(', '));
console.log('绘制包围盒(局部坐标):', JSON.stringify(bbox, (k, v) => typeof v === 'number' ? +v.toFixed(1) : v));
console.log(bad === 0 ? 'SMOKE OK — 全部物种无 NaN，PetPool 机制正确' : 'SMOKE FAIL — ' + bad + ' 处问题');
process.exit(bad === 0 ? 0 : 1);
