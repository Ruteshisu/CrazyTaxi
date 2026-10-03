/* 追従カメラ: ドリフト時の流れ、速度でFOV変化、ヒット時のシェイク/ズームパンチ、建物めり込み回避 */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const U = CT.util;

  class ChaseCamera {
    constructor(camera, world) {
      this.cam = camera; world && 0; this.world = world;
      this.angle = 0; this.fov = CT.config.camera.fov; this.shakeT = 0; this.shakeA = 0; this.punch = 0; this.pull = 0; this.pullT = 0;
      this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.inited = false;
      // 演出レベル(連続ヒット)が高いほど揺れ・ズームパンチ・引きが大きい。1発目はごく控えめ
      CT.bus.on('ped:hit', (e) => {
        const lv = e.level || 0;
        this.shake(0.12 + lv * 0.1, 0.06 + lv * 0.18);
        if (lv >= 2) { this.pull = Math.max(this.pull, 1.5 + (lv - 2) * 1.5); this.pullT = 1.6; }
      });
      CT.bus.on('crash', (e) => this.shake(0.3 * e.power + 0.1, 0.5 * e.power));
      CT.bus.on('jump:land', () => this.shake(0.25, 0.35));
      CT.bus.on('cine', (e) => { this.cine = { t: 0, dur: e.dur, kind: e.kind }; });
      this.cine = null; this.blend = 0;
    }
    shake(dur, amp) { this.shakeT = Math.max(this.shakeT, dur); this.shakeA = Math.max(this.shakeA, amp); this.punch = Math.max(this.punch, Math.min(1, amp)); }
    snap(taxi) { this.angle = taxi.h; this.inited = false; this.pull = 0; }

    update(dt, taxi) {
      const C = CT.config.camera, speed = taxi.totalSpeed, h = taxi.h;
      // 見る方向: 基本は車体後方。ドリフト中は進行方向寄り。きりもみ中は速度方向 (回転に釣られない)
      let target = h;
      if (taxi.spinning) target = Math.atan2(taxi.vx, taxi.vz);
      else if (speed > 6 && taxi.speed >= -1) { const va = Math.atan2(taxi.vx, taxi.vz); target = h + U.angleDiff(va, h) * 0.4; } // バック中は車体後方のまま (カメラを反転させない)
      this.angle += U.angleDiff(target, this.angle) * (1 - Math.exp(-(taxi.spinning ? 2.2 : 5) * dt));
      if (this.pullT > 0) this.pullT -= dt; else this.pull = U.damp(this.pull, 0, 1.5, dt);
      const dist = C.dist + speed * 0.03 + (taxi.boosting ? 1.4 : 0) + this.pull + (taxi.air ? 1.5 : 0);
      const height = C.height + speed * 0.02 + this.pull * 0.35;
      const dx = -Math.sin(this.angle), dz = -Math.cos(this.angle);
      let cx = taxi.x + dx * dist, cz = taxi.z + dz * dist, cy = height + taxi.y * 0.75;
      // 建物めり込み回避: 注視点→カメラの線分が建物に当たったら手前に詰める
      const tx = taxi.x, tz = taxi.z;
      let k = 1;
      for (const b of this.world.boxes) {
        if (b.h < cy + 1 || b.maxx < Math.min(tx, cx) - 2 || b.minx > Math.max(tx, cx) + 2 || b.maxz < Math.min(tz, cz) - 2 || b.minz > Math.max(tz, cz) + 2) continue;
        if (segBox(tx, tz, cx, cz, b.minx - 0.8, b.maxx + 0.8, b.minz - 0.8, b.maxz + 0.8)) {
          let lo = 0, hi = 1; for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; if (segBox(tx, tz, tx + (cx - tx) * m, tz + (cz - tz) * m, b.minx - 0.8, b.maxx + 0.8, b.minz - 0.8, b.maxz + 0.8)) hi = m; else lo = m; }
          k = Math.min(k, lo);
        }
      }
      if (k < 1) { k = Math.max(0.3, k); cx = tx + (cx - tx) * k; cz = tz + (cz - tz) * k; cy = Math.max(2.0, cy * (0.6 + 0.4 * k)); }
      if (!this.inited) { this.pos.set(cx, cy, cz); this.inited = true; }
      this.pos.x = U.damp(this.pos.x, cx, 12, dt); this.pos.y = U.damp(this.pos.y, cy, 7, dt); this.pos.z = U.damp(this.pos.z, cz, 12, dt);
      this.look.set(taxi.x + Math.sin(this.angle) * C.lookAhead, C.lookHeight + taxi.y * 0.8, taxi.z + Math.cos(this.angle) * C.lookAhead);
      // FOV
      const fovT = C.fov + U.clamp(speed / CT.config.taxi.maxSpeed, 0, 1.5) * 12 + (taxi.boosting ? 7 : 0) + this.punch * 8;
      this.fov = U.damp(this.fov, fovT, 5, dt);
      this.punch = U.damp(this.punch, 0, 7, dt);
      this.cam.fov = this.fov; this.cam.updateProjectionMatrix();
      // 乗降の演出カメラ: 左ドア側から回り込みながら見せる (1〜2秒)
      let lookT = this.look;
      if (this.cine) {
        this.cine.t += dt; if (this.cine.t > this.cine.dur) this.cine = null;
      }
      this.blend = U.damp(this.blend, this.cine ? 1 : 0, this.cine ? 10 : 6, dt);
      this.cam.position.copy(this.pos);
      if (this.blend > 0.002) {
        const ct = this.cine ? this.cine.t / this.cine.dur : 1, phi = U.lerp(1.0, -0.55, Math.min(1, ct));
        const lx = Math.cos(h), lz = -Math.sin(h), fx = Math.sin(h), fz = Math.cos(h), R = 6.0;
        const px = taxi.x + (lx * Math.cos(phi) + fx * Math.sin(phi)) * R, pz = taxi.z + (lz * Math.cos(phi) + fz * Math.sin(phi)) * R, py = 1.8 + ct * 0.7;
        this.cam.position.set(U.lerp(this.pos.x, px, this.blend), U.lerp(this.pos.y, py, this.blend), U.lerp(this.pos.z, pz, this.blend));
        lookT = this._lt = this._lt || new THREE.Vector3();
        lookT.set(U.lerp(this.look.x, taxi.x + lx * 1.6, this.blend), U.lerp(this.look.y, 1.3, this.blend), U.lerp(this.look.z, taxi.z + lz * 1.6, this.blend));
      }
      if (this.shakeT > 0) {
        this.shakeT -= dt; const a = this.shakeA * Math.min(1, this.shakeT * 4);
        this.cam.position.x += (Math.random() - 0.5) * a; this.cam.position.y += (Math.random() - 0.5) * a; this.cam.position.z += (Math.random() - 0.5) * a;
        if (this.shakeT <= 0) this.shakeA = 0;
      }
      this.cam.lookAt(lookT);
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
