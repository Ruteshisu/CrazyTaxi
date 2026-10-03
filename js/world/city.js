/* 街の生成。グリッド状の道路 + ブロック(建物/公園) + 当たり判定 + 経路用の交差点情報。
   座標系: XZ平面が地面、Yが上。道路中心線は x = lineX(k), z = lineZ(k) (k=0..N)。
   ブロック(i,j)の中心は (blockCenter(i), blockCenter(j)) */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const U = CT.util;

  const PALETTE = [0xf2a65a, 0xe8685a, 0x6aa6d6, 0x8fd18a, 0xf5d76e, 0xc59be3, 0xeeeeee, 0xe58fb0, 0x7fd6cf, 0xd9a066, 0x9db4ff];
  const SIGNS = ['ラーメン', 'カフェ', 'HOTEL', 'ゲーム', 'ドーナツ', 'COFFEE', 'ぶっ飛び', 'BAR', 'ピザ', 'SUSHI', '薬局', 'CLUB', '焼肉', 'うどん', 'BOOKS', '温泉'];
  const SIGN_BG = ['#ff4b4b', '#ffd23a', '#3aa6ff', '#40d070', '#ff7ac8', '#ffffff', '#ff9a2e', '#7a5cff'];

  class World {
    constructor(scene) {
      const c = CT.config.world;
      this.scene = scene;
      this.N = c.blocks; this.B = c.blockSize; this.R = c.roadWidth; this.S = c.sidewalk;
      this.P = this.B + this.R;
      this.half = (this.N * this.P) / 2;      // 道路中心線で囲まれた領域の半幅
      this.boxes = []; this.circles = []; this.blocks = []; this.knockSpots = [];
      this.rnd = U.mulberry32(c.seed);
      this.group = new THREE.Group(); scene.add(this.group);
      this.winTex = [];
      this.matCache = {};
      this._build();
    }

    /* ---------- 座標ヘルパー ---------- */
    lineX(k) { return (k - this.N / 2) * this.P; }
    lineZ(k) { return (k - this.N / 2) * this.P; }
    blockCenter(i) { return (i + 0.5 - this.N / 2) * this.P; }
    /** ブロック周囲の歩道ループ上の点。u: 0..4 (整数=角), inset: ブロック縁からの距離 */
    perimeterPoint(i, j, u, inset) {
      const h = this.B / 2 - inset, cx = this.blockCenter(i), cz = this.blockCenter(j);
      u = ((u % 4) + 4) % 4;
      const s = Math.floor(u), f = u - s;
      let x, z;
      if (s === 0) { x = -h + 2 * h * f; z = -h; }
      else if (s === 1) { x = h; z = -h + 2 * h * f; }
      else if (s === 2) { x = h - 2 * h * f; z = h; }
      else { x = -h; z = h - 2 * h * f; }
      return { x: cx + x, z: cz + z };
    }
    static cornerIndex(sx, sz) { return sx < 0 ? (sz < 0 ? 0 : 3) : (sz < 0 ? 1 : 2); }
    /** ランダムなお客さんスポット (歩道の縁) */
    randomSpot(fromX, fromZ, minD, maxD) {
      for (let n = 0; n < 60; n++) {
        const i = U.randInt(0, this.N - 1), j = U.randInt(0, this.N - 1);
        if (this.blocks[i * this.N + j].type === 'park' && Math.random() < 0.5) continue;
        const u = U.randInt(0, 3) + U.rand(0.18, 0.82);
        const p = this.perimeterPoint(i, j, u, 1.3);
        const d = Math.hypot(p.x - fromX, p.z - fromZ);
        if (d >= minD && d <= maxD) return { x: p.x, z: p.z, i, j };
      }
      const p = this.perimeterPoint(U.randInt(0, this.N - 1), U.randInt(0, this.N - 1), 0.5, 1.3);
      return { x: p.x, z: p.z };
    }
    /** 最寄り交差点のインデックス */
    nearestInt(x, z) {
      return {
        a: U.clamp(Math.round(x / this.P + this.N / 2), 0, this.N),
        b: U.clamp(Math.round(z / this.P + this.N / 2), 0, this.N),
      };
    }
    /** 線分が建物/木に当たらないか (AI用) */
    segmentClear(ax, az, bx, bz, pad) {
      pad = pad || 0;
      for (const b of this.boxes) {
        if (b.h < 1.5) continue;
        if (segBox(ax, az, bx, bz, b.minx - pad, b.maxx + pad, b.minz - pad, b.maxz + pad)) return false;
      }
      for (const c of this.circles) {
        if (distSegPt(ax, az, bx, bz, c.x, c.z) < c.r + pad) return false;
      }
      return true;
    }

    /* ---------- マテリアル/テクスチャ ---------- */
    _windowTextures() {
      const mk = (draw) => {
        const t = CT.Models.canvasTex(256, 256, draw, { repeat: true });
        return t;
      };
      // 0: 格子ガラス
      this.winTex.push(mk((g) => {
        g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
          const x = c * 64 + 7, y = r * 64 + 9;
          const gr = g.createLinearGradient(0, y, 0, y + 46); gr.addColorStop(0, '#9fd2ff'); gr.addColorStop(1, '#4f7fb5');
          g.fillStyle = gr; g.fillRect(x, y, 50, 46);
          g.fillStyle = '#ffffffaa'; g.fillRect(x + 4, y + 4, 12, 36);
        }
      }));
      // 1: 横連窓
      this.winTex.push(mk((g) => {
        g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
        for (let r = 0; r < 4; r++) {
          const y = r * 64 + 14; g.fillStyle = '#35507a'; g.fillRect(0, y, 256, 34);
          g.fillStyle = '#8bb8e8'; for (let c = 0; c < 8; c++) g.fillRect(c * 32 + 3, y + 3, 26, 28);
        }
      }));
      // 2: 小窓(点灯混じり)
      this.winTex.push(mk((g) => {
        g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
          const lit = (r * 7 + c * 3) % 5 === 0;
          g.fillStyle = lit ? '#ffe98a' : '#5b7da8'; g.fillRect(c * 32 + 6, r * 32 + 7, 20, 18);
        }
      }));
    }
    _wallMat(color, tex) {
      const k = color + '_' + tex;
      if (!this.matCache[k]) this.matCache[k] = new THREE.MeshLambertMaterial({ color, map: this.winTex[tex] });
      return this.matCache[k];
    }

    /* ---------- 建築 ---------- */
    _addBuilding(x, z, w, d, h, color, tex) {
      const geo = new THREE.BoxGeometry(w, h, d);
      const uv = geo.attributes.uv, TW = 12, TH = 12.8;
      for (let f = 0; f < 6; f++) {
        let du = 1, dv = 1;
        if (f < 2) { du = d / TW; dv = h / TH; } else if (f >= 4) { du = w / TW; dv = h / TH; }
        for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * du, uv.getY(i) * dv); }
      }
      const wall = this._wallMat(color, tex), roof = CT.Models.mat(0x9a9a9f);
      const m = new THREE.Mesh(geo, [wall, wall, roof, roof, wall, wall]);
      m.position.set(x, h / 2 + 0.3, z);
      this.group.add(m);
      this.boxes.push({ minx: x - w / 2, maxx: x + w / 2, minz: z - d / 2, maxz: z + d / 2, h: h + 0.3 });
      // 屋上の小物
      const r = this.rnd;
      if (r() < 0.6) this.group.add(CT.Models.box(w * 0.3, 1.6, d * 0.25, CT.Models.mat(0xb8b8bd), x + (r() - 0.5) * w * 0.4, h + 1.1, z + (r() - 0.5) * d * 0.4));
      if (h > 28 && r() < 0.7) {
        const a = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9, 5), CT.Models.mat(0xcccccc));
        a.position.set(x, h + 4.8, z); this.group.add(a);
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 6), CT.Models.basic(0xff3030));
        l.position.set(x, h + 9.3, z); this.group.add(l);
      }
      return m;
    }
    _addSign(x, z, side, w, d, h) {
      // side: 0:+x 1:-x 2:+z 3:-z (建物の外向き面)
      const r = this.rnd;
      const txt = SIGNS[Math.floor(r() * SIGNS.length)];
      const bg = SIGN_BG[Math.floor(r() * SIGN_BG.length)];
      const tex = CT.Models.textTex(txt, { bg, fg: bg === '#ffffff' || bg === '#ffd23a' ? '#222' : '#fff', border: '#222' });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), new THREE.MeshBasicMaterial({ map: tex }));
      const y = 3.5 + r() * 2.5 + 0.3;
      if (side === 0) { mesh.position.set(x + w / 2 + 0.06, y, z); mesh.rotation.y = Math.PI / 2; }
      else if (side === 1) { mesh.position.set(x - w / 2 - 0.06, y, z); mesh.rotation.y = -Math.PI / 2; }
      else if (side === 2) { mesh.position.set(x, y, z + d / 2 + 0.06); }
      else { mesh.position.set(x, y, z - d / 2 - 0.06); mesh.rotation.y = Math.PI; }
      this.group.add(mesh);
    }

    /* ---------- 全体構築 ---------- */
    _build() {
      const r = this.rnd, N = this.N, B = this.B, S = this.S, P = this.P, THREE_ = THREE;
      this._windowTextures();
      this._lights();
      this._ground();
      const sidewalkMat = CT.Models.mat(0xc9c2b4);
      const grassMat = CT.Models.mat(0x6dbb55);
      const lampPos = [], treePos = [];

      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const cx = this.blockCenter(i), cz = this.blockCenter(j);
        const center = Math.hypot(i - (N - 1) / 2, j - (N - 1) / 2);
        const isPark = (i === (N - 1) / 2 && j === (N - 1) / 2) || (r() < 0.1 && center > 1.5);
        const blk = { i, j, cx, cz, type: isPark ? 'park' : 'city' };
        this.blocks.push(blk);
        // 歩道
        const sw = new THREE.Mesh(new THREE.BoxGeometry(B, 0.3, B), sidewalkMat);
        sw.position.set(cx, 0.15, cz); this.group.add(sw);
        // 角の街灯
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) lampPos.push([cx + sx * (B / 2 - 0.8), cz + sz * (B / 2 - 0.8)]);
        // ノックできる小物(縁石沿い)
        for (let n = 0; n < 5; n++) {
          const u = U.randInt(0, 3) + 0.15 + r() * 0.7;
          const p = this.perimeterPoint(i, j, u, 0.9);
          const kind = ['cone', 'cone', 'bin', 'mailbox'][Math.floor(r() * 4)];
          this.knockSpots.push({ kind, x: p.x, z: p.z });
        }
        if (isPark) { this._park(blk, grassMat, treePos); continue; }
        // 並木
        for (let s = 0; s < 4; s++) for (let k = 1; k <= 3; k++) {
          if (r() < 0.45) continue;
          const p = this.perimeterPoint(i, j, s + k / 4, 3.2);
          treePos.push([p.x, p.z]);
        }
        this._cityBlock(blk);
      }
      this._instancedLamps(lampPos);
      this._instancedTrees(treePos);
      this._border();
      this._sky();
    }

    _cityBlock(blk) {
      const r = this.rnd, Z = this.B / 2 - this.S; // 建築可能な半幅
      const center = Math.hypot(blk.i - (this.N - 1) / 2, blk.j - (this.N - 1) / 2);
      const hBase = 14 + Math.max(0, 4 - center) * 7;
      const merged = r() < 0.2;
      const lots = [];
      if (merged) lots.push([0, 0, Z * 2, Z * 2]);
      else for (const sx of [-1, 1]) for (const sz of [-1, 1]) lots.push([sx * (Z / 2 + 1), sz * (Z / 2 + 1), Z - 1.6, Z - 1.6]);
      for (const [ox, oz, lw, ld] of lots) {
        const w = lw * (0.8 + r() * 0.2), d = ld * (0.8 + r() * 0.2);
        const h = hBase * (0.5 + r() * 1.1) + (merged ? 4 : 0);
        const color = PALETTE[Math.floor(r() * PALETTE.length)];
        const tex = Math.floor(r() * 3);
        // 外側(道路側)へ寄せて歩道との隙間を少なくする
        const x = blk.cx + ox + (ox > 0 ? 1 : ox < 0 ? -1 : 0) * (lw - w) / 2 * 0.0;
        const z = blk.cz + oz;
        this._addBuilding(x, z, w, d, h, color, tex);
        // 看板: 道路側の面
        if (r() < 0.65) {
          const side = r() < 0.5 ? (ox >= 0 ? 0 : 1) : (oz >= 0 ? 2 : 3);
          const outer = (side === 0 && ox > 0) || (side === 1 && ox < 0) || (side === 2 && oz > 0) || (side === 3 && oz < 0) || merged;
          if (outer) this._addSign(x, z, side, w, d, h);
        }
        // 屋上ひとアクセント: 上段
        if (h > 22 && r() < 0.6) {
          const h2 = 4 + r() * 8;
          this.group.add(CT.Models.box(w * 0.6, h2, d * 0.6, CT.Models.mat(color), x, h + 0.3 + h2 / 2, z));
        }
      }
    }

    _park(blk, grassMat, treePos) {
      const r = this.rnd, B = this.B;
      const g = new THREE.Mesh(new THREE.BoxGeometry(B - this.S * 2, 0.34, B - this.S * 2), grassMat);
      g.position.set(blk.cx, 0.17, blk.cz); this.group.add(g);
      // 噴水
      const fx = blk.cx, fz = blk.cz;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.4, 0.8, 14), CT.Models.mat(0xcfd4dc)); base.position.set(fx, 0.7, fz);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.2, 14), CT.Models.mat(0x5cc8ff)); water.position.set(fx, 1.12, fz);
      const jet = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3, 8), CT.Models.mat(0xbfeaff)); jet.position.set(fx, 2.6, fz);
      this.group.add(base, water, jet);
      this.circles.push({ x: fx, z: fz, r: 4.3, h: 1.3 });
      for (let n = 0; n < 12; n++) {
        const a = r() * Math.PI * 2, d = 9 + r() * 10;
        const x = blk.cx + Math.cos(a) * d, z = blk.cz + Math.sin(a) * d;
        if (Math.abs(x - blk.cx) > B / 2 - 5 || Math.abs(z - blk.cz) > B / 2 - 5) continue;
        treePos.push([x, z]);
      }
      // ベンチ(飾り)
      for (let n = 0; n < 4; n++) {
        const a = (n / 4) * Math.PI * 2 + 0.7;
        const b = CT.Models.box(2.2, 0.35, 0.6, CT.Models.mat(0x8a5a2b), blk.cx + Math.cos(a) * 7, 0.55, blk.cz + Math.sin(a) * 7);
        b.rotation.y = -a + Math.PI / 2; this.group.add(b);
      }
    }

    _instancedLamps(pos) {
      const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 6.4, 6), CT.Models.mat(0x555a64), pos.length);
      const head = new THREE.InstancedMesh(new THREE.BoxGeometry(1.3, 0.2, 0.5), CT.Models.basic(0xfff3b0), pos.length);
      const m = new THREE.Matrix4();
      pos.forEach((p, i) => {
        m.makeTranslation(p[0], 3.5, p[1]); pole.setMatrixAt(i, m);
        m.makeTranslation(p[0] + (p[0] > 0 ? -0.5 : 0.5), 6.7, p[1]); head.setMatrixAt(i, m);
      });
      this.group.add(pole, head);
    }
    _instancedTrees(pos) {
      const n = pos.length;
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6), CT.Models.mat(0x7a5230), n);
      const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
      const m = new THREE.Matrix4(), col = new THREE.Color(), r = this.rnd;
      const greens = [0x4fae4a, 0x66c255, 0x3d9a58, 0x8acb4f];
      pos.forEach((p, i) => {
        m.makeTranslation(p[0], 1.4, p[1]); trunk.setMatrixAt(i, m);
        const s = 0.8 + r() * 0.6;
        m.makeScale(s, s, s); m.setPosition(p[0], 3.9 + s, p[1]); crown.setMatrixAt(i, m);
        crown.setColorAt(i, col.setHex(greens[Math.floor(r() * greens.length)]));
        this.circles.push({ x: p[0], z: p[1], r: 0.5, h: 6 });
      });
      crown.instanceColor.needsUpdate = true;
      this.group.add(trunk, crown);
    }

    _lights() {
      const hemi = new THREE.HemisphereLight(0xdff0ff, 0x8a8f78, 0.95);
      const sun = new THREE.DirectionalLight(0xfff2d8, 0.75); sun.position.set(-0.6, 1.4, 0.8);
      this.scene.add(hemi, sun);
    }

    _ground() {
      const ext = this.half + this.R / 2 + 6, SZ = 2048;
      this.groundExt = ext;
      const R = this.R, P = this.P, N = this.N, half = this.half;
      const tex = CT.Models.canvasTex(SZ, SZ, (g) => {
        const px = (x) => ((x + ext) / (2 * ext)) * SZ;
        g.fillStyle = '#3c3f47'; g.fillRect(0, 0, SZ, SZ);
        // 路面のムラ
        for (let n = 0; n < 900; n++) { g.fillStyle = 'rgba(' + (n % 2 ? '255,255,255' : '0,0,0') + ',0.025)'; g.fillRect(Math.random() * SZ, Math.random() * SZ, 30 + Math.random() * 80, 6 + Math.random() * 20); }
        const dash = (x1, z1, x2, z2, col, w, dl, gl) => {
          g.strokeStyle = col; g.lineWidth = w; g.setLineDash([dl, gl]);
          g.beginPath(); g.moveTo(px(x1), px(z1)); g.lineTo(px(x2), px(z2)); g.stroke(); g.setLineDash([]);
        };
        const ppm = SZ / (2 * ext); // px/m
        for (let k = 0; k <= N; k++) {
          const c = (k - N / 2) * P;
          for (let m = 0; m < N; m++) {
            const a = (m - N / 2) * P + R / 2 + 1, b = ((m + 1) - N / 2) * P - R / 2 - 1;
            // 中央線(黄色)・縦道/横道
            dash(c, a, c, b, '#e8c32a', 0.35 * ppm, 3 * ppm, 3 * ppm);
            dash(a, c, b, c, '#e8c32a', 0.35 * ppm, 3 * ppm, 3 * ppm);
            // 縁の白線
            for (const off of [-R / 2 + 0.6, R / 2 - 0.6]) {
              dash(c + off, a, c + off, b, '#e8e8e8', 0.2 * ppm, 100, 0);
              dash(a, c + off, b, c + off, '#e8e8e8', 0.2 * ppm, 100, 0);
            }
          }
        }
        // 横断歩道(交差点の各腕)
        g.fillStyle = '#e9e9e9';
        for (let a = 0; a <= N; a++) for (let b = 0; b <= N; b++) {
          const cx = (a - N / 2) * P, cz = (b - N / 2) * P, o = R / 2 + 1.6;
          for (let s = -R / 2 + 1; s < R / 2 - 0.5; s += 1.5) {
            for (const sgn of [-1, 1]) {
              if (!(sgn < 0 && a === 0) && !(sgn > 0 && a === N)) g.fillRect(px(cx + sgn * o) - 1.0 * ppm, px(cz + s), 2 * ppm, 0.8 * ppm);
              if (!(sgn < 0 && b === 0) && !(sgn > 0 && b === N)) g.fillRect(px(cx + s), px(cz + sgn * o) - 1.0 * ppm, 0.8 * ppm, 2 * ppm);
            }
          }
        }
      }, {});
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 8;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(ext * 2, ext * 2), new THREE.MeshLambertMaterial({ map: tex }));
      plane.rotation.x = -Math.PI / 2; this.group.add(plane);
      const far = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), CT.Models.mat(0x77b25f));
      far.rotation.x = -Math.PI / 2; far.position.y = -0.05; this.group.add(far);
    }

    _border() {
      const W = this.half + this.R / 2 + 3, L = W * 2 + 12, hedge = CT.Models.mat(0x2f8a45), th = 5, h = 3.2;
      const defs = [[0, -W - th / 2, L, th], [0, W + th / 2, L, th], [-W - th / 2, 0, th, L], [W + th / 2, 0, th, L]];
      for (const [x, z, w, d] of defs) {
        this.group.add(CT.Models.box(w, h, d, hedge, x, h / 2, z));
        this.boxes.push({ minx: x - w / 2, maxx: x + w / 2, minz: z - d / 2, maxz: z + d / 2, h });
      }
      this.wallW = W;
      // 遠景のビル影
      const r = this.rnd, far = CT.Models.mat(0x93a6c9);
      for (let n = 0; n < 50; n++) {
        const a = (n / 50) * Math.PI * 2, d = this.half + 120 + r() * 160, h2 = 40 + r() * 140;
        this.group.add(CT.Models.box(30 + r() * 40, h2, 30 + r() * 40, far, Math.cos(a) * d, h2 / 2, Math.sin(a) * d));
      }
    }

    _sky() {
      const tex = CT.Models.canvasTex(8, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#2f8fe8'); gr.addColorStop(0.45, '#8fd0ff'); gr.addColorStop(0.5, '#d9f0ff'); gr.addColorStop(1, '#d9f0ff');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      });
      const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 16, 12),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
      sky.renderOrder = -10; this.sky = sky; this.scene.add(sky);
      // 雲
      const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
      for (let n = 0; n < 14; n++) {
        const g = new THREE.Group(), a = this.rnd() * Math.PI * 2, d = 500 + this.rnd() * 700;
        for (let k = 0; k < 4; k++) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(30 + this.rnd() * 25, 8, 6), cm);
          s.position.set(k * 40 - 60, this.rnd() * 10, this.rnd() * 20); s.scale.y = 0.5; g.add(s);
        }
        g.position.set(Math.cos(a) * d, 220 + this.rnd() * 160, Math.sin(a) * d); g.rotation.y = -a;
        this.sky.add(g);
        g.userData.base = g.position.clone();
      }
      this.scene.background = new THREE.Color(0xc8e8ff);
      this.scene.fog = new THREE.Fog(0xd2ecff, CT.config.world.fogNear, CT.config.world.fogFar);
    }
  }

  /* 線分 vs AABB (2D, スラブ法) */
  function segBox(ax, az, bx, bz, x0, x1, z0, z1) {
    let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
    for (const [p, q, lo, hi] of [[dx, ax, x0, x1], [dz, az, z0, z1]]) {
      if (Math.abs(p) < 1e-9) { if (q < lo || q > hi) return false; }
      else {
        let a = (lo - q) / p, b = (hi - q) / p; if (a > b) { const t = a; a = b; b = t; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return false;
      }
    }
    return true;
  }
  function distSegPt(ax, az, bx, bz, px, pz) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = U.clamp(t, 0, 1);
    return Math.hypot(ax + dx * t - px, az + dz * t - pz);
  }

  CT.World = World;
})();
