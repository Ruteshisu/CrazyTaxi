/* 一般車: 道路を走る車(交差点で曲がる) + 路駐車。タクシーが当たると派手に吹っ飛ぶ。
   走行中の車は左側通行。ジャンプ台の上は車体が傾いて越える。吹っ飛んだ車はしばらくして別の場所に補充される */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const U = CT.util;
  const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];            // 方向 0:+x 1:+z 2:-x 3:-z
  const LEFT = (d) => (d + 3) % 4, RIGHT = (d) => (d + 1) % 4;
  const COLORS = [0xe8685a, 0x6aa6d6, 0xf5d76e, 0x8fd18a, 0xc59be3, 0xeeeeee, 0xe58fb0, 0x7fd6cf, 0xff9a2e, 0x4f6bd6, 0x2b2f38];
  const KINDS = ['sedan', 'sedan', 'sedan', 'van', 'van', 'truck', 'bus'];
  const LABELS = ['ガッシャーン!', 'クルマが飛んだ!', 'ひっくり返った!', 'ドッカーン!'];

  class Traffic {
    constructor(scene, world) {
      this.scene = scene; this.world = world; this.cars = [];
      const cfg = CT.config.traffic;
      for (let i = 0; i < cfg.cars + cfg.parked; i++) this.cars.push(this._make(i >= cfg.cars));
      this.reset(null);
    }
    _make(parked) {
      const kind = parked ? U.pick(['sedan', 'sedan', 'van', 'truck']) : U.pick(KINDS);
      const m = CT.Models.car(U.pick(COLORS), kind);
      this.scene.add(m.group);
      return { m, kind, L: m.L, W: m.W, parked, state: 'road', x: 0, y: 0, z: 0, h: 0, vx: 0, vz: 0, vy: 0, speed: 0, vmax: 10, t: 0, ia: 0, ib: 0, d: 0, s: 0, off: CT.config.traffic.laneOffset, decided: false, turn: null, wx: 0, wy: 0, wz: 0, landedT: 0, hold: 0 };
    }
    reset(taxi) { for (const c of this.cars) this._respawn(c, taxi); }

    nodePos(ia, ib) { return { x: this.world.lineX(ia), z: this.world.lineZ(ib) }; }
    validDirs(ia, ib, notBack) {
      const N = this.world.N, out = [];
      for (let d = 0; d < 4; d++) { const a = ia + DX[d], b = ib + DZ[d]; if (a >= 0 && a <= N && b >= 0 && b <= N && d !== notBack) out.push(d); }
      return out;
    }
    _place(c) {
      const W = this.world, P = W.P, off = c.parked ? CT.config.traffic.parkedOffset : CT.config.traffic.laneOffset;
      const A = this.nodePos(c.ia, c.ib), l = LEFT(c.d), px = A.x + DX[c.d] * c.s + DX[l] * off, pz = A.z + DZ[c.d] * c.s + DZ[l] * off;
      c.x = px; c.z = pz; c.h = Math.atan2(DX[c.d], DZ[c.d]); void P;
    }
    _respawn(c, taxi) {
      const N = this.world.N, P = this.world.P, cfg = CT.config.traffic;
      for (let n = 0; n < 40; n++) {
        c.ia = U.randInt(0, N); c.ib = U.randInt(0, N);
        const ds = this.validDirs(c.ia, c.ib, -1); c.d = U.pick(ds);
        c.s = U.rand(8, P - 18);
        this._place(c);
        if (!taxi || Math.hypot(c.x - taxi.x, c.z - taxi.z) > 90) break;
      }
      c.state = c.parked ? 'parked' : 'road'; c.turn = null; c.decided = false; c.y = 0; c.vy = 0; c.hold = 0;
      c.vmax = U.rand(...cfg.speed); c.speed = c.parked ? 0 : c.vmax; c.off = cfg.laneOffset; c.t = 0;
      if (c.parked) { // 車線ではなく路肩寄り。向きは道なり
        c.h = Math.atan2(DX[c.d], DZ[c.d]) + (Math.random() < 0.5 ? 0 : 0);
      }
      c.m.group.visible = true; c.m.shadow.visible = true; c.m.group.rotation.order = 'XYZ'; c.m.group.rotation.set(0, c.h, 0); c.m.body.rotation.set(0, 0, 0);
      this._sync(c);
    }

    _sync(c) {
      const g = c.m.group;
      g.position.set(c.x, c.y, c.z);
      if (c.state === 'fly') return;
      g.rotation.y = c.h;
      const f = this.world.floorAt ? 1 : 0;
      if (f && (c.state === 'road' || c.state === 'turn')) {
        const fx = Math.sin(c.h) * 2, fz = Math.cos(c.h) * 2, W = this.world;
        const yF = W.floorAt(c.x + fx, c.z + fz), yB = W.floorAt(c.x - fx, c.z - fz);
        c.y = (yF + yB) / 2; g.position.y = c.y; c.m.body.rotation.x = -Math.atan2(yF - yB, 4);
      }
    }

    update(dt, taxi) {
      const P = this.world.P, cfg = CT.config.traffic;
      for (const c of this.cars) {
        if (c.state === 'road' || c.state === 'turn') this._drive(c, dt);
        else if (c.state === 'fly') this._fly(c, dt, taxi);
        // 当たり判定
        if (c.state !== 'fly' && taxi.y < 1.6) this._hitTest(c, taxi);
        this._sync(c);
      }
      void P; void cfg;
    }

    _drive(c, dt) {
      const W = this.world, P = W.P, R = 7, off = c.off;
      // 前方に車がいたら減速
      let want = c.vmax;
      const fx = Math.sin(c.h), fz = Math.cos(c.h);
      for (const o of this.cars) {
        if (o === c || o.state === 'fly') continue;
        const dx = o.x - c.x, dz = o.z - c.z, lf = dx * fx + dz * fz;
        if (lf < 0 || lf > 13 + c.L * 0.5) continue;
        const ll = dx * fz - dz * fx;
        if (Math.abs(ll) > 2.4) continue;
        if (!o.parked && Math.cos(o.h - c.h) < 0.8) continue;
        if (o.parked && Math.abs(ll) > 2.0) continue;
        want = Math.min(want, Math.max(0, (lf - (c.L + o.L) * 0.5 - 1.5) * 1.2));
      }
      c.speed = U.damp(c.speed, want, want < c.speed ? 4 : 1.2, dt);
      if (c.hold > 0) { c.hold -= dt; c.speed = 0; }
      const A = this.nodePos(c.ia, c.ib), d = c.d, l = LEFT(d), step = c.speed * dt;
      if (c.state === 'road') {
        c.s += step;
        // 交差点手前で進路決定
        if (!c.decided && c.s >= P - 14) {
          c.decided = true;
          const nb = { a: c.ia + DX[d], b: c.ib + DZ[d] }, ds = this.validDirs(nb.a, nb.b, (d + 2) % 4);
          const r = Math.random();
          let nd = d;
          if (ds.indexOf(d) < 0 || r > 0.62) { const alts = ds.filter((q) => q !== d); nd = alts.length ? U.pick(alts) : d; if (!alts.length && ds.indexOf(d) < 0) nd = (d + 2) % 4; }
          if (nd !== d && nd !== (d + 2) % 4) {
            const B = this.nodePos(nb.a, nb.b), nl = LEFT(nd);
            const cx = B.x + DX[l] * off + DX[nl] * off, cz = B.z + DZ[l] * off + DZ[nl] * off;
            c.turn = { nd, nb, p0x: cx - DX[d] * R, p0z: cz - DZ[d] * R, cx, cz, p2x: cx + DX[nd] * R, p2z: cz + DZ[nd] * R, u: 0 };
            c.turn.sStart = (c.turn.p0x - A.x) * DX[d] + (c.turn.p0z - A.z) * DZ[d];
            c.turn.len = Math.hypot(c.turn.p2x - c.turn.p0x, c.turn.p2z - c.turn.p0z) * 1.12;
          } else if (nd !== d) { // Uターンは作らない: 直進
            c.turn = null;
          } else c.turn = null;
        }
        if (c.turn && c.s >= c.turn.sStart) { c.state = 'turn'; c.turn.u = 0; }
        else if (c.s >= P) { // 直進して次のノードへ
          c.ia += DX[d]; c.ib += DZ[d]; c.s -= P; c.decided = false; c.turn = null;
        }
        if (c.state === 'road') {
          const A2 = this.nodePos(c.ia, c.ib);
          c.x = A2.x + DX[d] * c.s + DX[l] * off; c.z = A2.z + DZ[d] * c.s + DZ[l] * off; c.h = Math.atan2(DX[d], DZ[d]);
        }
      }
      if (c.state === 'turn') {
        const t = c.turn, u = t.u;
        t.u = Math.min(1, u + step / t.len);
        const k = t.u, a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, e = k * k;
        c.x = a * t.p0x + b * t.cx + e * t.p2x; c.z = a * t.p0z + b * t.cz + e * t.p2z;
        const tx = 2 * (1 - k) * (t.cx - t.p0x) + 2 * k * (t.p2x - t.cx), tz = 2 * (1 - k) * (t.cz - t.p0z) + 2 * k * (t.p2z - t.cz);
        c.h = Math.atan2(tx, tz);
        if (t.u >= 1) {
          const B = this.nodePos(t.nb.a, t.nb.b);
          c.ia = t.nb.a; c.ib = t.nb.b; c.d = t.nd; c.s = (t.p2x - B.x) * DX[t.nd] + (t.p2z - B.z) * DZ[t.nd];
          c.state = 'road'; c.turn = null; c.decided = false;
        }
      }
    }

    _hitTest(c, taxi) {
      const r = 1.15, half = Math.max(0, c.L / 2 - c.W / 2), fx = Math.sin(c.h), fz = Math.cos(c.h);
      let hit = false;
      for (const o of [1.45, 0, -1.45]) {
        const px = taxi.x + taxi.fx * o - c.x, pz = taxi.z + taxi.fz * o - c.z;
        const along = U.clamp(px * fx + pz * fz, -half, half);
        const qx = px - fx * along, qz = pz - fz * along;
        if (qx * qx + qz * qz < (c.W / 2 + r) * (c.W / 2 + r)) { hit = true; break; }
      }
      if (!hit) return;
      const sp = taxi.totalSpeed;
      if (c.state === 'parked' && sp < 1.5) return;
      this._launch(c, taxi, sp);
    }

    _launch(c, taxi, sp) {
      const heavy = c.kind === 'bus' ? 0.45 : c.kind === 'truck' ? 0.6 : c.kind === 'van' ? 0.8 : 1;
      const rel = Math.max(sp, 6);
      c.state = 'fly'; c.t = 0; c.landedT = 0;
      c.vx = taxi.vx * 0.9 * (0.5 + heavy * 0.5) + U.rand(-2, 2) + Math.sin(c.h) * c.speed * 0.5;
      c.vz = taxi.vz * 0.9 * (0.5 + heavy * 0.5) + U.rand(-2, 2) + Math.cos(c.h) * c.speed * 0.5;
      c.vy = (9 + rel * 0.25) * heavy;
      c.wx = U.rand(-5, 5) * heavy; c.wy = U.rand(-5, 5); c.wz = U.rand(-6, 6) * heavy;
      c.m.body.rotation.set(0, 0, 0); c.m.group.rotation.order = 'YXZ';
      taxi.vx *= 0.93 - 0.05 * (1 - heavy); taxi.vz *= 0.93 - 0.05 * (1 - heavy); taxi.bump(2.5);
      const pts = c.kind === 'bus' ? 3.2 : c.kind === 'truck' ? 2.6 : c.kind === 'van' ? 2.0 : 1.6;
      CT.bus.emit('prop:hit', { x: c.x, z: c.z, label: U.pick(LABELS), kind: 'car', pts, speed: sp, big: true });
    }

    _fly(c, dt, taxi) {
      const g = c.m.group;
      c.t += dt; c.vy -= 24 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      g.rotation.x += c.wx * dt; g.rotation.y += c.wy * dt; g.rotation.z += c.wz * dt;
      // 建物に当たったら止める
      for (const b of this.world.boxes) {
        if (b.h < 2 || c.y > b.h || c.x < b.minx - 1 || c.x > b.maxx + 1 || c.z < b.minz - 1 || c.z > b.maxz + 1) continue;
        c.vx *= -0.3; c.vz *= -0.3; c.x -= Math.sign(c.vx || 1) * 0.5; break;
      }
      if (c.y <= 0) {
        c.y = 0;
        if (c.vy < -4) { c.vy = -c.vy * 0.35; c.vx *= 0.7; c.vz *= 0.7; c.landedT = 0; }
        else {
          c.vy = 0; c.vx *= 0.92; c.vz *= 0.92; c.landedT += dt; c.wx *= 0.85; c.wy *= 0.9; c.wz *= 0.85;
          g.rotation.x = U.damp(g.rotation.x, Math.round(g.rotation.x / 6.2832) * 6.2832, 4, dt);
          g.rotation.z = U.damp(g.rotation.z, Math.round(g.rotation.z / 6.2832) * 6.2832, 4, dt);
        }
      }
      g.position.set(c.x, c.y, c.z);
      c.m.shadow.visible = c.y < 8;
      if (c.t > 7) { // 退場 → どこか遠くで補充
        c.m.group.visible = false; c.hold = 0; g.rotation.order = 'XYZ';
        c.state = 'gone'; c.t = 0;
      }
    }
  }
  // 'gone' から復帰させる (updateで処理)
  const origUpdate = Traffic.prototype.update;
  Traffic.prototype.update = function (dt, taxi) {
    for (const c of this.cars) if (c.state === 'gone') { c.t += dt; if (c.t > 3) this._respawn(c, taxi); }
    origUpdate.call(this, dt, taxi);
  };
  CT.Traffic = Traffic;
})();
