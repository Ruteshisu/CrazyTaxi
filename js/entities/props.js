/* 路上の小物(コーン/ゴミ箱/ポスト)・街路樹・街灯: ぶつかると全部ふっ飛ぶ。しばらくすると元の位置に復帰。
   木/街灯は World のインスタンスを非表示にして、代わりにプール済みの「飛ぶ用コピー」を飛ばす */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const U = CT.util;
  const LABELS = { cone: 'カコーン!', bin: 'ガシャーン!', mailbox: 'ポスト〜!', tree: 'メキメキ〜!', lamp: 'ガンッ!' };
  const POINTS = { cone: 1, bin: 1, mailbox: 1, tree: 1.6, lamp: 2 };

  class Props {
    constructor(scene, world, count) {
      this.world = world; this.scene = scene;
      this.list = [];
      const spots = world.knockSpots.slice().sort(() => Math.random() - 0.5).slice(0, count || 160);
      for (const s of spots) {
        const mesh = CT.Models[s.kind]();
        mesh.position.set(s.x, 0.3, s.z); scene.add(mesh);
        this.list.push({ kind: s.kind, mesh, hx: s.x, hz: s.z, x: s.x, y: 0.3, z: s.z, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, state: 'idle', t: 0 });
      }
      // 木・街灯の飛ぶ用コピー
      this.flyers = [];
      for (let i = 0; i < 12; i++) this.flyers.push(this._flyer('tree'));
      for (let i = 0; i < 8; i++) this.flyers.push(this._flyer('lamp'));
    }
    _flyer(kind) {
      const THREE = window.THREE, M = CT.Models, g = new THREE.Group();
      let crown = null;
      if (kind === 'tree') {
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6), M.mat(0x7a5230)).translateY(1.1));
        crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 0), new THREE.MeshLambertMaterial({ color: 0x4fae4a })); crown.position.y = 4.2; g.add(crown);
      } else {
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 6.4, 6), M.mat(0x555a64)).translateY(3.2));
        g.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.2, 0.5), M.basic(0xfff3b0)).translateY(6.4));
      }
      g.visible = false; this.scene.add(g);
      return { kind, mesh: g, crown, active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, t: 0 };
    }
    reset() {
      for (const p of this.list) this._home(p);
      for (const f of this.flyers) { f.active = false; f.mesh.visible = false; }
      const W = this.world;
      W.trees.forEach((t, i) => { if (!t.alive) W.setTreeVisible(i, true); t.t = 0; });
      W.lamps.forEach((l, i) => { if (!l.alive) W.setLampVisible(i, true); l.t = 0; });
    }
    _home(p) { p.state = 'idle'; p.x = p.hx; p.y = 0.3; p.z = p.hz; p.mesh.position.set(p.x, p.y, p.z); p.mesh.rotation.set(0, 0, 0); p.mesh.visible = true; }

    /** 車(taxi)の当たり範囲に入ったか */
    _touch(taxi, x, z, r) {
      const dx = x - taxi.x, dz = z - taxi.z;
      if (dx * dx + dz * dz > r * r) return false;
      const L = taxi.toLocal(x, z);
      return Math.abs(L.ll) < 1.9 && L.lf > -2.4 && L.lf < 3.2;
    }

    update(dt, taxi) {
      const sp = taxi.totalSpeed, can = sp > 2.5 && taxi.y < 1;
      for (const p of this.list) {
        if (p.state === 'idle') {
          if (can && this._touch(taxi, p.x, p.z, 3.2)) this._launch(p, taxi, sp);
        } else {
          p.t += dt;
          p.vy -= 24 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          p.mesh.rotation.x += p.wx * dt; p.mesh.rotation.y += p.wy * dt; p.mesh.rotation.z += p.wz * dt;
          if (p.y < 0.3) {
            p.y = 0.3;
            if (Math.abs(p.vy) > 3) { p.vy = -p.vy * 0.45; p.vx *= 0.7; p.vz *= 0.7; } else { p.vy = 0; p.vx *= 0.9; p.vz *= 0.9; p.wx *= 0.8; p.wy *= 0.8; p.wz *= 0.8; }
          }
          p.mesh.position.set(p.x, p.y, p.z);
          if (p.t > 9) this._home(p);
        }
      }
      // 街路樹・街灯
      const W = this.world;
      if (can) {
        for (let i = 0; i < W.trees.length; i++) { const t = W.trees[i]; if (t.alive && this._touch(taxi, t.x, t.z, 3.4)) this._knockFlora('tree', i, t, taxi, sp); }
        for (let i = 0; i < W.lamps.length; i++) { const l = W.lamps[i]; if (l.alive && this._touch(taxi, l.x, l.z, 3.4)) this._knockFlora('lamp', i, l, taxi, sp); }
      }
      for (const f of this.flyers) {
        if (!f.active) continue;
        f.t += dt; f.vy -= 24 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
        f.mesh.rotation.x += f.wx * dt; f.mesh.rotation.z += f.wz * dt; f.mesh.rotation.y += f.wy * dt;
        if (f.y < 0) { f.y = 0; if (Math.abs(f.vy) > 4) { f.vy = -f.vy * 0.4; f.vx *= 0.7; f.vz *= 0.7; } else { f.vy = 0; f.vx *= 0.9; f.vz *= 0.9; f.wx *= 0.85; f.wz *= 0.85; f.wy *= 0.85; } }
        f.mesh.position.set(f.x, f.y, f.z);
        if (f.t > 6) { f.active = false; f.mesh.visible = false; }
      }
      // 復帰 (遠くにいる時だけ)
      for (let i = 0; i < W.trees.length; i++) { const t = W.trees[i]; if (!t.alive) { t.t += dt; if (t.t > 16 && Math.hypot(t.x - taxi.x, t.z - taxi.z) > 40) W.setTreeVisible(i, true); } }
      for (let i = 0; i < W.lamps.length; i++) { const l = W.lamps[i]; if (!l.alive) { l.t += dt; if (l.t > 16 && Math.hypot(l.x - taxi.x, l.z - taxi.z) > 40) W.setLampVisible(i, true); } }
    }
    _launch(p, taxi, sp) {
      p.state = 'fly'; p.t = 0;
      p.vx = taxi.vx * 0.9 + U.rand(-3, 3); p.vz = taxi.vz * 0.9 + U.rand(-3, 3); p.vy = U.rand(8, 12) + sp * 0.2;
      p.wx = U.rand(-12, 12); p.wy = U.rand(-8, 8); p.wz = U.rand(-12, 12);
      CT.bus.emit('prop:hit', { x: p.x, z: p.z, label: LABELS[p.kind], kind: p.kind, pts: POINTS[p.kind], speed: sp });
    }
    _knockFlora(kind, idx, o, taxi, sp) {
      const f = this.flyers.find((q) => q.kind === kind && !q.active);
      if (kind === 'tree') this.world.setTreeVisible(idx, false); else this.world.setLampVisible(idx, false);
      o.t = 0;
      if (f) {
        f.active = true; f.t = 0; f.x = o.x; f.y = 0; f.z = o.z; f.mesh.visible = true;
        f.mesh.rotation.set(0, 0, 0); f.mesh.position.set(f.x, f.y, f.z);
        const k = kind === 'tree' ? 0.75 : 0.85;
        f.vx = taxi.vx * k + U.rand(-2, 2); f.vz = taxi.vz * k + U.rand(-2, 2); f.vy = U.rand(7, 10) + sp * 0.2;
        f.wx = U.rand(-5, 5); f.wy = U.rand(-4, 4); f.wz = U.rand(-5, 5);
        if (f.crown) { f.crown.material.color.setHex(o.color); f.crown.scale.setScalar(o.s); }
      }
      taxi.vx *= kind === 'tree' ? 0.97 : 0.96; taxi.vz *= kind === 'tree' ? 0.97 : 0.96;
      CT.bus.emit('prop:hit', { x: o.x, z: o.z, label: LABELS[kind], kind, pts: POINTS[kind], speed: sp });
    }
  }
  CT.Props = Props;
})();
