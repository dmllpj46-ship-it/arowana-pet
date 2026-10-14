/*
 * config.js — 全局常量
 *
 * ROTATE_MS   自动轮换间隔，默认 1 小时。
 *             调试时可用环境变量覆盖：PET_ROTATE_MS=10000 npm start（10 秒换一只）
 * TRANSITION_MS 切换淡入淡出时长（毫秒）
 * POOL        参与轮换的物种 id 白名单。新增动物时：在 src/pets/ 加文件注册后，
 *             把 id 加进这个数组即可入池。
 * WEIGHTS     每个物种的选中权重（未列出的默认 1）。权重越大越容易被抽中。
 *             例：fish=5 表示金龙鱼命中概率是其他(权重1)的 5 倍。
 *             调大某个值让它更常出现；想让所有宠物等概率就把全部设成相同值。
 * PET_ID      指定启动哪一只（必须是「已注册 且 在 POOL 内」的 id，如 fish / dragon）。
 *             不设 = 按 WEIGHTS 加权随机。设了但写错 = 打警告并退回随机（不猜你要哪只）。
 *             写法一：PET_ID=dragon npm start
 *             写法二：npm start -- --pet=dragon
 * PET_PIN     1 = 锁死当前这只，不再自动轮换，托盘「换一只」同时停用。
 *             写法一：PET_PIN=1 npm start
 *             写法二：npm start -- --pin
 *             锁定某只慢慢看：PET_ID=dragon PET_PIN=1 npm start
 * STATE_FILE  主进程持久化的状态文件名（存在 userData 下），记录当前宠物与激活时间。
 * AVOID_R     主动避让半径（像素）。光标进入这个圆内，宠物就开始往反方向游，
 *             而不是等你把鼠标压上来才反应。
 * AVOID_GAIN  避让强度倍率。调大躲得更急，调小更懒散。
 * GRAB_SETTLE_MS / GRAB_MOVE_EPS
 *             「抓取意图」判定：光标在宠物附近，且移动速度低于 GRAB_MOVE_EPS(px/ms)
 *             持续 GRAB_SETTLE_MS 毫秒，才把鼠标事件交给宠物。
 *             这样你在移动鼠标操作别的窗口时，点击一律穿透，绝不会被宠物吃掉。
 */
(function (root) {
  'use strict';

  var env = (typeof process !== 'undefined' && process.env) || {};
  var argv = (typeof process !== 'undefined' && Array.isArray(process.argv)) ? process.argv : [];
  var oneHour = 60 * 60 * 1000;

  // 命令行取值：--pet=dragon 与 --pet dragon 都认（electron 直接跑时的入口）
  function argOf(flag) {
    var pfx = '--' + flag + '=';
    for (var i = 0; i < argv.length; i++) {
      if (argv[i].indexOf(pfx) === 0) return argv[i].slice(pfx.length);
      if (argv[i] === '--' + flag && typeof argv[i + 1] === 'string') return argv[i + 1];
    }
    return null;
  }
  function flagOn(flag) { return argv.indexOf('--' + flag) !== -1; }

  // 环境变量优先于命令行，方便 start.js 把 --pet= 翻成环境变量后再透传
  var petIdRaw = env.PET_ID != null ? env.PET_ID : argOf('pet');
  var petId = (typeof petIdRaw === 'string' && petIdRaw.trim()) ? petIdRaw.trim() : null;
  var pinRaw = env.PET_PIN != null ? String(env.PET_PIN).trim().toLowerCase() : null;

  var cfg = {
    ROTATE_MS: env.PET_ROTATE_MS ? parseInt(env.PET_ROTATE_MS, 10) : oneHour,
    TRANSITION_MS: 500,
    POOL: ['fish', 'dragon', 'cat', 'dog', 'turtle', 'frog', 'bird'],
    // 金龙鱼与五彩金龙同为 5：这两只是主角，其余权重 1。
    // 7 只总权重 = 5+5+1+1+1+1+1 = 15，鱼/龙各 ≈33%，其余各 ≈6.7%。
    WEIGHTS: { fish: 5, dragon: 5, cat: 1, dog: 1, turtle: 1, frog: 1, bird: 1 },
    PET_ID: petId,
    PET_PIN: pinRaw === '1' || pinRaw === 'true' || flagOn('pin'),
    STATE_FILE: 'pet-state.json',
    AVOID_R: 260,
    AVOID_GAIN: 1.0,
    GRAB_SETTLE_MS: 260,
    GRAB_MOVE_EPS: 0.6
  };

  if (!isFinite(cfg.ROTATE_MS) || cfg.ROTATE_MS < 1000) cfg.ROTATE_MS = oneHour;
  if (!isFinite(cfg.AVOID_R) || cfg.AVOID_R < 0) cfg.AVOID_R = 260;
  if (!isFinite(cfg.AVOID_GAIN) || cfg.AVOID_GAIN < 0) cfg.AVOID_GAIN = 1;

  if (typeof module !== 'undefined' && module.exports) module.exports = cfg;
  root.PetConfig = cfg;
})(typeof window !== 'undefined' ? window : globalThis);
