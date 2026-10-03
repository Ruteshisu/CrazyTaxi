/* 開発用デバッグ補助(本番 index.html には含めない)。検証用ビルド(tools/build_artifact.py --debug)でのみ読み込む。
   1: 残り3秒にする(結果画面の確認)  2: 最寄りのお客さんの横へワープ  3: 目的地の横へワープ
   4: アクセル押しっぱなし切替      5: 通行人の群れを目の前に出す   6: ステータスをHUD下部に表示 */
(function () {
  'use strict';
  const CT = window.CT;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:0;bottom:0;right:0;z-index:99;font:11px monospace;color:#fff;background:#000a;padding:2px 6px;white-space:pre-wrap;pointer-events:none;max-height:30vh;overflow:hidden';
  document.body.appendChild(box);
  const errs = [];
  window.addEventListener('error', (e) => { errs.push((e.message || '') + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno); box.style.background = '#a00c'; });
  window.addEventListener('unhandledrejection', (e) => errs.push('rej:' + e.reason));
  const evl = []; const push = (x) => { evl.push(x); if (evl.length > 8) evl.shift(); };
  setTimeout(() => { CT.bus.on('art:add', (e) => push(e.kind + ':' + e.pts)); CT.bus.on('crash', (e) => push('crash' + e.power.toFixed(1) + (e.spin ? 'S' : ''))); CT.bus.on('jump:land', (e) => push('JUMP' + e.dist.toFixed(0))); }, 500);
  let hold = false, fc = 0, fps = 0, ft = performance.now();
  (function tick(){ fc++; const n = performance.now(); if (n - ft > 1000) { fps = Math.round(fc * 1000 / (n - ft)); fc = 0; ft = n; } requestAnimationFrame(tick); })();
  setInterval(() => {
    const g = CT.game; if (!g) return;
    const t = g.taxi;
    box.textContent = (errs.length ? 'ERR: ' + errs.slice(-3).join(' | ') + '\n' : '') +
      'fps=' + fps + ' ' + g.mode + ' t=' + g.time.toFixed(1) + ' art=' + Math.round(g.score.art) + ' fare=' + Math.round(g.score.money) + ' hits=' + g.score.hits + ' deliv=' + g.score.deliveries +
      ' pos=' + t.x.toFixed(0) + ',' + t.z.toFixed(0) + ' v=' + t.speed.toFixed(1) + ' slip=' + t.slip.toFixed(1) + ' rigs=' + g.pool.activeCount + ' air=' + t.air + ' y=' + t.y.toFixed(1) + ' spin=' + t.spinning + ' lv=' + g.score.combo + (hold ? ' HOLD' : '') + '\nEV ' + evl.join(' ') + (g.mode === 'attract' ? '\nAI ' + (g.driver.dbg || '') : '');
  }, 250);
  window.addEventListener('keydown', (e) => {
    const g = CT.game; if (!g) return;
    if (e.code === 'Digit1') g.time = 3;
    if (e.code === 'Digit2') { const s = g.fare.spots[0]; if (s) { g.taxi.x = s.x - 4; g.taxi.z = s.z; g.taxi.vx = g.taxi.vz = 0; g.taxi.h = Math.PI / 2; } }
    if (e.code === 'Digit3') { const d = g.fare.dest; if (d) { g.taxi.x = d.x - 4; g.taxi.z = d.z; g.taxi.vx = g.taxi.vz = 0; g.taxi.h = Math.PI / 2; } }
    if (e.code === 'Digit4') { hold = !hold; CT.Input.keys.ArrowUp = hold; }
    if (e.code === 'Digit6') { const r = g.world.ramps[1], t = g.taxi; t.x = r.x - r.ux * 45; t.z = r.z - r.uz * 45; t.h = Math.atan2(r.ux, r.uz); t.vx = r.ux * 22; t.vz = r.uz * 22; g.cam.snap(t); }
    if (e.code === 'Digit7') { const c = g.traffic.cars.find((q) => q.state === 'road'), t = g.taxi; if (c) { t.x = c.x - Math.sin(c.h) * 30; t.z = c.z - Math.cos(c.h) * 30; t.h = c.h; t.vx = Math.sin(c.h) * 26; t.vz = Math.cos(c.h) * 26; g.cam.snap(t); } }
    if (e.code === 'Digit8') { const b = g.world.boxes[20], t = g.taxi; t.x = b.minx - 30; t.z = (b.minz + b.maxz) / 2; t.h = Math.PI / 2; t.vx = 30; t.vz = 0; g.cam.snap(t); }
    if (e.code === 'Digit5') {
      const t = g.taxi;
      g.peds.list.slice(0, 10).forEach((p, i) => { p.x = t.x + t.fx * (20 + i * 4) + (i % 2 ? 3 : -3); p.z = t.z + t.fz * (20 + i * 4); p.state = 'walk'; p.tx = p.x; p.tz = p.z; });
    }
  });
})();
