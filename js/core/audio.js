/* WebAudioによる効果音/BGM/エンジン音の完全合成。音声ファイルは一切使わない */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const A = (CT.Audio = {
    ctx: null, master: null, sfxBus: null, bgmBus: null,
    muted: false, ready: false, bgmOn: false,
    _noise: null, eng: null, skid: null,

    /** ユーザー操作後に呼ぶ(ブラウザの自動再生制限対策) */
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(c.destination);
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
      this.bgmBus = c.createGain(); this.bgmBus.gain.value = 0.16; this.bgmBus.connect(this.master);
      // ノイズバッファ
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noise = buf;
      this._buildEngine();
      this._buildSkid();
      this.ready = true;
    },
    toggleMute() {
      this.muted = !this.muted;
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.8;
      return this.muted;
    },

    /* ---------- 継続音 ---------- */
    _buildEngine() {
      const c = this.ctx;
      const o1 = c.createOscillator(); o1.type = 'sawtooth';
      const o2 = c.createOscillator(); o2.type = 'square';
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      const g = c.createGain(); g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfxBus);
      o1.start(); o2.start();
      this.eng = { o1, o2, f, g };
    },
    _buildSkid() {
      const c = this.ctx;
      const s = c.createBufferSource(); s.buffer = this._noise; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2300; f.Q.value = 3.5;
      const g = c.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.sfxBus); s.start();
      this.skid = { s, f, g };
    },
    /** 毎フレーム: speedRatio 0..1.4, throttle -1..1, slip 0..1, active=ゲーム中か */
    updateDrive(speedRatio, throttle, slip, active) {
      if (!this.ready) return;
      const t = this.ctx.currentTime, e = this.eng;
      const base = 48 + speedRatio * 110 + Math.abs(throttle) * 12;
      e.o1.frequency.setTargetAtTime(base, t, 0.05);
      e.o2.frequency.setTargetAtTime(base * 0.503, t, 0.05);
      e.f.frequency.setTargetAtTime(380 + speedRatio * 900, t, 0.08);
      e.g.gain.setTargetAtTime(active ? 0.05 + Math.abs(throttle) * 0.03 : 0.025, t, 0.1);
      this.skid.g.gain.setTargetAtTime(active ? slip * 0.12 : 0, t, 0.05);
      this.skid.f.frequency.setTargetAtTime(1700 + slip * 1200, t, 0.1);
    },

    /* ---------- ワンショット ---------- */
    _env(g, t, a, d, peak) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    },
    _tone(type, f0, f1, dur, vol, delay) {
      if (!this.ready) return;
      const c = this.ctx, t = c.currentTime + (delay || 0);
      const o = c.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const g = c.createGain(); this._env(g, t, 0.008, dur, vol);
      o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
    },
    _noiseBurst(dur, vol, freq, type, delay) {
      if (!this.ready) return;
      const c = this.ctx, t = c.currentTime + (delay || 0);
      const s = c.createBufferSource(); s.buffer = this._noise;
      const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq || 1200;
      const g = c.createGain(); this._env(g, t, 0.004, dur, vol);
      s.connect(f); f.connect(g); g.connect(this.sfxBus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    },
    /** ヒット音: ポヨーン! (ピッチ=0..1で高さ変化) */
    boing(power) {
      if (!this.ready) return;
      const p = 0.6 + (power || 0.5) * 0.9;
      this._noiseBurst(0.07, 0.5, 900, 'lowpass');
      this._tone('sine', 140 * p, 900 * p, 0.28, 0.5);
      this._tone('triangle', 220 * p, 1500 * p, 0.34, 0.25, 0.03);
      // ビブラート風の揺れ
      this._tone('sine', 1000 * p, 700 * p, 0.2, 0.15, 0.2);
    },
    star() { // キラーン
      [1568, 2093, 2637, 3136].forEach((f, i) => this._tone('sine', f, f * 1.01, 0.22, 0.12, i * 0.06));
    },
    thud() { this._tone('sine', 160, 50, 0.18, 0.5); this._noiseBurst(0.12, 0.35, 500, 'lowpass'); },
    crash(power) {
      this._noiseBurst(0.25, 0.4 + 0.3 * (power || 0), 700, 'lowpass');
      this._tone('square', 120, 40, 0.22, 0.25);
    },
    clang() { // 缶・コーン
      this._tone('square', 880, 700, 0.15, 0.18); this._tone('square', 1320, 900, 0.12, 0.12, 0.02);
      this._noiseBurst(0.1, 0.25, 3000, 'highpass');
    },
    horn() {
      this._tone('square', 392, 392, 0.3, 0.16); this._tone('square', 494, 494, 0.3, 0.16);
    },
    cash() { // チャリーン
      this._tone('sine', 1318, 1318, 0.15, 0.25); this._tone('sine', 1975, 1975, 0.5, 0.25, 0.09);
      this._tone('sine', 2637, 2637, 0.5, 0.12, 0.09);
    },
    pickup() { this._tone('triangle', 660, 660, 0.12, 0.3); this._tone('triangle', 880, 880, 0.2, 0.3, 0.1); },
    tick() { this._tone('square', 1000, 1000, 0.06, 0.15); },
    go() { this._tone('square', 1500, 1500, 0.4, 0.2); },
    fanfare() {
      [523, 659, 784, 1047].forEach((f, i) => this._tone('square', f, f, 0.18, 0.2, i * 0.11));
      this._tone('square', 1047, 1047, 0.6, 0.2, 0.5);
    },
    timeup() { [440, 392, 330, 262].forEach((f, i) => this._tone('sawtooth', f, f * 0.98, 0.3, 0.2, i * 0.18)); },
    art(n) { // 加点ピコ
      this._tone('triangle', 900 + (n || 0) * 80, 1600 + (n || 0) * 80, 0.1, 0.18);
    },

    /* ---------- BGM (簡易シーケンサ) ---------- */
    startBgm() {
      if (!this.ready || this.bgmOn) return;
      this.bgmOn = true;
      this._step = 0; this._next = this.ctx.currentTime + 0.1;
      this._timer = setInterval(() => this._sched(), 40);
    },
    stopBgm() { this.bgmOn = false; clearInterval(this._timer); },
    _sched() {
      const c = this.ctx, spb = 60 / 150 / 4; // 150BPM 16分
      while (this._next < c.currentTime + 0.15) {
        this._playStep(this._step, this._next);
        this._next += spb; this._step++;
      }
    },
    _bgmTone(type, f, t, dur, vol) {
      const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.value = f;
      const g = c.createGain(); this._env(g, t, 0.005, dur, vol);
      o.connect(g); g.connect(this.bgmBus); o.start(t); o.stop(t + dur + 0.05);
    },
    _playStep(s, t) {
      const c = this.ctx, bar = Math.floor(s / 16) % 4, st = s % 16;
      const roots = [36, 33, 41, 43]; // C A F G (ベース)
      const root = roots[bar];
      // キック
      if (st % 4 === 0) {
        const o = c.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        const g = c.createGain(); this._env(g, t, 0.003, 0.14, 1.0); o.connect(g); g.connect(this.bgmBus); o.start(t); o.stop(t + 0.2);
      }
      // ハット/スネア
      if (st % 2 === 1 || st % 4 === 2) {
        const sN = c.createBufferSource(); sN.buffer = this._noise;
        const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = st % 8 === 4 ? 1500 : 6000;
        const g = c.createGain(); this._env(g, t, 0.002, st % 8 === 4 ? 0.12 : 0.04, st % 8 === 4 ? 0.7 : 0.25);
        sN.connect(f); f.connect(g); g.connect(this.bgmBus); sN.start(t, Math.random()); sN.stop(t + 0.15);
      }
      // ベース (8分でオクターブ跳ね)
      if (st % 2 === 0) this._bgmTone('square', mtof(root + (st % 4 === 2 ? 12 : 0)), t, 0.12, 0.5);
      // リード (ペンタトニック)
      const scale = [0, 2, 4, 7, 9, 12, 14, 16];
      const pat = [0, 2, 4, 2, 5, 4, 2, 0, 3, 4, 5, 7, 5, 4, 2, 4];
      if (st % 2 === 0 || st % 4 === 3) {
        const n = 60 + root - 36 + scale[(pat[st] + bar) % scale.length];
        this._bgmTone('square', mtof(n), t, 0.13, 0.22);
      }
    },

    /** バスのイベントを購読して自動で鳴らす */
    bindEvents() {
      const bus = CT.bus;
      bus.on('ped:hit', (e) => { this.boing(Math.min(1, e.speed / 35)); });
      bus.on('ped:apex', () => this.star());
      bus.on('ped:land', () => this.thud());
      bus.on('ped:wall', () => this.clang());
      bus.on('prop:hit', () => this.clang());
      bus.on('crash', (e) => this.crash(e.power));
      bus.on('pickup', () => this.pickup());
      bus.on('deliver', () => { this.cash(); });
      bus.on('art:add', (e) => this.art(Math.min(8, e.combo || 0)));
      bus.on('horn', () => this.horn());
      bus.on('game:timeup', () => this.timeup());
    },
  });
})();
