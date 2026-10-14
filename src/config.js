/*
 * config.js — 全局常量
 *
 * ROTATE_MS   自动轮换间隔，默认 1 小时。
 *             调试时可用环境变量覆盖：PET_ROTATE_MS=10000 npm start（10 秒换一只）
 * TRANSITION_MS 切换淡入淡出时长（毫秒）
 * POOL        参与轮换的物种 id 白名单。新增动物时：在 src/pets/ 加文件注册后，
 *             把 id 加进这个数组即可入池。
 * STATE_FILE  主进程持久化的状态文件名（存在 userData 下），记录当前宠物与激活时间。
 */
(function (root) {
  'use strict';

  var env = (typeof process !== 'undefined' && process.env) || {};
  var oneHour = 60 * 60 * 1000;

  var cfg = {
    ROTATE_MS: env.PET_ROTATE_MS ? parseInt(env.PET_ROTATE_MS, 10) : oneHour,
    TRANSITION_MS: 500,
    POOL: ['fish', 'cat', 'dog', 'turtle', 'frog', 'bird'],
    STATE_FILE: 'pet-state.json'
  };

  if (!isFinite(cfg.ROTATE_MS) || cfg.ROTATE_MS < 1000) cfg.ROTATE_MS = oneHour;

  if (typeof module !== 'undefined' && module.exports) module.exports = cfg;
  root.PetConfig = cfg;
})(typeof window !== 'undefined' ? window : globalThis);
