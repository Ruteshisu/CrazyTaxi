/* エントリポイント */
(function () {
  'use strict';
  const CT = window.CT;
  function fail(msg) {
    const l = document.getElementById('loading');
    l.style.display = 'flex'; l.innerHTML = '<div>' + msg + '</div>';
  }
  window.addEventListener('error', (e) => { console.error(e.error || e.message); });
  function boot() {
    if (!window.THREE) { fail('three.js を読み込めませんでした。<br>ネットワーク接続を確認して再読み込みしてください。'); return; }
    try {
      CT.Input.init();
      CT.Audio.bindEvents();
      CT.game = new CT.Game(document.getElementById('gl'));
      CT.game.start();
      document.getElementById('loading').style.display = 'none';
      if (CT.util.qs('debug') !== null) document.getElementById('fps').style.display = 'block';
    } catch (e) {
      console.error(e);
      fail('起動に失敗しました: ' + (e && e.message));
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
