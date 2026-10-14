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

  var api = { pick: pick };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PetPool = api;
})(typeof window !== 'undefined' ? window : globalThis);
