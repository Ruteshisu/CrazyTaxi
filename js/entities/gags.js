/* 吹っ飛びパターン(ギャグ)定義。新しいパターンを足すにはGAGS配列に1つ追加するだけ。
   lv: 出現する最低レベル (0=1発目〜, 1=2-3連続〜, 2=4-6連続〜, 3=7連続〜)。連続ヒットほど派手になる。
   make(ctx) -> {vel:{x,y,z}, spin:{x,y,z}} ctx: {speed, fx, fz, lx, lz} (車の前方/左ベクトルと速度)
   高さの目安: 頂点 ≒ vy²/(2×17)。上方向は控えめ(最大約3m)、前方への飛距離を重視 */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const U = CT.util;

  const GAGS = [
    { id: 'spring', label: 'ポヨ〜ン!', lv: 0, mult: 0.8, weight: 4, minSpeed: 0, maxSpeed: 14,
      make: (c) => ({ vel: { x: c.fx * (c.speed * 0.8 + 3), y: U.rand(4, 6), z: c.fz * (c.speed * 0.8 + 3) }, spin: { x: U.rand(-3, 3), y: U.rand(2, 5), z: U.rand(-3, 3) } }) },
    { id: 'tumble', label: 'くるくる〜', lv: 0, mult: 1.0, weight: 3, minSpeed: 5,
      make: (c) => ({ vel: { x: c.fx * (c.speed * 1.0 + 4), y: U.rand(4.5, 7), z: c.fz * (c.speed * 1.0 + 4) }, spin: { x: U.rand(-7, 7), y: U.rand(-4, 4), z: U.rand(-7, 7) } }) },
    { id: 'bowling', label: 'ストライク!', lv: 0, mult: 1.0, weight: 2, minSpeed: 14,
      make: (c) => ({ vel: { x: c.fx * c.speed * 1.3, y: U.rand(2.5, 4), z: c.fz * c.speed * 1.3 }, spin: { x: c.lx * -6, y: 0, z: c.lz * -6 } }) },
    { id: 'cartwheel', label: 'きりもみ回転!', lv: 1, mult: 1.2, weight: 3, minSpeed: 7,
      make: (c) => ({ vel: { x: c.fx * (c.speed * 1.0 + 6), y: U.rand(6, 8), z: c.fz * (c.speed * 1.0 + 6) }, spin: { x: U.rand(-11, 11), y: U.rand(-6, 6), z: U.rand(-11, 11) } }) },
    { id: 'homerun', label: 'ホームラン!', lv: 1, mult: 1.3, weight: 3, minSpeed: 12,
      make: (c) => ({ vel: { x: c.fx * (c.speed * 1.2 + 12), y: U.rand(6, 8), z: c.fz * (c.speed * 1.2 + 12) }, spin: { x: c.lx * -9, y: 0, z: c.lz * -9 } }) },
    { id: 'rocket', label: 'ロケット発射!', lv: 2, mult: 1.5, weight: 3, minSpeed: 5,
      make: (c) => ({ vel: { x: c.fx * (c.speed * 1.2 + 16), y: U.rand(7, 9), z: c.fz * (c.speed * 1.2 + 16) }, spin: { x: 0, y: U.rand(12, 18), z: 0 } }) },
    { id: 'star', label: 'お星様になった!', lv: 3, mult: 2.2, weight: 2.5, minSpeed: 16,
      make: (c) => ({ vel: { x: c.fx * (c.speed * 1.4 + 24), y: U.rand(9, 11), z: c.fz * (c.speed * 1.4 + 24) }, spin: { x: 0, y: 22, z: 0 } }) },
  ];

  CT.Gags = {
    list: GAGS,
    /** コンボ数 → 演出レベル 0..3 */
    levelFor(combo) { return combo <= 1 ? 0 : combo <= 3 ? 1 : combo <= 6 ? 2 : 3; },
    /** 速度とレベルに合ったギャグを選ぶ (レベルちょうどのものが出やすい) */
    pick(speed, ctx, level) {
      level = level || 0;
      let cand = GAGS.filter((g) => g.lv <= level && speed >= g.minSpeed && (g.maxSpeed === undefined || speed <= g.maxSpeed || level >= 2));
      if (!cand.length) cand = [GAGS[1]];
      const w = (g) => g.weight * (g.lv === level ? 2.2 : 1);
      let total = 0; cand.forEach((g) => (total += w(g)));
      let r = Math.random() * total, g = cand[0];
      for (const c of cand) { r -= w(c); if (r <= 0) { g = c; break; } }
      const m = g.make(ctx);
      return { id: g.id, label: g.label, mult: g.mult, vel: m.vel, spin: m.spin, level };
    },
  };
})();
