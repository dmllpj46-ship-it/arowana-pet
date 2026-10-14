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

  var api = { pick: pick, pickWeighted: pickWeighted };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PetPool = api;
})(typeof window !== 'undefined' ? window : globalThis);
