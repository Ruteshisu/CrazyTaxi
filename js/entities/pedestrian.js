/* 通行人: ブロック周囲のレール(歩道上 or 車道際)を歩き、時々横断。
   車が迫ると 逃げる/固まる。はねられるとラグドール化 → 着地後ふらふら → 復帰 */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const U = CT.util;
  const SHIRTS = [0xff5050, 0x3fa7ff, 0xffd23a, 0x5fd068, 0xff8ad0, 0xffffff, 0xb07cff, 0xff9a2e, 0x2dd4bf];
  const PANTS = [0x2b4a7a, 0x3a3a46, 0x7a5a3a, 0x556b2f, 0x6a3a6a];
  const HAIR = [0x2b1d12, 0x5a3a1c, 0x111111, 0xd9b44a, 0xb04a2a, 0xdddddd];
  const SKIN = [0xf3c9a0, 0xe0a878, 0xc68642, 0xffdbb5];

  class Pedestrians {
    constructor(scene, world, pool) {
      this.scene = scene; this.world = world; this.pool = pool; this.list = [];
      for (let n = 0; n < CT.config.ped.count; n++) this.list.push(this._make());
      this.reset();
    }

    _make() {
      const colors = { shirt: U.pick(SHIRTS), pants: U.pick(PANTS), hair: U.pick(HAIR), skin: U.pick(SKIN) };
      const h = CT.Models.human(Object.assign({ scale: U.rand(0.92, 1.1) }, colors));
      const stars = CT.Models.dizzyStars(); stars.position.y = 2.1; stars.visible = false; h.group.add(stars);
      const shadow = CT.Models.blobShadow(1.4); h.group.add(shadow);
      this.scene.add(h.group);
      return { h, stars, colors, state: 'walk', phase: Math.random() * 6, t: 0, x: 0, z: 0, yaw: 0, speed: 1.8, bi: 0, bj: 0, c: 0, dir: 1, inset: 2.2, tx: 0, tz: 0, freezer: Math.random() < CT.config.ped.freezeChance, rig: null, hitCount: 0 };
    }

    reset() {
      this.pool.clear();
      for (const p of this.list) { p.h.group.visible = true; this._place(p); }
    }
    /** ランダムなレール上に配置 */
    _place(p, nearX, nearZ) {
      const N = this.world.N;
      p.inset = Math.random() < 0.5 ? 2.2 : -1.3;
      p.bi = U.randInt(0, N - 1); p.bj = U.randInt(0, N - 1);
      p.c = U.randInt(0, 3); p.dir = Math.random() < 0.5 ? 1 : -1;
      const a = this.world.perimeterPoint(p.bi, p.bj, p.c, p.inset);
      const b = this.world.perimeterPoint(p.bi, p.bj, p.c + p.dir, p.inset);
      const f = Math.random();
      p.x = U.lerp(a.x, b.x, f); p.z = U.lerp(a.z, b.z, f);
      p.c = ((p.c + p.dir) + 4) % 4; // 目標の角
      this._setTarget(p);
      p.state = 'walk'; p.speed = U.rand(...CT.config.ped.walkSpeed); p.t = 0; p.h.group.visible = true;
      p.stars.visible = false; this._face(p);
    }
    placeNear(p, x, z, spread) { // 指定位置の近くのレールに置く(デモ演出用)
      for (let n = 0; n < 200; n++) {
        this._place(p);
        if (Math.hypot(p.x - x, p.z - z) < spread) return;
      }
    }
    _setTarget(p) { const t = this.world.perimeterPoint(p.bi, p.bj, p.c, p.inset); p.tx = t.x; p.tz = t.z; }
    _face(p) { p.yaw = Math.atan2(p.tx - p.x, p.tz - p.z); }

    _nextCorner(p) {
      const N = this.world.N, W = this.world;
      // 角に到着: 横断するか周回継続
      if (Math.random() < 0.28) {
        const sx = p.c === 1 || p.c === 2 ? 1 : -1, sz = p.c === 2 || p.c === 3 ? 1 : -1;
        const axisX = Math.random() < 0.5;
        const ni = p.bi + (axisX ? sx : 0), nj = p.bj + (axisX ? 0 : sz);
        if (ni >= 0 && ni < N && nj >= 0 && nj < N) {
          p.bi = ni; p.bj = nj;
          p.c = CT.World.cornerIndex(axisX ? -sx : sx, axisX ? sz : -sz);
          p.state = p.state === 'panic' ? 'panic' : 'cross';
          this._setTarget(p); return;
        }
      }
      if (p.state === 'cross') p.state = 'walk';
      if (Math.random() < 0.06) p.dir = -p.dir;
      p.c = (p.c + p.dir + 4) % 4; this._setTarget(p);
    }

    update(dt, taxi, game) {
      const cfg = CT.config.ped, t0 = performance.now() / 1000;
      const tfx = taxi.fx, tfz = taxi.fz, tsp = taxi.totalSpeed;
      for (const p of this.list) {
        if (p.state === 'rag') continue;
        p.t += dt; p.phase += dt * (p.state === 'panic' ? 14 : 3.6 + p.speed * 1.7);
        const dx = p.x - taxi.x, dz = p.z - taxi.z, d2 = dx * dx + dz * dz;
        // 逃げる/固まる判定
        if ((p.state === 'walk' || p.state === 'cross') && d2 < cfg.panicDist * cfg.panicDist && tsp > 6) {
          const d = Math.sqrt(d2) || 1, toward = (tfx * dx + tfz * dz) / d;
          if (toward > 0.5 && (tfx * (taxi.vx) + tfz * (taxi.vz)) > 0) {
            if (p.freezer) { p.state = 'freeze'; p.t = 0; }
            else {
              p.state = 'panic'; p.t = 0;
              // 車から遠い側の角へ走る
              const a = this.world.perimeterPoint(p.bi, p.bj, (p.c + 4) % 4, p.inset);
              const b = this.world.perimeterPoint(p.bi, p.bj, (p.c + 2 + 4) % 4, p.inset);
              void b;
              const prevD = Math.hypot(a.x - taxi.x, a.z - taxi.z);
              const cb = (p.c - p.dir + 4) % 4, back = this.world.perimeterPoint(p.bi, p.bj, cb, p.inset);
              if (Math.hypot(back.x - taxi.x, back.z - taxi.z) > prevD + 5) { p.dir = -p.dir; p.c = cb; this._setTarget(p); }
            }
          }
        }
        if (p.state === 'freeze' && (p.t > 3 || d2 > (cfg.panicDist * 1.3) ** 2)) { p.state = 'walk'; p.t = 0; }
        if (p.state === 'panic' && p.t > 3.2) { p.state = 'walk'; p.t = 0; }
        if (p.state === 'dizzy') {
          p.stars.userData && 0;
          p.stars.userData.update ? 0 : 0;
          if (p.t > cfg.dizzyTime) { p.state = 'walk'; p.stars.visible = false; this._rejoin(p); }
        }
        // 移動
        if (p.state === 'walk' || p.state === 'cross' || p.state === 'panic') {
          const sp = p.state === 'panic' ? cfg.fleeSpeed : p.speed;
          const ddx = p.tx - p.x, ddz = p.tz - p.z, dd = Math.hypot(ddx, ddz);
          if (dd < 0.5) this._nextCorner(p);
          else { p.x += (ddx / dd) * sp * dt; p.z += (ddz / dd) * sp * dt; p.yaw = Math.atan2(ddx, ddz); }
        }
        // 見た目
        const g = p.h.group;
        g.position.set(p.x, 0.3 * (p.inset > 0 ? 1 : 0), p.z);
        g.rotation.y = p.yaw;
        const mode = p.state === 'panic' ? 'panic' : p.state === 'freeze' ? 'freeze' : p.state === 'dizzy' ? 'dizzy' : 'walk';
        CT.Models.animHuman(p.h, mode, p.phase, p.t + p.phase);
        if (p.state === 'dizzy') { p.stars.userData.update(p.t); }
      }
      void t0;
      this._checkHits(taxi, game);
    }

    /** ふらふら後、最寄りのレールに戻る */
    _rejoin(p) {
      const W = this.world, N = W.N;
      p.bi = U.clamp(Math.floor((p.x + W.half) / W.P), 0, N - 1);
      p.bj = U.clamp(Math.floor((p.z + W.half) / W.P), 0, N - 1);
      let best = 0, bd = 1e9;
      for (let c = 0; c < 4; c++) { const q = W.perimeterPoint(p.bi, p.bj, c, p.inset); const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = c; } }
      p.c = best; p.state = 'walk'; this._setTarget(p);
    }

    _checkHits(taxi, game) {
      const cfg = CT.config.ped, sp = taxi.totalSpeed;
      if (sp < 2.2) return;
      for (const p of this.list) {
        if (p.state === 'rag') continue;
        const L = taxi.toLocal(p.x, p.z);
        if (Math.abs(L.ll) < cfg.hitHalfWidth && L.lf > -cfg.hitBack && L.lf < cfg.hitFront && taxi.y < 1.2) this.hit(p, taxi, sp);
      }
    }

    hit(p, taxi, sp) {
      const fx = taxi.vx / (sp || 1), fz = taxi.vz / (sp || 1);
      const ctx = { speed: sp, fx, fz, lx: -fz, lz: fx };
      const gag = CT.Gags.pick(sp, ctx);
      p.state = 'rag'; p.h.group.visible = false; p.stars.visible = false; p.hitCount++;
      const info = { ped: p, x: p.x, z: p.z, speed: sp, gag, fx, fz, y: 1 };
      const o = {
        x: p.x, z: p.z, y0: p.inset > 0 ? 0.3 : 0, yaw: p.yaw + Math.random() * 6, vel: gag.vel, spin: gag.spin, colors: p.colors,
        onApex: (rig, x, y, z) => CT.bus.emit('ped:apex', { ped: p, x, y, z, info }),
        onLand: (rig, x, z) => CT.bus.emit('ped:land', { ped: p, x, z, peak: rig.peak, air: rig.air, info, rig }),
        onWall: (rig, x, y, z) => CT.bus.emit('ped:wall', { ped: p, x, y, z, info }),
        onDone: (rig, x, z) => {
          const W = this.world;
          p.x = U.clamp(x, -W.half - 8, W.half + 8); p.z = U.clamp(z, -W.half - 8, W.half + 8);
          p.yaw = Math.random() * 6.28; p.state = 'dizzy'; p.t = 0; p.rig = null; p.h.group.visible = true; p.stars.visible = true;
        },
      };
      p.rig = this.pool.spawn(o);
      info.rig = p.rig;
      // 車の軽い反動 (ポヨン)
      taxi.bump(2.2 + Math.min(3, sp * 0.08));
      taxi.vx *= 0.975; taxi.vz *= 0.975;
      CT.bus.emit('ped:hit', info);
    }
  }
  CT.Pedestrians = Pedestrians;
})();
