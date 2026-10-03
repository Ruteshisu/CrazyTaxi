/* 街の生成。11x11ブロックの大きな街 + ゾーン(ダウンタウン/住宅/公園・湖/スタジアム/遊園地/工業/神社/ビーチ)。
   外周の道路(k=0,N)は赤白縁石のサーキット周回路。静的ジオメトリは全部マテリアルごとにマージして描画負荷を抑える。
   座標系: XZ平面が地面、Yが上。道路中心線は x = lineX(k), z = lineZ(k) (k=0..N)。ブロック(i,j)の中心は (blockCenter(i), blockCenter(j)) */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const U = CT.util;

  const PALETTE = [0xf2c28a, 0xf0948a, 0x9cc4e8, 0xb5e0b0, 0xf7e49a, 0xd6bbec, 0xf2f2f2, 0xf2b0cc, 0xa6e6e0, 0xe6c08e, 0xb8c8ff];
  const HOUSE = [0xfff0d8, 0xffe0c8, 0xe8f2ff, 0xf0ffe8, 0xfff6c8, 0xf8e0f0];
  const ROOFS = [0xc8553d, 0x4a6fa5, 0x6b8e4e, 0x8a5a44, 0x555a64, 0xa04a6a];
  const SIGNS = ['ラーメン', 'カフェ', 'HOTEL', 'ゲーム', 'ドーナツ', 'COFFEE', 'ぶっ飛び', 'BAR', 'ピザ', 'SUSHI', '薬局', 'CLUB', '焼肉', 'うどん', 'BOOKS', '温泉'];
  const SIGN_BG = ['#ff4b4b', '#ffd23a', '#3aa6ff', '#40d070', '#ff7ac8', '#ffffff', '#ff9a2e', '#7a5cff'];
  const TILE = [[12, 12.8], [12, 12.8], [12, 12.8], [12, 4.5]];

  /** 同じマテリアルの静的メッシュを1つの BufferGeometry にまとめる (頂点カラーで色分け) */
  class Batch {
    constructor(mat) { this.mat = mat; this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.vc = 0; }
    add(geo, m, color, uvr) {
      const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
      const nm = new THREE.Matrix3().getNormalMatrix(m), v = new THREE.Vector3(), col = new THREE.Color(color === undefined ? 0xffffff : color), base = this.vc;
      for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k).applyMatrix4(m); this.p.push(v.x, v.y, v.z);
        v.fromBufferAttribute(nor, k).applyMatrix3(nm).normalize(); this.n.push(v.x, v.y, v.z);
        if (uv) { let a = uv.getX(k), b = uv.getY(k); if (uvr) { a = uvr[0] + a * uvr[2]; b = uvr[1] + b * uvr[3]; } this.u.push(a, b); } else this.u.push(0, 0);
        this.c.push(col.r, col.g, col.b);
      }
      if (geo.index) for (let k = 0; k < geo.index.count; k++) this.i.push(base + geo.index.getX(k));
      else for (let k = 0; k < pos.count; k++) this.i.push(base + k);
      this.vc += pos.count;
    }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setIndex(new THREE.Uint32BufferAttribute(this.i, 1));
      const m = new THREE.Mesh(g, this.mat); m.frustumCulled = false; return m;
    }
  }

  class World {
    constructor(scene) {
      const c = CT.config.world;
      this.scene = scene;
      this.N = c.blocks; this.B = c.blockSize; this.R = c.roadWidth; this.S = c.sidewalk;
      this.P = this.B + this.R;
      this.half = (this.N * this.P) / 2;
      this.boxes = []; this.circles = []; this.blocks = []; this.knockSpots = [];
      this.ramps = []; this.trees = []; this.lamps = []; this._mtx = new THREE.Matrix4();
      this.grid = new Map(); this.anims = [];
      this.rnd = U.mulberry32(c.seed);
      this.group = new THREE.Group(); scene.add(this.group);
      this.batches = {};
      this._unit = new THREE.BoxGeometry(1, 1, 1);
      this._plane = new THREE.PlaneGeometry(1, 1); this._plane.rotateX(-Math.PI / 2);
      this._build();
    }

    /* ---------- 座標ヘルパー ---------- */
    lineX(k) { return (k - this.N / 2) * this.P; }
    lineZ(k) { return (k - this.N / 2) * this.P; }
    blockCenter(i) { return (i + 0.5 - this.N / 2) * this.P; }
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
    randomSpot(fromX, fromZ, minD, maxD) {
      for (let n = 0; n < 80; n++) {
        const i = U.randInt(0, this.N - 1), j = U.randInt(0, this.N - 1), t = this.blocks[i * this.N + j].type;
        if ((t === 'park' || t === 'lake' || t === 'stadium' || t === 'industrial') && Math.random() < 0.6) continue;
        const u = U.randInt(0, 3) + U.rand(0.18, 0.82);
        const p = this.perimeterPoint(i, j, u, 1.3);
        const d = Math.hypot(p.x - fromX, p.z - fromZ);
        if (d >= minD && d <= maxD) return { x: p.x, z: p.z, i, j };
      }
      const p = this.perimeterPoint(U.randInt(0, this.N - 1), U.randInt(0, this.N - 1), 0.5, 1.3);
      return { x: p.x, z: p.z };
    }
    nearestInt(x, z) { return { a: U.clamp(Math.round(x / this.P + this.N / 2), 0, this.N), b: U.clamp(Math.round(z / this.P + this.N / 2), 0, this.N) }; }
    segmentClear(ax, az, bx, bz, pad, hmin) {
      pad = pad || 0; hmin = hmin === undefined ? 1.5 : hmin;
      const minx = Math.min(ax, bx) - 10, maxx = Math.max(ax, bx) + 10, minz = Math.min(az, bz) - 10, maxz = Math.max(az, bz) + 10;
      for (const b of this.boxes) {
        if (b.h < hmin || b.maxx < minx || b.minx > maxx || b.maxz < minz || b.minz > maxz) continue;
        if (segBox(ax, az, bx, bz, b.minx - pad, b.maxx + pad, b.minz - pad, b.maxz + pad)) return false;
      }
      for (const c of this.circles) {
        if (c.h < hmin) continue;
        if (distSegPt(ax, az, bx, bz, c.x, c.z) < c.r + pad) return false;
      }
      return true;
    }
    /* ---------- 当たり判定 (空間グリッド) ---------- */
    addBox(minx, maxx, minz, maxz, h) {
      const b = { minx, maxx, minz, maxz, h }; this.boxes.push(b);
      const C = 40, x0 = Math.floor((minx - 3) / C), x1 = Math.floor((maxx + 3) / C), z0 = Math.floor((minz - 3) / C), z1 = Math.floor((maxz + 3) / C);
      for (let a = x0; a <= x1; a++) for (let c = z0; c <= z1; c++) { const k = a * 1000 + c; let l = this.grid.get(k); if (!l) this.grid.set(k, (l = [])); l.push(b); }
      return b;
    }
    nearBoxes(x, z) { return this.grid.get(Math.floor(x / 40) * 1000 + Math.floor(z / 40)) || EMPTY; }
    addCircle(x, z, r, h) { this.circles.push({ x, z, r, h }); }
    update(dt) { for (const a of this.anims) a(dt); }

    /* ---------- ジャンプ台 (山型) ---------- */
    _addRamp(x, z, ang) {
      const c = CT.config.ramps, m = CT.Models.ramp(c.length, c.width, c.height);
      m.position.set(x, 0.02, z); m.rotation.y = ang; this.group.add(m);
      this.ramps.push({ x, z, ux: Math.sin(ang), uz: Math.cos(ang), half: c.length / 2, hw: c.width / 2, h: c.height, ang });
    }
    _buildRamps() {
      const c = CT.config.ramps, N = this.N, used = new Set();
      this._addRamp((this.lineX(3) + this.lineX(4)) / 2, this.lineZ(5), Math.PI / 2); used.add('h,5,3');
      if (this.stadium) { this._addRamp(this.stadium.x, this.stadium.z - 7, Math.PI / 2); this._addRamp(this.stadium.x, this.stadium.z + 7, Math.PI / 2); }
      let guard = 0;
      while (this.ramps.length < c.count && guard++ < 600) {
        const horiz = Math.random() < 0.5, k = U.randInt(0, N), m = U.randInt(0, N - 1), key = (horiz ? 'h,' : 'v,') + k + ',' + m;
        if (used.has(key)) continue; used.add(key);
        const mid = (this.lineX(m) + this.lineX(m + 1)) / 2, line = this.lineX(k);
        if (horiz) this._addRamp(mid, line, Math.PI / 2); else this._addRamp(line, mid, 0);
      }
    }
    floorAt(x, z) {
      let f = 0;
      for (const r of this.ramps) {
        const dx = x - r.x, dz = z - r.z;
        if (dx > 12 || dx < -12 || dz > 12 || dz < -12) continue;
        const al = dx * r.ux + dz * r.uz, lat = Math.abs(dx * r.uz - dz * r.ux);
        if (Math.abs(al) >= r.half || lat >= r.hw) continue;
        const v = r.h * (1 - Math.abs(al) / r.half) * Math.min(1, (r.hw - lat) / 1.2);
        if (v > f) f = v;
      }
      return f;
    }
    floorSlopeSpeed(x, z, vx, vz) {
      for (const r of this.ramps) {
        const dx = x - r.x, dz = z - r.z;
        if (dx > 12 || dx < -12 || dz > 12 || dz < -12) continue;
        const al = dx * r.ux + dz * r.uz, lat = Math.abs(dx * r.uz - dz * r.ux);
        if (Math.abs(al) >= r.half || lat >= r.hw) continue;
        return (-r.h / r.half) * Math.sign(al) * (vx * r.ux + vz * r.uz) * Math.min(1, (r.hw - lat) / 1.2);
      }
      return 0;
    }
    setTreeVisible(i, on) {
      const t = this.trees[i], m = this._mtx;
      if (on) { this.treeTrunk.setMatrixAt(i, t.mTrunk); this.treeCrown.setMatrixAt(i, t.mCrown); }
      else { m.makeScale(0, 0, 0); this.treeTrunk.setMatrixAt(i, m); this.treeCrown.setMatrixAt(i, m); }
      this.treeTrunk.instanceMatrix.needsUpdate = this.treeCrown.instanceMatrix.needsUpdate = true; t.alive = on;
    }
    setLampVisible(i, on) {
      const l = this.lamps[i], m = this._mtx;
      if (on) { this.lampPole.setMatrixAt(i, l.mPole); this.lampHead.setMatrixAt(i, l.mHead); }
      else { m.makeScale(0, 0, 0); this.lampPole.setMatrixAt(i, m); this.lampHead.setMatrixAt(i, m); }
      this.lampPole.instanceMatrix.needsUpdate = this.lampHead.instanceMatrix.needsUpdate = true; l.alive = on;
    }

    /* ---------- バッチ描画ヘルパー ---------- */
    _mats() {
      const M = CT.Models, L = (o) => new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true }, o));
      this.winTex = [0, 1, 2, 3].map((k) => this._wallTex(k));
      this.mat = {
        flat: L({ side: THREE.DoubleSide }), basic: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
        road: L({ map: this._roadTex(false) }), ring: L({ map: this._roadTex(true) }), asphalt: L({}),
        wall0: L({ map: this.winTex[0] }), wall1: L({ map: this.winTex[1] }), wall2: L({ map: this.winTex[2] }), wall3: L({ map: this.winTex[3] }),
        sign: new THREE.MeshBasicMaterial({ map: this._signAtlas(), vertexColors: true }),
      };
      void M;
    }
    B_(name) { return this.batches[name] || (this.batches[name] = new Batch(this.mat[name])); }
    /** 色付きボックス (flat バッチ)。rot=Y回転 */
    box(cx, cy, cz, w, h, d, color, rot, name) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot || 0), new THREE.Vector3(w, h, d));
      this.B_(name || 'flat').add(this._unit, m, color);
    }
    /** 底面から立つ円柱/円錐など。geo は呼び出し側で作る */
    geo(geo, x, y, z, color, sx, sy, sz, rx, ry, name) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, 0));
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx || 1, sy || 1, sz || 1));
      this.B_(name || 'flat').add(geo, m, color);
    }
    cyl(x, y0, z, r0, r1, h, color, seg, name) { this.geo(this._cylG(r0, r1, seg || 10), x, y0 + h / 2, z, color, 1, h, 1, 0, 0, name); }
    _cylG(r0, r1, seg) { const k = 'c' + r0 + '_' + r1 + '_' + seg; this._gc = this._gc || {}; return this._gc[k] || (this._gc[k] = new THREE.CylinderGeometry(r1, r0, 1, seg)); }
    plane(x, y, z, w, d, color, rot, name) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot || 0), new THREE.Vector3(w, 1, d));
      this.B_(name || 'flat').add(this._plane, m, color);
    }
    /** 窓テクスチャ付き壁ボックス (UVを寸法に合わせる) */
    wall(cx, y0, cz, w, h, d, color, tex) {
      const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, T = TILE[tex];
      for (let f = 0; f < 6; f++) {
        let du = 1, dv = 1;
        if (f < 2) { du = d / T[0]; dv = h / T[1]; } else if (f < 4) { du = w / T[0]; dv = 0.001; } else { du = w / T[0]; dv = h / T[1]; }
        for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * du, uv.getY(i) * dv); }
      }
      this.B_('wall' + tex).add(g, new THREE.Matrix4().makeTranslation(cx, y0 + h / 2, cz), color); g.dispose();
    }
    /** 看板 (アトラス) を面に貼る。side 0:+x 1:-x 2:+z 3:-z */
    sign(x, z, side, w, d, y, idx) {
      const sw = 8, sh = 3, col = idx % 4, row = Math.floor(idx / 4), uvr = [col / 4, 1 - (row * 256 + 152) / 1024, 0.25, 96 / 1024];
      const g = new THREE.PlaneGeometry(sw, sh); let px = x, pz = z, ry = 0;
      if (side === 0) { px = x + w / 2 + 0.08; ry = Math.PI / 2; } else if (side === 1) { px = x - w / 2 - 0.08; ry = -Math.PI / 2; }
      else if (side === 2) { pz = z + d / 2 + 0.08; } else { pz = z - d / 2 - 0.08; ry = Math.PI; }
      const m = new THREE.Matrix4().compose(new THREE.Vector3(px, y, pz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
      this.B_('sign').add(g, m, 0xffffff, uvr); g.dispose();
    }

    /* ---------- テクスチャ ---------- */
    _wallTex(kind) {
      return CT.Models.canvasTex(256, 256, (g) => {
        if (kind === 0) { // ガラス張りオフィス
          g.fillStyle = '#e4e8ee'; g.fillRect(0, 0, 256, 256);
          for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
            const x = c * 64 + 3, y = r * 64 + 5;
            const gr = g.createLinearGradient(x, y, x + 58, y + 52); gr.addColorStop(0, '#bfe4ff'); gr.addColorStop(0.5, '#6aa6dd'); gr.addColorStop(1, '#3b6aa0');
            g.fillStyle = gr; g.fillRect(x, y, 58, 52);
            g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.moveTo(x + 6, y + 52); g.lineTo(x + 26, y); g.lineTo(x + 34, y); g.lineTo(x + 14, y + 52); g.fill();
            g.fillStyle = '#c9ced8'; g.fillRect(x - 3, y + 52, 64, 5);
          }
        } else if (kind === 1) { // マンション (ベランダ+窓+エアコン室外機)
          g.fillStyle = '#f4ede0'; g.fillRect(0, 0, 256, 256);
          for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
            const x = c * 64 + 10, y = r * 64 + 8;
            g.fillStyle = '#6f95b8'; g.fillRect(x, y, 44, 36); g.fillStyle = '#fff'; g.fillRect(x + 21, y, 2, 36);
            g.fillStyle = (r * 3 + c) % 3 === 0 ? '#e8908a' : (r + c) % 2 ? '#f5d77a' : '#9ad0a0'; g.fillRect(x + 2, y + 2, 17, 12);
            g.fillStyle = '#9aa0aa'; g.fillRect(x - 6, y + 40, 56, 14);
            g.fillStyle = '#d7dbe2'; for (let b = 0; b < 8; b++) g.fillRect(x - 4 + b * 7, y + 42, 3, 10);
            if ((r + c * 2) % 5 === 0) { g.fillStyle = '#cfd4da'; g.fillRect(x + 28, y + 46, 14, 8); }
          }
        } else if (kind === 2) { // レンガ調の古い雑居ビル
          g.fillStyle = '#e8d2b8'; g.fillRect(0, 0, 256, 256);
          g.fillStyle = '#c9a888'; for (let y = 0; y < 256; y += 8) for (let x = (y / 8) % 2 ? 0 : 16; x < 256; x += 32) g.fillRect(x, y, 30, 6);
          for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
            const x = c * 64 + 14, y = r * 64 + 8;
            g.fillStyle = '#5a3d2a'; g.fillRect(x - 3, y - 3, 42, 46);
            g.fillStyle = '#3f5f86'; g.fillRect(x, y, 36, 40); g.fillStyle = '#9cc4e8'; g.fillRect(x + 3, y + 3, 14, 15); g.fillRect(x + 20, y + 3, 14, 15);
            g.fillStyle = '#7a5a40'; g.fillRect(x - 3, y + 40, 42, 5);
          }
        } else { // 店舗の1階 (大きなショーウィンドウ+シャッター)
          g.fillStyle = '#d8d0c4'; g.fillRect(0, 0, 256, 256);
          for (let c = 0; c < 4; c++) {
            const x = c * 64 + 4;
            const gr = g.createLinearGradient(0, 40, 0, 220); gr.addColorStop(0, '#d8f0ff'); gr.addColorStop(1, '#5b86b0');
            g.fillStyle = gr; g.fillRect(x, 40, 56, 150);
            g.fillStyle = '#ffe9a0'; g.fillRect(x + 6, 140, 44, 40); g.fillStyle = '#e8908a'; g.fillRect(x + 12, 110, 14, 30);
            g.fillStyle = '#555'; g.fillRect(x, 190, 56, 12); g.fillStyle = '#8a8f98'; g.fillRect(x, 0, 56, 30);
          }
        }
        g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256);
      }, { repeat: true });
    }
    _roadTex(ring) {
      const t = CT.Models.canvasTex(128, 200, (g, w, h) => { // 横=進行方向(12m) 縦=道幅(20m)
        g.fillStyle = '#3c3f47'; g.fillRect(0, 0, w, h);
        for (let n = 0; n < 160; n++) { g.fillStyle = 'rgba(' + (n % 2 ? '255,255,255' : '0,0,0') + ',0.03)'; g.fillRect(Math.random() * w, Math.random() * h, 10 + Math.random() * 30, 2 + Math.random() * 8); }
        // 縁
        if (ring) { const s = 16; for (let x = 0; x < w; x += s) { g.fillStyle = (x / s) % 2 ? '#e8e8e8' : '#e03a3a'; g.fillRect(x, 0, s, 8); g.fillRect(x, h - 8, s, 8); } }
        else { g.fillStyle = '#e8e8e8'; g.fillRect(0, 6, w, 3); g.fillRect(0, h - 9, w, 3); }
        g.fillStyle = '#e8c32a'; g.fillRect(0, h / 2 - 3, w * 0.55, 3); g.fillRect(0, h / 2 + 1, w * 0.55, 3);
        if (ring) { g.fillStyle = '#e8e8e8'; for (const o of [h * 0.28, h * 0.72]) g.fillRect(0, o - 1, w * 0.4, 2); }
      }, { repeat: true });
      t.anisotropy = 8; return t;
    }
    _signAtlas() {
      const r = this.rnd;
      return CT.Models.canvasTex(1024, 1024, (g) => {
        for (let k = 0; k < 16; k++) {
          const col = k % 4, row = Math.floor(k / 4), x = col * 256, y = row * 256, bg = SIGN_BG[Math.floor(r() * SIGN_BG.length)];
          g.fillStyle = bg; g.fillRect(x, y + 56, 256, 96); g.strokeStyle = '#222'; g.lineWidth = 6; g.strokeRect(x + 3, y + 59, 250, 90);
          g.fillStyle = bg === '#ffffff' || bg === '#ffd23a' ? '#222' : '#fff'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(SIGNS[k], x + 128, y + 106, 236);
        }
      });
    }

    /* ---------- 全体構築 ---------- */
    zoneOf(i, j) {
      const N = this.N, c = (N - 1) / 2, cheb = Math.max(Math.abs(i - c), Math.abs(j - c));
      if (i === 8 && j === 3) return 'stadium';
      if (i === 8 && j === 8) return 'amuse';
      if (i === 6 && j === 6) return 'tower';
      if (i === c && j === c) return 'park';
      if (i === 2 && j === 2) return 'lake';
      if ((i === 1 && j === 1) || (i === 2 && j === 1) || (i === 1 && j === 2)) return 'park';
      if (i === 1 && j === 8) return 'shrine';
      if (j === N - 1 && i >= 1 && i <= N - 2) return 'beach';
      if (i >= N - 2 && j >= 4 && j <= 7) return 'industrial';
      if (cheb <= 2) return 'downtown';
      if (cheb === 3) return 'city';
      return this.rnd() < 0.07 ? 'park' : 'house';
    }
    _build() {
      const r = this.rnd, N = this.N, B = this.B;
      this._mats(); this._lights(); this._ground();
      const lampPos = [], treePos = [];
      this._roads();
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const cx = this.blockCenter(i), cz = this.blockCenter(j), type = this.zoneOf(i, j);
        const blk = { i, j, cx, cz, type };
        this.blocks.push(blk);
        const swColor = type === 'beach' ? 0xe8d6a0 : type === 'industrial' ? 0x9a9ca2 : 0xc9c2b4;
        this.box(cx, 0.15, cz, B, 0.3, B, swColor);
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) lampPos.push([cx + sx * (B / 2 - 0.8), cz + sz * (B / 2 - 0.8)]);
        for (let n = 0; n < 5; n++) {
          const u = U.randInt(0, 3) + 0.15 + r() * 0.7, p = this.perimeterPoint(i, j, u, 0.9);
          this.knockSpots.push({ kind: ['cone', 'cone', 'bin', 'mailbox'][Math.floor(r() * 4)], x: p.x, z: p.z });
        }
        switch (type) {
          case 'park': this._park(blk, treePos, false); break;
          case 'lake': this._park(blk, treePos, true); break;
          case 'stadium': this._stadium(blk); break;
          case 'amuse': this._amusement(blk, treePos); break;
          case 'shrine': this._shrine(blk, treePos); break;
          case 'beach': this._beach(blk); break;
          case 'industrial': this._industrial(blk); break;
          case 'house': this._houses(blk, treePos); break;
          case 'tower': this._tower(blk, treePos); break;
          default:
            for (let s = 0; s < 4; s++) for (let k = 1; k <= 3; k++) { if (r() < 0.5) continue; const p = this.perimeterPoint(i, j, s + k / 4, 3.2); treePos.push([p.x, p.z]); }
            this._cityBlock(blk, type === 'downtown');
        }
      }
      this._instancedLamps(lampPos);
      this._instancedTrees(treePos);
      this._ringFeatures();
      this._buildRamps();
      this._border();
      this._sky();
      for (const k in this.batches) this.group.add(this.batches[k].build());
      this.batches = {};
    }

    /* ---------- 道路 ---------- */
    _roads() {
      const N = this.N, B = this.B, R = this.R, P = this.P;
      for (let k = 0; k <= N; k++) {
        const ring = k === 0 || k === N;
        for (let m = 0; m < N; m++) {
          const mid = (this.lineX(m) + this.lineX(m + 1)) / 2, line = this.lineX(k);
          // 横方向(x沿い)の道路と縦方向(z沿い)の道路
          this._roadSeg(mid, line, B, R, false, ring);
          this._roadSeg(line, mid, B, R, true, ring);
          // 横断歩道
          for (const sgn of [-1, 1]) {
            for (let s = -R / 2 + 1.2; s < R / 2 - 0.6; s += 1.7) {
              this.plane(mid + sgn * (B / 2 - 1.6), 0.05, line + s, 2.6, 0.9, 0xe9e9e9);
              this.plane(line + s, 0.05, mid + sgn * (B / 2 - 1.6), 0.9, 2.6, 0xe9e9e9);
            }
          }
        }
        for (let a = 0; a <= N; a++) this.plane(this.lineX(a), 0.025, this.lineX(k), R, R, 0x3c3f47, 0, 'asphalt');
      }
      void P;
    }
    _roadSeg(x, z, len, wid, vert, ring) {
      const g = new THREE.PlaneGeometry(len, wid), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 12);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.02, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), vert ? Math.PI / 2 : 0), new THREE.Vector3(1, 1, 1));
      this.B_(ring ? 'ring' : 'road').add(g, m, 0xffffff); g.dispose();
    }
    /** 周回路の目印: アーチ(チェッカーのバナー) */
    _ringFeatures() {
      const N = this.N, spots = [[0, this.lineZ(0), false], [0, this.lineZ(N), false], [this.lineX(0), 0, true], [this.lineX(N), 0, true]];
      const ban = CT.Models.canvasTex(512, 128, (g) => {
        g.fillStyle = '#111'; g.fillRect(0, 0, 512, 128);
        for (let y = 0; y < 128; y += 16) for (let x = 0; x < 512; x += 16) { if (((x + y) / 16) % 2 === 0) { g.fillStyle = '#fff'; g.fillRect(x, y, 16, 16); } }
        g.fillStyle = '#e03a3a'; g.fillRect(40, 24, 432, 80); g.fillStyle = '#fff'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CIRCUIT  ブッ飛びGP', 256, 66, 410);
      });
      for (const [x, z, vert] of spots) {
        const ox = vert ? 11.2 : 0, oz = vert ? 0 : 11.2;
        for (const s of [-1, 1]) { this.box(x + s * ox, 4.5, z + s * oz, 1.4, 9, 1.4, 0xd8d8e0); this.addCircle(x + s * ox, z + s * oz, 1.1, 9); }
        this.box(x, 8.4, z, vert ? 24 : 1.6, 1.6, vert ? 1.6 : 24, 0x2b2f38);
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.2), new THREE.MeshBasicMaterial({ map: ban, side: THREE.DoubleSide }));
        pl.position.set(x, 8.4, z); pl.rotation.y = vert ? Math.PI / 2 : 0; if (vert) { pl.rotation.y = 0; pl.rotation.y = 0; }
        pl.rotation.y = vert ? 0 : Math.PI / 2; this.group.add(pl);
      }
    }

    /* ---------- ダウンタウン/商業ブロック ---------- */
    _cityBlock(blk, downtown) {
      const r = this.rnd, Z = this.B / 2 - this.S, center = Math.hypot(blk.i - (this.N - 1) / 2, blk.j - (this.N - 1) / 2);
      const hBase = (downtown ? 30 : 14) + Math.max(0, 4 - center) * 8;
      const merged = r() < 0.2, lots = [];
      if (merged) lots.push([0, 0, Z * 2, Z * 2]);
      else for (const sx of [-1, 1]) for (const sz of [-1, 1]) lots.push([sx * (Z / 2 + 1), sz * (Z / 2 + 1), Z - 1.6, Z - 1.6]);
      for (const [ox, oz, lw, ld] of lots) {
        const w = lw * (0.82 + r() * 0.18), d = ld * (0.82 + r() * 0.18);
        const h = hBase * (0.5 + r() * 1.1) + (merged ? 6 : 0);
        const color = PALETTE[Math.floor(r() * PALETTE.length)];
        const tex = downtown ? (r() < 0.55 ? 0 : 1) : Math.floor(r() * 3);
        const x = blk.cx + ox, z = blk.cz + oz;
        this._addBuilding(x, z, w, d, h, color, tex, ox, oz, merged);
      }
    }
    _addBuilding(x, z, w, d, h, color, tex, ox, oz, merged) {
      const r = this.rnd, pod = 4.5, topH = h - pod;
      // 1階(店舗) + 庇
      this.wall(x, 0.3, z, w, pod, d, 0xffffff, 3);
      const outX = merged ? 0 : (ox > 0 ? 1 : -1), outZ = merged ? 0 : (oz > 0 ? 1 : -1);
      const awn = [0xe8483f, 0x2f8fe8, 0xffb52e, 0x3fbf6a][Math.floor(r() * 4)];
      if (outX) this.box(x + outX * (w / 2 + 0.7), pod - 0.4, z, 1.6, 0.25, d * 0.9, awn);
      if (outZ) this.box(x, pod - 0.4, z + outZ * (d / 2 + 0.7), w * 0.9, 0.25, 1.6, awn);
      // 上層 (高いビルはセットバック)
      const setback = h > 38 && r() < 0.7;
      const h1 = setback ? topH * 0.62 : topH;
      this.wall(x, pod + 0.3, z, w * 0.94, h1, d * 0.94, color, tex);
      let top = pod + 0.3 + h1, tw = w * 0.94, td = d * 0.94;
      if (setback) {
        this.box(x, top + 0.2, z, tw + 0.6, 0.4, td + 0.6, 0x8d8f98);
        tw *= 0.66; td *= 0.66; const h2 = topH * 0.38;
        this.wall(x, top + 0.4, z, tw, h2, td, color, tex); top += 0.4 + h2;
      }
      // 屋上: 縁/空調/タンク/アンテナ
      this.box(x, top + 0.3, z, tw + 0.5, 0.6, td + 0.5, 0x9a9a9f);
      if (r() < 0.7) this.box(x + (r() - 0.5) * tw * 0.4, top + 1.3, z + (r() - 0.5) * td * 0.4, tw * 0.28, 1.6, td * 0.22, 0xb8b8bd);
      if (r() < 0.4) { const tx = x + (r() - 0.5) * tw * 0.4, tz = z + (r() - 0.5) * td * 0.4; this.cyl(tx, top + 0.6, tz, 1.3, 1.3, 2.4, 0x8a6a4a, 10); this.cyl(tx, top + 3, tz, 0, 1.4, 0.9, 0x6a4a3a, 10); }
      if (h > 34 && r() < 0.7) { this.cyl(x, top + 0.6, z, 0.12, 0.12, 9, 0xcccccc, 5); this.geo(this._sph(), x, top + 9.8, z, 0xff3030, 0.35, 0.35, 0.35, 0, 0, 'basic'); }
      // 看板 (1階)
      if (r() < 0.75) {
        const side = r() < 0.5 ? (outX > 0 ? 0 : 1) : (outZ > 0 ? 2 : 3);
        if (merged || (side < 2 ? outX : outZ)) this.sign(x, z, merged ? U.randInt(0, 3) : side, w, d, 3.2, Math.floor(r() * 16));
      }
      this.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h + 0.3);
    }
    _sph() { return this._sphG || (this._sphG = new THREE.SphereGeometry(1, 8, 6)); }

    /* ---------- 住宅 ---------- */
    _houses(blk, treePos) {
      const r = this.rnd, Z = this.B / 2 - this.S;
      this.box(blk.cx, 0.31, blk.cz, this.B - this.S * 2, 0.04, this.B - this.S * 2, 0x7cc46a); // 芝生
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = blk.cx + sx * (Z / 2 + 1), z = blk.cz + sz * (Z / 2 + 1);
        const w = 12 + r() * 4, d = 11 + r() * 4, wc = HOUSE[Math.floor(r() * HOUSE.length)], rc = ROOFS[Math.floor(r() * ROOFS.length)];
        const hh = r() < 0.5 ? 5.8 : 8.6; // 2階建/3階建
        this.wall(x, 0.3, z, w, hh, d, wc, r() < 0.5 ? 1 : 2);
        this.geo(this._cylG(Math.hypot(w, d) * 0.62, 0, 4), x, 0.3 + hh + 1.7, z, rc, 1, 3.4, 1, 0, Math.PI / 4);
        this.box(x + w * 0.25, 0.3 + hh + 3.4, z, 1, 2.4, 1, 0x8a7a70); // 煙突
        this.box(x + (sx > 0 ? -1 : 1) * (w / 2 + 2.2), 1.8, z - sz * (d * 0.2), 4, 3, d * 0.5, 0xe8e2d6); // ガレージ
        this.box(x, 1.1, z + sz * (d / 2 + 0.05), 1.4, 2.2, 0.15, 0x7a4a2a); // ドア
        // 塀
        this.box(x, 0.9, z + sz * (Z / 2 + 0.9) * 0.0 + sz * (d / 2 + 4.2), w + 6, 1.2, 0.3, 0xd8d0c0);
        this.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, hh + 0.3);
        if (r() < 0.8) treePos.push([x + sx * (w / 2 + 3), z + sz * (d / 2 + 3)]);
      }
    }

    /* ---------- 公園 / 湖 ---------- */
    _park(blk, treePos, lake) {
      const r = this.rnd, B = this.B, S = this.S;
      this.box(blk.cx, 0.17, blk.cz, B - S * 2, 0.34, B - S * 2, 0x6dbb55);
      // 園路
      this.plane(blk.cx, 0.355, blk.cz, 3.2, B - S * 2 - 2, 0xe6d7b4); this.plane(blk.cx, 0.356, blk.cz, B - S * 2 - 2, 3.2, 0xe6d7b4);
      if (lake) {
        this.cyl(blk.cx, 0.3, blk.cz, 15, 15, 0.14, 0x3fa8e8, 24); this.cyl(blk.cx, 0.36, blk.cz, 12, 12, 0.1, 0x6cc8f4, 24);
        this.addCircle(blk.cx, blk.cz, 14.5, 1.5);
        for (const a of [0.5, 2.1, 3.9]) this.box(blk.cx + Math.cos(a) * 17, 0.8, blk.cz + Math.sin(a) * 17, 1.4, 0.7, 4, 0x8a5a2b, -a);
        // 橋
        this.box(blk.cx, 0.6, blk.cz, 3, 0.3, 32, 0xb08a5a); this.box(blk.cx, 0.6, blk.cz, 32, 0.3, 3, 0xb08a5a);
      } else {
        this.cyl(blk.cx, 0.34, blk.cz, 4.4, 4, 0.8, 0xcfd4dc, 14); this.cyl(blk.cx, 1.1, blk.cz, 3.6, 3.6, 0.2, 0x5cc8ff, 14); this.cyl(blk.cx, 1.2, blk.cz, 0.5, 0.2, 3, 0xbfeaff, 8);
        this.addCircle(blk.cx, blk.cz, 4.3, 1.3);
        for (let n = 0; n < 4; n++) { const a = (n / 4) * Math.PI * 2 + 0.7; this.box(blk.cx + Math.cos(a) * 7, 0.55, blk.cz + Math.sin(a) * 7, 2.2, 0.35, 0.6, 0x8a5a2b, -a + Math.PI / 2); }
      }
      for (let n = 0; n < 16; n++) {
        const a = r() * Math.PI * 2, d = (lake ? 17 : 8) + r() * 12, x = blk.cx + Math.cos(a) * d, z = blk.cz + Math.sin(a) * d;
        if (Math.abs(x - blk.cx) > B / 2 - 5 || Math.abs(z - blk.cz) > B / 2 - 5) continue;
        treePos.push([x, z]);
      }
      // 花壇
      for (let n = 0; n < 6; n++) { const x = blk.cx + (r() - 0.5) * 36, z = blk.cz + (r() - 0.5) * 36; if (Math.hypot(x - blk.cx, z - blk.cz) < 8) continue; this.cyl(x, 0.34, z, 1.2, 1.2, 0.4, [0xff7ac8, 0xffd23a, 0xff6a4a, 0xb07cff][n % 4], 8); }
    }

    /* ---------- スタジアム ---------- */
    _stadium(blk) {
      const cx = blk.cx, cz = blk.cz; this.stadium = { x: cx, z: cz };
      this.box(cx, 0.31, cz, this.B - this.S * 2, 0.04, this.B - this.S * 2, 0x8f9096);
      // ピッチ
      this.cyl(cx, 0.33, cz, 19, 19, 0.06, 0x4fae4a, 28);
      for (let n = -2; n <= 2; n++) this.plane(cx, 0.4, cz + n * 6, 30, 0.35, 0xe8f2e8);
      this.plane(cx, 0.41, cz, 0.35, 34, 0xe8f2e8);
      // スタンド(外壁→観客席の段)
      const wallG = new THREE.CylinderGeometry(24, 24, 1, 36, 1, true);
      this.geo(wallG, cx, 5, cz, 0xe8e2d6, 1, 10, 1);
      for (let t = 0; t < 4; t++) { const rr = 22 - t * 2.4; this.geo(new THREE.CylinderGeometry(rr, rr, 1, 36, 1, true), cx, 2.4 + t * 2.4, cz, [0xd8483f, 0xf2f2f2, 0x2f6fd8, 0xf2f2f2][t], 1, 1.0, 1);
        this.geo(new THREE.RingGeometry(rr - 2.4, rr, 36), cx, 2.4 + t * 2.4 + 0.5, cz, [0xb8382f, 0xd0d0d0, 0x2556b0, 0xd0d0d0][t], 1, 1, 1, -Math.PI / 2, 0); }
      // 屋根リング + 照明塔
      this.geo(new THREE.RingGeometry(14, 25.5, 36), cx, 10.2, cz, 0xf4f4f8, 1, 1, 1, -Math.PI / 2, 0);
      for (let n = 0; n < 4; n++) {
        const a = Math.PI / 4 + n * Math.PI / 2, x = cx + Math.cos(a) * 25, z = cz + Math.sin(a) * 25;
        this.cyl(x, 0, z, 0.5, 0.35, 20, 0x666a74, 8); this.box(x, 20.5, z, 4, 1.8, 1.2, 0xffffee, a, 'basic'); this.box(x, 20.5, z, 4.4, 2.2, 0.8, 0x333840, a);
      }
      // 外壁の当たり判定: 円を並べる(南側に出入口を開けておく=中に入れる)
      const n = 30;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2; if (Math.sin(a) > 0.82 && Math.abs(Math.cos(a)) < 0.3) continue;
        this.addCircle(cx + Math.cos(a) * 23.5, cz + Math.sin(a) * 23.5, 3.4, 10);
      }
      // ゲート看板
      const tex = CT.Models.textTex('SUPER STADIUM', { w: 512, h: 128, bg: '#1f2a68', fg: '#ffe14a', font: 'bold 62px sans-serif', border: '#fff' });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: tex })); pl.position.set(cx, 8.5, cz + 25.5); this.group.add(pl);
    }

    /* ---------- 遊園地 ---------- */
    _amusement(blk, treePos) {
      const cx = blk.cx, cz = blk.cz, r = this.rnd;
      this.box(cx, 0.31, cz, this.B - this.S * 2, 0.04, this.B - this.S * 2, 0xf2d8f0);
      for (let n = 0; n < 5; n++) this.plane(cx + (n - 2) * 8, 0.36, cz, 3, 44, n % 2 ? 0xffe9a0 : 0xffc0d8);
      // 観覧車 (回転)
      const g = new THREE.Group(), R = 17, pivot = new THREE.Group(); g.position.set(cx, 0, cz - 4); g.add(pivot); this.group.add(g);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.4, 6, 40), CT.Models.mat(0xf2f2f8)); rim.position.y = R + 3; pivot.add(rim);
      const rim2 = rim.clone(); rim2.scale.set(0.55, 0.55, 1); pivot.add(rim2);
      const cols = [0xff4b4b, 0xffd23a, 0x3aa6ff, 0x40d070, 0xff7ac8, 0xff9a2e];
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2, sp = new THREE.Mesh(new THREE.BoxGeometry(R * 1.0, 0.18, 0.18), CT.Models.mat(0xdddde6));
        sp.position.set(Math.cos(a) * R / 2, R + 3 + Math.sin(a) * R / 2, 0); sp.rotation.z = a; pivot.add(sp);
        const cab = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 2.2), CT.Models.mat(cols[k % 6])); body.position.y = -1.1; cab.add(body);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.8, 4), CT.Models.mat(0xffffff)); roof.position.y = 0.3; roof.rotation.y = Math.PI / 4; cab.add(roof);
        cab.position.set(Math.cos(a) * R, R + 3 + Math.sin(a) * R, 0); cab.userData.keep = true; pivot.add(cab);
      }
      for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, R + 4, 0.8), CT.Models.mat(0x666a74)); leg.position.set(0, (R + 3) / 2, s * 2.2); leg.rotation.x = s * 0.18; g.add(leg); }
      this.anims.push((dt) => { pivot.rotation.z -= dt * 0.25; for (const c of pivot.children) if (c.userData.keep) c.rotation.z = -pivot.rotation.z; });
      this.addCircle(cx, cz - 4, 3.5, 12);
      // メリーゴーランド
      const mx = cx + 14, mz = cz + 14;
      this.cyl(mx, 0.3, mz, 6, 6, 0.6, 0xf2d8a0, 16); this.cyl(mx, 0.9, mz, 0.5, 0.5, 4.5, 0xffd23a, 8); this.cyl(mx, 5.4, mz, 7, 0.4, 2.4, 0xe8483f, 16);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; this.cyl(mx + Math.cos(a) * 4.5, 0.9, mz + Math.sin(a) * 4.5, 0.15, 0.15, 4.4, 0xffffff, 5); }
      this.addCircle(mx, mz, 6, 7);
      // サーカステント
      for (const [tx, tz, c1] of [[cx - 15, cz + 14, 0xff4b4b], [cx - 16, cz - 14, 0x3aa6ff]]) {
        this.cyl(tx, 0.3, tz, 5, 5, 3, c1, 14); this.cyl(tx, 3.3, tz, 5.4, 0, 5, 0xffffff, 14); this.cyl(tx, 8.3, tz, 0.1, 0.1, 2, 0x666a74, 5);
        this.addCircle(tx, tz, 5.2, 8);
      }
      for (let n = 0; n < 4; n++) treePos.push([cx + (r() - 0.5) * 40, cz + 20 + (r() - 0.5) * 3]);
    }

    /* ---------- 神社 ---------- */
    _shrine(blk, treePos) {
      const cx = blk.cx, cz = blk.cz, r = this.rnd;
      this.box(cx, 0.31, cz, this.B - this.S * 2, 0.04, this.B - this.S * 2, 0xcfc4a8); // 玉砂利
      this.plane(cx, 0.36, cz + 2, 6, 44, 0xe8e0cc);
      for (const dz of [20, 6]) { // 鳥居
        const z = cz + dz;
        for (const s of [-1, 1]) this.cyl(cx + s * 3, 0.3, z, 0.45, 0.4, 6.4, 0xd8301f, 8);
        this.box(cx, 6.2, z, 9, 0.5, 0.7, 0x222222); this.box(cx, 5.1, z, 7, 0.35, 0.5, 0xd8301f);
        this.addCircle(cx - 3, z, 0.7, 7); this.addCircle(cx + 3, z, 0.7, 7);
      }
      const hz = cz - 12; // 拝殿
      this.box(cx, 2.6, hz, 14, 4.6, 9, 0x8a5a3a); this.box(cx, 5.4, hz, 17, 1, 12, 0x4a4a52);
      this.geo(this._cylG(10, 0, 4), cx, 7.3, hz, 0x4a4a52, 1, 3.2, 0.75, 0, Math.PI / 4);
      this.box(cx, 1.2, hz + 4.6, 3, 2.4, 0.3, 0xd8301f);
      this.addBox(cx - 8, cx + 8, hz - 6, hz + 5, 8);
      for (const s of [-1, 1]) for (const dz of [14, 0]) { this.box(cx + s * 6, 0.9, cz + dz, 0.8, 1.2, 0.8, 0x9a9a98); this.box(cx + s * 6, 1.7, cz + dz, 1.2, 0.5, 1.2, 0x9a9a98); }
      for (let n = 0; n < 12; n++) { const x = cx + (r() < 0.5 ? -1 : 1) * (10 + r() * 10), z = cz + (r() - 0.5) * 40; treePos.push([x, z]); }
    }

    /* ---------- ビーチ ---------- */
    _beach(blk) {
      const cx = blk.cx, cz = blk.cz, r = this.rnd;
      this.box(cx, 0.31, cz, this.B - this.S * 2, 0.05, this.B - this.S * 2, 0xf3e2a8);
      for (let n = 0; n < 5; n++) { // パラソル
        const x = cx + (n - 2) * 8 + (r() - 0.5) * 3, z = cz + (r() - 0.5) * 20 + 6, c = [0xff4b4b, 0xffd23a, 0x3aa6ff, 0x40d070, 0xff7ac8][n];
        this.cyl(x, 0.3, z, 0.08, 0.08, 3, 0xdddddd, 5); this.cyl(x, 3.1, z, 2.1, 0, 0.9, c, 8); this.box(x + 2, 0.5, z + 1, 1.8, 0.2, 0.7, 0xffffff, r() * 3);
      }
      for (let n = 0; n < 4; n++) { // ヤシの木
        const x = cx + (n - 1.5) * 11, z = cz - 14 + r() * 4;
        this.cyl(x, 0.3, z, 0.4, 0.22, 7, 0x9a7048, 6);
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; this.geo(this._cylG(0.0, 0.7, 4), x + Math.cos(a) * 1.6, 7.2, z + Math.sin(a) * 1.6, 0x3fae4a, 1, 3.4, 1, Math.cos(a) * 1.2, 0); }
        this.cyl(x, 6.6, z, 0.6, 0.6, 0.5, 0x7a5a38, 6);
      }
      // ライフガードタワー
      this.box(cx + 16, 1.8, cz + 8, 2.6, 3.4, 2.6, 0xffffff); this.box(cx + 16, 3.8, cz + 8, 3.4, 0.4, 3.4, 0xe8483f); this.addBox(cx + 14.5, cx + 17.5, cz + 6.5, cz + 9.5, 4);
    }

    /* ---------- 工業地帯 ---------- */
    _industrial(blk) {
      const cx = blk.cx, cz = blk.cz, r = this.rnd;
      this.box(cx, 0.31, cz, this.B - this.S * 2, 0.04, this.B - this.S * 2, 0x8a8c90);
      for (const sz of [-1, 1]) { // 倉庫
        const z = cz + sz * 14, w = 36, d = 12;
        this.box(cx, 4.5, z, w, 8.4, d, 0xc8ccd2); this.box(cx, 9, z, w + 0.6, 0.8, d + 0.6, 0x6f7480);
        for (let k = -4; k <= 4; k++) this.box(cx + k * 4, 9.5, z, 0.3, 0.5, d + 0.6, 0x555a64);
        this.box(cx - 8, 2.2, z + sz * (d / 2 + 0.05), 6, 4.2, 0.2, [0x3a7ad8, 0xd8483f][sz > 0 ? 0 : 1]);
        this.addBox(cx - w / 2, cx + w / 2, z - d / 2, z + d / 2, 9.4);
      }
      for (let n = 0; n < 6; n++) { // コンテナ
        const x = cx - 18 + n * 7, z = cz + (r() - 0.5) * 3, c = [0xd8483f, 0x3a7ad8, 0xffb52e, 0x3fbf6a, 0xe8e8ee][Math.floor(r() * 5)];
        this.box(x, 1.5, z, 6, 2.6, 2.5, c); if (r() < 0.6) this.box(x, 4.1, z, 6, 2.6, 2.5, [0xd8483f, 0x3a7ad8, 0xffb52e][Math.floor(r() * 3)]);
        this.addBox(x - 3, x + 3, z - 1.3, z + 1.3, 3);
      }
      this.cyl(cx + 20, 0.3, cz, 4, 4, 11, 0xdddde4, 14); this.addCircle(cx + 20, cz, 4.2, 11); // タンク
      this.box(cx - 20, 8, cz + 1, 1, 15, 1, 0xe8a82e); this.box(cx - 10, 15, cz + 1, 22, 0.8, 1, 0xe8a82e); // クレーン
    }

    /* ---------- タワー(ランドマーク) ---------- */
    _tower(blk, treePos) {
      const cx = blk.cx, cz = blk.cz;
      this.box(cx, 0.31, cz, this.B - this.S * 2, 0.04, this.B - this.S * 2, 0xd8d4cc);
      let y = 0.3; const secs = [[7, 4.6, 26, 0xe8483f], [4.6, 2.8, 28, 0xf4f4f4], [2.8, 1.5, 26, 0xe8483f], [1.5, 0.6, 24, 0xf4f4f4]];
      for (const [r0, r1, h, c] of secs) { this.cyl(cx, y, cz, r0, r1, h, c, 8); y += h; }
      this.cyl(cx, 50, cz, 7.5, 7.5, 2.4, 0x2f6fd8, 12); this.cyl(cx, 52.4, cz, 6.5, 6.5, 0.5, 0xf4f4f4, 12); this.cyl(cx, 90, cz, 4.5, 4.5, 2, 0x2f6fd8, 12);
      this.cyl(cx, y, cz, 0.3, 0.1, 22, 0xcccccc, 5); this.geo(this._sph(), cx, y + 22, cz, 0xff3030, 0.6, 0.6, 0.6, 0, 0, 'basic');
      this.addCircle(cx, cz, 7.5, 140);
      for (let n = 0; n < 8; n++) { const a = (n / 8) * Math.PI * 2; treePos.push([cx + Math.cos(a) * 17, cz + Math.sin(a) * 17]); }
    }

    /* ---------- 木/街灯 (インスタンス・ノックで飛ぶ) ---------- */
    _instancedLamps(pos) {
      const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 6.4, 6), CT.Models.mat(0x555a64), pos.length);
      const head = new THREE.InstancedMesh(new THREE.BoxGeometry(1.3, 0.2, 0.5), CT.Models.basic(0xfff3b0), pos.length);
      pos.forEach((p, i) => {
        const mp = new THREE.Matrix4().makeTranslation(p[0], 3.5, p[1]), mh = new THREE.Matrix4().makeTranslation(p[0] + (p[0] > 0 ? -0.5 : 0.5), 6.7, p[1]);
        pole.setMatrixAt(i, mp); head.setMatrixAt(i, mh);
        this.lamps.push({ x: p[0], z: p[1], mPole: mp, mHead: mh, alive: true, t: 0 });
      });
      this.lampPole = pole; this.lampHead = head; this.group.add(pole, head);
    }
    _instancedTrees(pos) {
      const n = pos.length, r = this.rnd;
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6), CT.Models.mat(0x7a5230), n);
      const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
      const col = new THREE.Color(), greens = [0x4fae4a, 0x66c255, 0x3d9a58, 0x8acb4f, 0x2f8a52];
      pos.forEach((p, i) => {
        const mt = new THREE.Matrix4().makeTranslation(p[0], 1.4, p[1]); trunk.setMatrixAt(i, mt);
        const s = 0.8 + r() * 0.6, mc = new THREE.Matrix4().makeScale(s, s * 1.1, s); mc.setPosition(p[0], 3.9 + s, p[1]); crown.setMatrixAt(i, mc);
        const c = greens[Math.floor(r() * greens.length)]; crown.setColorAt(i, col.setHex(c));
        this.trees.push({ x: p[0], z: p[1], s, color: c, mTrunk: mt, mCrown: mc, alive: true, t: 0 });
      });
      crown.instanceColor.needsUpdate = true; this.treeTrunk = trunk; this.treeCrown = crown; this.group.add(trunk, crown);
    }

    _lights() {
      const hemi = new THREE.HemisphereLight(0xdff0ff, 0x8a8f78, 0.95);
      const sun = new THREE.DirectionalLight(0xfff2d8, 0.75); sun.position.set(-0.6, 1.4, 0.8);
      this.scene.add(hemi, sun);
    }
    _ground() {
      const far = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), CT.Models.mat(0x77b25f));
      far.rotation.x = -Math.PI / 2; far.position.y = -0.05; this.group.add(far);
      // 海 (南側)
      const wt = CT.Models.canvasTex(256, 256, (g) => {
        g.fillStyle = '#2a9fd8'; g.fillRect(0, 0, 256, 256);
        for (let n = 0; n < 140; n++) { g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 2; const x = Math.random() * 256, y = Math.random() * 256; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 5, x + 20, y); g.stroke(); }
      }, { repeat: true });
      wt.repeat.set(30, 30);
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 2400), new THREE.MeshLambertMaterial({ map: wt }));
      sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.0, this.half + 14 + 1200); this.group.add(sea);
      this.anims.push((dt) => { wt.offset.x += dt * 0.01; wt.offset.y += dt * 0.006; });
    }
    _border() {
      const W = this.half + this.R / 2 + 3, L = W * 2 + 12, th = 5, hedge = 0x2f8a45;
      const defs = [[0, -W - th / 2, L, th, hedge, 3.2], [-W - th / 2, 0, th, L, hedge, 3.2], [W + th / 2, 0, th, L, hedge, 3.2], [0, W + th / 2, L, th, 0xcfd2da, 1.4]];
      for (const [x, z, w, d, c, h] of defs) { this.box(x, h / 2, z, w, h, d, c); this.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h); }
      this.wallW = W;
      // 遠景: 山とビル影
      const r = this.rnd, far = CT.Models.mat(0x93a6c9), mt = CT.Models.mat(0x6f9a78), snow = CT.Models.mat(0xf4f6fa);
      for (let n = 0; n < 40; n++) {
        const a = (n / 40) * Math.PI * 2 + r() * 0.1, d = this.half + 250 + r() * 500; if (Math.sin(a) > 0.55) continue; // 海側には出さない
        const h = 80 + r() * 220, rad = 90 + r() * 110;
        const m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 7), mt); m.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d); this.group.add(m);
        if (h > 200) { const s = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.3, h * 0.28, 7), snow); s.position.set(m.position.x, h * 0.88, m.position.z); this.group.add(s); }
      }
      for (let n = 0; n < 40; n++) {
        const a = (n / 40) * Math.PI * 2, d = this.half + 100 + r() * 80, h2 = 30 + r() * 110; if (Math.sin(a) > 0.5) continue;
        this.group.add(CT.Models.box(30 + r() * 40, h2, 30 + r() * 40, far, Math.cos(a) * d, h2 / 2, Math.sin(a) * d));
      }
      // 灯台と桟橋 (海側)
      const lx = this.half - 40, lz = this.half + 60;
      for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(4 - k * 0.5, 4.5 - k * 0.5, 8, 10), CT.Models.mat(k % 2 ? 0xe8483f : 0xf4f4f4)); c.position.set(lx, 4 + k * 8, lz); this.group.add(c); }
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), CT.Models.basic(0xfff29a)); lamp.position.set(lx, 35, lz); this.group.add(lamp);
      this.group.add(CT.Models.box(10, 0.8, 90, CT.Models.mat(0xb08a5a), 0, 0.4, this.half + 60));
      for (let n = 0; n < 6; n++) { const bt = CT.Models.box(5, 1.4, 12, CT.Models.mat([0xf4f4f4, 0xe8483f, 0x3aa6ff][n % 3]), -90 + n * 40, 0.6, this.half + 90 + (n % 2) * 40); bt.rotation.y = r() * 3; this.group.add(bt); }
    }
    _sky() {
      const tex = CT.Models.canvasTex(8, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#2f8fe8'); gr.addColorStop(0.45, '#8fd0ff'); gr.addColorStop(0.5, '#d9f0ff'); gr.addColorStop(1, '#d9f0ff');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      });
      const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 16, 12), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
      sky.renderOrder = -10; this.sky = sky; this.scene.add(sky);
      const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
      for (let n = 0; n < 16; n++) {
        const g = new THREE.Group(), a = this.rnd() * Math.PI * 2, d = 600 + this.rnd() * 1000;
        for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(30 + this.rnd() * 25, 8, 6), cm); s.position.set(k * 40 - 60, this.rnd() * 10, this.rnd() * 20); s.scale.y = 0.5; g.add(s); }
        g.position.set(Math.cos(a) * d, 260 + this.rnd() * 200, Math.sin(a) * d); g.rotation.y = -a; this.sky.add(g);
      }
      this.scene.background = new THREE.Color(0xc8e8ff);
      this.scene.fog = new THREE.Fog(0xd2ecff, CT.config.world.fogNear, CT.config.world.fogFar);
    }
  }

  const EMPTY = [];
  function segBox(ax, az, bx, bz, x0, x1, z0, z1) {
    let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
    for (const [p, q, lo, hi] of [[dx, ax, x0, x1], [dz, az, z0, z1]]) {
      if (Math.abs(p) < 1e-9) { if (q < lo || q > hi) return false; }
      else { let a = (lo - q) / p, b = (hi - q) / p; if (a > b) { const t = a; a = b; b = t; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return false; }
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
