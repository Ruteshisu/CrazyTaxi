/* 追従カメラ: ドリフト時の流れ、速度でFOV変化、ヒット時のシェイク/ズームパンチ、建物めり込み回避 */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const U = CT.util;

  class ChaseCamera {
    constructor(camera, world) {
      this.cam = camera; this.world = world;
      this.angle = 0; this.fov = 62; this.shakeT = 0; this.shakeA = 0; this.punch = 0;
      this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.inited = false;
      this.orbit = 0; // 演出用の追加回転
      CT.bus.on('ped:hit', (e) => this.shake(0.28 + Math.min(0.5, e.speed / 60), 0.35 + e.speed / 90));
      CT.bus.on('crash', (e) => this.shake(0.3 * e.power + 0.1, 0.5 * e.power));
    }
    shake(dur, amp) { this.shakeT = Math.max(this.shakeT, dur); this.shakeA = Math.max(this.shakeA, amp); this.punch = Math.max(this.punch, Math.min(1, amp)); }
    snap(taxi) { this.angle = taxi.h; this.inited = false; }

    update(dt, taxi) {
      const speed = taxi.totalSpeed, h = taxi.h;
      // 見る方向: 車体向きと速度方向を混ぜる (ドリフト中は進行方向寄り)
      let target = h;
      if (speed > 6) { const va = Math.atan2(taxi.vx, taxi.vz); target = h + U.angleDiff(va, h) * 0.45; if (taxi.speed < -1) target = h + Math.PI; }
      this.angle += U.angleDiff(target, this.angle) * (1 - Math.exp(-4.2 * dt));
      const dist = 10.5 + speed * 0.09 + (taxi.boosting ? 2.5 : 0), height = 4.4 + speed * 0.045;
      const dx = -Math.sin(this.angle), dz = -Math.cos(this.angle);
      let cx = taxi.x + dx * dist, cz = taxi.z + dz * dist, cy = height + taxi.y * 0.5;
      // 建物めり込み回避: 注視点→カメラの線分が建物に当たったら手前に詰める
      const tx = taxi.x, tz = taxi.z;
      let k = 1;
      for (const b of this.world.boxes) {
        if (b.h < cy + 1) continue;
        if (segBox(tx, tz, cx, cz, b.minx - 0.8, b.maxx + 0.8, b.minz - 0.8, b.maxz + 0.8)) {
          // 当たる最小tを求める (ざっくり二分)
          let lo = 0, hi = 1; for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; if (segBox(tx, tz, tx + (cx - tx) * m, tz + (cz - tz) * m, b.minx - 0.8, b.maxx + 0.8, b.minz - 0.8, b.maxz + 0.8)) hi = m; else lo = m; }
          k = Math.min(k, lo);
        }
      }
      if (k < 1) { k = Math.max(0.25, k); cx = tx + (cx - tx) * k; cz = tz + (cz - tz) * k; cy = Math.max(2.4, cy * (0.5 + 0.5 * k)); }
      if (!this.inited) { this.pos.set(cx, cy, cz); this.inited = true; }
      this.pos.x = U.damp(this.pos.x, cx, 9, dt); this.pos.y = U.damp(this.pos.y, cy, 6, dt); this.pos.z = U.damp(this.pos.z, cz, 9, dt);
      this.look.set(taxi.x + Math.sin(this.angle) * 6, 1.6 + taxi.y, taxi.z + Math.cos(this.angle) * 6);
      // FOV
      const fovT = 60 + U.clamp(speed / CT.config.taxi.maxSpeed, 0, 1.5) * 14 + (taxi.boosting ? 8 : 0) + this.punch * 10;
      this.fov = U.damp(this.fov, fovT, 5, dt);
      this.punch = U.damp(this.punch, 0, 7, dt);
      this.cam.fov = this.fov; this.cam.updateProjectionMatrix();
      this.cam.position.copy(this.pos);
      if (this.shakeT > 0) {
        this.shakeT -= dt; const a = this.shakeA * Math.min(1, this.shakeT * 4);
        this.cam.position.x += (Math.random() - 0.5) * a; this.cam.position.y += (Math.random() - 0.5) * a; this.cam.position.z += (Math.random() - 0.5) * a;
        if (this.shakeT <= 0) this.shakeA = 0;
      }
      this.cam.lookAt(this.look);
      // 空は常にカメラ中心
      if (this.world.sky) this.world.sky.position.copy(this.cam.position);
    }
  }

  function segBox(ax, az, bx, bz, x0, x1, z0, z1) {
    let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
    for (const [p, q, lo, hi] of [[dx, ax, x0, x1], [dz, az, z0, z1]]) {
      if (Math.abs(p) < 1e-9) { if (q < lo || q > hi) return false; }
      else { let a = (lo - q) / p, b = (hi - q) / p; if (a > b) { const t = a; a = b; b = t; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return false; }
    }
    return true;
  }
  CT.ChaseCamera = ChaseCamera;
})();
