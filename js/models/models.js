/* 手続き生成のモデル/テクスチャ集。外部アセットは一切使わない。
   新しい乗り物/キャラ/小物を足すときはここにビルダー関数を追加する。 */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const T = () => window.THREE;

  const matCache = {};

  /* ================= ジオメトリ補助 (全て初回生成してキャッシュ) ================= */
  const G = {};
  const pick = (a) => a[(Math.random() * a.length) | 0];
  /** 色を明るさ倍率で変える */
  function shade(hex, f) {
    const r = Math.min(255, ((hex >> 16) & 255) * f) | 0, g = Math.min(255, ((hex >> 8) & 255) * f) | 0, b = Math.min(255, (hex & 255) * f) | 0;
    return (r << 16) | (g << 8) | b;
  }
  /** 非インデックスのジオメトリに「角が丸い所だけ滑らか」な法線を付け直す (折れ角 deg 未満は平均) */
  function crease(geo, deg) {
    const pos = geo.attributes.position, n = pos.count, p = pos.array, cosT = Math.cos((deg || 40) * Math.PI / 180);
    const fu = new Float32Array(n * 3), fn = new Float32Array(n * 3), map = new Map();
    for (let i = 0; i < n; i += 3) {
      const ax = p[i * 3], ay = p[i * 3 + 1], az = p[i * 3 + 2];
      const ex = p[i * 3 + 3] - ax, ey = p[i * 3 + 4] - ay, ez = p[i * 3 + 5] - az;
      const fx = p[i * 3 + 6] - ax, fy = p[i * 3 + 7] - ay, fz = p[i * 3 + 8] - az;
      const cx = ey * fz - ez * fy, cy = ez * fx - ex * fz, cz = ex * fy - ey * fx, l = Math.hypot(cx, cy, cz);
      for (let k = 0; k < 3; k++) {
        const o = (i + k) * 3;
        fu[o] = cx; fu[o + 1] = cy; fu[o + 2] = cz;
        if (l > 1e-12) { fn[o] = cx / l; fn[o + 1] = cy / l; fn[o + 2] = cz / l; } else { fn[o + 1] = 1; }
      }
    }
    for (let i = 0; i < n; i++) {
      const key = Math.round(p[i * 3] * 400) + '_' + Math.round(p[i * 3 + 1] * 400) + '_' + Math.round(p[i * 3 + 2] * 400);
      let a = map.get(key); if (!a) map.set(key, (a = [])); a.push(i);
    }
    const out = new Float32Array(n * 3);
    for (const list of map.values()) {
      for (const i of list) {
        let x = 0, y = 0, z = 0;
        for (const j of list) {
          if (fn[i * 3] * fn[j * 3] + fn[i * 3 + 1] * fn[j * 3 + 1] + fn[i * 3 + 2] * fn[j * 3 + 2] > cosT) { x += fu[j * 3]; y += fu[j * 3 + 1]; z += fu[j * 3 + 2]; }
        }
        const l = Math.hypot(x, y, z) || 1;
        out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
      }
    }
    geo.setAttribute('normal', new (T().BufferAttribute)(out, 3));
    return geo;
  }
  /** [x,y,r] の点列 → 角丸のShape (r>0 の角は二次曲線で丸める) */
  function rshape(pts) {
    const sh = new (T().Shape)(), n = pts.length;
    for (let i = 0; i < n; i++) {
      const c = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n], r = c[2] || 0;
      if (r > 0) {
        const d1 = Math.hypot(a[0] - c[0], a[1] - c[1]) || 1, d2 = Math.hypot(b[0] - c[0], b[1] - c[1]) || 1;
        const t1 = Math.min(r, d1 * 0.5) / d1, t2 = Math.min(r, d2 * 0.5) / d2;
        const sx = c[0] + (a[0] - c[0]) * t1, sy = c[1] + (a[1] - c[1]) * t1;
        if (i === 0) sh.moveTo(sx, sy); else sh.lineTo(sx, sy);
        sh.quadraticCurveTo(c[0], c[1], c[0] + (b[0] - c[0]) * t2, c[1] + (b[1] - c[1]) * t2);
      } else if (i === 0) sh.moveTo(c[0], c[1]); else sh.lineTo(c[0], c[1]);
    }
    sh.closePath();
    return sh;
  }
  /** 側面プロファイル(z,y) を押し出して幅方向(x)に厚みを持たせる。x=0中心、+zが前 */
  function prof(pts, width, o) {
    const THREE = T(); o = o || {};
    const bt = o.bt == null ? 0.05 : o.bt;
    const geo = new THREE.ExtrudeGeometry(rshape(pts), {
      depth: width, bevelEnabled: bt > 0, bevelThickness: bt, bevelSize: o.bs == null ? bt : o.bs,
      bevelSegments: o.seg || 2, curveSegments: o.cs || 4, steps: 1,
    });
    geo.translate(0, 0, -width / 2); geo.rotateY(-Math.PI / 2);
    return crease(geo, o.ca || 40);
  }
  /** 平面形状(x,z) を押し出して高さ h のパーツにする (バンパー用)。y=0中心 */
  function plan(pts, h) {
    const THREE = T();
    const geo = new THREE.ExtrudeGeometry(rshape(pts), { depth: h, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 4 });
    geo.translate(0, 0, -h / 2); geo.rotateX(Math.PI / 2);
    return crease(geo, 40);
  }
  /** ホイールアーチ用の半円の点列を pts に追加 (左→右、上に凸) */
  function arc(pts, cz, cy, r, n) {
    for (let i = 0; i <= n; i++) { const th = Math.PI - (Math.PI * i) / n; pts.push([cz + r * Math.cos(th), cy + r * Math.sin(th), 0]); }
  }
  /** 変換を焼き込んで list に積む (後で merge で1メッシュにまとめる) */
  function put(list, geo, col, p, r, s) {
    const THREE = T();
    let g;
    if (geo.index) g = geo.toNonIndexed();
    else { g = new THREE.BufferGeometry(); g.setAttribute('position', geo.attributes.position.clone()); g.setAttribute('normal', geo.attributes.normal.clone()); }
    const q = r && r.isQuaternion ? r : new THREE.Quaternion().setFromEuler(new THREE.Euler(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0));
    p = p || [0, 0, 0]; s = s || [1, 1, 1];
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2]), q, new THREE.Vector3(s[0], s[1], s[2])));
    list.push({ g, col: col || 0 });
  }
  const pbox = (list, col, w, h, d, x, y, z, rx, ry, rz) => {
    if (!G.ub) G.ub = new (T().BoxGeometry)(1, 1, 1);
    put(list, G.ub, col, [x, y, z], [rx || 0, ry || 0, rz || 0], [w, h, d]);
  };
  const pcyl = (list, col, rt, rb, h, seg, x, y, z, rx, ry, rz, sx, sy, sz) =>
    put(list, new (T().CylinderGeometry)(rt, rb, h, seg), col, [x, y, z], [rx || 0, ry || 0, rz || 0], [sx || 1, sy || 1, sz || 1]);
  const psph = (list, col, r, ws, hs, x, y, z, sx, sy, sz, rx, ry, rz) =>
    put(list, new (T().SphereGeometry)(r, ws, hs), col, [x, y, z], [rx || 0, ry || 0, rz || 0], [sx || 1, sy || 1, sz || 1]);
  /** a端(太さra)〜b端(太さrb) をつなぐ円柱 */
  function pseg(list, col, a, b, ra, rb, n) {
    const THREE = T(), dir = new THREE.Vector3(a[0] - b[0], a[1] - b[1], a[2] - b[2]), len = dir.length() || 1e-4;
    dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    put(list, new THREE.CylinderGeometry(ra, rb, len, n || 8, 1), col, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], q);
  }
  /** list の中身を1つのBufferGeometryに結合。vc=true で頂点カラーを持たせる */
  function merge(list, vc) {
    const THREE = T();
    let n = 0; for (const it of list) n += it.g.attributes.position.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = vc ? new Float32Array(n * 3) : null, c = new THREE.Color();
    let o = 0;
    for (const it of list) {
      const cnt = it.g.attributes.position.count;
      P.set(it.g.attributes.position.array, o * 3); N.set(it.g.attributes.normal.array, o * 3);
      if (C) { c.setHex(it.col); for (let i = 0; i < cnt; i++) { C[(o + i) * 3] = c.r; C[(o + i) * 3 + 1] = c.g; C[(o + i) * 3 + 2] = c.b; } }
      o += cnt; it.g.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    if (C) g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    return g;
  }
  /** 傾斜したライン(p0→p1)の外側に薄いガラス板を貼る (フロントガラス用)。sgn=法線の向き */
  function lineSlab(list, p0, p1, t0, t1, off, width, sgn) {
    const dz = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dz, dy), nz = (sgn * dy) / l, ny = (-sgn * dz) / l;
    const a = [p0[0] + dz * t0, p0[1] + dy * t0], b = [p0[0] + dz * t1, p0[1] + dy * t1];
    put(list, prof([[a[0], a[1], 0], [b[0], b[1], 0], [b[0] + nz * off, b[1] + ny * off, 0], [a[0] + nz * off, a[1] + ny * off, 0]], width, { bt: 0.01, bs: 0.01, seg: 1, cs: 2 }), 0);
  }
  /** 頂点カラー用の共有マテリアル */
  const vcMat = (basic) => {
    const k = basic ? 'vcB' : 'vcL';
    if (!G[k]) G[k] = new (T())[basic ? 'MeshBasicMaterial' : 'MeshLambertMaterial']({ vertexColors: true });
    return G[k];
  };
  const DK = 0x1f2126, CH = 0xcfd3da;
  const glassMat = () => G.glass || (G.glass = new (T().MeshPhongMaterial)({ color: 0x1d2740, specular: 0x8899bb, shininess: 90 }));

  /** ホイール(タイヤ+リム+スポーク+ハブ)を頂点カラー1メッシュに。軸=x、半径0.42 */
  function wheelGeo() {
    if (G.wheel) return G.wheel;
    const L = [], TIRE = 0x15161a, RIM = 0xcfd3da;
    const R = Math.PI / 2;
    pcyl(L, TIRE, 0.42, 0.42, 0.2, 16, 0, 0, 0, 0, 0, R);
    for (const s of [-1, 1]) {
      pcyl(L, TIRE, 0.37, 0.42, 0.05, 16, s * 0.125, 0, 0, 0, 0, -s * R);
    }
    pcyl(L, RIM, 0.3, 0.3, 0.32, 16, 0, 0, 0, 0, 0, R);
    pcyl(L, 0x3a3d44, 0.22, 0.22, 0.328, 12, 0, 0, 0, 0, 0, R);
    for (let i = 0; i < 3; i++) pbox(L, RIM, 0.334, 0.5, 0.055, 0, 0, 0, (i * Math.PI) / 3, 0, 0);
    pcyl(L, 0xe8eaee, 0.085, 0.085, 0.36, 8, 0, 0, 0, 0, 0, R);
    G.wheel = merge(L, true);
    return G.wheel;
  }
  function wheelMesh() { return new (T().Mesh)(wheelGeo(), vcMat(false)); }

  /** 車体シェルを parent に追加 (S={body,glass,trim,lights,pale}) */
  function addShell(parent, S, color, scl, bodyOpts) {
    const THREE = T();
    const bm = M.phong(color, bodyOpts || { shininess: 70, specular: 0x555555 });
    const parts = [[S.body, bm], [S.glass, glassMat()], [S.trim, vcMat(false)], [S.lights, vcMat(true)], [S.pale, M.phong(0xe8e8ee, { shininess: 40 })]];
    for (const [geo, mat] of parts) {
      if (!geo) continue;
      const m = new THREE.Mesh(geo, mat); if (scl) m.scale.set(scl[0], scl[1], scl[2]); parent.add(m);
    }
  }
  /** バンパー平面形状: z0〜z1 幅 hw */
  function bumperGeo(hw, z0, z1) {
    const k = 'bump' + hw + z0 + z1;
    if (!G[k]) G[k] = plan([[-hw, z0, 0], [hw, z0, 0], [hw, z0 + (z1 - z0) * 0.6, 0.08], [hw - 0.27, z1, 0.15], [-hw + 0.27, z1, 0.15], [-hw, z0 + (z1 - z0) * 0.6, 0.08]], 0.2);
    return G[k];
  }

  /* ---- セダン(タクシーと共有) ---- */
  /** open=true: オープンカー(タクシー用)。屋根/ピラーなしで、座席・ハンドル・フロントガラスを付ける */
  function sedanGeo(open) {
    const key = open ? 'taxiOpen' : 'sedan';
    if (G[key]) return G[key];
    const body = [], glass = [], trim = [], lights = [];
    const lp = [[-2.2, 0.42, 0.1]]; arc(lp, -1.45, 0.42, 0.5, 8); arc(lp, 1.4, 0.42, 0.5, 8);
    lp.push([2.2, 0.42, 0.1], [2.25, 0.7, 0.12], [2.1, 0.9, 0.22], [1.3, 1.0, 0.3]);
    if (open) lp.push([0.8, 1.02, 0.08], [0.72, 1.0, 0], [0.66, 0.74, 0], [-1.3, 0.74, 0], [-1.38, 1.0, 0], [-1.5, 1.02, 0.15], [-2.2, 0.98, 0.18], [-2.26, 0.7, 0.12]);
    else lp.push([0.75, 1.02, 0.15], [-1.5, 1.02, 0.2], [-2.2, 0.98, 0.18], [-2.26, 0.7, 0.12]);
    put(body, prof(lp, 1.86, { bt: 0.07, bs: 0.06, seg: 3, cs: 4 }), 0);
    if (open) {
      // フロントガラス(低く傾斜)と枠、シート、ダッシュボード、ハンドル
      put(glass, prof([[0.78, 1.0, 0], [0.5, 1.46, 0.02], [0.45, 1.46, 0.02], [0.72, 1.0, 0]], 1.66, { bt: 0.015, bs: 0.015, seg: 1, cs: 3 }), 0);
      pbox(trim, 0x2a2a2a, 1.72, 0.05, 0.06, 0, 1.47, 0.47); pbox(trim, 0x2a2a2a, 0.05, 0.5, 0.05, 0.85, 1.22, 0.62); pbox(trim, 0x2a2a2a, 0.05, 0.5, 0.05, -0.85, 1.22, 0.62);
      for (const z of [0.08, -0.95]) pbox(trim, 0x8a1f1f, 1.46, 0.2, 0.62, 0, 0.88, z);       // 座面
      pbox(trim, 0x8a1f1f, 1.46, 0.58, 0.14, 0, 1.2, -0.28); pbox(trim, 0x8a1f1f, 1.46, 0.62, 0.14, 0, 1.22, -1.32);  // 背もたれ
      pbox(trim, 0x2a2a2a, 1.6, 0.18, 0.3, 0, 0.98, 0.62);                                    // ダッシュボード
      const wheel = new (T().TorusGeometry)(0.19, 0.03, 6, 14);
      put(trim, wheel, 0x1a1a1a, [0.42, 1.12, 0.52], [-1.0, 0, 0]);
    } else {
    // キャビン(ガラス) + 屋根 + ピラー
    put(glass, prof([[0.9, 0.98, 0], [0.4, 1.62, 0.14], [-0.95, 1.62, 0.14], [-1.42, 0.98, 0]], 1.72, { bt: 0.02, bs: 0.02, seg: 1, cs: 4 }), 0);
    put(body, prof([[0.52, 1.48, 0.04], [0.42, 1.66, 0.1], [-0.97, 1.66, 0.1], [-1.06, 1.48, 0.04]], 1.82, { bt: 0.03, bs: 0.03, seg: 2, cs: 4 }), 0);
    const pil = [
      [[0.9, 0.98, 0], [0.4, 1.62, 0], [0.31, 1.62, 0], [0.81, 0.98, 0]],
      [[-1.42, 0.98, 0], [-0.95, 1.62, 0], [-0.75, 1.62, 0], [-1.22, 0.98, 0]],
      [[-0.2, 0.98, 0], [-0.2, 1.6, 0], [-0.3, 1.6, 0], [-0.3, 0.98, 0]],
    ];
    for (const q of pil) { const g = prof(q, 0.08, { bt: 0.01, bs: 0.01, seg: 1, cs: 2 }); for (const sx of [-1, 1]) put(body, g, 0, [sx * 0.89, 0, 0]); }
    }
    // ホイールハウスの暗がり
    for (const [wz] of [[1.4], [-1.45]]) for (const sx of [-1, 1]) pcyl(trim, 0x15161a, 0.47, 0.47, 0.52, 12, sx * 0.71, 0.42, wz, 0, 0, Math.PI / 2);
    // バンパー
    const bg = bumperGeo(1.02, 2.0, 2.34);
    put(trim, bg, DK, [0, 0.52, 0]); put(trim, bg, DK, [0, 0.52, 0], [0, Math.PI, 0]);
    // 前面
    pbox(trim, 0x15161a, 0.62, 0.2, 0.06, 0, 0.74, 2.29);
    for (let i = 0; i < 3; i++) pbox(trim, CH, 0.6, 0.018, 0.02, 0, 0.68 + i * 0.06, 2.325);
    for (const sx of [-1, 1]) {
      pcyl(trim, CH, 0.17, 0.17, 0.05, 12, sx * 0.74, 0.78, 2.27, Math.PI / 2);
      put(lights, new (T().SphereGeometry)(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xfff6c0, [sx * 0.74, 0.78, 2.285], [Math.PI / 2, 0, 0]);
      pbox(lights, 0xffa020, 0.14, 0.09, 0.05, sx * 0.93, 0.6, 2.27);
      pbox(lights, 0xd01818, 0.46, 0.15, 0.07, sx * 0.72, 0.84, -2.3);
      pbox(lights, 0xffffff, 0.1, 0.08, 0.06, sx * 0.4, 0.84, -2.3);
      pbox(lights, 0xffa020, 0.12, 0.07, 0.05, sx * 0.93, 0.7, -2.27);
      // ドアハンドル・ミラー
      pbox(trim, CH, 0.035, 0.04, 0.18, sx * 1.005, 0.92, 0.38);
      pbox(trim, CH, 0.035, 0.04, 0.18, sx * 1.005, 0.92, -0.42);
      pbox(trim, DK, 0.1, 0.13, 0.2, sx * 1.13, 1.13, 0.7);
      pbox(trim, DK, 0.1, 0.03, 0.04, sx * 1.04, 1.07, 0.72);
      for (const sz of [0.56, -0.22, -0.97]) pbox(trim, 0x3a3000, 0.025, 0.34, 0.02, sx * 1.002, 0.82, sz);
      pbox(trim, 0x3a3000, 0.025, 0.014, 1.55, sx * 1.002, 0.66, -0.2);
    }
    pbox(trim, 0xf3f3e6, 0.52, 0.26, 0.02, 0, 0.5, 2.37);
    pbox(trim, 0xf3f3e6, 0.52, 0.26, 0.02, 0, 0.5, -2.37);
    // フード/トランクの合わせ目
    pbox(trim, 0x3a3000, 1.7, 0.016, 0.02, 0, 1.085, 0.78);
    pbox(trim, 0x3a3000, 1.7, 0.016, 0.02, 0, 1.07, -1.75);
    G.sedan = { body: merge(body, false), glass: merge(glass, false), trim: merge(trim, true), lights: merge(lights, true) };
    return G.sedan;
  }

  /* ---- バン ---- */
  function vanGeo() {
    if (G.van) return G.van;
    const body = [], glass = [], trim = [], lights = [];
    const bp = [[-2.4, 0.42, 0.1]]; arc(bp, -1.536, 0.42, 0.52, 8); arc(bp, 1.536, 0.42, 0.52, 8);
    bp.push([2.4, 0.42, 0.1], [2.44, 0.8, 0.14], [2.32, 1.2, 0.25], [1.5, 1.35, 0.3], [0.85, 2.05, 0.3], [-2.3, 2.1, 0.2], [-2.44, 1.8, 0.12], [-2.44, 0.9, 0.1]);
    put(body, prof(bp, 1.96, { bt: 0.07, bs: 0.06, seg: 3, cs: 4 }), 0);
    lineSlab(glass, [1.5, 1.35], [0.85, 2.05], 0.12, 0.9, 0.09, 1.84, 1);
    // 側面の窓 (幅=車幅より少し広い板で左右同時に)
    const win = (a, b, c, d) => put(glass, prof([[a, c, 0.05], [a, d, 0.05], [b, d, 0.05], [b, c, 0.05]], 2.1, { bt: 0.01, bs: 0.01, seg: 1, cs: 3 }), 0);
    win(1.2, 0.25, 1.58, 1.95); win(-0.1, -1.0, 1.58, 1.95); win(-1.15, -1.9, 1.6, 1.95);
    pbox(glass, 0, 1.5, 0.4, 0.04, 0, 1.65, -2.5);
    for (const sx of [-1, 1]) {
      pcyl(trim, 0x15161a, 0.5, 0.5, 0.52, 12, sx * 0.76, 0.42, 1.536, 0, 0, Math.PI / 2);
      pcyl(trim, 0x15161a, 0.5, 0.5, 0.52, 12, sx * 0.76, 0.42, -1.536, 0, 0, Math.PI / 2);
      pbox(trim, 0x2b2b2b, 0.025, 0.03, 2.0, sx * 1.052, 1.3, -1.3);               // スライドドアのレール
      pbox(trim, 0x2b2b2b, 0.025, 1.2, 0.025, sx * 1.052, 1.3, -0.05);              // スライドドアの合わせ目
      pbox(trim, 0x2b2b2b, 0.025, 1.2, 0.025, sx * 1.052, 1.3, 0.25);
      pbox(trim, CH, 0.04, 0.05, 0.22, sx * 1.056, 1.2, 0.5);
      pbox(trim, CH, 0.04, 0.05, 0.22, sx * 1.056, 1.2, -0.3);
      pbox(trim, DK, 0.1, 0.34, 0.2, sx * 1.2, 1.5, 1.3); pbox(trim, DK, 0.16, 0.04, 0.04, sx * 1.12, 1.4, 1.3);
      pbox(lights, 0xfff6c0, 0.42, 0.2, 0.06, sx * 0.76, 0.86, 2.52);
      pbox(lights, 0xffa020, 0.16, 0.08, 0.05, sx * 1.0, 0.68, 2.5);
      pbox(lights, 0xd01818, 0.14, 0.5, 0.06, sx * 1.0, 1.2, -2.52);
    }
    pbox(trim, 0x15161a, 1.0, 0.3, 0.05, 0, 0.85, 2.52);
    for (let i = 0; i < 3; i++) pbox(trim, CH, 0.98, 0.02, 0.02, 0, 0.78 + i * 0.07, 2.55);
    const bg = bumperGeo(1.07, 2.1, 2.5);
    put(trim, bg, DK, [0, 0.55, 0]); put(trim, bg, DK, [0, 0.55, 0], [0, Math.PI, 0]);
    pbox(trim, 0x2b2b2b, 0.025, 1.4, 0.03, 0, 1.3, -2.505);                          // 後ろ観音扉の合わせ目
    G.van = { body: merge(body, false), glass: merge(glass, false), trim: merge(trim, true), lights: merge(lights, true) };
    return G.van;
  }

  /* ---- トラック ---- */
  function truckGeo() {
    if (G.truck) return G.truck;
    const body = [], glass = [], trim = [], lights = [], pale = [];
    const cp = [[0.95, 0.48, 0.08]]; arc(cp, 2.2, 0.48, 0.6, 8);
    cp.push([3.1, 0.48, 0.1], [3.14, 1.4, 0.12], [2.98, 2.6, 0.2], [0.95, 2.6, 0.1]);
    put(body, prof(cp, 2.2, { bt: 0.05, bs: 0.05, seg: 2, cs: 4 }), 0);
    lineSlab(glass, [3.14, 1.4], [2.98, 2.6], 0.12, 0.9, 0.1, 2.0, 1);
    put(glass, prof([[2.7, 1.6, 0.05], [2.7, 2.45, 0.05], [1.4, 2.45, 0.05], [1.4, 1.6, 0.05]], 2.3, { bt: 0.01, bs: 0.01, seg: 1, cs: 3 }), 0);
    // 荷台
    put(pale, prof([[1.1, 1.05, 0.08], [-3.0, 1.05, 0.08], [-3.0, 3.1, 0.12], [1.1, 3.1, 0.12]], 2.2, { bt: 0.05, bs: 0.05, seg: 2, cs: 4 }), 0);
    pbox(trim, DK, 1.3, 0.3, 5.6, 0, 0.72, -0.4);
    for (const sx of [-1, 1]) {
      pcyl(trim, 0x15161a, 0.57, 0.57, 0.5, 14, sx * 0.88, 0.48, 2.2, 0, 0, Math.PI / 2);
      for (let i = 0; i < 6; i++) pbox(trim, 0xc4c4cc, 0.04, 1.9, 0.07, sx * 1.17, 2.1, 0.6 - i * 0.68);
      pbox(trim, DK, 0.04, 0.1, 3.9, sx * 1.17, 1.12, -1.0);
      pbox(trim, DK, 0.35, 0.07, 1.3, sx * 1.12, 1.0, -1.8);
      pbox(body, 0, 0.02, 0.3, 3.7, sx * 1.158, 1.45, -1.2);
      // キャブ細部
      pbox(trim, 0x2b2b2b, 0.03, 1.5, 0.03, sx * 1.16, 1.75, 2.8); pbox(trim, 0x2b2b2b, 0.03, 1.5, 0.03, sx * 1.16, 1.75, 1.25);
      pbox(trim, 0x2b2b2b, 0.03, 0.03, 1.55, sx * 1.16, 1.0, 2.02);
      pbox(trim, CH, 0.04, 0.05, 0.2, sx * 1.17, 1.9, 1.5);
      pbox(trim, DK, 0.45, 0.05, 0.05, sx * 1.38, 2.1, 2.9); pbox(trim, DK, 0.08, 0.5, 0.22, sx * 1.62, 2.2, 2.9);
      pbox(lights, 0xfff6c0, 0.42, 0.24, 0.07, sx * 0.95, 1.2, 3.2);
      pbox(lights, 0xffa020, 0.2, 0.1, 0.05, sx * 1.0, 0.75, 3.2);
      pbox(lights, 0xd01818, 0.2, 0.35, 0.06, sx * 1.0, 1.4, -3.1);
      pbox(lights, 0xffa020, 0.2, 0.14, 0.06, sx * 1.0, 1.75, -3.1);
      pbox(trim, CH, 0.05, 0.5, 0.05, sx * 0.1, 2.0, -3.12);
    }
    pbox(trim, 0x15161a, 1.5, 0.55, 0.06, 0, 1.1, 3.2);
    for (let i = 0; i < 4; i++) pbox(trim, CH, 1.4, 0.02, 0.02, 0, 0.9 + i * 0.12, 3.24);
    pbox(trim, 0x2b2b2b, 0.03, 1.9, 0.03, 0, 2.1, -3.1);
    const bg = bumperGeo(1.18, 2.9, 3.3);
    put(trim, bg, DK, [0, 0.58, 0]); put(trim, bg, DK, [0, 0.82, 0], [0, Math.PI, 0]);
    G.truck = { body: merge(body, false), glass: merge(glass, false), trim: merge(trim, true), lights: merge(lights, true), pale: merge(pale, false) };
    return G.truck;
  }

  /* ---- バス ---- */
  function busGeo() {
    if (G.bus) return G.bus;
    const body = [], glass = [], trim = [], lights = [], pale = [];
    const bp = [[-4.5, 0.48, 0.08]]; arc(bp, -3, 0.48, 0.62, 10); arc(bp, 3, 0.48, 0.62, 10);
    bp.push([4.5, 0.48, 0.08], [4.52, 0.9, 0.12], [4.5, 3.35, 0.45], [-4.45, 3.35, 0.35], [-4.52, 0.9, 0.12]);
    put(body, prof(bp, 2.4, { bt: 0.05, bs: 0.05, seg: 2, cs: 4 }), 0);
    put(glass, prof([[2.6, 1.75, 0.08], [2.6, 2.95, 0.08], [-4.2, 2.95, 0.08], [-4.2, 1.75, 0.08]], 2.52, { bt: 0.01, bs: 0.01, seg: 1, cs: 3 }), 0);
    pbox(glass, 0, 2.3, 1.3, 0.05, 0, 2.25, 4.57);                      // フロントガラス
    pbox(glass, 0, 1.9, 0.9, 0.04, 0, 2.3, -4.585);                     // リアウィンドウ
    pbox(lights, 0xffa030, 1.4, 0.18, 0.03, 0, 2.75, 4.6);              // 行き先表示
    put(pale, prof([[0.8, 3.4, 0.1], [-1.9, 3.4, 0.1], [-1.9, 3.7, 0.1], [0.8, 3.7, 0.1]], 1.6, { bt: 0.03, bs: 0.03, seg: 1, cs: 3 }), 0);
    for (let i = 0; i < 8; i++) for (const sx of [-1, 1]) pbox(body, 0, 0.03, 1.2, 0.12, sx * 1.27, 2.35, -3.9 + i * 0.95);
    for (const sx of [-1, 1]) {
      pbox(pale, 0, 0.02, 0.3, 8.4, sx * 1.255, 1.45, 0);              // 帯
      pbox(glass, 0, 0.04, 2.3, 1.2, sx * 1.255, 1.7, 3.4);            // 乗降ドア
      pbox(trim, 0x2b2b2b, 0.03, 2.3, 0.03, sx * 1.265, 1.7, 2.78); pbox(trim, 0x2b2b2b, 0.03, 2.3, 0.03, sx * 1.265, 1.7, 3.4);
      pbox(trim, 0x2b2b2b, 0.03, 2.3, 0.03, sx * 1.265, 1.7, 4.0);
      pbox(trim, DK, 0.1, 0.5, 0.2, sx * 1.42, 2.6, 4.2); pbox(trim, DK, 0.2, 0.04, 0.04, sx * 1.32, 2.5, 4.2);
      pbox(lights, 0xfff6c0, 0.35, 0.22, 0.06, sx * 0.95, 0.85, 4.58);
      pbox(lights, 0xffa020, 0.16, 0.1, 0.05, sx * 1.1, 0.62, 4.56);
      pbox(lights, 0xd01818, 0.18, 0.7, 0.06, sx * 1.1, 1.2, -4.58);
      for (const wz of [3, -3]) pcyl(trim, 0x15161a, 0.58, 0.58, 0.5, 14, sx * 1.0, 0.48, wz, 0, 0, Math.PI / 2);
    }
    pbox(trim, 0x15161a, 1.2, 0.3, 0.05, 0, 0.8, 4.57);
    const bg = bumperGeo(1.28, 4.2, 4.62);
    put(trim, bg, DK, [0, 0.52, 0]); put(trim, bg, DK, [0, 0.52, 0], [0, Math.PI, 0]);
    G.bus = { body: merge(body, false), glass: merge(glass, false), trim: merge(trim, true), lights: merge(lights, true), pale: merge(pale, false) };
    return G.bus;
  }

  /* ================= 人体パーツ (頂点カラーで1メッシュ/部位。色の組み合わせごとにキャッシュ) ================= */
  const SPH = (r, w, h, ps, pl, ts, tl) => new (T().SphereGeometry)(r, w, h, ps, pl, ts, tl);
  const HAT_COLS = [0xd9302b, 0x2f6fd6, 0x222222, 0xeeeeee, 0x2e9e5b];
  const ACC_COLS = [0x2f6fd6, 0xd9302b, 0x2e9e5b, 0x444444, 0xe0a030, 0x8a4fd0];
  const SHOE_COLS = [0x222222, 0x222222, 0xeeeeee, 0x6b3a1e, 0xc0392b];
  const HAIR_STYLES = ['short', 'short', 'short', 'long', 'long', 'pony', 'pony', 'bob', 'spiky', 'bald'];

  function cached(key, build) { return G[key] || (G[key] = merge(build(), true)); }

  function torsoGeo(s) {
    return cached('t' + [s.shirt, s.pants, s.jacket, s.belt, s.pack, s.skirt, s.accent, s.skin].join(), () => {
      const L = [], sh = s.shirt, pa = s.pants;
      pcyl(L, pa, 0.205, 0.2, 0.2, 10, 0, 0.8, 0, 0, 0, 0, 1, 1, 0.66);                       // 骨盤
      pcyl(L, sh, 0.25, 0.2, 0.6, 10, 0, 1.13, 0, 0, 0, 0, 1, 1, 0.62);                       // 胴 (肩が広いテーパー)
      pcyl(L, sh, 0.2, 0.25, 0.08, 10, 0, 1.4, 0, 0, 0, 0, 1, 1, 0.62);
      pcyl(L, s.skin, 0.055, 0.065, 0.1, 8, 0, 1.48, 0);                                      // 首
      if (s.jacket) {
        pcyl(L, shade(sh, 0.72), 0.1, 0.12, 0.05, 10, 0, 1.45, 0, 0, 0, 0, 1, 1, 0.85);       // 襟
        pbox(L, shade(sh, 0.55), 0.016, 0.5, 0.012, 0, 1.15, 0.148);                           // ジッパー
        pcyl(L, shade(sh, 0.8), 0.215, 0.21, 0.07, 10, 0, 0.88, 0, 0, 0, 0, 1, 1, 0.66);
      } else {
        pbox(L, s.accent, 0.18, 0.05, 0.012, 0, 1.2, 0.138);                                  // 胸のワンポイント
      }
      if (s.belt) { pcyl(L, 0x2a2a2a, 0.212, 0.212, 0.045, 10, 0, 0.855, 0, 0, 0, 0, 1, 1, 0.66); pbox(L, 0xd8b640, 0.05, 0.04, 0.012, 0, 0.855, 0.143); }
      if (s.pack) {
        pbox(L, s.accent, 0.34, 0.42, 0.14, 0, 1.13, -0.21); pbox(L, shade(s.accent, 0.75), 0.2, 0.15, 0.04, 0, 1.0, -0.3);
        for (const sx of [-1, 1]) pbox(L, shade(s.accent, 0.7), 0.05, 0.03, 0.34, sx * 0.12, 1.4, -0.0);
      }
      if (s.skirt) pcyl(L, pa, 0.22, 0.31, 0.34, 12, 0, 0.7, 0, 0, 0, 0, 1, 1, 0.9);
      for (const sx of [-1, 1]) psph(L, sh, 0.07, 8, 6, sx * 0.26, 1.38, 0);                   // 肩の丸み
      return L;
    });
  }
  function armGeo(s) {
    return cached('a' + [s.shirt, s.skin, s.longSleeve, s.jacket].join(), () => {
      const L = [], sh = s.shirt, sk = s.skin, ls = s.longSleeve, cuff = shade(sh, 0.7);
      const e = [0, -0.3 - 0.26 * Math.cos(0.2), 0.26 * Math.sin(0.2)];
      psph(L, sh, 0.077, 8, 6, 0, 0, 0);
      if (ls) pseg(L, sh, [0, 0, 0], [0, -0.3, 0], 0.062, 0.055, 8);
      else { pseg(L, sh, [0, 0, 0], [0, -0.17, 0], 0.064, 0.06, 8); pseg(L, sk, [0, -0.17, 0], [0, -0.3, 0], 0.056, 0.05, 8); }
      psph(L, ls ? sh : sk, 0.054, 8, 6, 0, -0.3, 0);
      pseg(L, ls ? sh : sk, [0, -0.3, 0], e, 0.052, 0.04, 8);
      if (ls) pcyl(L, cuff, 0.047, 0.047, 0.035, 8, e[0], e[1] + 0.012, e[2] - 0.004, -0.2);
      psph(L, sk, 0.047, 8, 6, 0, e[1] - 0.04, e[2] + 0.012, 1, 1.2, 0.9);                      // 手
      return L;
    });
  }
  function legUpperGeo(s) {
    return cached('lu' + [s.pants, s.skin, s.skirt].join(), () => {
      const L = [], c = s.skirt ? s.skin : s.pants;
      psph(L, c, 0.09, 8, 6, 0, 0, 0);
      pseg(L, c, [0, 0, 0], [0, -0.4, 0], 0.09, 0.07, 9);
      return L;
    });
  }
  function legLowerGeo(s) {
    return cached('ll' + [s.pants, s.skin, s.skirt, s.shoe].join(), () => {
      const L = [], c = s.skirt ? s.skin : s.pants;
      psph(L, c, 0.07, 8, 6, 0, 0, 0);
      pseg(L, c, [0, 0, 0], [0, -0.36, 0], 0.068, 0.05, 9);
      psph(L, s.shoe, 1, 8, 6, 0, -0.375, 0.04, 0.075, 0.055, 0.14);                           // 靴
      pbox(L, s.shoe === 0xeeeeee ? 0xbbbbbb : 0xf0f0f0, 0.14, 0.025, 0.29, 0, -0.415, 0.05);   // ソール
      return L;
    });
  }
  function headGeo(s) {
    return cached('h' + [s.skin, s.hair, s.hairStyle, s.hat ? s.hatCol : 0, s.glasses, s.accent].join(), () => {
      const L = [], sk = s.skin, hr = s.hair, TAU = Math.PI * 2;
      put(L, SPH(0.215, 14, 10), sk, [0, 0, 0], null, [1, 1.08, 1.02]);
      for (const sx of [-1, 1]) {
        put(L, SPH(1, 6, 5), 0xffffff, [sx * 0.075, 0.03, 0.192], null, [0.05, 0.058, 0.03]);       // 白目
        put(L, SPH(1, 5, 4), 0x111111, [sx * 0.075, 0.03, 0.208], null, [0.027, 0.032, 0.02]);      // 瞳
        pbox(L, shade(hr, 0.7), 0.075, 0.014, 0.02, sx * 0.078, 0.1, 0.19, 0, 0, sx * -0.12);        // 眉
        put(L, SPH(1, 6, 5), sk, [sx * 0.215, 0, 0], null, [0.03, 0.05, 0.035]);                     // 耳
        if (s.glasses) pbox(L, 0x111111, 0.1, 0.05, 0.02, sx * 0.075, 0.035, 0.212);
      }
      if (s.glasses) pbox(L, 0x111111, 0.05, 0.012, 0.012, 0, 0.045, 0.212);
      put(L, SPH(1, 6, 5), shade(sk, 0.93), [0, -0.03, 0.208], null, [0.03, 0.04, 0.035]);          // 鼻
      pbox(L, 0xa8403a, 0.07, 0.014, 0.012, 0, -0.1, 0.19);                                            // 口
      const st = s.hairStyle;
      if (!s.hat && st !== 'bald') put(L, SPH(0.232, 14, 8, 0, TAU, 0, Math.PI * 0.58), hr, [0, 0, -0.01], [-0.28, 0, 0], [1, 1.06, 1.04]);
      if (st === 'long' || st === 'bob') {
        const big = st === 'long';
        put(L, SPH(0.225, 10, 8), hr, [0, big ? -0.13 : -0.08, -0.09], null, [1.02, big ? 1.15 : 0.8, 0.75]);
        for (const sx of [-1, 1]) pbox(L, hr, 0.05, big ? 0.3 : 0.18, 0.12, sx * 0.205, big ? -0.1 : -0.03, -0.04);
      } else if (st === 'pony') {
        pseg(L, hr, [0, 0.08, -0.21], [0, -0.22, -0.3], 0.05, 0.022, 7);
        psph(L, s.accent, 0.04, 6, 5, 0, 0.1, -0.22);
        for (const sx of [-1, 1]) pbox(L, hr, 0.03, 0.1, 0.1, sx * 0.205, 0.0, -0.01);
      } else if (st === 'spiky') {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU;
          put(L, new (T().ConeGeometry)(0.05, 0.15, 5), hr, [Math.cos(a) * 0.12, 0.22, Math.sin(a) * 0.12 - 0.01], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]);
        }
        put(L, new (T().ConeGeometry)(0.06, 0.18, 5), hr, [0, 0.25, 0]);
      } else if (st === 'short') {
        for (const sx of [-1, 1]) pbox(L, hr, 0.03, 0.09, 0.09, sx * 0.205, 0.04, -0.02);
      }
      if (s.hat) {
        put(L, SPH(0.24, 12, 6, 0, TAU, 0, Math.PI * 0.5), s.hatCol, [0, 0.03, 0], [-0.12, 0, 0], [1, 1.05, 1.05]);
        put(L, new (T().CylinderGeometry)(0.27, 0.27, 0.02, 12, 1, false, -Math.PI / 2, Math.PI), s.hatCol, [0, 0.09, 0.02], [0.12, 0, 0]);
        pcyl(L, shade(s.hatCol, 0.7), 0.242, 0.242, 0.03, 12, 0, 0.06, 0);
      }
      return L;
    });
  }

  const M = (CT.Models = {
    /** Lambertマテリアルのキャッシュ付き取得 */
    mat(color, opts) {
      const key = color + (opts ? JSON.stringify(opts) : '');
      if (!matCache[key]) matCache[key] = new (T().MeshLambertMaterial)(Object.assign({ color }, opts || {}));
      return matCache[key];
    },
    /** Phongマテリアル(ツヤあり)のキャッシュ付き取得 */
    phong(color, opts) {
      const key = 'p' + color + (opts ? JSON.stringify(opts) : '');
      if (!matCache[key]) matCache[key] = new (T().MeshPhongMaterial)(Object.assign({ color, shininess: 50, specular: 0x444444 }, opts || {}));
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
      addShell(body, sedanGeo(true), color || 0xffc400);
      // 側面の市松ストライプ (ドア間)
      if (!G.checker) {
        G.checker = M.canvasTex(32, 16, (c) => {
          for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#111' : '#fff'; c.fillRect(i * 8, 0, 8, 8); c.fillStyle = i % 2 ? '#fff' : '#111'; c.fillRect(i * 8, 8, 8, 8); }
        }, { repeat: true });
        G.checker.repeat.set(26 / 4, 1);
        G.plate = M.textTex('CT 3A-7710', { w: 128, h: 64, bg: '#f4f4e6', fg: '#1f3a8a', font: 'bold 25px sans-serif', border: '#1f3a8a' });
        G.signTex = M.textTex('TAXI', { w: 128, h: 48, bg: '#fff7d6', fg: '#c40', font: 'bold 34px sans-serif' });
      }
      const sm = new THREE.MeshLambertMaterial({ map: G.checker });
      const sg = new THREE.PlaneGeometry(1.8, 0.14);
      for (const sx of [-1, 1]) { const m = new THREE.Mesh(sg, sm); m.rotation.y = sx * Math.PI / 2; m.position.set(sx * 1.004, 0.74, -0.02); body.add(m); }
      // ナンバープレート
      const pm = new THREE.MeshLambertMaterial({ map: G.plate }), pg = new THREE.PlaneGeometry(0.5, 0.25);
      const pf = new THREE.Mesh(pg, pm); pf.position.set(0, 0.5, 2.382); body.add(pf);
      const pr = new THREE.Mesh(pg, pm); pr.rotation.y = Math.PI; pr.position.set(0, 0.5, -2.382); body.add(pr);
      // 屋根のTAXI行灯
      const sw = M.basic(0xfff7d6), smat = new THREE.MeshBasicMaterial({ map: G.signTex });
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.27, 0.38), [sw, sw, sw, sw, smat, smat]);
      sign.position.set(0, 1.28, -1.8); body.add(sign);
      const bt = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.3), M.mat(0x2a2a2a)); bt.position.set(0, 1.12, -1.8); body.add(bt);
      // ホイール
      const wheels = [];
      for (const [sx, sz, front] of [[-1.05, 1.4, true], [1.05, 1.4, true], [-1.05, -1.45, false], [1.05, -1.45, false]]) {
        const steer = new THREE.Group(), spin = new THREE.Group();
        spin.add(wheelMesh()); steer.add(spin); steer.position.set(sx, 0.42, sz); g.add(steer);
        wheels.push({ steer, spin, front, side: sx });
      }
      const shadow = M.blobShadow(6); shadow.scale.set(0.8, 1.15, 1); g.add(shadow);
      // 乗員 (運転手と後席の客)。座った姿勢は animHuman の 'seat'/'cheer' モードで動かす
      const driver = M.human({ shirt: 0x2f6fd8, pants: 0x2b2b3a, scale: 1.0, hat: true }), pax = M.human({ shirt: 0xff7a5a, pants: 0x2b4a7a, scale: 1.0 });
      driver.group.position.set(0.42, 0.18, 0.1); pax.group.position.set(-0.3, 0.18, -1.0); pax.group.visible = false;
      body.add(driver.group, pax.group);
      return { group: g, body, wheels, shadow, riders: { driver, passenger: pax } };
    },

    /* ================= 通行人(歩き用) ================= */
    /** 胴/頭/腕2/脚(太もも+膝から先)2 の8メッシュ。ジオメトリは色・スタイルの組み合わせごとに共有。
        脚グループ userData.knee = 膝グループ (animHuman が曲げる) */
    human(o) {
      const THREE = T();
      o = Object.assign({ shirt: 0xe84a5f, pants: 0x2b4a7a, skin: 0xf3c9a0, hair: 0x3a2a1c, scale: 1, hat: false }, o || {});
      const R = Math.random, jacket = R() < 0.3;
      const s = {
        shirt: o.shirt, pants: o.pants, skin: o.skin, hair: o.hair, jacket,
        longSleeve: jacket || R() < 0.25, belt: R() < 0.5, pack: R() < 0.16, skirt: R() < 0.14,
        accent: pick(ACC_COLS), shoe: pick(SHOE_COLS), glasses: R() < 0.12, hat: !!o.hat, hatCol: pick(HAT_COLS), hairStyle: pick(HAIR_STYLES),
      };
      const mat = vcMat(false);
      const g = new THREE.Group(), root = new THREE.Group(); g.add(root);
      const torso = new THREE.Mesh(torsoGeo(s), mat); root.add(torso);
      const head = new THREE.Group(); head.position.set(0, 1.62, 0); head.add(new THREE.Mesh(headGeo(s), mat)); root.add(head);
      const mkLeg = (x) => {
        const p = new THREE.Group(); p.position.set(x, 0.84, 0);
        p.add(new THREE.Mesh(legUpperGeo(s), mat));
        const knee = new THREE.Group(); knee.position.y = -0.4; knee.add(new THREE.Mesh(legLowerGeo(s), mat)); p.add(knee);
        p.userData.knee = knee; root.add(p); return p;
      };
      const mkArm = (x) => { const p = new THREE.Group(); p.position.set(x, 1.37, 0); p.add(new THREE.Mesh(armGeo(s), mat)); root.add(p); return p; };
      const legL = mkLeg(-0.12), legR = mkLeg(0.12), armL = mkArm(-0.32), armR = mkArm(0.32);
      root.scale.setScalar(o.scale);
      return { group: g, root, head, legL, legR, armL, armR, torso, o };
    },
    /** 歩行/パニック/ふらふらの簡易アニメ。mode: 'walk'|'run'|'panic'|'wave'|'freeze'|'dizzy' */
    animHuman(h, mode, phase, t) {
      const s = Math.sin(phase);
      h.root.rotation.set(0, 0, 0); h.root.position.y = 0;
      h.head.rotation.set(0, 0, 0);
      let bend = 0, seated = false; // 膝の曲げ量 (足が前に振り出される間だけ曲げる)
      switch (mode) {
        case 'seat': // 運転手: ハンドルを握って座る
          seated = true; h.legL.rotation.x = h.legR.rotation.x = -1.4;
          h.armL.rotation.set(-1.05, 0, 0.1); h.armR.rotation.set(-1.05, 0, -0.1); h.head.rotation.y = Math.sin(t * 0.7) * 0.25; break;
        case 'seatIdle': // 後席の客: 膝に手
          seated = true; h.legL.rotation.x = h.legR.rotation.x = -1.4;
          h.armL.rotation.set(-0.5, 0, 0.1); h.armR.rotation.set(-0.5, 0, -0.1); h.head.rotation.y = Math.sin(t * 0.9) * 0.4; break;
        case 'cheer': // 両手を上げて大喜び (ドリフト/吹っ飛ばし)
          seated = true; h.legL.rotation.x = h.legR.rotation.x = -1.4;
          h.armL.rotation.set(-2.9 + Math.sin(t * 15) * 0.25, 0, 0.45); h.armR.rotation.set(-2.9 - Math.sin(t * 15) * 0.25, 0, -0.45);
          h.root.position.y = Math.abs(Math.sin(t * 9)) * 0.07; h.head.rotation.x = -0.25; break;
        case 'run':
          h.legL.rotation.x = s * 1.0; h.legR.rotation.x = -s * 1.0;
          h.armL.rotation.x = -s * 1.1; h.armR.rotation.x = s * 1.1;
          h.root.rotation.x = 0.2; h.root.position.y = Math.abs(s) * 0.08; bend = 1.5; break;
        case 'panic': // 両手を上げて走る
          h.legL.rotation.x = s * 1.0; h.legR.rotation.x = -s * 1.0;
          h.armL.rotation.set(-2.6 + s * 0.4, 0, -0.3); h.armR.rotation.set(-2.6 - s * 0.4, 0, 0.3);
          h.root.position.y = Math.abs(s) * 0.1; bend = 1.4; break;
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
          h.root.position.y = Math.abs(s) * 0.03; bend = 0.9;
      }
      const kL = h.legL.userData.knee, kR = h.legR.userData.knee;
      if (kL && kR && seated) { kL.rotation.x = kR.rotation.x = 1.35; } else if (kL && kR) {
        const c = Math.cos(phase);
        kL.rotation.x = bend ? Math.max(0, -c) * bend + 0.05 : 0;
        kR.rotation.x = bend ? Math.max(0, c) * bend + 0.05 : 0;
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
    /* ================= 一般車 (交通/駐車) ================= */
    /** kind: 'sedan' | 'van' | 'truck' | 'bus'。ジオメトリは種類ごとに1回だけ作って共有 */
    car(color, kind) {
      const THREE = T(), g = new THREE.Group(), body = new THREE.Group(); g.add(body);
      kind = kind || 'sedan';
      let L = 4.2, W = 2.0, S, scl = null, wz = [1.337, -1.385], wx = 1.02, ws = 1, wy = 0.42;
      if (kind === 'van') { S = vanGeo(); L = 4.8; W = 2.1; wz = [1.536, -1.536]; wx = 1.07; }
      else if (kind === 'truck') { S = truckGeo(); L = 6.2; W = 2.3; wz = [2.2, -1.8]; wx = 1.12; ws = 1.15; wy = 0.48; }
      else if (kind === 'bus') { S = busGeo(); L = 9; W = 2.5; wz = [3, -3]; wx = 1.27; ws = 1.15; wy = 0.48; }
      else { S = sedanGeo(); scl = [0.97, 1, 0.955]; }
      addShell(body, S, color, scl);
      for (const z of wz) for (const sx of [-1, 1]) {
        const w = wheelMesh(); w.scale.set(1, ws, ws); w.position.set(sx * wx, wy, z); g.add(w);
      }
      const shadow = M.blobShadow(Math.max(L, 5) * 1.25); shadow.scale.set(0.6, 1, 1); g.add(shadow);
      g.userData.dims = { L, W };
      return { group: g, body, L, W, kind, shadow };
    },

    /* ================= ジャンプ台 ================= */
    /** 山型(左右対称)の踏切台。長さ方向が +z。group.rotation.y = 道路方向の角度。どちら向きからでも飛べる */
    ramp(len, width, h) {
      const THREE = T(), g = new THREE.Group();
      const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(len, 0); shape.lineTo(len / 2, h); shape.lineTo(0, 0);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
      geo.translate(-len / 2, 0, -width / 2); geo.rotateY(-Math.PI / 2);
      g.add(new THREE.Mesh(geo, M.mat(0xff8a00)));
      const tex = M.canvasTex(64, 128, (c, w, hh) => {
        c.fillStyle = '#1b1b22'; c.fillRect(0, 0, w, hh); c.strokeStyle = '#ffe14a'; c.lineWidth = 9; c.lineJoin = 'miter';
        for (let i = 0; i < 3; i++) { const y = 18 + i * 38; c.beginPath(); c.moveTo(8, y + 22); c.lineTo(w / 2, y); c.lineTo(w - 8, y + 22); c.stroke(); }
      });
      const half = len / 2, slope = Math.hypot(half, h), ang = Math.atan2(h, half);
      const dm = new THREE.MeshBasicMaterial({ map: tex });
      const up = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.9, slope), dm);   // +z向きに上る面
      up.rotation.set(-Math.PI / 2 - ang, 0, Math.PI); up.position.set(0, h / 2 + 0.06, -len / 4);
      const dn = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.9, slope), dm);   // -z向きに上る面
      dn.rotation.set(-Math.PI / 2 + ang, 0, 0); dn.position.set(0, h / 2 + 0.06, len / 4);
      g.add(up, dn);
      return g;
    },

    /** 客の頭上で揺れる大きな矢印 (▼) */
    arrowMarker(color) {
      const THREE = T();
      const m = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.8, 4), new THREE.MeshBasicMaterial({ color, fog: false }));
      m.rotation.x = Math.PI; return m;
    },

    /** 吹き出し/ポップ用スプライト素材 (テキスト) */
    sprite(tex, w, h) {
      const THREE = T();
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.scale.set(w, h, 1); return s;
    },
  });
})();
