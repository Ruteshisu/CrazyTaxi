/* 自動運転AI (タイトル画面のデモプレイ用)。入力と同じ形式のコントロールを返すので、
   プレイヤー入力と差し替えるだけで動く。将来の「ライバルタクシー」にも流用可能。
   戦略: 開幕は通行人狩り(hunt) → お客さんを拾う → 目的地へ(途中で通行人にも当たりに行く) */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const U = CT.util;

  class Driver {
    constructor(game) { this.g = game; this.reset(); }
    reset() {
      this.route = []; this.routeKey = ''; this.replanT = 0; this.stuckT = 0; this.reverseT = 0; this.reverseSteer = 1;
      this.driftT = 0; this.huntLeft = 4; this.obj = null; this.pedTarget = null; this.lastHits = 0;
    }

    update(dt) {
      const g = this.g, taxi = g.taxi, W = g.world, fare = g.fare;
      this.replanT -= dt;
      // 通行人にヒットしたら hunt 残数を減らす
      if (g.score.hits !== this.lastHits) { this.huntLeft -= (g.score.hits - this.lastHits); this.lastHits = g.score.hits; this.route = []; }

      // 後退中
      if (this.reverseT > 0) {
        this.reverseT -= dt;
        return { throttle: -1, steer: this.reverseSteer, handbrake: false, boost: false };
      }

      // 目標の決定
      let obj = null, hunting = false;
      if (fare.onboard) obj = { x: fare.dest.x, z: fare.dest.z, stop: true };
      else if (this.huntLeft > 0) hunting = true;
      if (!obj && !hunting) {
        const t = fare.target(taxi); if (t) obj = { x: t.x, z: t.z, stop: true };
      }
      const ped = this._findPed(taxi, hunting ? 80 : (obj ? 28 : 40), hunting ? 1.1 : 0.4, hunting);
      let goal;
      if (ped) { goal = { x: ped.x + (ped.tx - ped.x) * 0.0, z: ped.z, ped: true }; // 位置をそのまま狙う
        const d = Math.hypot(ped.x - taxi.x, ped.z - taxi.z), lead = d / Math.max(12, taxi.totalSpeed);
        const dx = ped.tx - ped.x, dz = ped.tz - ped.z, dd = Math.hypot(dx, dz) || 1, sp = ped.state === 'panic' ? CT.config.ped.fleeSpeed : (ped.state === 'freeze' || ped.state === 'dizzy' ? 0 : ped.speed);
        goal.x = ped.x + (dx / dd) * sp * lead; goal.z = ped.z + (dz / dd) * sp * lead; goal.stop = false;
      } else if (obj) goal = obj;
      else {
        // 通行人が見つからない: 付近の通行人密度が高い方向 or 適当に前進
        goal = this._wander(taxi);
      }

      // 目標までの進路 (直進可能なら直進、だめなら交差点経由)
      let wp = this._navigate(taxi, W, goal, dt);
      const dxw = wp.x - taxi.x, dzw = wp.z - taxi.z, distW = Math.hypot(dxw, dzw);
      const diff = U.angleDiff(Math.atan2(dxw, dzw), taxi.h);
      const sp = taxi.speed;

      // 操舵
      let steer = U.clamp(-diff * 2.4, -1, 1);
      // 速度目標
      let want = 31;
      const dGoal = Math.hypot(goal.x - taxi.x, goal.z - taxi.z);
      if (goal.stop) want = U.clamp(dGoal * 0.62 - 2, 5, 31);
      if (!goal.ped && Math.abs(diff) > 0.8 && distW < 30) want = Math.min(want, 20);
      let throttle = sp < want ? 1 : sp > want + 4 ? -1 : 0;
      if (throttle < 0 && sp < 3) throttle = 0;

      // ドリフトで曲がる
      let handbrake = false;
      this.driftT -= dt;
      if (this.driftT > 0) handbrake = true;
      else if (!goal.ped && Math.abs(diff) > 0.65 && sp > 17 && distW < 26 && taxi.y < 0.2) { this.driftT = 0.5; handbrake = true; }
      if (handbrake && Math.abs(diff) < 0.2) { this.driftT = 0; handbrake = false; }
      if (handbrake) throttle = 1;
      // 真っすぐ長い道ではブースト
      const boost = goal.ped ? false : (Math.abs(diff) < 0.08 && distW > 80 && taxi.boost > 0.6 && sp > 25 && !goal.stop);

      // スタック検出
      if (Math.abs(sp) < 1.5 && throttle > 0) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
      if (this.stuckT > 0.8) { this.stuckT = 0; this.reverseT = 0.9; this.reverseSteer = Math.random() < 0.5 ? -1 : 1; this.route = []; }

      return { throttle, steer, handbrake, boost };
    }

    /** 前方の狙える通行人 */
    _findPed(taxi, maxD, maxAng, hunting) {
      const g = this.g; let best = null, bs = 1e9;
      for (const p of g.peds.list) {
        if (p.state === 'rag') continue;
        const dx = p.x - taxi.x, dz = p.z - taxi.z, d = Math.hypot(dx, dz);
        if (d > maxD || d < 3) continue;
        const ang = Math.abs(U.angleDiff(Math.atan2(dx, dz), taxi.h));
        if (ang > maxAng) continue;
        if (!g.world.segmentClear(taxi.x, taxi.z, p.x, p.z, 1.4)) continue;
        const s = d + ang * 25 - (p.state === 'dizzy' ? 15 : 0);
        if (s < bs) { bs = s; best = p; }
      }
      return best;
    }
    _wander(taxi) {
      // 通行人が多い方向(重心)へ。いなければ前方
      const g = this.g; let sx = 0, sz = 0, n = 0;
      for (const p of g.peds.list) { if (p.state === 'rag') continue; const d = Math.hypot(p.x - taxi.x, p.z - taxi.z); if (d < 160 && d > 20) { sx += p.x; sz += p.z; n++; } }
      if (n) return { x: sx / n, z: sz / n, stop: false, far: true };
      return { x: taxi.x + taxi.fx * 60, z: taxi.z + taxi.fz * 60, stop: false };
    }

    /** 進路選択: 直進可能ならそのまま。ダメなら交差点経由の簡易ルート */
    _navigate(taxi, W, goal, dt) {
      const clear = W.segmentClear(taxi.x, taxi.z, goal.x, goal.z, 1.9);
      if (clear) { this.route = []; return goal; }
      const key = Math.round(goal.x / 20) + ',' + Math.round(goal.z / 20);
      if (key !== this.routeKey || !this.route.length || this.replanT <= 0) {
        this.route = this._plan(taxi, W, goal); this.routeKey = key; this.replanT = 3;
      }
      while (this.route.length > 1) {
        const w = this.route[0];
        if (Math.hypot(w.x - taxi.x, w.z - taxi.z) < 16) this.route.shift(); else break;
      }
      return this.route[0] || goal;
    }
    _plan(taxi, W, goal) {
      const N = W.N, P = W.P;
      const fx = taxi.fx, fz = taxi.fz;
      // 開始交差点: 周囲4つのうち、通れて前方寄りのもの
      const a0 = U.clamp(Math.floor(taxi.x / P + N / 2), 0, N - 1), b0 = U.clamp(Math.floor(taxi.z / P + N / 2), 0, N - 1);
      let start = null, bs = 1e9;
      for (let da = 0; da <= 1; da++) for (let db = 0; db <= 1; db++) {
        const a = a0 + da, b = b0 + db, x = W.lineX(a), z = W.lineZ(b);
        const d = Math.hypot(x - taxi.x, z - taxi.z), dot = ((x - taxi.x) * fx + (z - taxi.z) * fz) / (d || 1);
        const clr = W.segmentClear(taxi.x, taxi.z, x, z, 1.5);
        const s = d - dot * 14 + (clr ? 0 : 400);
        if (s < bs) { bs = s; start = { a, b }; }
      }
      // 目標側の交差点
      const ga0 = U.clamp(Math.floor(goal.x / P + N / 2), 0, N - 1), gb0 = U.clamp(Math.floor(goal.z / P + N / 2), 0, N - 1);
      let end = null; bs = 1e9;
      for (let da = 0; da <= 1; da++) for (let db = 0; db <= 1; db++) {
        const a = ga0 + da, b = gb0 + db, x = W.lineX(a), z = W.lineZ(b);
        const d = Math.hypot(x - goal.x, z - goal.z), clr = W.segmentClear(x, z, goal.x, goal.z, 1.2);
        const s = d + (clr ? 0 : 400);
        if (s < bs) { bs = s; end = { a, b }; }
      }
      const pts = [];
      const P0 = (a, b) => ({ x: W.lineX(a), z: W.lineZ(b) });
      pts.push(P0(start.a, start.b));
      if (start.a !== end.a && start.b !== end.b) {
        // 長い方の軸を先に進む
        if (Math.abs(end.a - start.a) >= Math.abs(end.b - start.b)) pts.push(P0(end.a, start.b)); else pts.push(P0(start.a, end.b));
      }
      pts.push(P0(end.a, end.b));
      pts.push({ x: goal.x, z: goal.z });
      return pts;
    }
  }
  CT.Driver = Driver;
})();
