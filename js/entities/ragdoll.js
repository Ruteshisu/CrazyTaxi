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
    [1, 0.2, 'shirt'], [2, 0.075, 'shirt'], [3, 0.065, 'skin'], [4, 0.075, 'shirt'], [5, 0.065, 'skin'],
    [6, 0.09, 'pants'], [7, 0.085, 'pants'], [8, 0.09, 'pants'], [9, 0.085, 'pants'],
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
      const cyl = new THREE.CylinderGeometry(1, 1, 1, 7);
      this.limbs = LIMBS.map(([si, r, kind]) => {
        const m = new THREE.Mesh(cyl, this.mats[kind]); m.scale.set(r, 1, r); this.group.add(m);
        return { m, si, r };
      });
      // 足/手の丸
      const sph = new THREE.SphereGeometry(1, 7, 6);
      this.balls = [[4, 0.085, 'skin'], [6, 0.085, 'skin'], [8, 0.12, 'shoe'], [10, 0.12, 'shoe']].map(([pi, r, k]) => {
        const m = new THREE.Mesh(sph, k === 'shoe' ? M.mat(0x222222) : this.mats.skin); m.scale.setScalar(r); this.group.add(m); return { m, pi };
      });
      // 頭 (前後に顔: 「目が点/ O口」)
      const head = new THREE.Group();
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), this.mats.skin));
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.245, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), this.mats.hair);
      head.add(cap);
      const white = M.basic(0xffffff), black = M.basic(0x111111), eg = new THREE.SphereGeometry(1, 8, 6);
      for (const sz of [1, -1]) for (const sx of [-1, 1]) {
        const e = new THREE.Mesh(eg, white); e.scale.setScalar(0.075); e.position.set(sx * 0.09, 0.03, sz * 0.18); head.add(e);
        const p = new THREE.Mesh(eg, black); p.scale.setScalar(0.035); p.position.set(sx * 0.09, 0.03, sz * 0.25); head.add(p);
      }
      for (const sz of [1, -1]) {
        const mo = new THREE.Mesh(eg, black); mo.scale.set(0.06, 0.08, 0.04); mo.position.set(0, -0.1, sz * 0.2); head.add(mo);
      }
      this.group.add(head); this.head = head;
      this.pts = POSE.map(() => ({ x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0 }));
      this.rest = STICKS.map(([a, b]) => Math.hypot(POSE[a][0] - POSE[b][0], POSE[a][1] - POSE[b][1], POSE[a][2] - POSE[b][2]));
      this.active = false;
      this._v = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._up = new THREE.Vector3(0, 1, 0);
    }

    /** o: {x,z,yaw, vel:{x,y,z}, spin:{x,y,z}, colors:{shirt,pants,skin,hair}, onLand, onWall, onApex, onDone, tag} */
    launch(o) {
      this.active = true; this.group.visible = true; this.o = o;
      const c = o.colors || {};
      this.mats.shirt.color.setHex(c.shirt || 0xff5050); this.mats.pants.color.setHex(c.pants || 0x335577);
      this.mats.skin.color.setHex(c.skin || 0xf3c9a0); this.mats.hair.color.setHex(c.hair || 0x332211);
      const cs = Math.cos(o.yaw || 0), sn = Math.sin(o.yaw || 0), dt0 = 1 / 60;
      const v = o.vel, w = o.spin || { x: 0, y: 0, z: 0 };
      const cx = o.x, cz = o.z, py = POSE[2];
      this.pts.forEach((p, i) => {
        const lx = POSE[i][0], ly = POSE[i][1], lz = POSE[i][2];
        p.x = cx + lx * cs + lz * sn; p.y = ly + (o.y0 || 0); p.z = cz - lx * sn + lz * cs;
        const rx = p.x - cx, ry = p.y - (py[1] + (o.y0 || 0)), rz = p.z - cz;
        const vx = v.x + (w.y * rz - w.z * ry), vy = v.y + (w.z * rx - w.x * rz), vz = v.z + (w.x * ry - w.y * rx);
        p.px = p.x - vx * dt0; p.py = p.y - vy * dt0; p.pz = p.z - vz * dt0;
      });
      this.age = 0; this.air = 0; this.peak = 0; this.landed = false; this.rest = this.rest; this.restT = 0;
      this.apexFired = false; this.prevVy = v.y; this.wallHits = 0; this.wallCd = 0; this.acc = 0; this.bounces = 0;
      this.render();
    }

    update(dt, world) {
      if (!this.active) return;
      this.acc += Math.min(dt, 0.05);
      const h = 1 / 60;
      while (this.acc >= h) { this.acc -= h; this._step(h, world); if (!this.active) return; }
      this.render();
    }

    _step(h, world) {
      const cfg = CT.config.ragdoll, g = cfg.gravity, pts = this.pts, o = this.o;
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
        for (let i = 0; i < pts.length; i++) if (pts[i].y < RAD[i]) pts[i].y = RAD[i];
      }
      // 地面/壁との衝突 (速度反射)
      let grounded = false;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.y <= RAD[i] + 0.001) {
          const vy = p.y - p.py;
          p.y = RAD[i];
          if (vy < -0.05) p.py = p.y + vy * 0.5; else p.py = p.y;
          p.px += (p.x - p.px) * 0.22; p.pz += (p.z - p.pz) * 0.22;
          grounded = true;
        }
        // 建物
        if (world) for (const b of world.boxes) {
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
      if (!this.apexFired && this.peak > 16 && this.prevVy > 0 && vy <= 0) { this.apexFired = true; o.onApex && o.onApex(this, pel.x, pel.y, pel.z); }
      this.prevVy = vy;
      if (!grounded) this.air += h;
      if (grounded && !this.landed && this.age > 0.25) {
        this.landed = true; o.onLand && o.onLand(this, pel.x, pel.z);
      }
      // 静止判定
      let ke = 0; for (const p of pts) ke += Math.abs(p.x - p.px) + Math.abs(p.z - p.pz) + Math.abs(p.y - p.py);
      if (grounded && this.landed && ke / pts.length < 0.012) this.restT += h; else this.restT = 0;
      if (this.restT > 0.5 || this.age > cfg.maxLife) this.finish();
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
        q.setFromUnitVectors(up, v); l.m.quaternion.copy(q); l.m.scale.y = len;
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
    constructor(scene, n) { this.rigs = []; for (let i = 0; i < n; i++) this.rigs.push(new Rig(scene)); this.order = 0; }
    spawn(o) {
      let r = this.rigs.find((x) => !x.active);
      if (!r) { // 一番古いものを強制終了して再利用
        r = this.rigs.reduce((a, b) => (a.age > b.age ? a : b)); r.finish();
      }
      r.launch(o); return r;
    }
    update(dt, world) { for (const r of this.rigs) if (r.active) r.update(dt, world); }
    clear() { for (const r of this.rigs) { r.active = false; r.group.visible = false; } }
    get activeCount() { return this.rigs.filter((r) => r.active).length; }
  }

  CT.Rig = Rig; CT.RagdollPool = RagdollPool;
})();
