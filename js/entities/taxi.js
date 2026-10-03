/* タクシー: アーケード寄りの車両物理 + 見た目の同期。
   heading h: 前方ベクトル f=(sin h, cos h), 左ベクトル l=(cos h, -sin h)。ステア入力は右が正(=hが減る) */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const U = CT.util;

  class Taxi {
    constructor(scene, color) {
      this.model = CT.Models.taxi(color);
      scene.add(this.model.group);
      this.cfg = CT.config.taxi;
      this.reset(0, 0, 0);
    }
    reset(x, z, h) {
      this.x = x; this.z = z; this.y = 0; this.vy = 0; this.h = h;
      this.vx = 0; this.vz = 0;
      this.yaw = 0; this.speed = 0; this.slip = 0; this.drifting = false; this.driftTime = 0;
      this.grip = this.cfg.gripNormal;
      this.boost = 1; this.boosting = false; this.steerVis = 0;
      this.roll = 0; this.pitch = 0; this.wheelSpin = 0; this.accel = 0; this.lastCtl = { throttle: 0, steer: 0 };
      this.crashCooldown = 0;
      this.sync();
    }
    get fx() { return Math.sin(this.h); }
    get fz() { return Math.cos(this.h); }
    get totalSpeed() { return Math.hypot(this.vx, this.vz); }
    /** ワールド座標 → 車ローカル (lf=前方, ll=左) */
    toLocal(x, z) {
      const dx = x - this.x, dz = z - this.z, fx = this.fx, fz = this.fz;
      return { lf: dx * fx + dz * fz, ll: dx * fz * 1 - dz * fx * 1 };
    }
    /** 小さく跳ねる (ヒット時のバウンド) */
    bump(vy) { if (this.y < 0.3) this.vy = Math.max(this.vy, vy); }

    update(dt, ctl, world) {
      const n = Math.max(1, Math.ceil(dt / (1 / 90)));
      const sdt = dt / n;
      for (let i = 0; i < n; i++) this._step(sdt, ctl, world);
      this.lastCtl = ctl;
      this.sync(dt);
    }

    _step(dt, ctl, world) {
      const C = this.cfg;
      this.crashCooldown = Math.max(0, this.crashCooldown - dt);
      // ブースト
      const wantBoost = ctl.boost && this.boost > 0.02 && ctl.throttle >= 0;
      this.boosting = wantBoost;
      if (wantBoost) this.boost = Math.max(0, this.boost - C.boostDrain * dt);
      else this.boost = Math.min(1, this.boost + (C.boostRecharge + (this.drifting ? C.boostDriftGain : 0)) * dt);
      const maxS = wantBoost ? C.boostSpeed : C.maxSpeed;

      // 1) 旋回: ヘディングを回してから、速度を新しい軸で分解 (横滑りが自然に生まれる)
      const spPrev = this.speed;
      const sp = Math.abs(spPrev);
      const auth = Math.min(sp / 5, 1) * (1 - 0.45 * Math.min(sp / C.maxSpeed, 1));
      const dir = spPrev >= -0.5 ? 1 : -1;
      const rate = C.steerRate * (ctl.handbrake ? 1.55 : 1);
      const yawT = -ctl.steer * rate * auth * dir;
      this.yaw = U.damp(this.yaw, yawT, ctl.handbrake ? 9 : 13, dt);
      this.h += this.yaw * dt;
      const fx = Math.sin(this.h), fz = Math.cos(this.h), lx = Math.cos(this.h), lz = -Math.sin(this.h);
      let vF = this.vx * fx + this.vz * fz;
      let vL = this.vx * lx + this.vz * lz;

      // 2) 縦方向: アクセル/ブレーキ
      const prevF = vF;
      if (ctl.throttle > 0) {
        if (vF < -0.5) vF += C.brake * dt;
        else vF += C.engine * Math.max(0, 1 - Math.max(0, vF) / maxS) * ctl.throttle * dt * (wantBoost ? 2.4 : 1);
      } else if (ctl.throttle < 0) {
        if (vF > 0.8) vF -= C.brake * -ctl.throttle * dt;
        else vF = Math.max(vF + ctl.throttle * C.engine * 0.55 * dt, -C.reverseMax);
      } else {
        vF -= Math.sign(vF) * Math.min(Math.abs(vF), 3.5 * dt);
      }
      vF -= vF * 0.05 * dt;
      if (vF > maxS) vF = U.damp(vF, maxS, 1.6, dt);
      if (ctl.handbrake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 5.5 * dt);

      // 3) グリップ: ハンドブレーキ/急ハンドル+高速で滑る
      const load = Math.abs(ctl.steer) * Math.min(sp / C.maxSpeed, 1);
      let gripT = U.lerp(C.gripNormal, 4.6, load * load);
      if (ctl.handbrake && sp > 5) gripT = C.gripDrift;
      this.grip = U.damp(this.grip, gripT, gripT < this.grip ? 30 : 3.2, dt);
      vL *= Math.exp(-this.grip * dt);

      this.vx = fx * vF + lx * vL; this.vz = fz * vF + lz * vL;
      this.speed = vF; this.slip = Math.abs(vL);
      this.accel = (vF - prevF) / dt;

      // 4) 位置・上下動
      this.x += this.vx * dt; this.z += this.vz * dt;
      this.vy -= 32 * dt; this.y += this.vy * dt;
      if (this.y < 0) { this.y = 0; this.vy = this.vy < -3 ? -this.vy * 0.25 : 0; }

      // ドリフト判定 (ヒステリシス)
      const dr = this.slip > (this.drifting ? 3.2 : 5) && Math.abs(vF) > 8;
      if (dr) this.driftTime += dt; else if (this.drifting) this.driftTime = 0;
      this.drifting = dr;

      this._collide(world);
    }

    _collide(world) {
      const r = this.cfg.radius, offs = [1.45, 0, -1.45];
      for (const o of offs) {
        const cx = this.x + this.fx * o, cz = this.z + this.fz * o;
        let hit = null;
        for (const b of world.boxes) {
          if (b.h < 0.45 || this.y > b.h - 0.2) continue;
          if (cx < b.minx - r || cx > b.maxx + r || cz < b.minz - r || cz > b.maxz + r) continue;
          const px = U.clamp(cx, b.minx, b.maxx), pz = U.clamp(cz, b.minz, b.maxz);
          let dx = cx - px, dz = cz - pz, d = Math.hypot(dx, dz);
          if (d < r) {
            if (d < 1e-4) { // 中心が内部: 最短の面から押し出す
              const ds = [cx - b.minx, b.maxx - cx, cz - b.minz, b.maxz - cz], m = Math.min(...ds), k = ds.indexOf(m);
              dx = k === 0 ? -1 : k === 1 ? 1 : 0; dz = k === 2 ? -1 : k === 3 ? 1 : 0; d = 0; hit = { nx: dx, nz: dz, pen: r + m };
            } else hit = { nx: dx / d, nz: dz / d, pen: r - d };
            this._resolve(hit, o);
          }
        }
        for (const c of world.circles) {
          if (c.h < 0.45 || this.y > c.h - 0.2) continue;
          const dx = cx - c.x, dz = cz - c.z, rr = r + c.r;
          if (dx * dx + dz * dz < rr * rr) {
            const d = Math.hypot(dx, dz) || 1e-4;
            this._resolve({ nx: dx / d, nz: dz / d, pen: rr - d }, o);
          }
        }
      }
    }
    _resolve(h, off) {
      this.x += h.nx * h.pen; this.z += h.nz * h.pen;
      const vn = this.vx * h.nx + this.vz * h.nz;
      if (vn < 0) {
        const e = 0.28;
        this.vx -= (1 + e) * vn * h.nx; this.vz -= (1 + e) * vn * h.nz;
        // 壁に擦ると少し減速
        this.vx *= 0.985; this.vz *= 0.985;
        // 接触位置に応じて車体がくるっと回る
        const lx = Math.cos(this.h), lz = -Math.sin(this.h);
        this.yaw += (h.nx * lx + h.nz * lz) * off * 0.08 * -vn * 0.2;
        if (-vn > 3.5 && this.crashCooldown <= 0) {
          this.crashCooldown = 0.25;
          CT.bus.emit('crash', { power: Math.min(1, -vn / 22), x: this.x + this.fx * off, z: this.z + this.fz * off, speed: -vn });
        }
      }
    }

    /** 見た目の更新 */
    sync(dt) {
      dt = dt || 0;
      const m = this.model, C = this.cfg, ctl = this.lastCtl;
      m.group.position.set(this.x, this.y, this.z);
      m.group.rotation.y = this.h;
      const rollT = U.clamp(this.yaw * this.speed * 0.0034, -0.17, 0.17) + (this.drifting ? -Math.sign(this.vx * Math.cos(this.h) - this.vz * Math.sin(this.h)) * 0.05 : 0);
      const pitchT = U.clamp(-this.accel * 0.0035, -0.07, 0.1);
      if (dt) { this.roll = U.damp(this.roll, rollT, 9, dt); this.pitch = U.damp(this.pitch, pitchT, 9, dt); }
      m.body.rotation.z = this.roll; m.body.rotation.x = this.pitch;
      if (dt) this.steerVis = U.damp(this.steerVis, -(ctl.steer || 0) * 0.5, 14, dt);
      this.wheelSpin += this.speed * dt / 0.42;
      for (const w of m.wheels) {
        w.spin.rotation.x = this.wheelSpin;
        if (w.front) w.steer.rotation.y = this.steerVis;
      }
      m.shadow.position.y = 0.05 - this.y;
    }

    /** 後輪のワールド座標 (タイヤ痕/スモーク用) */
    rearWheels() {
      const f = -1.45, s = 1.05, fx = this.fx, fz = this.fz, lx = Math.cos(this.h), lz = -Math.sin(this.h);
      return [
        { x: this.x + fx * f + lx * s, z: this.z + fz * f + lz * s },
        { x: this.x + fx * f - lx * s, z: this.z + fz * f - lz * s },
      ];
    }
  }
  CT.Taxi = Taxi;
})();
