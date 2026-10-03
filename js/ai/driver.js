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
      this.driftT = 0; this.huntLeft = 4; this.node = null; this.next = null; this._fk = ''; this.obj = null; this.pedTarget = null; this.lastHits = 0;
    }

    update(dt) {
      const g = this.g, taxi = g.taxi, W = g.world, fare = g.fare;
      this.replanT -= dt;
      // 通行人にヒットしたら hunt 残数を減らす
      if (g.score.hits !== this.lastHits) { this.huntLeft -= (g.score.hits - this.lastHits); this.lastHits = g.score.hits; this.node = null; }

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
      const ped = this._findPed(taxi, hunting ? 80 : (obj ? 22 : 40), hunting ? 1.1 : 0.35, hunting);
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

      // 目標までの進路: 直進できて近ければ直進。そうでなければ道路の交差点を結ぶ経路を追従 (経路探索は距離場)
      const nav = this._navigate(taxi, W, goal, dt);
      const wp = nav.aim, distW = Math.hypot(wp.x - taxi.x, wp.z - taxi.z);
      const diff = U.angleDiff(Math.atan2(wp.x - taxi.x, wp.z - taxi.z), taxi.h);
      const sp = taxi.speed;

      // 操舵 (速いほどゆるやかに)
      let steer = U.clamp(-diff * (sp > 20 ? 2.0 : 2.6), -1, 1);
      // 速度目標: 目的地の手前/曲がり角の手前/前方の障害物で減速
      let want = 31;
      const dGoal = Math.hypot(goal.x - taxi.x, goal.z - taxi.z);
      if (goal.stop) want = U.clamp(dGoal * 0.62 - 2, 5, 31);
      if (nav.turn > 0.5) want = Math.min(want, 13 + nav.toNode * 0.55 + (1 - Math.min(1, nav.turn / 1.6)) * 6);
      const free = this._freeDist(taxi, W, goal.ped ? 1.7 : 2.0);
      if (free < 60) want = Math.min(want, Math.max(2.5, free * 0.6 - 1.5));
      if (free < 14 && sp > 6) steer = this._avoidSteer(taxi, W, steer);
      // 壁の目の前で動けない: 少し下がって向きを変える (きりもみ衝突を繰り返さない)
      if (free < 3.5 && sp < 7 && taxi.y < 0.3) { this.reverseT = 0.8; this.reverseSteer = this._clearSide(taxi, W); this.node = null; return { throttle: -1, steer: this.reverseSteer, handbrake: false, boost: false }; }
      let throttle = sp < want ? 1 : sp > want + 3 ? -1 : 0;
      if (throttle < 0 && sp < 3) throttle = 0;

      // ドリフトで曲がる (広い交差点内で、前方が開けているときだけ)
      let handbrake = false;
      this.driftT -= dt;
      if (this.driftT > 0) handbrake = true;
      else if (!goal.ped && nav.turn > 0.9 && Math.abs(diff) > 0.65 && sp > 17 && nav.toNode < 14 && free > 30 && taxi.y < 0.2) { this.driftT = 0.45; handbrake = true; }
      if (handbrake && (Math.abs(diff) < 0.25 || free < 16)) { this.driftT = 0; handbrake = false; }
      if (handbrake) throttle = 1;
      // 真っすぐ長い道ではブースト
      const boost = goal.ped ? false : (Math.abs(diff) < 0.06 && free > 55 && nav.turn < 0.3 && taxi.boost > 0.6 && sp > 25 && !goal.stop);

      // スタック検出
      if (Math.abs(sp) < 1.5 && throttle > 0) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
      if (this.stuckT > 0.8) { this.stuckT = 0; this.reverseT = 0.9; this.reverseSteer = Math.random() < 0.5 ? -1 : 1; this.node = null; }

      this.dbg = (goal.ped ? 'PED' : goal.stop ? (fare.onboard ? 'DEST' : 'SPOT') : 'WANDER') + ' dG=' + Math.round(dGoal) +  ' n=' + (this.node ? this.node.a + ',' + this.node.b : '-') + ' nx=' + (this.next ? this.next.a + ',' + this.next.b : '-') + ' aim=' + Math.round(wp.x) + ',' + Math.round(wp.z) + ' free=' + Math.round(free) + ' diff=' + diff.toFixed(2) + ' want=' + Math.round(want) + ' hunt=' + this.huntLeft + (handbrake ? ' HB' : '');
      return { throttle, steer, handbrake, boost };
    }

    /** 前方の狙える通行人 */
    _findPed(taxi, maxD, maxAng, hunting) {
      const g = this.g; let best = null, bs = 1e9;
      for (const p of g.peds.list) {
        if (p.state === 'rag' || p.state === 'down') continue;
        const dx = p.x - taxi.x, dz = p.z - taxi.z, d = Math.hypot(dx, dz);
        if (d > maxD || d < 3) continue;
        const ang = Math.abs(U.angleDiff(Math.atan2(dx, dz), taxi.h));
        if (ang > maxAng) continue;
        if (this._lateral(g.world, p.x, p.z) > 12.8) continue; // 道路から遠い(歩道の奥)の人は狙わない
        if (!g.world.segmentClear(taxi.x, taxi.z, p.x, p.z, 1.9)) continue;
        const s = d + ang * 25;
        if (s < bs) { bs = s; best = p; }
      }
      return best;
    }
    /** 最寄りの道路中心線までの距離 */
    _lateral(W, x, z) {
      const P = W.P, N = W.N, ax = Math.abs(x / P + N / 2 - Math.round(x / P + N / 2)) * P, az = Math.abs(z / P + N / 2 - Math.round(z / P + N / 2)) * P;
      return Math.min(ax, az);
    }
    _wander(taxi) {
      // 通行人が多い方向(重心)へ。いなければ前方
      const g = this.g; let sx = 0, sz = 0, n = 0;
      for (const p of g.peds.list) { if (p.state === 'rag' || p.state === 'down') continue; const d = Math.hypot(p.x - taxi.x, p.z - taxi.z); if (d < 160 && d > 20) { sx += p.x; sz += p.z; n++; } }
      if (n) return { x: sx / n, z: sz / n, stop: false, far: true };
      return { x: taxi.x + taxi.fx * 60, z: taxi.z + taxi.fz * 60, stop: false };
    }

    /** 前方の障害物までの距離 (進行方向に沿って見る。最大60m) */
    _freeDist(taxi, W, pad) {
      const fx = taxi.fx, fz = taxi.fz, L = Math.min(60, 10 + Math.abs(taxi.speed) * 1.5);
      if (W.segmentClear(taxi.x, taxi.z, taxi.x + fx * L, taxi.z + fz * L, pad, 0.45)) return 60;
      let lo = 0, hi = L; for (let i = 0; i < 6; i++) { const m = (lo + hi) / 2; if (W.segmentClear(taxi.x, taxi.z, taxi.x + fx * m, taxi.z + fz * m, pad, 0.45)) lo = m; else hi = m; }
      return lo;
    }
    /** 前方がふさがれている時、左右どちらが開いているか見て切る */
    _avoidSteer(taxi, W, steer) {
      let best = steer, bs = -1;
      for (const a of [-0.9, -0.5, 0.5, 0.9]) {
        const h = taxi.h + a, x = taxi.x + Math.sin(h) * 18, z = taxi.z + Math.cos(h) * 18;
        const ok = W.segmentClear(taxi.x, taxi.z, x, z, 1.8, 0.45) ? 1 : 0;
        const sc = ok * 2 - Math.abs(a - (-steer) * 0.9) * 0.2;
        if (sc > bs) { bs = sc; best = -Math.sign(a) * Math.min(1, Math.abs(a) * 1.4); }
      }
      return best;
    }
    /** 後退しながら切る向き (前方がより開ける側) */
    _clearSide(taxi, W) {
      let best = 1, bd = -1;
      for (const sgn of [-1, 1]) {
        const h = taxi.h + sgn * 0.9; let lo = 0;
        for (const d of [6, 12, 20]) { if (W.segmentClear(taxi.x, taxi.z, taxi.x + Math.sin(h) * d, taxi.z + Math.cos(h) * d, 1.8, 0.45)) lo = d; else break; }
        if (lo > bd) { bd = lo; best = sgn; }
      }
      return best; // 後退時は逆向きに切ると車首がその側へ回る
    }
    /** 交差点ノード (a,b) の座標 */
    _node(W, a, b) { return { a, b, x: W.lineX(a), z: W.lineZ(b) }; }
    /** 目標からの距離場 (各交差点→目標までの道のり)。目標ごとにキャッシュ */
    _field(W, goal) {
      const key = Math.round(goal.x / 12) + ',' + Math.round(goal.z / 12);
      if (this._fk === key) return this._f;
      const N = W.N, M = N + 1, f = new Float32Array(M * M).fill(1e9), P = W.P;
      const ga = U.clamp(Math.floor(goal.x / P + N / 2), 0, N - 1), gb = U.clamp(Math.floor(goal.z / P + N / 2), 0, N - 1);
      const open = [];
      for (let da = 0; da <= 1; da++) for (let db = 0; db <= 1; db++) {
        const a = ga + da, b = gb + db, x = W.lineX(a), z = W.lineZ(b);
        f[a * M + b] = Math.hypot(x - goal.x, z - goal.z) * 0.8 + 8; open.push(a * M + b);
      }
      const done = new Uint8Array(M * M);
      while (open.length) {
        let bi = 0; for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
        const k = open.splice(bi, 1)[0]; if (done[k]) continue; done[k] = 1;
        const a = Math.floor(k / M), b = k % M;
        for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const na = a + da, nb = b + db; if (na < 0 || nb < 0 || na > N || nb > N) continue;
          const nk = na * M + nb, c = f[k] + P; if (c < f[nk]) { f[nk] = c; open.push(nk); }
        }
      }
      this._fk = key; this._f = f; this.node = null; this.prevNode = null; return f;
    }
    _nextNode(W, f, node, prev, goal) {
      const N = W.N, M = N + 1; let best = null, bs = f[node.a * M + node.b] - 1e-3;
      // 現ノードより目標に近い隣へ。同程度なら直進を優先、Uターンは避ける
      const pdir = prev ? { a: Math.sign(node.a - prev.a), b: Math.sign(node.b - prev.b) } : null;
      for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const na = node.a + da, nb = node.b + db; if (na < 0 || nb < 0 || na > N || nb > N) continue;
        let sc = f[na * M + nb] + W.P;
        if (pdir && da === pdir.a && db === pdir.b) sc -= 6; else if (pdir && da === -pdir.a && db === -pdir.b) sc += 80;
        if (sc < bs + W.P || !best) { if (best === null || sc < best.sc) best = { a: na, b: nb, sc }; }
      }
      void goal; void bs;
      // 目標に最も近い角(終点)に着いたら null
      const here = f[node.a * M + node.b];
      if (best && f[best.a * M + best.b] >= here) return null;
      return best ? this._node(W, best.a, best.b) : null;
    }
    _navigate(taxi, W, goal, dt) {
      const dGoal = Math.hypot(goal.x - taxi.x, goal.z - taxi.z);
      const out = (aim, turn, toNode) => ({ aim, turn: turn || 0, toNode: toNode || 0 });
      // 近くて見通せるなら直進
      if (dGoal < 130 && W.segmentClear(taxi.x, taxi.z, goal.x, goal.z, 2.2, 0.45)) { this.node = null; this._fk = ''; return out(goal, 0, 99); }
      const f = this._field(W, goal), N = W.N, M = N + 1;
      if (!this.node) {
        // 周囲4交差点のうち「近い・前方寄り・見通せる・目標に近い」ものから開始
        let best = null, bs = 1e18;
        const a0 = U.clamp(Math.floor(taxi.x / W.P + N / 2), 0, N - 1), b0 = U.clamp(Math.floor(taxi.z / W.P + N / 2), 0, N - 1);
        for (let da = 0; da <= 1; da++) for (let db = 0; db <= 1; db++) {
          const nd = this._node(W, a0 + da, b0 + db), d = Math.hypot(nd.x - taxi.x, nd.z - taxi.z);
          const dot = ((nd.x - taxi.x) * taxi.fx + (nd.z - taxi.z) * taxi.fz) / (d || 1);
          const clr = W.segmentClear(taxi.x, taxi.z, nd.x, nd.z, 1.8, 0.45);
          const sc = f[nd.a * M + nd.b] + d + (dot < 0.1 ? 60 : 0) + (clr ? 0 : 500);
          if (sc < bs) { bs = sc; best = nd; }
        }
        this.node = best; this.prevNode = null; this.next = this._nextNode(W, f, best, null, goal);
      }
      let nd = this.node;
      let toNode = Math.hypot(nd.x - taxi.x, nd.z - taxi.z);
      // 到着(または通り過ぎ)で次のノードへ
      const passed = ((nd.x - taxi.x) * taxi.fx + (nd.z - taxi.z) * taxi.fz) < 0 && toNode < 22;
      if (toNode < 9 || passed) {
        if (!this.next) { this.node = null; this._fk = ''; return out(goal, 0, 99); } // 終点: あとは直接目標へ
        this.prevNode = nd; this.node = nd = this.next; this.next = this._nextNode(W, f, nd, this.prevNode, goal);
        toNode = Math.hypot(nd.x - taxi.x, nd.z - taxi.z);
      }
      // 曲がり角の大きさ (進入方向 vs 次の区間)
      let turn = 0, aim = { x: nd.x, z: nd.z };
      const nx = this.next || null;
      if (nx) {
        const ax = nd.x - taxi.x, az = nd.z - taxi.z, bx = nx.x - nd.x, bz = nx.z - nd.z;
        turn = Math.abs(U.angleDiff(Math.atan2(bx, bz), Math.atan2(ax, az)));
        const LOOK = 16; // 角を少し手前から曲がる (純追跡)
        if (toNode < LOOK) { const k = (LOOK - toNode) / LOOK, bl = Math.hypot(bx, bz) || 1; aim = { x: nd.x + (bx / bl) * k * 14, z: nd.z + (bz / bl) * k * 14 }; }
      } else {
        // 最後のノード: 目標へ
        const ax = goal.x - nd.x, az = goal.z - nd.z;
        turn = Math.abs(U.angleDiff(Math.atan2(ax, az), Math.atan2(nd.x - taxi.x, nd.z - taxi.z)));
        if (toNode < 16) { const k = (16 - toNode) / 16, bl = Math.hypot(ax, az) || 1; aim = { x: nd.x + (ax / bl) * k * 14, z: nd.z + (az / bl) * k * 14 }; }
      }
      void dt;
      return out(aim, turn, toNode);
    }
  }
  CT.Driver = Driver;
})();
