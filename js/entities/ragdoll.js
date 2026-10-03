/* ベルレ積分(点+棒)によるラグドール。プール化して再利用する。
   リアルさより「ふわっと長く飛んで、壁で跳ね返る」ギャグ向けの軽い重力設定 (CT.config.ragdoll) */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const U = CT.util;

  // 点: 0頭 1首 2腰 3左肘 4左手 5右肘 6右手 7左膝 8左足 9右膝 10右足
  const POSE = [
    [0, 1.78, 0], [0, 1.45, 0], [0, 0.92, 0],
    [-0.34, 1.2, 0], [-0.34, 0.82, 0], [0.34, 1.2, 0], [0.34, 0.82, 0],
    [-0.13, 0.5, 0], [-0.13, 0.06, 0], [0.13, 0.5, 0], [0.13, 0.06, 0],
  ];
  // [a, b, 剛性]
  const STICKS = [
    [0, 1, 1], [1, 2, 1], [1, 3, 1], [3, 4, 1], [1, 5, 1], [5, 6, 1], [2, 7, 1], [7, 8, 1], [2, 9, 1], [9, 10, 1],
    [0, 2, 0.3], [1, 4, 0.04], [1, 6, 0.04], [2, 8, 0.05], [2, 10, 0.05], [7, 9, 0.12], [3, 5, 0.06],
  ];
  const RAD = [0.2, 0.1, 0.12, 0.08, 0.08, 0.08, 0.08, 0.1, 0.08, 0.1, 0.08];
  // 描画する棒 [stick index, 太さ, 色種別]
  const LIMBS = [
    [0, 0.06, 'skin'], [1, 0.23, 'shirt'], [2, 0.085, 'shirt'], [3, 0.07, 'skin'], [4, 0.085, 'shirt'], [5, 0.07, 'skin'],
    [6, 0.105, 'pants'], [7, 0.09, 'pants'], [8, 0.105, 'pants'], [9, 0.09, 'pants'],
  ];

  class Rig {
    constructor(scene) {
      const THREE = window.THREE, M = CT.Models;
      this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
      this.mats = {
        shirt: new THREE.MeshLambertMaterial({ color: 0xff5050 }),
        pants: new THREE.MeshLambertMaterial({ color: 0x335577 }),
        skin: new THREE.MeshLambertMaterial({ color: 0xf3c9a0 }),
        hair: new THREE.MeshLambertMaterial({ color: 0x332211 }),
      };
      // 手足/胴: 付け根(A側=下端)が太く先(B側)が細いテーパー円柱
      const cyl = new THREE.CylinderGeometry(0.75, 1, 1, 10);
      this.limbs = LIMBS.map(([si, r, kind]) => {
        const m = new THREE.Mesh(cyl, this.mats[kind]); m.scale.set(r, 1, r); this.group.add(m);
        return { m, si, r };
      });
      // 関節/手/足の丸 (肩・腰・肘・膝・手・靴)
      const sph = new THREE.SphereGeometry(1, 8, 6), shoe = M.mat(0x222222);
      this.balls = [[1, 0.13, 'shirt'], [2, 0.14, 'pants'], [3, 0.075, 'skin'], [5, 0.075, 'skin'], [7, 0.1, 'pants'], [9, 0.1, 'pants'],
        [4, 0.085, 'skin'], [6, 0.085, 'skin'], [8, 0.13, 'shoe'], [10, 0.13, 'shoe']].map(([pi, r, k]) => {
        const m = new THREE.Mesh(sph, k === 'shoe' ? shoe : this.mats[k]); m.scale.setScalar(r); this.group.add(m); return { m, pi, r };
      });
      // 頭 (前後に顔: 「目が点/ O口」。髪・耳・眉・鼻つき)
      const head = new THREE.Group(), hs = this.mats.skin, hh = this.mats.hair;
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 10), hs));
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hh);
      cap.rotation.x = -0.1; head.add(cap);
      const white = M.basic(0xffffff), black = M.basic(0x111111), eg = new THREE.SphereGeometry(1, 8, 6);
      for (const sz of [1, -1]) for (const sx of [-1, 1]) {
        const e = new THREE.Mesh(eg, white); e.scale.setScalar(0.075); e.position.set(sx * 0.09, 0.03, sz * 0.18); head.add(e);
        const p = new THREE.Mesh(eg, black); p.scale.setScalar(0.035); p.position.set(sx * 0.09, 0.03, sz * 0.25); head.add(p);
        const br = new THREE.Mesh(M._bg || (M._bg = new THREE.BoxGeometry(1, 1, 1)), hh); br.scale.set(0.1, 0.022, 0.03);
        br.position.set(sx * 0.09, 0.115, sz * 0.2); br.rotation.z = sx * sz * -0.15; head.add(br);
      }
      for (const sx of [-1, 1]) {
        const ear = new THREE.Mesh(eg, hs); ear.scale.set(0.035, 0.06, 0.04); ear.position.set(sx * 0.23, 0, 0); head.add(ear);
      }
      for (const sz of [1, -1]) {
        const mo = new THREE.Mesh(eg, black); mo.scale.set(0.06, 0.08, 0.04); mo.position.set(0, -0.1, sz * 0.2); head.add(mo);
      }
      const nose = new THREE.Mesh(eg, hs); nose.scale.set(0.035, 0.045, 0.04); nose.position.set(0, -0.03, 0.225); head.add(nose);
      const tuft = new THREE.Mesh(eg, hh); tuft.scale.set(0.05, 0.1, 0.05); tuft.position.set(0, 0.27, 0); tuft.rotation.z = 0.4; head.add(tuft);
      this.group.add(head); this.head = head;
      this.pts = POSE.map(() => ({ x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0 }));
      this.baseRest = STICKS.map(([a, b]) => Math.hypot(POSE[a][0] - POSE[b][0], POSE[a][1] - POSE[b][1], POSE[a][2] - POSE[b][2]));
      this.rest = this.baseRest.slice(); this.sc = 1; this.sleeping = false;
      this.active = false;
      this._v = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._up = new THREE.Vector3(0, 1, 0);
    }

    /** o: {x,z,yaw, vel:{x,y,z}, spin:{x,y,z}, colors:{shirt,pants,skin,hair}, onLand, onWall, onApex, onDone, tag} */
    launch(o) {
      this.active = true; this.sleeping = false; this.group.visible = true; this.o = o;
      const sc = (this.sc = o.scale || 1); this.rest = this.baseRest.map((v) => v * sc);
      this.head.scale.setScalar(sc);
      for (const b of this.balls) b.m.scale.setScalar(b.r * sc);
      const c = o.colors || {};
      this.mats.shirt.color.setHex(c.shirt || 0xff5050); this.mats.pants.color.setHex(c.pants || 0x335577);
      this.mats.skin.color.setHex(c.skin || 0xf3c9a0); this.mats.hair.color.setHex(c.hair || 0x332211);
      const cs = Math.cos(o.yaw || 0), sn = Math.sin(o.yaw || 0), dt0 = 1 / 60;
      const v = o.vel, w = o.spin || { x: 0, y: 0, z: 0 };
      const cx = o.x, cz = o.z, py = [POSE[2][0] * sc, POSE[2][1] * sc, POSE[2][2] * sc];
      this.pts.forEach((p, i) => {
        const lx = POSE[i][0] * sc, ly = POSE[i][1] * sc, lz = POSE[i][2] * sc;
        p.x = cx + lx * cs + lz * sn; p.y = ly + (o.y0 || 0); p.z = cz - lx * sn + lz * cs;
        const rx = p.x - cx, ry = p.y - (py[1] + (o.y0 || 0)), rz = p.z - cz;
        const vx = v.x + (w.y * rz - w.z * ry), vy = v.y + (w.z * rx - w.x * rz), vz = v.z + (w.x * ry - w.y * rx);
        p.px = p.x - vx * dt0; p.py = p.y - vy * dt0; p.pz = p.z - vz * dt0;
      });
      this.sx = cx; this.sz = cz; this.age = 0; this.air = 0; this.peak = 0; this.landed = false; this.restT = 0;
      this.apexFired = false; this.prevVy = v.y; this.wallHits = 0; this.wallCd = 0; this.acc = 0; this.bounces = 0;
      this.render();
    }

    update(dt, world) {
      if (!this.active || this.sleeping) return;
      this.acc += Math.min(dt, 0.05);
      const h = 1 / 60;
      while (this.acc >= h) { this.acc -= h; this._step(h, world); if (!this.active) return; }
      this.render();
    }

    _step(h, world) {
      const cfg = CT.config.ragdoll, g = cfg.gravity, pts = this.pts, o = this.o, sc = this.sc;
      this.age += h; this.wallCd -= h;
      for (const p of pts) {
        const vx = (p.x - p.px) * cfg.damping, vy = (p.y - p.py) * cfg.damping, vz = (p.z - p.pz) * cfg.damping;
        p.px = p.x; p.py = p.y; p.pz = p.z;
        p.x += vx; p.y += vy - g * h * h; p.z += vz;
      }
      for (let it = 0; it < cfg.iterations; it++) {
        for (let s = 0; s < STICKS.length; s++) {
          const [a, b, k] = STICKS[s], A = pts[a], B = pts[b];
          const dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z, d = Math.hypot(dx, dy, dz) || 1e-5;
          const diff = ((d - this.rest[s]) / d) * 0.5 * k;
          A.x += dx * diff; A.y += dy * diff; A.z += dz * diff; B.x -= dx * diff; B.y -= dy * diff; B.z -= dz * diff;
        }
        for (let i = 0; i < pts.length; i++) { const rr = RAD[i] * sc; if (pts[i].y < rr) pts[i].y = rr; }
      }
      // 地面/壁との衝突 (速度反射)
      let grounded = false;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const rad = RAD[i] * sc;
        if (p.y <= rad + 0.001) {
          const vy = p.y - p.py;
          p.y = rad;
          if (vy < -0.05) p.py = p.y + vy * 0.5; else p.py = p.y;
          p.px += (p.x - p.px) * 0.22; p.pz += (p.z - p.pz) * 0.22;
          grounded = true;
        }
        // 建物
        if (world) for (const b of world.nearBoxes(p.x, p.z)) {
          if (p.y > b.h + 0.1 || p.x < b.minx - 0.2 || p.x > b.maxx + 0.2 || p.z < b.minz - 0.2 || p.z > b.maxz + 0.2) continue;
          const dl = p.x - b.minx, dr = b.maxx - p.x, df = p.z - b.minz, db = b.maxz - p.z;
          const m = Math.min(dl, dr, df, db);
          const vx = p.x - p.px, vz = p.z - p.pz;
          if (m === dl) { p.x = b.minx - 0.2; p.px = p.x + Math.abs(vx) * 0.55; }
          else if (m === dr) { p.x = b.maxx + 0.2; p.px = p.x - Math.abs(vx) * 0.55; }
          else if (m === df) { p.z = b.minz - 0.2; p.pz = p.z + Math.abs(vz) * 0.55; }
          else { p.z = b.maxz + 0.2; p.pz = p.z - Math.abs(vz) * 0.55; }
          if (this.wallCd <= 0 && Math.hypot(vx, vz) > 0.25) {
            this.wallCd = 0.5; this.wallHits++;
            o.onWall && o.onWall(this, p.x, p.y, p.z);
          }
        }
      }
      const pel = pts[2], vy = pel.y - pel.py;
      if (pel.y > this.peak) this.peak = pel.y;
      if (!this.apexFired && this.peak > 3.2 && this.prevVy > 0 && vy <= 0) { this.apexFired = true; o.onApex && o.onApex(this, pel.x, pel.y, pel.z); }
      this.prevVy = vy;
      if (!grounded) this.air += h;
      if (grounded && !this.landed && this.age > 0.25) {
        this.landed = true; o.onLand && o.onLand(this, pel.x, pel.z);
      }
      // 静止判定
      let ke = 0; for (const p of pts) ke += Math.abs(p.x - p.px) + Math.abs(p.z - p.pz) + Math.abs(p.y - p.py);
      if (grounded && this.landed && ke / pts.length < 0.012) this.restT += h; else this.restT = 0;
      if (this.restT > 0.5 || this.age > cfg.maxLife) this.settle();
    }

    /** 倒れて静止中のラグドールをもう一度蹴り飛ばす。o2: 新しいコールバック群(onLand等) */
    kick(vel, spin, o2) {
      if (!this.active || !this.sleeping) return false;
      const pts = this.pts, dt0 = 1 / 60, w = spin || { x: 0, y: 0, z: 0 }, c = pts[2];
      this.o = Object.assign({}, this.o, o2); this.sleeping = false;
      pts.forEach((p) => {
        const rx = p.x - c.x, ry = p.y - c.y, rz = p.z - c.z;
        const vx = vel.x + (w.y * rz - w.z * ry), vy = vel.y + (w.z * rx - w.x * rz), vz = vel.z + (w.x * ry - w.y * rx);
        p.px = p.x - vx * dt0; p.py = p.y - vy * dt0; p.pz = p.z - vz * dt0;
        p.y += 0.05;
      });
      this.sx = c.x; this.sz = c.z; this.age = 0; this.air = 0; this.peak = c.y; this.landed = false; this.restT = 0;
      this.apexFired = false; this.prevVy = vel.y; this.wallCd = 0; this.acc = 0;
      return true;
    }

    /** 静止: そのまま倒れた姿で残す (シミュレーションだけ止める) */
    settle() {
      if (!this.active || this.sleeping) return;
      this.sleeping = true; this.render();
      const pel = this.pts[2], cb = this.o.onDone; this.o.onDone = null;
      cb && cb(this, pel.x, pel.z);
    }
    finish() {
      if (!this.active) return;
      this.active = false; this.group.visible = false;
      const pel = this.pts[2];
      this.o.onDone && this.o.onDone(this, pel.x, pel.z);
    }

    render() {
      const pts = this.pts, v = this._v, q = this._q, up = this._up;
      for (const l of this.limbs) {
        const [a, b] = STICKS[l.si], A = pts[a], B = pts[b];
        v.set(B.x - A.x, B.y - A.y, B.z - A.z); const len = v.length() || 1e-4; v.multiplyScalar(1 / len);
        l.m.position.set((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
        q.setFromUnitVectors(up, v); l.m.quaternion.copy(q); l.m.scale.set(l.r * this.sc, len, l.r * this.sc);
      }
      for (const bl of this.balls) bl.m.position.set(pts[bl.pi].x, pts[bl.pi].y, pts[bl.pi].z);
      const h = pts[0], n = pts[1];
      this.head.position.set(h.x, h.y, h.z);
      v.set(h.x - n.x, h.y - n.y, h.z - n.z).normalize(); q.setFromUnitVectors(up, v); this.head.quaternion.copy(q);
    }
    get x() { return this.pts[2].x; }
    get y() { return this.pts[2].y; }
    get z() { return this.pts[2].z; }
  }

  class RagdollPool {
    constructor(scene, n) { this.rigs = []; for (let i = 0; i < n; i++) this.rigs.push(new Rig(scene)); this.focus = { x: 0, z: 0 }; }
    /** 空きが無ければ、眠っている(倒れて静止中の)もののうち車から一番遠いものを再利用 */
    spawn(o) {
      let r = this.rigs.find((x) => !x.active);
      if (!r) {
        const f = this.focus; let bd = -1;
        for (const x of this.rigs) if (x.sleeping) { const d = Math.hypot(x.x - f.x, x.z - f.z); if (d > bd) { bd = d; r = x; } }
        if (!r) r = this.rigs.reduce((a, b) => (a.age > b.age ? a : b));
        r.finish();
      }
      r.launch(o); return r;
    }
    update(dt, world) { for (const r of this.rigs) if (r.active && !r.sleeping) r.update(dt, world); }
    clear() { for (const r of this.rigs) { r.active = false; r.sleeping = false; r.group.visible = false; } }
    get activeCount() { return this.rigs.filter((r) => r.active).length; }
  }

  CT.Rig = Rig; CT.RagdollPool = RagdollPool;
})();
