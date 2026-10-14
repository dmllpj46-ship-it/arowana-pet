/*
 * registry.js — 宠物注册表
 *
 * 每个物种模块（src/pets/*.js）加载后调用 PetRegistry.register(def) 自注册。
 * 渲染进程（window）与主进程（globalThis）共用同一份实现：
 *   - 浏览器预览 / smoke：靠 <script> 标签顺序加载
 *   - main.js：require('./src/registry.js') 后 require 各物种文件完成注册
 *
 * def 结构：
 *   {
 *     id: 'fish',            // 唯一 id
 *     name: '金龙鱼',         // 展示名（托盘菜单）
 *     L: 240,                // 参考体型，决定命中半径与图标缩放
 *     palette: 0,            // 默认配色下标（可选）
 *     iconScale: 0.2,        // 托盘图标缩放（可选，默认 48/L）
 *     profile: {...},        // 行为参数，喂给 Brain
 *     draw: (ctx, st) => {}, // 与旧 Fish.draw 同签名
 *     drawIcon: null         // 可选；缺省时用 draw + 迷你状态画图标
 *   }
 */
(function (root) {
  'use strict';

  var defs = {};

  function register(def) {
    if (def && def.id) defs[def.id] = def;
    return def;
  }
  function get(id) { return defs[id] || null; }
  function has(id) { return !!defs[id]; }
  function ids() { return Object.keys(defs); }

  var api = { register: register, get: get, has: has, ids: ids };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PetRegistry = api;
})(typeof window !== 'undefined' ? window : globalThis);
