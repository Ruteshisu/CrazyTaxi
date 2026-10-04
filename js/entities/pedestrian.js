/* 通行人: ブロック周囲のレール(歩道上 or 車道際)を3〜7人の集団で歩き、時々横断。
   車が迫ると 逃げる/固まる。はねられるとラグドール化 → そのまま倒れて残る(復活しない)。
   倒した人の分は、しばらくして車の前方の別の場所に新しい通行人が補充される */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const U = CT.util;
  const SHIRTS = [0xff5050, 0x3fa7ff, 0xffd23a, 0x5fd068, 0xff8ad0, 0xffffff, 0xb07cff, 0xff9a2e, 0x2dd4bf];
  const PANTS = [0x2b4a7a, 0x3a3a46, 0x7a5a3a, 0x556b2f, 0x6a3a6a];
  const HAIR = [0x2b1d12, 0x5a3a1c, 0x111111, 0xd9b44a, 0xb04a2a, 0xdddddd];
  const SKIN = [0xf3c9a0, 0xe0a878, 0xc68642, 0xffdbb5];

  const CRIES = [['gya', 'ぎゃー!'], ['gyo', 'ぐぎょー!'], ['uwa', 'うわぁー!'], ['hee', 'ひぇー!'], ['gefu', 'ぐえっ!'], ['oioi', 'オイオイ!'], ['kya', 'きゃー!'], ['bho', 'ぼへー'], ['hya', 'ひゃー!'], ['wah', 'わぁー!']];
  class Pedestrians {
    constructor(scene, world, pool) {
      this.scene = scene; this.world = world; this.pool = pool; this.list = [];
      for (let n = 0; n < CT.config.ped.count; n++) this.list.push(this._make());
      // 公園の群衆 (ボーナスステージ): 中央の大きな公園は特に多い
      this.parks = world.blocks.filter((b) => b.type === 'park');
      const c = (world.N - 1) / 2, cfg = CT.config.ped;
      for (const b of this.parks) {
        const n = b.i === c && b.j === c ? cfg.parkCrowd : cfg.parkCrowdSmall; b.crowd = n;
        for (let k = 0; k < n; k++) { const p = this._make(); p.park = b; this.list.push(p); }
      }
      this._anchor = null;
      this.reset();
    }

    _make() {
      const colors = { shirt: U.pick(SHIRTS), pants: U.pick(PANTS), hair: U.pick(HAIR), skin: U.pick(SKIN) };
      const sc = U.rand(0.92, 1.1) * CT.config.ped.scale;
      const h = CT.Models.human(Object.assign({ scale: sc }, colors));
      const stars = CT.Models.dizzyStars(); stars.position.y = 2.1 * sc; stars.visible = false; h.group.add(stars);
      const shadow = CT.Models.blobShadow(1.4 * CT.config.ped.scale); h.group.add(shadow);
      this.scene.add(h.group);
      return { sc, h, stars, colors, state: 'walk', phase: Math.random() * 6, t: 0, x: 0, z: 0, yaw: 0, speed: 1.8, bi: 0, bj: 0, c: 0, dir: 1, inset: 2.2, tx: 0, tz: 0, freezer: Math.random() < CT.config.ped.freezeChance, rig: null, hitCount: 0 };
    }

    reset() {
      this.pool.clear(); this._anchor = null;
      const gs = CT.config.ped.groupSize, street = this.list.filter((p) => !p.park);
      let i = 0;
      while (i < street.length) {
        const n = Math.min(street.length - i, U.randInt(gs[0], gs[1]));
        this._placeGroup(street.slice(i, i + n)); i += n;
      }
      for (const b of this.parks) { // 公園: 何重もの周回路に群れで配置
        const mem = this.list.filter((p) => p.park === b); let k = 0;
        while (k < mem.length) { const n = Math.min(mem.length - k, U.randInt(gs[0], gs[1])); this._placeGroup(mem.slice(k, k + n), { bi: b.i, bj: b.j, inset: U.pick([3, 6.5, 10, 13.5, 17]) }); k += n; }
      }
    }
    /** 同じ辺の上に並べた人だかり。全員同じ向きに歩く */
    _placeGroup(members, opt) {
      const N = this.world.N, inset = opt ? opt.inset : (Math.random() < 0.5 ? 2.2 : -1.3), dir = Math.random() < 0.5 ? 1 : -1;
      const bi = opt ? opt.bi : U.randInt(0, N - 1), bj = opt ? opt.bj : U.randInt(0, N - 1), side = U.randInt(0, 3), f0 = U.rand(0.04, 0.4);
      members.forEach((p, k) => {
        p.bi = bi; p.bj = bj; p.dir = dir; p.inset = inset + U.rand(-0.5, 0.5);
        const f = Math.min(0.96, f0 + k * 0.055 + U.rand(-0.01, 0.01));
        const q = this.world.perimeterPoint(bi, bj, side + f, p.inset);
        p.x = q.x; p.z = q.z; p.c = dir > 0 ? (side + 1) % 4 : side; this._setTarget(p);
        p.state = 'walk'; p.speed = U.rand(...CT.config.ped.walkSpeed) * (k ? 1 : 1) ; p.t = 0; p.h.group.visible = true; p.stars.visible = false; this._face(p);
      });
    }
    /** 倒された後の補充: 公園の人は公園へ戻る。街の人は「グループ」で補充(同じ場所に続けて並べる) */
    _respawnNear(p, taxi) {
      if (p.park) {
        const b = p.park, N = this.world.N;
        p.bi = b.i; p.bj = b.j; p.inset = U.pick([3, 6.5, 10, 13.5, 17]) + U.rand(-0.5, 0.5); p.dir = Math.random() < 0.5 ? 1 : -1;
        const side = U.randInt(0, 3), q = this.world.perimeterPoint(b.i, b.j, side + U.rand(0.05, 0.9), p.inset);
        p.x = q.x; p.z = q.z; p.c = (side + (p.dir > 0 ? 1 : 0)) % 4; void N; this._setTarget(p);
        p.state = 'walk'; p.t = 0; p.h.group.visible = true; p.stars.visible = false; p.freezer = Math.random() < CT.config.ped.freezeChance; this._face(p);
        return;
      }
      const now = performance.now() / 1000, an = this._anchor;
      if (!an || now - an.t > 4 || an.left <= 0) { // 新しいグループの置き場所を決める
        let best = null, bs = 1e9;
        for (let n = 0; n < 14; n++) {
          const inset = Math.random() < 0.5 ? 2.2 : -1.3, bi = U.randInt(0, this.world.N - 1), bj = U.randInt(0, this.world.N - 1), side = U.randInt(0, 3), f = U.rand(0.05, 0.4);
          const q = this.world.perimeterPoint(bi, bj, side + f, inset), dx = q.x - taxi.x, dz = q.z - taxi.z, d = Math.hypot(dx, dz);
          if (d < 45) continue;
          const sc = Math.abs(d - 85) - ((dx * taxi.fx + dz * taxi.fz) / (d || 1)) * 40;
          if (sc < bs) { bs = sc; best = { bi, bj, side, f, inset }; }
        }
        if (best) this._anchor = { ...best, dir: Math.random() < 0.5 ? 1 : -1, left: U.randInt(3, 8), t: now, k: 0 };
      }
      const A = this._anchor;
      if (A) {
        const f = Math.min(0.96, A.f + A.k * 0.055); A.k++; A.left--;
        const q = this.world.perimeterPoint(A.bi, A.bj, A.side + f, A.inset + U.rand(-0.4, 0.4));
        p.bi = A.bi; p.bj = A.bj; p.inset = A.inset; p.dir = A.dir; p.x = q.x; p.z = q.z; p.c = A.dir > 0 ? (A.side + 1) % 4 : A.side; this._setTarget(p);
      } else this._place(p);
      p.state = 'walk'; p.t = 0; p.h.group.visible = true; p.stars.visible = false; p.freezer = Math.random() < CT.config.ped.freezeChance; this._face(p);
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
    /** 指定ブロックの辺(side 0..3)の上、辺内位置f(0..1)に置く (デモの人だかり用) */
    placeAt(p, bi, bj, side, f, inset) {
      p.bi = bi; p.bj = bj; p.inset = inset; p.dir = 1;
      const a = this.world.perimeterPoint(bi, bj, side + f, inset);
      p.x = a.x; p.z = a.z; p.c = (side + 1) % 4; this._setTarget(p);
      p.state = 'walk'; p.speed = U.rand(1.4, 2.0); p.t = 0; p.h.group.visible = true; p.stars.visible = false; this._face(p);
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
      if (!p.park && Math.random() < 0.28) {
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
      const tfx = taxi.fx, tfz = taxi.fz, tsp = taxi.totalSpeed, cull2 = cfg.cullDist * cfg.cullDist;
      for (const p of this.list) {
        if (p.state === 'rag') continue;
        if (p.state === 'down') { p.t += dt; if (p.t > cfg.respawnTime) this._respawnNear(p, taxi); continue; }
        const dx = p.x - taxi.x, dz = p.z - taxi.z, d2 = dx * dx + dz * dz;
        if (d2 > cull2) { // 遠い人: 描画/アニメを止める(位置だけ進める)
          p.h.group.visible = false; p.t += dt;
          if (p.state === 'walk' || p.state === 'cross') {
            const ddx = p.tx - p.x, ddz = p.tz - p.z, dd = Math.hypot(ddx, ddz);
            if (dd < 0.5) this._nextCorner(p); else { p.x += (ddx / dd) * p.speed * dt; p.z += (ddz / dd) * p.speed * dt; p.yaw = Math.atan2(ddx, ddz); }
          } else if (p.state === 'panic' || p.state === 'freeze') { p.state = 'walk'; p.t = 0; }
          continue;
        }
        p.h.group.visible = true;
        p.t += dt; p.phase += dt * (p.state === 'panic' ? 14 : 3.6 + p.speed * 1.7);
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
        const mode = p.state === 'panic' ? 'panic' : p.state === 'freeze' ? 'freeze' : 'walk';
        CT.Models.animHuman(p.h, mode, p.phase, p.t + p.phase);
      }
      void t0;
      this._checkHits(taxi, game);
      this._checkRigs(taxi, game);
    }

    /** 倒れて横たわっているラグドールも、車で当たればもう一度吹っ飛ぶ */
    _checkRigs(taxi, game) {
      const cfg = CT.config.ped, sp = taxi.totalSpeed;
      if (sp < 3 || taxi.y > 1.2) return;
      for (const r of this.pool.rigs) {
        if (!r.active || !r.sleeping || !r.o || !r.o.ped) continue;
        const L = taxi.toLocal(r.x, r.z);
        if (Math.abs(L.ll) < cfg.hitHalfWidth + 0.4 && L.lf > -cfg.hitBack && L.lf < cfg.hitFront) this.rehit(r, taxi, sp, game);
      }
    }
    rehit(r, taxi, sp, game) {
      const p = r.o.ped, fx = taxi.vx / (sp || 1), fz = taxi.vz / (sp || 1);
      const ctx = { speed: sp, fx, fz, lx: -fz, lz: fx };
      const level = CT.Gags.levelFor(((game && game.score && game.score.enabled) ? game.score.combo : 0) + 1);
      const gag = CT.Gags.pick(sp, ctx, level), cr = U.pick(CRIES);
      const info = { ped: p, x: r.x, z: r.z, speed: sp, gag, fx, fz, y: 1, level, rehit: true, cry: { voice: cr[0], text: cr[1] } };
      const ok = r.kick(gag.vel, gag.spin, {
        onApex: (rig, x, y, z) => CT.bus.emit('ped:apex', { ped: p, x, y, z, info }),
        onLand: (rig, x, z) => CT.bus.emit('ped:land', { ped: p, x, z, peak: rig.peak, air: rig.air, dist: Math.hypot(x - rig.sx, z - rig.sz), info, rig }),
        onWall: (rig, x, y, z) => CT.bus.emit('ped:wall', { ped: p, x, y, z, info }),
        onDone: null,
      });
      if (!ok) return;
      info.rig = r;
      taxi.bump(1.0 + Math.min(1.5, sp * 0.04));
      CT.bus.emit('ped:hit', info);
    }


    _checkHits(taxi, game) {
      const cfg = CT.config.ped, sp = taxi.totalSpeed;
      if (sp < 2.2) return;
      for (const p of this.list) {
        if (p.state === 'rag') continue;
        const L = taxi.toLocal(p.x, p.z);
        if (Math.abs(L.ll) < cfg.hitHalfWidth && L.lf > -cfg.hitBack && L.lf < cfg.hitFront && taxi.y < 1.2) this.hit(p, taxi, sp, game);
      }
    }

    hit(p, taxi, sp, game) {
      const fx = taxi.vx / (sp || 1), fz = taxi.vz / (sp || 1);
      const ctx = { speed: sp, fx, fz, lx: -fz, lz: fx };
      const level = CT.Gags.levelFor(((game && game.score && game.score.enabled) ? game.score.combo : 0) + 1);
      const gag = CT.Gags.pick(sp, ctx, level);
      p.state = 'rag'; p.h.group.visible = false; p.stars.visible = false; p.hitCount++;
      const cr = U.pick(CRIES), info = { ped: p, x: p.x, z: p.z, speed: sp, gag, fx, fz, y: 1, level, cry: { voice: cr[0], text: cr[1] } };
      const o = {
        ped: p, x: p.x, z: p.z, y0: p.inset > 0 ? 0.3 : 0, yaw: p.yaw + Math.random() * 6, vel: gag.vel, spin: gag.spin, colors: p.colors, scale: p.sc,
        onApex: (rig, x, y, z) => CT.bus.emit('ped:apex', { ped: p, x, y, z, info }),
        onLand: (rig, x, z) => CT.bus.emit('ped:land', { ped: p, x, z, peak: rig.peak, air: rig.air, dist: Math.hypot(x - rig.sx, z - rig.sz), info, rig }),
        onWall: (rig, x, y, z) => CT.bus.emit('ped:wall', { ped: p, x, y, z, info }),
        onDone: () => { p.state = 'down'; p.t = 0; p.rig = null; },
      };
      p.rig = this.pool.spawn(o);
      info.rig = p.rig;
      // 車の軽い反動 (ポヨン)
      taxi.bump(1.2 + Math.min(2, sp * 0.05));
      taxi.vx *= 0.985; taxi.vz *= 0.985;
      CT.bus.emit('ped:hit', info);
    }
  }
  CT.Pedestrians = Pedestrians;
})();
