/* お客さん(配送)システム: 客スポット3つ(距離で色分け) → 停止して乗車 → 目的地へ → 到着で料金+時間延長 */
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
    }
    get onboard() { return !!this.current; }
    reset(taxi) {
      for (const s of this.spots) this.root.remove(s.obj);
      if (this.dest) this.root.remove(this.dest.obj);
      this.spots = []; this.current = null; this.dest = null;
      this.spawnSpots(taxi);
    }
    _marker(color, big) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(big ? 6.6 : 5.2, big ? 8.2 : 6.6, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.45; ring.renderOrder = 3; g.add(ring);
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(big ? 6.5 : 4.5, big ? 6.5 : 4.5, 60, 20, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, fog: false }));
      pil.position.y = 30; g.add(pil);
      g.userData = { ring, pil };
      return g;
    }
    spawnSpots(taxi) {
      for (const t of this.cfg.tiers) this._spawn(taxi, t);
    }
    _spawn(taxi, tier) {
      const s = this.world.randomSpot(taxi.x, taxi.z, tier.dist[0] * 0.6, tier.dist[1] * 0.75);
      const obj = this._marker(tier.color, false);
      const cust = CT.Models.human({ shirt: U.pick([0xff5050, 0x3fa7ff, 0xb07cff, 0xffffff]), pants: 0x2b4a7a, scale: 1.05 });
      cust.group.position.set(0, 0.3, 0); obj.add(cust.group);
      obj.position.set(s.x, 0, s.z); this.root.add(obj);
      this.spots.push({ tier, x: s.x, z: s.z, obj, cust });
    }
    /** 現在の案内先 {x,z,color,kind} */
    target(taxi) {
      if (this.current) return { x: this.dest.x, z: this.dest.z, color: this.current.tier.color, kind: 'dest' };
      let best = null, bd = 1e9;
      for (const s of this.spots) { const d = U.dist2(s.x, s.z, taxi.x, taxi.z); if (d < bd) { bd = d; best = s; } }
      return best ? { x: best.x, z: best.z, color: best.tier.color, kind: 'spot' } : null;
    }

    update(dt, taxi, game) {
      this.t += dt;
      const pulse = 1 + Math.sin(this.t * 5) * 0.05;
      for (const s of this.spots) {
        s.obj.userData.ring.scale.setScalar(pulse); CT.Models.animHuman(s.cust, 'wave', this.t * 3, this.t);
        s.cust.group.rotation.y = Math.atan2(taxi.x - s.x, taxi.z - s.z);
      }
      if (this.dest) this.dest.obj.userData.ring.scale.setScalar(pulse);
      const sp = taxi.totalSpeed;
      if (!this.current) {
        for (const s of this.spots) {
          const d = Math.hypot(s.x - taxi.x, s.z - taxi.z);
          if (d < this.cfg.pickupRadius && sp < this.cfg.stopSpeed && taxi.y < 1) { this._board(s, taxi, game); break; }
        }
      } else {
        const d = Math.hypot(this.dest.x - taxi.x, this.dest.z - taxi.z);
        this.current.dist2dest = d;
        if (d < this.cfg.dropRadius && sp < this.cfg.stopSpeed && taxi.y < 1) this._deliver(taxi, game);
      }
    }

    _board(s, taxi, game) {
      const tier = s.tier;
      // 目的地
      const d = this.world.randomSpot(s.x, s.z, tier.dist[0], tier.dist[1]);
      const obj = this._marker(0xffffff, true);
      obj.userData.ring.material.color.setHex(tier.color);
      obj.position.set(d.x, 0, d.z); this.root.add(obj);
      for (const o of this.spots) this.root.remove(o.obj);
      this.spots = [];
      this.dest = { x: d.x, z: d.z, obj };
      const dist = Math.hypot(d.x - s.x, d.z - s.z);
      this.current = { tier, dist, startT: game.playTime, artAtStart: game.score.art, from: { x: s.x, z: s.z } };
      CT.bus.emit('pickup', { x: s.x, z: s.z, tier, dist });
    }

    _deliver(taxi, game) {
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
      this.spawnSpots(taxi);
    }
  }
  CT.Fare = Fare;
})();
