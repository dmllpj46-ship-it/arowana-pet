/*
 * petpool.js — 宠物池选取逻辑（纯函数，主进程与测试共用）
 *
 * pick(ids, exclude)：从 ids 中等概率随机取一个，但永不取 exclude（当前宠物）。
 * 若排除后池子空了（例如池里只有一只），退化为返回 exclude 自身——
 * 机制上等价于"池子里只有它，只能还是它"。
 */
(function (root) {
  'use strict';

  function pick(ids, exclude) {
    var list = (ids || []).filter(function (id) { return id !== exclude; });
    if (list.length === 0) {
      return exclude || (ids && ids.length ? ids[0] : null);
    }
    return list[Math.floor(Math.random() * list.length)];
  }

  /*
   * pickWeighted(ids, exclude, weights)：按权重加权随机，仍永不取 exclude。
   * weights 形如 { fish: 3, cat: 1 }，缺省/非正数的按 1 计。
   * 做法：先排除当前，再在剩余里按累计权重做一次轮盘赌。
   */
  function pickWeighted(ids, exclude, weights) {
    var w = weights || {};
    var list = (ids || []).filter(function (id) { return id !== exclude; });
    if (list.length === 0) {
      return exclude || (ids && ids.length ? ids[0] : null);
    }
    var total = 0, i;
    for (i = 0; i < list.length; i++) {
      var wi = w[list[i]];
      total += (typeof wi === 'number' && wi > 0) ? wi : 1;
    }
    var roll = Math.random() * total;
    for (i = 0; i < list.length; i++) {
      var wj = w[list[i]];
      roll -= (typeof wj === 'number' && wj > 0) ? wj : 1;
      if (roll < 0) return list[i];
    }
    return list[list.length - 1];
  }

  /*
   * resolveForced(ids, want, allIds)：把用户指定的 PET_ID 收敛成一个可用的 id。
   *
   * 返回 { id: 'fish' }            —— 可用
   *       { id: null, reason: '..' } —— 不可用，reason 是给人看的解释
   *
   * 规则（故意不做「猜一个相近的」这种容错）：
   *   - want 为空/纯空白 -> id:null（调用方走加权随机）
   *   - 拼错 / 没注册    -> 拒绝：宁可退回随机也别静默显示另一只，
   *                         否则你以为在看龙，实际是条鱼，还得回头查为什么
   *   - 注册了但不在 POOL -> 同样拒绝：POOL 是「参与轮换的白名单」，
   *                         放一只池外宠物进来会让「换一只」的逻辑不一致
   */
  function resolveForced(ids, want, allIds) {
    var w = (typeof want === 'string') ? want.trim() : '';
    if (!w) return { id: null };

    var pool = ids || [];
    var known = allIds || pool;

    if (known.indexOf(w) === -1) {
      return { id: null, reason: '宠物 "' + w + '" 不存在。可选：' + known.join(', ') };
    }
    if (pool.indexOf(w) === -1) {
      return {
        id: null,
        reason: '宠物 "' + w + '" 已注册但不在 POOL 里，不会被选中。POOL：' + pool.join(', ')
      };
    }
    return { id: w };
  }

  var api = { pick: pick, pickWeighted: pickWeighted, resolveForced: resolveForced };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PetPool = api;
})(typeof window !== 'undefined' ? window : globalThis);
