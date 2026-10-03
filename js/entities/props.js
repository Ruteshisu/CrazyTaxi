/* 路上の小物(コーン/ゴミ箱/ポスト): ぶつかると派手に飛ぶ。しばらくすると元の位置に復帰 */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const U = CT.util;
  const LABELS = { cone: 'カコーン!', bin: 'ガシャーン!', mailbox: 'ポスト〜!' };

  class Props {
    constructor(scene, world, count) {
      this.list = [];
      const spots = world.knockSpots.slice().sort(() => Math.random() - 0.5).slice(0, count || 90);
      for (const s of spots) {
        const mesh = CT.Models[s.kind]();
        mesh.position.set(s.x, 0.3, s.z); scene.add(mesh);
        this.list.push({ kind: s.kind, mesh, hx: s.x, hz: s.z, x: s.x, y: 0.3, z: s.z, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, state: 'idle', t: 0 });
      }
    }
    reset() { for (const p of this.list) this._home(p); }
    _home(p) { p.state = 'idle'; p.x = p.hx; p.y = 0.3; p.z = p.hz; p.mesh.position.set(p.x, p.y, p.z); p.mesh.rotation.set(0, 0, 0); p.mesh.visible = true; }
    update(dt, taxi) {
      const sp = taxi.totalSpeed;
      for (const p of this.list) {
        if (p.state === 'idle') {
          const dx = p.x - taxi.x, dz = p.z - taxi.z;
          if (sp > 2.5 && dx * dx + dz * dz < 2.9 * 2.9 && taxi.y < 1) {
            const L = taxi.toLocal(p.x, p.z);
            if (Math.abs(L.ll) < 1.9 && L.lf > -2.4 && L.lf < 3.2) this._launch(p, taxi, sp);
          }
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
    }
    _launch(p, taxi, sp) {
      p.state = 'fly'; p.t = 0;
      p.vx = taxi.vx * 0.9 + U.rand(-3, 3); p.vz = taxi.vz * 0.9 + U.rand(-3, 3); p.vy = U.rand(9, 15) + sp * 0.25;
      p.wx = U.rand(-12, 12); p.wy = U.rand(-8, 8); p.wz = U.rand(-12, 12);
      CT.bus.emit('prop:hit', { x: p.x, z: p.z, label: LABELS[p.kind], kind: p.kind });
    }
  }
  CT.Props = Props;
})();
