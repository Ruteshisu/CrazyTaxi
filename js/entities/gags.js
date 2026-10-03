/* 吹っ飛びパターン(ギャグ)定義。新しいパターンを足すにはGAGS配列に1つ追加するだけ。
   make(ctx) -> {vel:{x,y,z}, spin:{x,y,z}} ctx: {speed, fx, fz, lx, lz} (車の前方/左ベクトルと速度) */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const U = CT.util;

  const GAGS = [
    {
      id: 'rocket', label: 'ロケット発射!', mult: 1.4, weight: 3, minSpeed: 5,
      make: (c) => ({ vel: { x: c.fx * c.speed * 0.2, y: U.rand(27, 34), z: c.fz * c.speed * 0.2 }, spin: { x: 0, y: U.rand(12, 18), z: 0 } }),
    },
    {
      id: 'homerun', label: 'ホームラン!', mult: 1.2, weight: 3, minSpeed: 12,
      make: (c) => ({ vel: { x: c.fx * (c.speed * 0.95 + 10), y: U.rand(15, 20), z: c.fz * (c.speed * 0.95 + 10) }, spin: { x: c.lx * -9, y: 0, z: c.lz * -9 } }),
    },
    {
      id: 'cartwheel', label: 'きりもみ回転!', mult: 1.2, weight: 3, minSpeed: 7,
      make: (c) => ({ vel: { x: c.fx * c.speed * 0.5, y: U.rand(18, 24), z: c.fz * c.speed * 0.5 }, spin: { x: U.rand(-12, 12), y: U.rand(-6, 6), z: U.rand(-12, 12) } }),
    },
    {
      id: 'bowling', label: 'ストライク!', mult: 1.0, weight: 2, minSpeed: 14,
      make: (c) => ({ vel: { x: c.fx * c.speed * 1.15, y: U.rand(5, 8), z: c.fz * c.speed * 1.15 }, spin: { x: c.lx * -6, y: 0, z: c.lz * -6 } }),
    },
    {
      id: 'star', label: 'お星様になった!', mult: 2.2, weight: 0.7, minSpeed: 20,
      make: (c) => ({ vel: { x: c.fx * c.speed * 0.1, y: U.rand(38, 46), z: c.fz * c.speed * 0.1 }, spin: { x: 0, y: 22, z: 0 } }),
    },
    {
      id: 'spring', label: 'ポヨ〜ン!', mult: 0.8, weight: 4, minSpeed: 0, maxSpeed: 12,
      make: (c) => ({ vel: { x: c.fx * c.speed * 0.4, y: U.rand(12, 17), z: c.fz * c.speed * 0.4 }, spin: { x: U.rand(-5, 5), y: U.rand(4, 9), z: U.rand(-5, 5) } }),
    },
  ];

  CT.Gags = {
    list: GAGS,
    /** 速度に合ったギャグをランダム選択 */
    pick(speed, ctx) {
      const cand = GAGS.filter((g) => speed >= g.minSpeed && (g.maxSpeed === undefined || speed <= g.maxSpeed));
      let total = 0; cand.forEach((g) => (total += g.weight));
      let r = Math.random() * total, g = cand[0];
      for (const c of cand) { r -= c.weight; if (r <= 0) { g = c; break; } }
      const m = g.make(ctx);
      return { id: g.id, label: g.label, mult: g.mult, vel: m.vel, spin: m.spin };
    },
  };
})();
