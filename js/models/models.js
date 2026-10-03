/* 手続き生成のモデル/テクスチャ集。外部アセットは一切使わない。
   新しい乗り物/キャラ/小物を足すときはここにビルダー関数を追加する。 */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const T = () => window.THREE;

  const matCache = {};
  const M = (CT.Models = {
    /** Lambertマテリアルのキャッシュ付き取得 */
    mat(color, opts) {
      const key = color + (opts ? JSON.stringify(opts) : '');
      if (!matCache[key]) matCache[key] = new (T().MeshLambertMaterial)(Object.assign({ color }, opts || {}));
      return matCache[key];
    },
    basic(color, opts) {
      const key = 'b' + color + (opts ? JSON.stringify(opts) : '');
      if (!matCache[key]) matCache[key] = new (T().MeshBasicMaterial)(Object.assign({ color }, opts || {}));
      return matCache[key];
    },
    box(w, h, d, mat, x, y, z) {
      const m = new (T().Mesh)(new (T().BoxGeometry)(w, h, d), mat);
      m.position.set(x || 0, y || 0, z || 0);
      return m;
    },
    canvasTex(w, h, draw, opts) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      const t = new (T().CanvasTexture)(c);
      if (opts && opts.repeat) { t.wrapS = t.wrapT = T().RepeatWrapping; }
      t.anisotropy = 4;
      return t;
    },
    /** 看板用の文字テクスチャ */
    textTex(text, o) {
      o = Object.assign({ w: 256, h: 96, bg: '#ffffff', fg: '#222', font: 'bold 54px sans-serif', border: null }, o || {});
      return M.canvasTex(o.w, o.h, (g, w, h) => {
        g.fillStyle = o.bg; g.fillRect(0, 0, w, h);
        if (o.border) { g.strokeStyle = o.border; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8); }
        g.fillStyle = o.fg; g.font = o.font; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(text, w / 2, h / 2 + 3, w - 16);
      });
    },
    radialTex(inner, outer) {
      return M.canvasTex(64, 64, (g) => {
        const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, inner); gr.addColorStop(0.6, inner); gr.addColorStop(1, outer);
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      });
    },
    starTex(fill) {
      return M.canvasTex(64, 64, (g) => {
        g.translate(32, 32); g.fillStyle = fill; g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 11 : 28, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.closePath(); g.fill();
      });
    },
    blobShadow(size) {
      if (!M._blobTex) M._blobTex = M.radialTex('rgba(0,0,0,0.45)', 'rgba(0,0,0,0)');
      const m = new (T().Mesh)(new (T().PlaneGeometry)(size, size),
        new (T().MeshBasicMaterial)({ map: M._blobTex, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.renderOrder = 1;
      return m;
    },

    /* ================= タクシー ================= */
    taxi(color) {
      const THREE = T(), g = new THREE.Group(), body = new THREE.Group(); g.add(body);
      const Y = M.mat(color || 0xffc400), glass = M.mat(0x25324d), dark = M.mat(0x23252b);
      body.add(M.box(2.1, 0.62, 4.4, Y, 0, 0.66, 0));
      body.add(M.box(1.9, 0.16, 1.2, Y, 0, 1.03, 1.45));
      body.add(M.box(1.9, 0.16, 0.9, Y, 0, 1.03, -1.7));
      body.add(M.box(1.82, 0.62, 2.0, glass, 0, 1.28, -0.2));
      body.add(M.box(1.92, 0.1, 2.3, Y, 0, 1.62, -0.2));
      for (const sx of [-0.9, 0.9]) for (const sz of [-1.15, 0.75]) body.add(M.box(0.09, 0.64, 0.09, Y, sx, 1.28, sz));
      // 市松ストライプ
      const checker = M.canvasTex(128, 16, (c, w, h) => {
        for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#111' : '#fff'; c.fillRect(i * 8, 0, 8, 8); c.fillStyle = i % 2 ? '#fff' : '#111'; c.fillRect(i * 8, 8, 8, 8); }
      });
      const sideStripe = new THREE.MeshLambertMaterial({ map: checker });
      body.add(M.box(2.13, 0.12, 4.2, sideStripe, 0, 0.74, 0));
      body.add(M.box(1.9, 0.18, 0.2, dark, 0, 0.5, 2.28));
      body.add(M.box(1.9, 0.18, 0.2, dark, 0, 0.5, -2.28));
      // 屋根のTAXI行灯
      const signTex = M.textTex('TAXI', { w: 128, h: 48, bg: '#fff7d6', fg: '#c40', font: 'bold 34px sans-serif' });
      const sm = new THREE.MeshBasicMaterial({ map: signTex }), sw = M.basic(0xfff7d6);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.3, 0.4), [sw, sw, sw, sw, sm, sm]);
      sign.position.set(0, 1.82, -0.2); body.add(sign);
      // ライト
      for (const sx of [-0.7, 0.7]) {
        body.add(M.box(0.4, 0.2, 0.08, M.basic(0xfff6c0), sx, 0.72, 2.22));
        body.add(M.box(0.4, 0.18, 0.08, M.basic(0xff3030), sx, 0.72, -2.22));
      }
      // ホイール
      const wheels = [];
      const wg = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14);
      const hubG = new THREE.CylinderGeometry(0.2, 0.2, 0.32, 8);
      for (const [sx, sz, front] of [[-1.05, 1.4, true], [1.05, 1.4, true], [-1.05, -1.45, false], [1.05, -1.45, false]]) {
        const steer = new THREE.Group(), spin = new THREE.Group();
        const w = new THREE.Mesh(wg, M.mat(0x16171a)); w.rotation.z = Math.PI / 2;
        const hub = new THREE.Mesh(hubG, M.mat(0xc9ccd4)); hub.rotation.z = Math.PI / 2;
        spin.add(w, hub); steer.add(spin); steer.position.set(sx, 0.42, sz); g.add(steer);
        wheels.push({ steer, spin, front, side: sx });
      }
      const shadow = M.blobShadow(6); shadow.scale.set(0.8, 1.15, 1); g.add(shadow);
      return { group: g, body, wheels, shadow };
    },

    /* ================= 通行人(歩き用) ================= */
    human(o) {
      const THREE = T();
      o = Object.assign({ shirt: 0xe84a5f, pants: 0x2b4a7a, skin: 0xf3c9a0, hair: 0x3a2a1c, scale: 1, hat: false }, o || {});
      const g = new THREE.Group(), root = new THREE.Group(); g.add(root);
      const shirt = M.mat(o.shirt), pants = M.mat(o.pants), skin = M.mat(o.skin), hair = M.mat(o.hair);
      const torso = M.box(0.5, 0.62, 0.28, shirt, 0, 1.12, 0); root.add(torso);
      const head = new THREE.Group(); head.position.set(0, 1.62, 0); root.add(head);
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), skin));
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.245, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
      cap.rotation.x = -0.25; head.add(cap);
      const eyeM = M.basic(0x111111);
      for (const sx of [-0.08, 0.08]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), eyeM); e.position.set(sx, 0.03, 0.2); head.add(e); }
      const mkLimb = (w, h, d, mat, x, y) => {
        const p = new THREE.Group(); p.position.set(x, y, 0);
        const m = M.box(w, h, d, mat, 0, -h / 2, 0); p.add(m); root.add(p); return p;
      };
      const legL = mkLimb(0.19, 0.78, 0.2, pants, -0.14, 0.8);
      const legR = mkLimb(0.19, 0.78, 0.2, pants, 0.14, 0.8);
      const armL = mkLimb(0.14, 0.58, 0.14, shirt, -0.34, 1.4);
      const armR = mkLimb(0.14, 0.58, 0.14, shirt, 0.34, 1.4);
      for (const a of [armL, armR]) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 6), skin); h.position.y = -0.6; a.add(h); }
      root.scale.setScalar(o.scale);
      return { group: g, root, head, legL, legR, armL, armR, torso, o };
    },
    /** 歩行/パニック/ふらふらの簡易アニメ。mode: 'walk'|'run'|'panic'|'wave'|'freeze'|'dizzy' */
    animHuman(h, mode, phase, t) {
      const s = Math.sin(phase);
      h.root.rotation.set(0, 0, 0); h.root.position.y = 0;
      h.head.rotation.set(0, 0, 0);
      switch (mode) {
        case 'run':
          h.legL.rotation.x = s * 1.0; h.legR.rotation.x = -s * 1.0;
          h.armL.rotation.x = -s * 1.1; h.armR.rotation.x = s * 1.1;
          h.root.rotation.x = 0.2; h.root.position.y = Math.abs(s) * 0.08; break;
        case 'panic': // 両手を上げて走る
          h.legL.rotation.x = s * 1.0; h.legR.rotation.x = -s * 1.0;
          h.armL.rotation.set(-2.6 + s * 0.4, 0, -0.3); h.armR.rotation.set(-2.6 - s * 0.4, 0, 0.3);
          h.root.position.y = Math.abs(s) * 0.1; break;
        case 'freeze': // 固まって手をあげ ガタガタ
          h.legL.rotation.x = 0; h.legR.rotation.x = 0;
          h.armL.rotation.set(-2.9, 0, -0.5); h.armR.rotation.set(-2.9, 0, 0.5);
          h.root.position.x = Math.sin(t * 60) * 0.02; break;
        case 'wave': // 客: 手を振る
          h.legL.rotation.x = 0; h.legR.rotation.x = 0;
          h.armL.rotation.x = 0;
          h.armR.rotation.set(-2.7, 0, 0.4 + Math.sin(t * 9) * 0.5); break;
        case 'dizzy': // ふらふら
          h.legL.rotation.x = 0; h.legR.rotation.x = 0;
          h.armL.rotation.set(0, 0, -0.5 + Math.sin(t * 4) * 0.2); h.armR.rotation.set(0, 0, 0.5 - Math.sin(t * 4) * 0.2);
          h.root.rotation.z = Math.sin(t * 5) * 0.18; h.root.rotation.x = Math.cos(t * 4) * 0.1;
          h.head.rotation.z = Math.sin(t * 5 + 1) * 0.3; break;
        default: // walk
          h.legL.rotation.x = s * 0.7; h.legR.rotation.x = -s * 0.7;
          h.armL.rotation.x = -s * 0.6; h.armR.rotation.x = s * 0.6;
          h.root.position.y = Math.abs(s) * 0.03;
      }
    },
    dizzyStars() {
      const THREE = T(), g = new THREE.Group(), geo = new THREE.OctahedronGeometry(0.1, 0);
      const m = M.basic(0xffe14a);
      for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(geo, m); g.add(s); }
      g.userData.update = (t) => {
        g.children.forEach((s, i) => {
          const a = t * 6 + (i * Math.PI * 2) / 3;
          s.position.set(Math.cos(a) * 0.36, Math.sin(t * 3 + i) * 0.04, Math.sin(a) * 0.36);
          s.rotation.y = t * 8;
        });
      };
      return g;
    },

    /* ================= 小物 (吹っ飛ぶ) ================= */
    cone() {
      const THREE = T(), g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.3, 0.75, 8), M.mat(0xff6a00)).translateY(0.42));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.12, 8), M.mat(0xffffff)).translateY(0.4));
      g.add(M.box(0.7, 0.06, 0.7, M.mat(0x333333), 0, 0.03, 0));
      return g;
    },
    bin() {
      const THREE = T(), g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.3, 0.9, 10), M.mat(0x4d7c8a)).translateY(0.45));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 10), M.mat(0x2f525e)).translateY(0.94));
      return g;
    },
    mailbox() {
      const g = new (T().Group)(), r = M.mat(0xd9302b);
      g.add(M.box(0.12, 0.9, 0.12, M.mat(0x555555), 0, 0.45, 0));
      g.add(M.box(0.6, 0.4, 0.55, r, 0, 1.1, 0));
      g.add(M.box(0.62, 0.08, 0.57, M.mat(0xffffff), 0, 1.32, 0));
      return g;
    },
    /** 吹き出し/ポップ用スプライト素材 (テキスト) */
    sprite(tex, w, h) {
      const THREE = T();
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.scale.set(w, h, 1); return s;
    },
  });
})();
