/* タクシー: アーケード寄りの車両物理 + 見た目の同期。
   heading h: 前方ベクトル f=(sin h, cos h), 左ベクトル l=(cos h, -sin h)。ステア入力は右が正(=hが減る)
   - ハンドブレーキ/急ハンドルで横滑り(ドリフト)
   - 建物/壁などにぶつかると「きりもみ回転して向きを変えて着地」し、速度はほぼ落ちない
   - ジャンプ台(world.floorAt)でジャンプ */
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
      this.crashCooldown = 0; this.autoBrake = false;
      this.spinT = 0; this.spinDur = 0; this.spinH0 = 0; this.spinTotal = 0; this.spinRoll = 1;
      this.air = false; this.airT = 0; this.fromRamp = false; this.airPeak = 0; this.airStartX = 0; this.airStartZ = 0;
      this.sync();
    }
    get fx() { return Math.sin(this.h); }
    get fz() { return Math.cos(this.h); }
    get totalSpeed() { return Math.hypot(this.vx, this.vz); }
    get spinning() { return this.spinT > 0; }
    /** ワールド座標 → 車ローカル (lf=前方, ll=左) */
    toLocal(x, z) {
      const dx = x - this.x, dz = z - this.z, fx = this.fx, fz = this.fz;
      return { lf: dx * fx + dz * fz, ll: dx * fz - dz * fx };
    }
    /** 小さく跳ねる (ヒット時のバウンド) */
    bump(vy) { if (this.y < 0.3) this.vy = Math.max(this.vy, vy); }

    update(dt, ctl, world) {
      if (this.autoBrake) { // 客の輪の中: 操作を無視して急ブレーキ (乗降用)
        ctl = { throttle: -1, steer: 0, handbrake: false, boost: false };
        const k = Math.exp(-2.5 * dt); this.vx *= k; this.vz *= k;
        if (this.totalSpeed < 1.2) { this.vx = this.vz = 0; this.speed = 0; }
      }
      const n = Math.max(1, Math.ceil(dt / (1 / 90)));
      const sdt = dt / n;
      for (let i = 0; i < n; i++) this._step(sdt, ctl, world);
      this.lastCtl = ctl;
      this.sync(dt);
    }

    _step(dt, ctl, world) {
      const C = this.cfg;
      this.crashCooldown = Math.max(0, this.crashCooldown - dt);

      // きりもみ回転中: 操作不能。向きを回しながら速度は維持
      if (this.spinT > 0) {
        this.spinT -= dt;
        const p = 1 - Math.max(0, this.spinT) / this.spinDur;
        const e = 1 - Math.pow(1 - p, 2);
        this.h = this.spinH0 + this.spinTotal * e;
        this.x += this.vx * dt; this.z += this.vz * dt;
        this._vertical(dt, world);
        this.speed = this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h);
        this.slip = 0; this.drifting = false;
        if (this.spinT <= 0) { this.h = this.spinH0 + this.spinTotal; this.yaw = 0; this.grip = C.gripNormal; }
        this._collide(world);
        return;
      }

      // ブースト
      const wantBoost = ctl.boost && this.boost > 0.02 && ctl.throttle >= 0;
      this.boosting = wantBoost && !this.air;
      if (wantBoost && !this.air) this.boost = Math.max(0, this.boost - C.boostDrain * dt);
      else this.boost = Math.min(1, this.boost + (C.boostRecharge + (this.drifting ? C.boostDriftGain : 0)) * dt);
      const maxS = wantBoost ? C.boostSpeed : C.maxSpeed;
      const air = this.air;

      // 1) 旋回: ヘディングを回してから、速度を新しい軸で分解 (横滑りが自然に生まれる)
      const spPrev = this.speed;
      const sp = Math.abs(spPrev);
      const auth = Math.min(sp / 5, 1) * (1 - 0.45 * Math.min(sp / C.maxSpeed, 1)) * (air ? 0.25 : 1);
      const dir = spPrev >= -0.5 ? 1 : -1;
      const rate = C.steerRate * (ctl.handbrake ? 1.55 : 1);
      const yawT = -ctl.steer * rate * auth * dir;
      this.yaw = U.damp(this.yaw, yawT, ctl.handbrake ? 9 : 13, dt);
      this.h += this.yaw * dt;
      const fx = Math.sin(this.h), fz = Math.cos(this.h), lx = Math.cos(this.h), lz = -Math.sin(this.h);
      let vF = this.vx * fx + this.vz * fz;
      let vL = this.vx * lx + this.vz * lz;

      // 2) 縦方向: アクセル/ブレーキ (空中は操作無効)
      const prevF = vF;
      if (!air) {
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

        // 3) グリップ
        const load = Math.abs(ctl.steer) * Math.min(sp / C.maxSpeed, 1);
        let gripT = U.lerp(C.gripNormal, 4.6, load * load);
        if (ctl.handbrake && sp > 5) gripT = C.gripDrift;
        this.grip = U.damp(this.grip, gripT, gripT < this.grip ? 30 : 3.2, dt);
        vL *= Math.exp(-this.grip * dt);
      }

      this.vx = fx * vF + lx * vL; this.vz = fz * vF + lz * vL;
      this.speed = vF; this.slip = Math.abs(vL);
      this.accel = (vF - prevF) / dt;

      // 4) 位置・上下動(ジャンプ台含む)
      this.x += this.vx * dt; this.z += this.vz * dt;
      this._vertical(dt, world);

      // ドリフト判定 (ヒステリシス)
      const dr = !this.air && this.slip > (this.drifting ? 3.2 : 5) && Math.abs(vF) > 8;
      if (dr) this.driftTime += dt; else if (this.drifting) this.driftTime = 0;
      this.drifting = dr;

      this._collide(world);
    }

    /** 重力・地面・ジャンプ台の床 */
    _vertical(dt, world) {
      const was = this.air;
      this.vy -= C_GRAV(this.cfg) * dt; this.y += this.vy * dt;
      const f = world && world.floorAt ? world.floorAt(this.x, this.z) : 0;
      if (this.y <= f) {
        if (f > 0.05 && this.vy < 0) { // 斜面に沿って進む
          this.y = f;
          const sp = world.floorSlopeSpeed(this.x, this.z, this.vx, this.vz);
          this.vy = Math.min(sp * (CT.config.ramps.boost || 1), CT.config.ramps.vyCap || 14);
          this.fromRamp = true; this.rampSpeed = this.totalSpeed;
        } else {
          this.y = f;
          if (this.vy < -3) this.vy = -this.vy * 0.2; else this.vy = 0;
        }
      }
      this.air = this.y > f + 0.35;
      if (this.air && !was) { this.airT = 0; this.airPeak = this.y; this.airStartX = this.x; this.airStartZ = this.z; }
      if (this.air) { this.airT += dt; this.airPeak = Math.max(this.airPeak, this.y); }
      if (!this.air && was) {
        if (this.fromRamp && this.airT > 0.35) {
          CT.bus.emit('jump:land', { air: this.airT, peak: this.airPeak, dist: Math.hypot(this.x - this.airStartX, this.z - this.airStartZ), x: this.x, z: this.z });
        }
        this.fromRamp = false;
      }
    }

    _collide(world) {
      const r = this.cfg.radius, offs = [1.45, 0, -1.45];
      for (const o of offs) {
        const cx = this.x + this.fx * o, cz = this.z + this.fz * o;
        for (const b of world.nearBoxes(cx, cz)) {
          if (b.h < 0.45 || this.y > b.h - 0.2) continue;
          if (cx < b.minx - r || cx > b.maxx + r || cz < b.minz - r || cz > b.maxz + r) continue;
          const px = U.clamp(cx, b.minx, b.maxx), pz = U.clamp(cz, b.minz, b.maxz);
          let dx = cx - px, dz = cz - pz, d = Math.hypot(dx, dz), hit;
          if (d < r) {
            if (d < 1e-4) { // 中心が内部: 最短の面から押し出す
              const ds = [cx - b.minx, b.maxx - cx, cz - b.minz, b.maxz - cz], m = Math.min(...ds), k = ds.indexOf(m);
              dx = k === 0 ? -1 : k === 1 ? 1 : 0; dz = k === 2 ? -1 : k === 3 ? 1 : 0; hit = { nx: dx, nz: dz, pen: r + m };
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
      if (vn >= 0) return;
      const C = this.cfg, speed = this.totalSpeed;
      if (-vn > 5.5 && this.spinT <= 0 && this.crashCooldown <= 0) {
        this._crashSpin(h, vn, speed);
        return;
      }
      // 軽い接触は壁沿いにすべる(減速しない)
      this.vx -= (1 + 0.15) * vn * h.nx; this.vz -= (1 + 0.15) * vn * h.nz;
      const lx = Math.cos(this.h), lz = -Math.sin(this.h);
      this.yaw += (h.nx * lx + h.nz * lz) * off * 0.02 * -vn;
      if (-vn > 3.5 && this.crashCooldown <= 0) {
        this.crashCooldown = 0.25;
        CT.bus.emit('crash', { power: Math.min(1, -vn / 22), x: this.x + this.fx * off, z: this.z + this.fz * off, speed: -vn });
      }
    }

    /** 衝突 → 跳ね返りつつ きりもみ回転で向きを変えて着地。速度はほとんど落とさない */
    _crashSpin(h, vn, speed) {
      const C = this.cfg;
      const tx = -h.nz, tz = h.nx;                       // 壁の接線
      const vt = this.vx * tx + this.vz * tz;            // 接線方向速度(符号つき)
      // 出射: 接線は保持、法線は跳ね返り
      let ox = tx * vt + h.nx * (-vn) * 0.7, oz = tz * vt + h.nz * (-vn) * 0.7;
      let sp = Math.hypot(ox, oz);
      if (sp < 1) { ox = h.nx; oz = h.nz; sp = 1; }
      const target = Math.max(C.crashMinSpeed, speed * C.crashKeepSpeed);
      ox *= target / sp; oz *= target / sp;
      this.vx = ox; this.vz = oz;
      this.vy = 9 + Math.min(4, speed * 0.08); this.y += 0.05;
      this.spinDur = Math.max(C.crashSpinTime * 0.9, (2 * this.vy) / C.gravity + 0.1);
      this.spinT = this.spinDur; this.spinH0 = this.h;
      const targetH = Math.atan2(ox, oz), sign = Math.random() < 0.5 ? 1 : -1;
      let d = U.angleDiff(targetH, this.h);
      this.spinTotal = d + sign * Math.PI * 2; this.spinRoll = sign;
      this.crashCooldown = 0.6;
      this.fromRamp = false;
      CT.bus.emit('crash', { power: Math.min(1, speed / 28), x: this.x, z: this.z, speed, spin: true });
    }

    /** 見た目の更新 */
    sync(dt) {
      dt = dt || 0;
      const m = this.model, ctl = this.lastCtl;
      m.group.position.set(this.x, this.y, this.z);
      m.group.rotation.y = this.h;
      let rollT = U.clamp(this.yaw * this.speed * 0.0034, -0.17, 0.17) + (this.drifting ? -Math.sign(this.vx * Math.cos(this.h) - this.vz * Math.sin(this.h)) * 0.05 : 0);
      let pitchT = U.clamp(-this.accel * 0.0035, -0.07, 0.1);
      if (this.air && this.spinT <= 0) pitchT = U.clamp(-this.vy * 0.03, -0.35, 0.35); // 空中は進行方向に合わせて機首が上下
      if (this.spinT > 0) {
        const p = 1 - Math.max(0, this.spinT) / this.spinDur;
        m.body.rotation.z = this.spinRoll * Math.PI * 2 * Math.min(1, p * 1.15);
        m.body.rotation.x = Math.sin(p * Math.PI) * -0.25;
        this.roll = 0; this.pitch = 0;
      } else {
        if (dt) { this.roll = U.damp(this.roll, rollT, 9, dt); this.pitch = U.damp(this.pitch, pitchT, 9, dt); }
        m.body.rotation.z = this.roll; m.body.rotation.x = this.pitch;
      }
      if (dt) this.steerVis = U.damp(this.steerVis, -(ctl.steer || 0) * 0.5, 14, dt);
      this.wheelSpin += this.speed * dt / 0.42;
      for (const w of m.wheels) {
        w.spin.rotation.x = this.wheelSpin;
        if (w.front) w.steer.rotation.y = this.steerVis;
      }
      m.shadow.position.y = 0.05 - this.y;
      m.shadow.scale.set(0.8 * (1 - Math.min(0.5, this.y * 0.05)), 1.15 * (1 - Math.min(0.5, this.y * 0.05)), 1);
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
  function C_GRAV(cfg) { return cfg.gravity || 24; }
  CT.Taxi = Taxi;
})();
