/* お客さん(配送)システム: マップ中に散らばった客(常に cfg.spots 人) → 近づいて停止すれば誰でも乗せられる → 目的地へ → 到着で料金+時間延長。
   客の色は目的地までの距離帯(緑=近い/黄=中/赤=遠い)。客の頭上には巨大な矢印、タクシーの屋根にも目的地を指す矢印が出る */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const U = CT.util;

  class Fare {
    constructor(scene, world) {
      this.scene = scene; this.world = world; this.cfg = CT.config.fare;
      this.spots = []; this.current = null; this.dest = null;
      this.root = new THREE.Group(); scene.add(this.root);
      this.t = 0;
      this.arrow = this._roofArrow(); scene.add(this.arrow);
    }
    get onboard() { return !!this.current; }
    /** 車内に客が見えている間 (乗り込み完了〜降車開始) */
    get riding() { return !!this.current || !!(this.cap && this.cap.kind === 'pick' && this.cap.ct >= 1.0); }
    /** お客さんごとの見た目 (乗車中の車内/降車でも同じ見た目になる) */
    _look() {
      const U2 = U;
      return { seed: Math.floor(Math.random() * 1e9), scale: 1.0,
        shirt: U2.pick([0xff5050, 0x3fa7ff, 0xb07cff, 0xffffff, 0xffd23a, 0x5fd068, 0xff8ad0, 0xff9a2e, 0x2dd4bf]),
        pants: U2.pick([0x2b4a7a, 0x3a3a46, 0x7a5a3a, 0x556b2f, 0x6a3a6a]),
        hair: U2.pick([0x2b1d12, 0x5a3a1c, 0x111111, 0xd9b44a, 0xb04a2a, 0xdddddd]),
        skin: U2.pick([0xf3c9a0, 0xe0a878, 0xc68642, 0xffdbb5]) };
    }
    /** タクシー屋根の上に浮く、目的地を指す矢印 (平たい矢印形) */
    _roofArrow() {
      const THREE = window.THREE, sh = new THREE.Shape();
      sh.moveTo(0, 2.3); sh.lineTo(1.5, 0.3); sh.lineTo(0.55, 0.3); sh.lineTo(0.55, -1.7); sh.lineTo(-0.55, -1.7); sh.lineTo(-0.55, 0.3); sh.lineTo(-1.5, 0.3); sh.lineTo(0, 2.3);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: false }); geo.translate(0, 0, -0.25); geo.rotateX(Math.PI / 2); // 先端が +z
      const mat = new THREE.MeshBasicMaterial({ color: 0x38e060 });
      const m = new THREE.Mesh(geo, mat), g = new THREE.Group(); g.add(m);
      const edge = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide })); edge.scale.set(1.12, 1.4, 1.12); g.add(edge);
      g.userData = { mat }; g.visible = false; return g;
    }
    reset(taxi) {
      for (const s of this.spots) this.root.remove(s.obj);
      if (this.dest) this.root.remove(this.dest.obj);
      this.spots = []; this.current = null; this.dest = null; this.cap = null;
      if (this.passenger) { this.root.remove(this.passenger.group); this.passenger = null; }
      this.arrow.visible = true;
      for (let i = 0; i < this.cfg.spots; i++) this._spawn(taxi, i === 0 ? 0 : i);
    }
    hideArrow() { this.arrow.visible = false; }
    _marker(color, big) {
      const g = new THREE.Group(), RR = big ? this.cfg.dropRadius : this.cfg.pickupRadius;
      const ring = new THREE.Mesh(new THREE.RingGeometry(RR - 1.5, RR, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.45; ring.renderOrder = 3; g.add(ring);
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(RR * 0.8, RR * 0.8, 80, 28, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, fog: false }));
      pil.position.y = 40; g.add(pil);
      const arr = CT.Models.arrowMarker(color); arr.scale.setScalar(big ? 3.0 : 2.2); arr.position.y = 13; g.add(arr);
      g.userData = { ring, pil, arr };
      return g;
    }
    _tierPick(i) { return this.cfg.tiers[i % 3 === 2 ? 1 : i % 3 === 1 ? 0 : (i % 2 ? 2 : 0)]; }
    _spawn(taxi, i, avoid) {
      const tiers = this.cfg.tiers, r = Math.random(), tier = r < 0.42 ? tiers[0] : r < 0.8 ? tiers[1] : tiers[2];
      let s = null;
      for (let n = 0; n < 30; n++) {
        const q = i === 0 && !this.spots.length && !avoid ? this.world.randomSpot(taxi.x, taxi.z, 120, 200) : this.world.randomSpot(0, 0, 0, 1e9);
        const dT = Math.hypot(q.x - taxi.x, q.z - taxi.z);
        if (dT < 40) continue;
        if (this.spots.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < 45)) continue;
        s = q; break;
      }
      if (!s) s = this.world.randomSpot(taxi.x, taxi.z, 60, 400);
      const obj = this._marker(tier.color, false);
      const look = this._look(), cust = CT.Models.human(Object.assign({}, look, { scale: 1.05 * CT.config.ped.scale }));
      cust.group.position.set(0, 0.3, 0); obj.add(cust.group);
      obj.position.set(s.x, 0, s.z); this.root.add(obj);
      this.spots.push({ tier, x: s.x, z: s.z, obj, cust, look, ph: Math.random() * 6 });
    }
    /** 現在の案内先 {x,z,color,kind} (客探し中は一番近い客) */
    target(taxi) {
      if (this.current) return { x: this.dest.x, z: this.dest.z, color: this.current.tier.color, kind: 'dest' };
      let best = null, bd = 1e9;
      for (const s of this.spots) { const d = U.dist2(s.x, s.z, taxi.x, taxi.z); if (d < bd) { bd = d; best = s; } }
      return best ? { x: best.x, z: best.z, color: best.tier.color, kind: 'spot' } : null;
    }

    update(dt, taxi, game) {
      this.t += dt;
      if (this.passengerT > 0) { this.passengerT -= dt; if (this.passengerT <= 0 && this.passenger) { this.root.remove(this.passenger.group); this.passenger = null; } }
      const pulse = 1 + Math.sin(this.t * 5) * 0.05;
      const tg = this.target(taxi);
      for (const s of this.spots) {
        s.obj.userData.ring.scale.setScalar(pulse); CT.Models.animHuman(s.cust, 'wave', this.t * 3 + s.ph, this.t + s.ph);
        s.cust.group.rotation.y = Math.atan2(taxi.x - s.x, taxi.z - s.z);
        const near = tg && tg.kind === 'spot' && tg.x === s.x && tg.z === s.z;
        s.obj.userData.arr.position.y = 13 + Math.sin(this.t * 4 + s.ph) * 1.0; s.obj.userData.arr.rotation.y = this.t * 2;
        s.obj.userData.pil.visible = !this.current; s.obj.userData.arr.visible = !this.current;
        s.obj.userData.pil.material.opacity = near ? 0.34 : 0.17;
      }
      if (this.dest) { this.dest.obj.userData.ring.scale.setScalar(pulse); this.dest.obj.userData.arr.position.y = 13 + Math.sin(this.t * 4) * 1.0; this.dest.obj.userData.arr.rotation.y = this.t * 2; }
      // 屋根の矢印
      if (tg) {
        const a = this.arrow, dx = tg.x - taxi.x, dz = tg.z - taxi.z;
        a.visible = true; a.userData.mat.color.setHex(tg.color);
        a.position.set(taxi.x, taxi.y + 2.5 + Math.sin(this.t * 6) * 0.1, taxi.z);
        a.rotation.order = 'YXZ'; a.rotation.y = Math.atan2(dx, dz); a.rotation.x = -0.45;
        const sc = 0.62 + Math.sin(this.t * 6) * 0.03; a.scale.set(sc, sc, sc);
      } else this.arrow.visible = false;
      const sp = taxi.totalSpeed;
      if (this.cap) { this._cap(dt, taxi, game); return; }
      if (taxi.y > 1 || taxi.spinning) return;
      if (!this.current) {
        for (const s of this.spots) {
          if (Math.hypot(s.x - taxi.x, s.z - taxi.z) < this.cfg.pickupRadius) { this._startCap('pick', s, taxi); break; }
        }
      } else {
        const d = Math.hypot(this.dest.x - taxi.x, this.dest.z - taxi.z);
        this.current.dist2dest = d;
        if (d < this.cfg.dropRadius) this._startCap('drop', null, taxi);
      }
      void sp;
    }
    get busy() { return !!this.cap; }
    /** 輪に入った: 急ブレーキ → 停車したら乗降の演出(1.7秒) */
    _startCap(kind, spot, taxi) {
      this.cap = { kind, spot, phase: 'brake', t: 0, ct: 0 };
      taxi.autoBrake = true; CT.bus.emit('fare:brake', { kind });
    }
    _cap(dt, taxi, game) {
      const c = this.cap; c.t += dt;
      const lx = Math.cos(taxi.h), lz = -Math.sin(taxi.h); // 左ドア側
      if (c.phase === 'brake') {
        if (taxi.totalSpeed < 1.5 || c.t > 1.6) {
          taxi.vx = taxi.vz = 0; taxi.speed = 0; c.phase = 'cine'; c.ct = 0; c.dur = c.kind === 'drop' ? 2.3 : 1.7;
          CT.bus.emit('cine', { kind: c.kind, dur: c.dur, x: taxi.x, z: taxi.z });
          if (c.kind === 'drop') this._deliver(taxi, game, true);
          else { c.s0 = { x: c.spot.x, z: c.spot.z }; c.spot.obj.userData.pil.visible = false; }
        }
        return;
      }
      taxi.vx = taxi.vz = 0; c.ct += dt;
      const door = { x: taxi.x + lx * 2.0, z: taxi.z + lz * 2.0 };
      if (c.kind === 'pick') {
        const s = c.spot, p = Math.min(1, c.ct / 1.0), e = p * p * (3 - 2 * p);
        const wx = U.lerp(c.s0.x, door.x, e), wz = U.lerp(c.s0.z, door.z, e);
        s.cust.group.position.set(wx - s.obj.position.x, 0.3, wz - s.obj.position.z);
        s.cust.group.rotation.y = Math.atan2(door.x - c.s0.x, door.z - c.s0.z);
        CT.Models.animHuman(s.cust, p < 1 ? 'walk' : 'wave', c.ct * 9, c.ct);
        if (c.ct >= 1.0) s.cust.group.visible = false; // ドアに着いたら乗り込み (拡大縮小はせず、車内に座った姿に切り替わる)
        if (!c.boarded && c.ct >= 1.0) { c.boarded = true; this._board(s, taxi, game); }
        if (c.ct >= c.dur) this._endCap(taxi);
      } else {
        const pg = this.passenger;
        if (pg) {
          // 前半: ドア横で車のほうを向いて反応(ハイタッチ等) / 後半: 歩き去る
          const rx = c.react || 'wave', talk = rx === 'wave' || rx === 'bow' ? 0.5 : 1.0, ox = door.x + lx * 0.4, oz = door.z + lz * 0.4;
          const tx = taxi.x + lx * 3.4 + Math.sin(taxi.h) * 6.5, tz = taxi.z + lz * 3.4 + Math.cos(taxi.h) * 6.5;
          if (c.ct < talk) {
            pg.group.position.set(ox, 0.3, oz); pg.group.rotation.y = Math.atan2(-lx, -lz);
            CT.Models.animHuman(pg, rx, c.ct, c.ct * 1.2);
          } else {
            const p = Math.min(1, (c.ct - talk) / 1.3);
            pg.group.position.set(U.lerp(ox, tx, p), 0.3, U.lerp(oz, tz, p)); pg.group.rotation.y = Math.atan2(tx - ox, tz - oz);
            CT.Models.animHuman(pg, p < 1 ? 'walk' : 'wave', c.ct * 9, c.ct);
          }
        }
        if (c.ct >= c.dur) this._endCap(taxi);
      }
    }
    _endCap(taxi) { taxi.autoBrake = false; this.cap = null; if (this.passenger) { this.passengerT = 3; } }

    _board(s, taxi, game) {
      const tier = s.tier;
      const d = this.world.randomSpot(s.x, s.z, tier.dist[0], tier.dist[1]);
      const obj = this._marker(0xffffff, true);
      obj.userData.ring.material.color.setHex(tier.color);
      obj.position.set(d.x, 0, d.z); this.root.add(obj);
      this.root.remove(s.obj); this.spots.splice(this.spots.indexOf(s), 1); // 他の客はそのまま残す
      this.dest = { x: d.x, z: d.z, obj };
      const dist = Math.hypot(d.x - s.x, d.z - s.z);
      this.current = { tier, dist, startT: game.playTime, artAtStart: game.score.art, from: { x: s.x, z: s.z }, look: s.look };
      taxi.setPassenger(s.look);
      CT.bus.emit('pickup', { x: s.x, z: s.z, tier, dist });
    }

    _deliver(taxi, game, cine) {
      const c = this.current, tier = c.tier;
      const ride = Math.max(1, game.playTime - c.startT), ideal = c.dist / 20;
      const ratio = U.clamp(ideal / ride, 0.3, 1.4);
      const money = Math.round(tier.base + c.dist * 0.6 + tier.base * Math.max(0, ratio - 0.6));
      const tip = Math.round(Math.max(0, game.score.art - c.artAtStart) * 0.12);
      const timeBonus = Math.round(tier.time * U.clamp(ratio + 0.2, 0.6, 1.4) * 10) / 10;
      const rating = ratio > 1.0 ? 'スゴイ!!' : ratio > 0.75 ? 'グレート!' : ratio > 0.5 ? 'グッド' : 'ふつう';
      const info = { x: this.dest.x, z: this.dest.z, money, tip, timeBonus, rating, tier, dist: c.dist, ride };
      this.root.remove(this.dest.obj); this.dest = null; this.current = null;
      CT.bus.emit('deliver', info);
      if (cine) { // 降りるお客さん (乗せたときと同じ見た目。ドア横に現れる)
        if (this.passenger) this.root.remove(this.passenger.group);
        this.passenger = CT.Models.human(Object.assign({}, c.look, { scale: 1.05 * CT.config.ped.scale }));
        this.root.add(this.passenger.group);
        // 良いプレイならハイタッチ等 (評価でバリエーション)
        const R = Math.random(), good = rating === 'スゴイ!!' ? (R < 0.5 ? 'hifi' : 'banzai') : rating === 'グレート!' ? (R < 0.6 ? 'hifi' : 'fist') : rating === 'グッド' ? (R < 0.5 ? 'thumbs' : 'bow') : 'wave';
        this.cap.react = good;
        const label = { hifi: 'ハイタッチ!', banzai: 'バンザーイ!', fist: 'グータッチ!', thumbs: 'いいね!', bow: 'ありがとう!', wave: '' }[good];
        taxi.react(good === 'hifi' || good === 'fist' ? good : good === 'banzai' ? 'banzai' : null, 1.3);
        if (label && game.score && (good === 'hifi' || good === 'banzai' || good === 'fist')) game.score.add(good === 'banzai' ? 700 : 400, { kind: 'bonus', label, x: this.dest ? this.dest.x : taxi.x, y: 3, z: this.dest ? this.dest.z : taxi.z, big: true });
        else if (label) CT.bus.emit('fare:react', { label, x: taxi.x, z: taxi.z });
      }
      while (this.spots.length < this.cfg.spots) this._spawn(taxi, this.spots.length, true);
    }
  }
  CT.Fare = Fare;
})();
