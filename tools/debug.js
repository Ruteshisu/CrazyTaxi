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
  let hold = false;
  setInterval(() => {
    const g = CT.game; if (!g) return;
    const t = g.taxi;
    box.textContent = (errs.length ? 'ERR: ' + errs.slice(-3).join(' | ') + '\n' : '') +
      g.mode + ' t=' + g.time.toFixed(1) + ' art=' + Math.round(g.score.art) + ' fare=' + Math.round(g.score.money) + ' hits=' + g.score.hits + ' deliv=' + g.score.deliveries +
      ' pos=' + t.x.toFixed(0) + ',' + t.z.toFixed(0) + ' v=' + t.speed.toFixed(1) + ' slip=' + t.slip.toFixed(1) + ' rigs=' + g.pool.activeCount + (hold ? ' HOLD' : '');
  }, 250);
  window.addEventListener('keydown', (e) => {
    const g = CT.game; if (!g) return;
    if (e.code === 'Digit1') g.time = 3;
    if (e.code === 'Digit2') { const s = g.fare.spots[0]; if (s) { g.taxi.x = s.x - 8; g.taxi.z = s.z; g.taxi.vx = g.taxi.vz = 0; g.taxi.h = Math.PI / 2; } }
    if (e.code === 'Digit3') { const d = g.fare.dest; if (d) { g.taxi.x = d.x - 8; g.taxi.z = d.z; g.taxi.vx = g.taxi.vz = 0; g.taxi.h = Math.PI / 2; } }
    if (e.code === 'Digit4') { hold = !hold; CT.Input.keys.ArrowUp = hold; }
    if (e.code === 'Digit5') {
      const t = g.taxi;
      g.peds.list.slice(0, 10).forEach((p, i) => { p.x = t.x + t.fx * (20 + i * 4) + (i % 2 ? 3 : -3); p.z = t.z + t.fz * (20 + i * 4); p.state = 'walk'; p.tx = p.x; p.tz = p.z; });
    }
  });
})();
