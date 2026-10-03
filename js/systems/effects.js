/* 粒子(スモーク/星/火花)・タイヤ痕。バスイベントを購読して自動で演出を出す */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const U = CT.util;

  /** 1枚のテクスチャで描くポイントスプライト粒子 (リングバッファ) */
  class PointFX {
    constructor(scene, tex, max, additive) {
      const THREE = window.THREE;
      this.max = max; this.i = 0;
      this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
      this.size = new Float32Array(max); this.alpha = new Float32Array(max);
      this.p = []; for (let n = 0; n < max; n++) this.p.push({ life: 0, max: 1 });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3));
      g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
      g.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1));
      this.uni = { map: { value: tex }, scale: { value: 600 } };
      const mat = new THREE.ShaderMaterial({
        uniforms: this.uni, transparent: true, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        vertexShader: 'attribute vec3 pcolor; attribute float psize; attribute float palpha; uniform float scale; varying vec3 vC; varying float vA;\n' +
          'void main(){ vC=pcolor; vA=palpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=psize*scale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }',
        fragmentShader: 'uniform sampler2D map; varying vec3 vC; varying float vA;\n' +
          'void main(){ vec4 t=texture2D(map,gl_PointCoord); gl_FragColor=vec4(vC*t.rgb,t.a*vA); if(gl_FragColor.a<0.01) discard; }',
      });
      this.mesh = new THREE.Points(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
      scene.add(this.mesh); this.geo = g;
    }
    setScale(s) { this.uni.scale.value = s; }
    emit(o) {
      const n = this.i; this.i = (this.i + 1) % this.max;
      const p = this.p[n];
      p.life = p.max = o.life || 1; p.x = o.x; p.y = o.y; p.z = o.z; p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
      p.g = o.g === undefined ? 0 : o.g; p.drag = o.drag === undefined ? 0 : o.drag;
      p.s0 = o.s0 || 1; p.s1 = o.s1 === undefined ? p.s0 : o.s1; p.a0 = o.a0 === undefined ? 1 : o.a0; p.a1 = o.a1 || 0;
      p.r = o.r === undefined ? 1 : o.r; p.gr = o.g2 === undefined ? 1 : o.g2; p.b = o.b === undefined ? 1 : o.b;
    }
    update(dt) {
      for (let n = 0; n < this.max; n++) {
        const p = this.p[n];
        if (p.life <= 0) { this.size[n] = 0; continue; }
        p.life -= dt; const k = 1 - Math.max(0, p.life) / p.max;
        p.vy -= p.g * dt; const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; p.vz *= d;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.05) { p.y = 0.05; p.vy = Math.abs(p.vy) * 0.3; }
        this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
        this.col[n * 3] = p.r; this.col[n * 3 + 1] = p.gr; this.col[n * 3 + 2] = p.b;
        this.size[n] = U.lerp(p.s0, p.s1, k); this.alpha[n] = U.lerp(p.a0, p.a1, k);
      }
      const a = this.geo.attributes;
      a.position.needsUpdate = a.pcolor.needsUpdate = a.psize.needsUpdate = a.palpha.needsUpdate = true;
    }
    clear() { for (const p of this.p) p.life = 0; }
  }

  /** タイヤ痕 (地面に貼る帯のリングバッファ) */
  class Skids {
    constructor(scene, max) {
      const THREE = window.THREE; this.max = max; this.n = 0; this.count = 0;
      this.pos = new Float32Array(max * 12);
      const idx = new Uint16Array(max * 6);
      for (let i = 0; i < max; i++) { const b = i * 4; idx.set([b, b + 1, b + 2, b + 2, b + 1, b + 3], i * 6); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.setDrawRange(0, 0); this.geo = g;
      this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x15161a, transparent: true, opacity: 0.55, depthWrite: false }));
      this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; scene.add(this.mesh);
      this.last = [null, null];
    }
    mark(wi, x, z) {
      const l = this.last[wi];
      if (l) {
        const dx = x - l.x, dz = z - l.z, d = Math.hypot(dx, dz);
        if (d < 0.25) return;
        if (d > 6) { this.last[wi] = { x, z }; return; }
        const px = (-dz / d) * 0.17, pz = (dx / d) * 0.17, y = 0.32, o = this.n * 12, P = this.pos;
        P.set([l.x - px, y, l.z - pz, l.x + px, y, l.z + pz, x - px, y, z - pz, x + px, y, z + pz], o);
        this.n = (this.n + 1) % this.max; this.count = Math.min(this.max, this.count + 1);
        this.geo.setDrawRange(0, this.count * 6); this.geo.attributes.position.needsUpdate = true;
      }
      this.last[wi] = { x, z };
    }
    release() { this.last = [null, null]; }
    clear() { this.count = 0; this.n = 0; this.geo.setDrawRange(0, 0); }
  }

  class Effects {
    constructor(scene, camera) {
      this.camera = camera; this.scene = scene;
      this.smoke = new PointFX(scene, CT.Models.radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), 500, false);
      this.stars = new PointFX(scene, CT.Models.starTex('#ffffff'), 400, true);
      this.skids = new Skids(scene, 700);
      this.trailT = 0;
      const bus = CT.bus;
      bus.on('ped:hit', (e) => this.onHit(e));
      bus.on('ped:apex', (e) => this.starBurst(e.x, e.y, e.z, 60, 14));
      bus.on('ped:land', (e) => this.dust(e.x, 0.3, e.z, 14, 5));
      bus.on('ped:wall', (e) => this.starBurst(e.x, e.y, e.z, 12, 5));
      bus.on('prop:hit', (e) => this.starBurst(e.x, 1, e.z, 10, 5));
      bus.on('crash', (e) => this.sparks(e.x, 1, e.z, 6 + Math.round(e.power * 18)));
      bus.on('deliver', (e) => this.starBurst(e.x, 2, e.z, 40, 9));
      bus.on('pickup', (e) => this.starBurst(e.x, 2, e.z, 25, 7));
    }
    resize(h, pr) { const s = (h * pr) * 0.55; this.smoke.setScale(s); this.stars.setScale(s); }
    dust(x, y, z, n, spd) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28;
        this.smoke.emit({ x, y, z, vx: Math.cos(a) * spd * Math.random(), vy: U.rand(0.5, 3), vz: Math.sin(a) * spd * Math.random(), life: U.rand(0.5, 1.0), s0: 2.5, s1: 7, a0: 0.55, a1: 0, drag: 2.5, r: 0.95, g2: 0.92, b: 0.85 });
      }
    }
    starBurst(x, y, z, n, spd) {
      const cols = [[1, 0.9, 0.2], [1, 0.5, 0.8], [0.4, 0.9, 1], [1, 1, 1]];
      for (let i = 0; i < n; i++) {
        const c = U.pick(cols), a = Math.random() * 6.28, e = U.rand(-0.3, 1.2), s = U.rand(0.3, 1) * spd;
        this.stars.emit({ x, y, z, vx: Math.cos(a) * s * Math.cos(e), vy: Math.sin(e) * s + 2, vz: Math.sin(a) * s * Math.cos(e), life: U.rand(0.6, 1.3), s0: U.rand(1.2, 2.8), s1: 0.3, a0: 0.95, a1: 0, g: 3, drag: 1.2, r: c[0], g2: c[1], b: c[2] });
      }
    }
    sparks(x, y, z, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28;
        this.stars.emit({ x, y, z, vx: Math.cos(a) * 9, vy: U.rand(1, 7), vz: Math.sin(a) * 9, life: U.rand(0.25, 0.6), s0: 1.8, s1: 0.2, g: 20, drag: 1, r: 1, g2: 0.8, b: 0.3 });
      }
    }
    onHit(e) {
      this.starBurst(e.x, 1.3, e.z, 26, 13);
      this.dust(e.x, 0.6, e.z, 8, 4);
    }
    /** 毎フレーム */
    update(dt, taxi, pool, active) {
      // ドリフトスモーク & タイヤ痕
      const rw = taxi.rearWheels();
      const skidding = taxi.y < 0.2 && (taxi.drifting || (taxi.lastCtl && taxi.lastCtl.handbrake && Math.abs(taxi.speed) > 6) || (taxi.lastCtl && taxi.lastCtl.throttle < 0 && taxi.speed > 12));
      if (skidding) {
        for (let w = 0; w < 2; w++) {
          this.skids.mark(w, rw[w].x, rw[w].z);
          if (Math.random() < Math.min(1, dt * 40)) this.smoke.emit({ x: rw[w].x, y: 0.3, z: rw[w].z, vx: U.rand(-1, 1), vy: U.rand(0.5, 1.8), vz: U.rand(-1, 1), life: U.rand(0.5, 0.9), s0: 2, s1: 5.5, a0: 0.45, a1: 0, drag: 1.5, r: 0.92, g2: 0.92, b: 0.95 });
        }
      } else this.skids.release();
      // ブースト炎
      if (taxi.boosting && active) {
        const bx = taxi.x - taxi.fx * 2.4, bz = taxi.z - taxi.fz * 2.4;
        this.stars.emit({ x: bx, y: 0.6, z: bz, vx: -taxi.fx * 8 + U.rand(-1, 1), vy: U.rand(0, 1), vz: -taxi.fz * 8 + U.rand(-1, 1), life: 0.3, s0: 4, s1: 0.5, r: 1, g2: 0.6, b: 0.15 });
      }
      // 吹っ飛び中のラグドールにキラキラ尾を引く
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.05;
        for (const r of pool.rigs) if (r.active && r.y > 3 && !r.landed) {
          this.stars.emit({ x: r.x, y: r.y, z: r.z, vx: U.rand(-1.5, 1.5), vy: U.rand(-1, 1), vz: U.rand(-1.5, 1.5), life: 0.7, s0: U.rand(2, 4.5), s1: 0.3, g: 2, r: 1, g2: U.rand(0.7, 1), b: U.rand(0.3, 0.9) });
        }
      }
      this.smoke.update(dt); this.stars.update(dt);
    }
    clear() { this.smoke.clear(); this.stars.clear(); this.skids.clear(); }
  }

  CT.PointFX = PointFX; CT.Effects = Effects;
})();
