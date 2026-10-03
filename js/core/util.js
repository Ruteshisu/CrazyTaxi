/* 共通ユーティリティ + イベントバス。他の全ファイルより先に読み込む */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});

  const U = (CT.util = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    /** フレームレート非依存の追従 */
    damp: (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt)),
    wrapAngle(a) {
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      return a;
    },
    /** to-from を -PI..PI で返す */
    angleDiff: (to, from) => U.wrapAngle(to - from),
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    /** シード付き乱数 (街の生成を毎回同じにする) */
    mulberry32(seed) {
      let a = seed >>> 0;
      return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    dist2: (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz),
    hexToRgb(h) { return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; },
    qs(name) { return new URLSearchParams(location.search).get(name); },
  });

  /** 軽量イベントバス: CT.bus.on('ped:hit', fn) / CT.bus.emit('ped:hit', data) */
  class Emitter {
    constructor() { this.h = {}; }
    on(ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); return this; }
    off(ev, fn) { const a = this.h[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
    emit(ev, data) {
      const a = this.h[ev];
      if (!a) return;
      for (let i = 0; i < a.length; i++) {
        try { a[i](data); } catch (e) { console.error('[bus:' + ev + ']', e); }
      }
    }
  }
  CT.Emitter = Emitter;
  CT.bus = new Emitter();
})();
