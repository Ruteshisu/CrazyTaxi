/* キーボード/ゲームパッド入力。getControls() で共通形式 {throttle, steer, handbrake, boost} を返す */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});

  const Input = (CT.Input = {
    keys: {},
    steer: 0,
    anyKeyHandlers: [],
    init() {
      const prevent = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', ' ']);
      window.addEventListener('keydown', (e) => {
        if (prevent.has(e.code) || prevent.has(e.key)) e.preventDefault();
        if (e.repeat) return;
        this.keys[e.code] = true;
        CT.bus.emit('key:down', e.code);
      });
      window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
      window.addEventListener('blur', () => { this.keys = {}; });
      // ゲームパッド接続時の任意ボタン
      this._padPrev = false;
      this._initTouch();
    },
    touch: { left: false, right: false, gas: false, brake: false, drift: false, boost: false },
    /** タッチ操作: 画面下の仮想ボタン(左:ハンドル / 右:アクセル等)。画面のどこかをタップでスタート */
    _initTouch() {
      const el = document.getElementById('touch'); if (!el) return;
      const T = this.touch;
      const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      const show = () => { document.body.classList.add('is-touch'); };
      if (isTouch) show();
      window.addEventListener('touchstart', show, { passive: true, once: true });
      el.querySelectorAll('[data-k]').forEach((b) => {
        const k = b.dataset.k, held = new Set();
        const on = (e) => { e.preventDefault(); held.add(e.pointerId); T[k] = true; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) {} CT.bus.emit('key:down', 'Touch'); };
        const off = (e) => { held.delete(e.pointerId); if (!held.size) { T[k] = false; b.classList.remove('on'); } };
        b.addEventListener('pointerdown', on);
        b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
        b.addEventListener('contextmenu', (e) => e.preventDefault());
      });
      // 画面タップでもスタート/リトライ (ボタン以外)
      document.getElementById('stage').addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') CT.bus.emit('key:down', 'Touch'); });
      const stop = (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); };
      document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
      document.addEventListener('touchstart', stop, { passive: false });
      document.addEventListener('gesturestart', (e) => e.preventDefault());
      window.addEventListener('contextmenu', (e) => e.preventDefault());
    },
    down(...codes) { for (const c of codes) if (this.keys[c]) return true; return false; },
    pad() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) if (p && p.connected) return p;
      return null;
    },
    /** 毎フレーム呼ぶ。dt秒。ステア値のなめらかな補間を行う */
    getControls(dt) {
      let throttle = 0, target = 0, hb = false, boost = false;
      if (this.down('ArrowUp', 'KeyW')) throttle += 1;
      if (this.down('ArrowDown', 'KeyS')) throttle -= 1;
      if (this.down('ArrowLeft', 'KeyA')) target -= 1;
      if (this.down('ArrowRight', 'KeyD')) target += 1;
      if (this.down('Space')) hb = true;
      if (this.down('ShiftLeft', 'ShiftRight')) boost = true;
      const T = this.touch;
      if (T.gas) throttle += 1; if (T.brake) throttle -= 1;
      if (T.left) target -= 1; if (T.right) target += 1;
      if (T.drift) hb = true; if (T.boost) boost = true;
      const p = this.pad();
      if (p) {
        const ax = p.axes[0] || 0;
        if (Math.abs(ax) > 0.15) target = ax;
        const rt = p.buttons[7] ? p.buttons[7].value : 0;
        const lt = p.buttons[6] ? p.buttons[6].value : 0;
        if (rt > 0.1) throttle = rt;
        if (lt > 0.1) throttle = -lt;
        if (p.buttons[0] && p.buttons[0].pressed) throttle = 1;
        if (p.buttons[2] && p.buttons[2].pressed) hb = true;
        if (p.buttons[1] && p.buttons[1].pressed) boost = true;
        const any = p.buttons.some((b) => b.pressed);
        if (any && !this._padPrev) CT.bus.emit('key:down', 'Pad');
        this._padPrev = any;
      }
      const rate = target === 0 ? 11 : 7;
      this.steer = CT.util.damp(this.steer, target, rate, dt);
      if (Math.abs(this.steer) < 0.01) this.steer = 0;
      return { throttle, steer: this.steer, handbrake: hb, boost };
    },
  });
})();
