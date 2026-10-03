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

    /* ---------- 「やられ声」: ギャグ調の母音フォルマント合成 (ノコギリ波→フォルマントBPF並列+息ノイズ+ビブラート) ---------- */
    cryKinds: ['gya', 'gyo', 'uwa', 'hee', 'gefu', 'oioi', 'kya', 'bho', 'hya', 'wah'],
    _cryDefs: null, _cryEnds: null, _cryLast: -9, _curves: null,
    _raspCurve(k) {
      this._curves = this._curves || {};
      const key = k.toFixed(2);
      if (this._curves[key]) return this._curves[key];
      const n = 256, cv = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; cv[i] = Math.tanh(x * (1 + k * 4)) * 0.85; }
      return (this._curves[key] = cv);
    },
    /** 1セグメント分の声を合成。pm=ピッチ倍率, vm=音量倍率, dm=長さ倍率 */
    _voice(seg, t0, pm, vm, dm) {
      const c = this.ctx, V = A._vowels, dur = seg.dur * dm, t = t0 + (seg.at || 0) * dm;
      const o = c.createOscillator(); o.type = seg.w || 'sawtooth';
      const pts = seg.f;
      o.frequency.setValueAtTime(pts[0][1] * pm, t);
      for (let i = 1; i < pts.length; i++) o.frequency.exponentialRampToValueAtTime(pts[i][1] * pm, t + pts[i][0] * dur);
      // ビブラート
      const lfo = c.createOscillator(); lfo.frequency.value = seg.vib[0];
      const lg = c.createGain(); lg.gain.value = seg.vib[1] * pm;
      lfo.connect(lg); lg.connect(o.frequency);
      // ざらつき(軽いウェーブシェイパ)
      const sh = c.createWaveShaper(); sh.curve = this._raspCurve(seg.rasp || 0.3);
      const pre = c.createGain(); pre.gain.value = 0.5;
      const out = c.createGain(), pk = (seg.vol || 1) * vm;
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(pk, t + Math.min(0.04, dur * 0.2));
      out.gain.exponentialRampToValueAtTime(pk * 0.75, t + dur * 0.7);
      out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(pre); pre.connect(sh);
      const va = V[seg.v[0]], vb = V[seg.v[1]], fg = [1, 0.7, 0.35];
      for (let k = 0; k < 3; k++) {
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = k === 0 ? 5 : 8;
        bp.frequency.setValueAtTime(va[k], t);
        bp.frequency.exponentialRampToValueAtTime(vb[k], t + dur * 0.8);
        const g = c.createGain(); g.gain.value = fg[k];
        sh.connect(bp); bp.connect(g); g.connect(out);
      }
      // 息(ノイズ)
      if (seg.br) {
        const s = c.createBufferSource(); s.buffer = this._noise;
        const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2200; nf.Q.value = 0.8;
        const ng = c.createGain(); ng.gain.value = seg.br;
        s.connect(nf); nf.connect(ng); ng.connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
      }
      out.connect(this.sfxBus);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
      return t + dur;
    },
    /** やられ声: kind=cryKindsのいずれか, power=0..1(強いほど大声・高音), delay=秒 */
    cry(kind, power, delay) {
      if (!this.ready) return;
      const defs = A._cryDefs;
      const segs = defs[kind] || defs[this.cryKinds[Math.floor(Math.random() * this.cryKinds.length)]];
      const c = this.ctx, now = c.currentTime, t = now + (delay || 0);
      // 同時発声は最大3、前の声から70ms以上空ける
      const ends = (this._cryEnds = (this._cryEnds || []).filter((x) => x > now));
      if (ends.length >= 3 || t - this._cryLast < 0.07) return;
      this._cryLast = t;
      const p = Math.max(0, Math.min(1, power == null ? 0.5 : power));
      const pm = (0.9 + p * 0.3) * (0.93 + Math.random() * 0.14);
      const dm = 0.92 + Math.random() * 0.2, vm = 0.28 + p * 0.3;
      let end = t;
      for (const sg of segs) end = Math.max(end, this._voice(sg, t, pm, vm, dm));
      ends.push(end);
    },

    /* ---------- BGM: 複数トラックのシーケンサ (トラック定義は下の A.tracks) ---------- */
    trackIndex: 0, _pending: -1, _step: 0, _next: 0, _timer: null,
    startBgm(idx) {
      if (!this.ready || this.bgmOn) return;
      const n = this.tracks.length, i = (idx | 0);
      this.trackIndex = i >= 0 && i < n ? i : 0; this._pending = -1;
      this.bgmOn = true; this._buildBgmChain();
      this._step = 0; this._next = this.ctx.currentTime + 0.1;
      this._timer = setInterval(() => this._sched(), 40);
      this._emitTrack();
    },
    stopBgm() { this.bgmOn = false; this._pending = -1; clearInterval(this._timer); this._timer = null; },
    _emitTrack() {
      if (CT.bus && CT.bus.emit) CT.bus.emit('bgm:track', { index: this.trackIndex, name: this.tracks[this.trackIndex].name });
    },
    /** 次の小節頭でトラックを切り替える(停止中は即時に選択だけ) */
    setTrack(i) {
      const n = this.tracks.length; i = ((i | 0) % n + n) % n;
      if (!this.bgmOn) { this.trackIndex = i; this._pending = -1; this._emitTrack(); return i; }
      if (i === this.trackIndex && this._pending < 0) return i;
      this._pending = i; return i;
    },
    nextTrack() {
      const base = this._pending >= 0 ? this._pending : this.trackIndex;
      return this.setTrack((base + 1) % this.tracks.length);
    },
    /** トラック切替のファンファーレ(約1.2秒) */
    jingle(delay) {
      if (!this.ready) return;
      const d = delay || 0, notes = [523, 659, 784, 1047, 784, 1047, 1319, 1568];
      notes.forEach((f, i) => {
        const dt = d + i * 0.085, long = i === notes.length - 1;
        this._tone('square', f, f, long ? 0.5 : 0.11, 0.16, dt);
        this._tone('triangle', f / 2, f / 2, long ? 0.5 : 0.11, 0.2, dt);
      });
      this._noiseBurst(0.6, 0.2, 5000, 'highpass', d + 0.68);
    },
    _buildBgmChain() {
      if (this._guitarBus) return;
      const c = this.ctx;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.12;
      this.bgmBus.disconnect(); this.bgmBus.connect(comp); comp.connect(this.master); this.bgmBus.gain.value = 0.3;
      const shaper = c.createWaveShaper(), n = 1024, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * 5) * 0.9; }
      shaper.curve = curve; shaper.oversample = '2x';
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90;
      const g = c.createGain(); g.gain.value = 0.34;
      hp.connect(shaper); shaper.connect(lp); lp.connect(g); g.connect(this.bgmBus);
      this._guitarBus = hp;
      // クリーン系(ファンク/スカ/サーフ/ホーン用)
      const chp = c.createBiquadFilter(); chp.type = 'highpass'; chp.frequency.value = 120;
      const clp = c.createBiquadFilter(); clp.type = 'lowpass'; clp.frequency.value = 5500;
      const cg = c.createGain(); cg.gain.value = 0.55;
      chp.connect(clp); clp.connect(cg); cg.connect(this.bgmBus);
      this._cleanBus = chp;
      // やわらかい系(パッド用)
      const slp = c.createBiquadFilter(); slp.type = 'lowpass'; slp.frequency.value = 1600;
      const sg = c.createGain(); sg.gain.value = 0.4;
      slp.connect(sg); sg.connect(this.bgmBus);
      this._softBus = slp;
    },
    _sched() {
      if (!this.bgmOn) return;
      const c = this.ctx;
      if (this._next < c.currentTime - 0.3) this._next = c.currentTime + 0.05; // タブ停止からの復帰で連打しない
      while (this._next < c.currentTime + 0.15) {
        if (this._pending >= 0 && this._step % 16 === 0) { // 小節頭で切替: ステップを小節頭にリセット
          this.trackIndex = this._pending; this._pending = -1; this._step = 0;
          this.jingle(Math.max(0, this._next - c.currentTime)); this._emitTrack();
        }
        const trk = this.tracks[this.trackIndex], spb = 60 / trk.bpm / 4;
        const sw = this._step % 2 === 1 ? (trk.swing || 0) * spb : 0; // 裏16分を遅らせてシャッフル
        trk.play(this._step, this._next + sw);
        this._next += spb; this._step++;
      }
    },
    /** BGM用の1音。vib=[Hz,cents]でビブラート */
    _bgmTone(type, f, t, dur, vol, dest, vib) {
      const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.value = f;
      const g = c.createGain(); this._env(g, t, 0.004, dur, vol);
      o.connect(g); g.connect(dest || this.bgmBus); o.start(t); o.stop(t + dur + 0.05);
      if (vib) {
        const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = vib[0]; lg.gain.value = vib[1];
        l.connect(lg); lg.connect(o.detune); l.start(t); l.stop(t + dur + 0.05);
      }
    },
    _noiseHit(t, dur, vol, freq, type) {
      const c = this.ctx, sN = c.createBufferSource(); sN.buffer = this._noise;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const g = c.createGain(); this._env(g, t, 0.002, dur, vol);
      sN.connect(f); f.connect(g); g.connect(this.bgmBus); sN.start(t, Math.random()); sN.stop(t + dur + 0.1);
    },
    /* ドラム部品 */
    _kick(t, vol, f0) {
      const c = this.ctx, o = c.createOscillator(); o.frequency.setValueAtTime(f0 || 160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.1);
      const g = c.createGain(); this._env(g, t, 0.002, 0.13, vol == null ? 1.0 : vol); o.connect(g); g.connect(this.bgmBus); o.start(t); o.stop(t + 0.2);
    },
    _snare(t, vol, body) {
      const v = vol == null ? 0.75 : vol;
      this._noiseHit(t, 0.13, v, 1800, 'highpass');
      const c = this.ctx, o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(body || 220, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
      const g = c.createGain(); this._env(g, t, 0.002, 0.1, v * 0.67); o.connect(g); g.connect(this.bgmBus); o.start(t); o.stop(t + 0.15);
    },
    _hat(t, open, vol) { this._noiseHit(t, open ? 0.1 : 0.035, vol == null ? 0.2 : vol, 7000, 'highpass'); },
    _crashCym(t, vol) { this._noiseHit(t, 0.9, vol == null ? 0.35 : vol, 5000, 'highpass'); },
    _clap(t, vol) { this._noiseHit(t, 0.06, vol, 1500, 'bandpass'); this._noiseHit(t + 0.012, 0.1, vol * 0.8, 1500, 'bandpass'); },
    _chordOf(trk, s) { return trk.chords[Math.floor(s / 32) % trk.chords.length]; }, // 2小節ごとにコード
    /** ペンタトニック度数→半音 (th=3:マイナー / 4:メジャー) */
    _pent(d, th) {
      const p = th === 3 ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
      return p[((d % 5) + 5) % 5] + 12 * Math.floor(d / 5);
    },
    /** バスのイベントを購読して自動で鳴らす */
    bindEvents() {
      const bus = CT.bus;
      bus.on('ped:hit', (e) => {
        const lv = e.level || 0, sp = Math.min(1, (e.speed || 0) / 35);
        this.boing(sp * 0.6 + lv * 0.13);
        if (lv >= 2) this._noiseBurst(0.5, 0.25, 6000, 'highpass');
        // やられ声: 指定があればそのvoice、なければランダム。レベルが高いほど大声・高音
        const voice = e.cry && e.cry.voice ? e.cry.voice : this.cryKinds[Math.floor(Math.random() * this.cryKinds.length)];
        this.cry(voice, Math.min(1, 0.2 + lv * 0.22 + sp * 0.2), 0.04);
      });
      bus.on('ped:apex', () => this.star());
      bus.on('ped:land', () => this.thud());
      bus.on('ped:wall', () => this.clang());
      bus.on('prop:hit', (e) => { if (e.kind === 'car') { this.crash(0.8); this._tone('sine', 200, 60, 0.3, 0.4); } else this.clang(); });
      bus.on('jump:land', () => { this.thud(); this.pickup(); });
      bus.on('crash', (e) => this.crash(e.power));
      bus.on('pickup', () => this.pickup());
      bus.on('deliver', () => { this.cash(); });
      bus.on('art:add', (e) => this.art(Math.min(8, e.combo || 0)));
      bus.on('horn', () => this.horn());
      bus.on('game:timeup', () => this.timeup());
    },
  });

  /* 母音フォルマント [F1,F2,F3] */
  A._vowels = {
    a: [800, 1200, 2600], o: [500, 900, 2500], i: [300, 2300, 3000], u: [350, 800, 2400], e: [550, 1800, 2700],
  };
  /* やられ声定義: f=[[時間比,Hz]..] v=[開始母音,終了母音] vib=[Hz,ビブラート幅Hz] br=息 rasp=ざらつき */
  A._cryDefs = {
    gya: [{ dur: 0.7, f: [[0, 520], [0.3, 1100], [0.55, 1250], [1, 700]], v: ['a', 'a'], vib: [6.5, 28], br: 0.12, rasp: 0.6, vol: 1.0 }],
    gyo: [{ dur: 0.65, f: [[0, 150], [0.3, 125], [0.55, 300], [0.8, 640], [1, 520]], v: ['u', 'o'], vib: [7, 10], br: 0.2, rasp: 0.9, vol: 1.0 }],
    uwa: [{ dur: 0.7, f: [[0, 300], [0.25, 430], [0.6, 680], [1, 380]], v: ['u', 'a'], vib: [5.5, 14], br: 0.1, rasp: 0.4, vol: 1.0 }],
    hee: [{ dur: 0.36, f: [[0, 900], [0.5, 1550], [1, 1250]], v: ['i', 'e'], vib: [9, 30], br: 0.1, rasp: 0.3, vol: 0.9, w: 'square' }],
    gefu: [{ dur: 0.22, f: [[0, 175], [1, 85]], v: ['e', 'u'], vib: [4, 4], br: 0.3, rasp: 1.0, vol: 1.1 }],
    oioi: [
      { at: 0, dur: 0.15, f: [[0, 250], [1, 205]], v: ['o', 'o'], vib: [4, 3], br: 0.1, rasp: 0.5, vol: 1.0 },
      { at: 0.24, dur: 0.17, f: [[0, 320], [1, 270]], v: ['i', 'e'], vib: [4, 3], br: 0.1, rasp: 0.5, vol: 1.0 }],
    kya: [{ dur: 0.62, f: [[0, 800], [0.3, 1550], [1, 1100]], v: ['i', 'a'], vib: [7, 35], br: 0.1, rasp: 0.35, vol: 0.9 }],
    bho: [{ dur: 0.85, f: [[0, 460], [0.2, 530], [1, 140]], v: ['o', 'u'], vib: [5, 12], br: 0.15, rasp: 0.4, vol: 1.0 }],
    hya: [{ dur: 0.22, f: [[0, 1100], [1, 900]], v: ['i', 'a'], vib: [8, 20], br: 0.25, rasp: 0.3, vol: 0.9 }],
    wah: [{ dur: 0.6, f: [[0, 380], [0.35, 760], [1, 480]], v: ['u', 'a'], vib: [6, 18], br: 0.12, rasp: 0.5, vol: 1.0 }],
  };

  /* ================= トラック定義 (16小節ループ。chords=[根音, 3度(3|4)] を2小節ごとに8個) ================= */
  const mt = (n, f) => mtof(n) * (f || 1);
  // 汎用: 度数パターン(16ステップ)からリードを鳴らす
  const leadPat = (pat, st, root, th, t, o) => {
    const d = pat[st]; if (d == null) return;
    const n = root + o.oct + A._pent(d, th);
    A._bgmTone(o.type, mt(n), t, o.dur, o.vol, o.dest, o.vib);
    if (o.type2) A._bgmTone(o.type2, mt(n, o.det || 1.004), t, o.dur, o.vol * 0.6, o.dest);
  };

  A.tracks = [
    /* 0: 疾走パンク 188BPM Am-F-C-G (既存曲) */
    { name: 'PUNK RUSH', bpm: 188, swing: 0,
      play(s, t) {
        const bar = Math.floor(s / 16) % 16, st = s % 16, chordIdx = Math.floor(bar / 2) % 4;
        const roots = [45, 41, 48, 43], root = roots[chordIdx], hook = bar >= 8;
        const kick = [0, 2, 8, 10].indexOf(st) >= 0 || (bar % 4 === 3 && st === 14);
        if (kick) A._kick(t, 1.0);
        const fill = bar % 4 === 3 && st >= 12;
        if (st === 4 || st === 12 || (fill && st > 12)) A._snare(t, 0.75);
        if (st % 2 === 0 && !fill) A._noiseHit(t, st % 8 === 6 ? 0.1 : 0.035, st % 8 === 6 ? 0.28 : 0.2, 7000, 'highpass');
        if (st === 0 && bar % 4 === 0) A._crashCym(t, 0.35);
        if (st % 2 === 0) A._bgmTone('sawtooth', mt(root - 12), t, st % 8 === 0 ? 0.2 : 0.1, 0.34);
        if (st % 2 === 0 || (hook && st === 7)) {
          const sustain = st === 0 || (hook && (st === 6 || st === 10)), dur = sustain ? 0.34 : 0.075;
          for (const iv of [0, 7, 12]) A._bgmTone('sawtooth', mt(root + 12 + iv, iv === 7 ? 1.003 : 1), t, dur, 0.5, A._guitarBus);
        }
        if (hook) {
          const mel = { 0: 12, 3: 12, 6: 15, 8: 17, 10: 15, 12: 12, 14: 10 }, d = mel[st];
          if (d !== undefined) {
            const n = root + 12 + d;
            A._bgmTone('square', mt(n + 12), t, 0.14, 0.2);
            A._bgmTone('square', mt(n + 12, 1.005), t, 0.14, 0.12);
          }
        }
      } },

    /* 1: サーフ/ガレージ・ファンク 150BPM Em-C-D-B7 / ウォーキングベース+ツァンギーなリード+シャッフルhat */
    { name: 'SURF GARAGE', bpm: 150, swing: 0.28,
      chords: [[40, 3], [48, 4], [50, 4], [40, 3], [40, 3], [48, 4], [50, 4], [47, 4]],
      patA: [7, null, 9, 7, null, 5, 7, null, 3, null, 5, 3, null, 2, null, null],
      patB: [5, 7, 9, 10, null, 9, 7, 5, 7, null, null, 5, 3, null, 2, 0],
      play(s, t) {
        const T = A.tracks[1], bar = Math.floor(s / 16) % 16, st = s % 16, ch = A._chordOf(T, s), root = ch[0], th = ch[1];
        const chorus = bar >= 8, fillB = bar % 4 === 3;
        if ([0, 6, 8].indexOf(st) >= 0 || (bar % 2 === 1 && st === 11)) A._kick(t, 0.95, 150);
        if (st === 4 || st === 12 || (fillB && st >= 14)) A._snare(t, 0.65, 200);
        if (st % 2 === 0) A._hat(t, st === 14 && !fillB, st % 4 === 0 ? 0.24 : 0.16);
        if (st === 0 && bar % 4 === 0) A._crashCym(t, 0.3);
        // ウォーキングベース
        if (st % 2 === 0) {
          const walk = [0, th, 7, 9, 12, 9, 7, th], off = walk[(st / 2) % 8];
          A._bgmTone('sawtooth', mt(root + off - (off >= 12 ? 12 : 0)), t, 0.11, 0.32);
        }
        // 裏拍のクリーン刻み
        if (st % 4 === 2) for (const iv of [0, th, 7]) A._bgmTone('square', mt(root + 12 + iv), t, 0.07, 0.16, A._cleanBus);
        if (st === 0) for (const iv of [0, 7]) A._bgmTone('square', mt(root + 24 + iv), t, 0.3, 0.07, A._cleanBus);
        // ツァンギーなリード
        if (chorus || bar === 4 || bar === 5) {
          const o = { oct: 24, type: 'square', type2: 'sawtooth', dur: 0.17, vol: 0.16, dest: A._cleanBus, vib: [6, 18], det: 1.003 };
          leadPat(bar % 2 === 0 ? T.patA : T.patB, st, root, th, t, o);
        }
        if (fillB && bar >= 8 && st >= 12) A._bgmTone('square', mt(root + 36 - (st - 12) * 2), t, 0.08, 0.1, A._cleanBus); // 下降グリス
      } },

    /* 2: スカパンク 175BPM G-C-G-D / Em-C-D: 裏打ちスカンク+ホーンのスタブ */
    { name: 'SKA PUNK', bpm: 175, swing: 0,
      chords: [[43, 4], [48, 4], [43, 4], [50, 4], [43, 4], [52, 3], [48, 4], [50, 4]],
      patH: [null, null, 7, null, 7, 9, null, 7, null, null, 5, null, 4, null, 2, null],
      patH2: [9, null, 7, null, 9, 10, 9, null, 7, null, 5, 7, null, 5, 4, null],
      play(s, t) {
        const T = A.tracks[2], bar = Math.floor(s / 16) % 16, st = s % 16, ch = A._chordOf(T, s), root = ch[0], th = ch[1];
        const chorus = bar >= 8, fillB = bar % 4 === 3 && st >= 12;
        if (st % 8 === 0) A._kick(t, 0.95, 155);
        if (st === 4 || st === 12 || (fillB && st > 12)) A._snare(t, 0.7);
        if (st % 2 === 0 && !fillB) A._hat(t, st % 8 === 6, 0.16);
        if (st === 0 && bar % 4 === 0) A._crashCym(t, 0.3);
        // オンビートのベース (ルート-5度-ルート-オクターブ)
        if (st % 4 === 0) {
          const off = [0, 7, 0, 12][(st / 4) % 4];
          A._bgmTone('triangle', mt(root + off), t, 0.13, 0.5);
          A._bgmTone('sawtooth', mt(root + off), t, 0.1, 0.12);
        }
        // 裏打ちスカンク(クリーンギター)
        if (st % 4 === 2) for (const iv of [0, th, 7]) A._bgmTone('square', mt(root + 12 + iv), t, 0.065, 0.2, A._cleanBus);
        // ホーン風ソーのスタブ
        if (chorus && (st === 2 || st === 6 || st === 10 || st === 13)) {
          for (const iv of [0, th, 7]) A._bgmTone('sawtooth', mt(root + 24 + iv), t, 0.1, 0.12, A._cleanBus);
        }
        // ホーンのメロディ
        if (chorus || bar >= 6) {
          const o = { oct: 24, type: 'sawtooth', type2: 'square', dur: 0.13, vol: 0.15, dest: A._cleanBus, vib: [5.5, 12], det: 1.006 };
          leadPat(bar % 2 === 0 ? T.patH : T.patH2, st, root, th, t, o);
        }
      } },

    /* 3: エレクトロ/ドラムンベース 170BPM Dm-Bb-F-C / Gm: ブレイクビーツ+リースベース(LFOフィルタ)+アルペジオ */
    { name: 'ELECTRO DNB', bpm: 170, swing: 0,
      chords: [[38, 3], [34, 4], [41, 4], [36, 4], [38, 3], [34, 4], [43, 3], [36, 4]],
      arp: [0, 2, 4, 2, 5, 4, 2, 4, 0, 2, 4, 7, 5, 4, 2, 0],
      arp2: [4, 5, 7, 5, 4, 2, 0, 2, 4, 5, 7, 9, 7, 5, 4, 2],
      lead: [9, null, null, 7, null, 5, null, 7, 9, null, null, 10, null, 9, 7, null],
      _reese(note, t, dur, vol) {
        const c = A.ctx, f = mt(note);
        const o1 = c.createOscillator(), o2 = c.createOscillator(); o1.type = 'sawtooth'; o2.type = 'sawtooth';
        o1.frequency.value = f; o2.frequency.value = f * 1.012; o2.detune.value = 7;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6; lp.frequency.value = 700;
        const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 4 + Math.random() * 3; lg.gain.value = 450;
        lfo.connect(lg); lg.connect(lp.frequency);
        const g = c.createGain(); A._env(g, t, 0.006, dur, vol);
        o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(A.bgmBus);
        o1.start(t); o2.start(t); lfo.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
      },
      play(s, t) {
        const T = A.tracks[3], bar = Math.floor(s / 16) % 16, st = s % 16, ch = A._chordOf(T, s), root = ch[0], th = ch[1];
        const spb = 60 / T.bpm / 4, drums = bar >= 2, bass = bar >= 4, full = bar >= 8, fillB = bar % 4 === 3 && st >= 12;
        if (drums) {
          if (st === 0 || st === 10 || (bar % 2 === 1 && st === 6) || (bar % 4 === 3 && st === 3)) A._kick(t, 0.95, 170);
          if (st === 4 || st === 12 || (fillB && st > 12)) A._snare(t, 0.7, 240);
          if (st === 7 || st === 15 || (st === 9 && bar % 2 === 1)) A._snare(t, 0.22, 260);
          A._hat(t, st === 14 && !fillB, st % 4 === 2 ? 0.2 : 0.1);
        }
        if (st === 0 && bar % 4 === 0 && bar > 0) A._crashCym(t, 0.3);
        // パッド
        if (st === 0) for (const iv of [0, th, 7]) A._bgmTone('sawtooth', mt(root + 12 + iv), t, spb * 16 * 0.95, 0.07, A._softBus);
        // リースベース
        if (bass) {
          if (st === 0 || st === 8) { T._reese(root, t, spb * 5.5, 0.34); A._bgmTone('sine', mt(root - 12), t, spb * 5.5, 0.35); }
          else if (st === 6) T._reese(root + (bar % 2 ? 12 : 0), t, spb * 1.8, 0.28);
          else if (st === 14 && full) T._reese(root + 7, t, spb * 1.8, 0.26);
        }
        // アルペジオ (16分)
        const pat = bar % 2 === 0 ? T.arp : T.arp2;
        A._bgmTone('square', mt(root + 24 + A._pent(pat[st], th)), t, 0.07, bar < 4 ? 0.11 : 0.08, A._cleanBus);
        // リード
        if (full) leadPat(T.lead, st, root, th, t, { oct: 36, type: 'sawtooth', type2: 'square', dur: 0.2, vol: 0.11, dest: A._cleanBus, vib: [5, 14], det: 1.005 });
      } },

    /* 4: ヘビーメタル/ハードロック ギャロップ 160BPM Em-F-Em-G: パームミュート16分ギャロップ+ダブルキック */
    { name: 'METAL GALLOP', bpm: 160, swing: 0,
      chords: [[40, 3], [41, 4], [40, 3], [43, 3], [40, 3], [41, 4], [38, 4], [43, 4]],
      lead: [12, null, null, null, 10, null, 8, null, 7, null, null, null, 5, null, 7, null],
      lead2: [14, null, 12, null, 10, null, 12, 10, 8, null, null, 7, null, null, 5, null],
      play(s, t) {
        const T = A.tracks[4], bar = Math.floor(s / 16) % 16, st = s % 16, ch = A._chordOf(T, s), root = ch[0], th = ch[1];
        const chorus = bar >= 8, gal = [0, 2, 3].indexOf(st % 4) >= 0, fillB = bar % 4 === 3 && st >= 12;
        const dbl = bar >= 4 && !fillB;
        if (st === 0 || st === 10 || (dbl && gal)) A._kick(t, dbl && gal && st !== 0 ? 0.8 : 1.0, 140);
        if (st === 4 || st === 12 || (fillB && st > 12)) A._snare(t, 0.8, 200);
        if (st % 2 === 0 && !fillB) A._hat(t, false, 0.17);
        if (st === 0 && bar % 4 === 0) A._crashCym(t, 0.4);
        // ベース・ギターのギャロップ
        if (gal) {
          const acc = st === 0;
          A._bgmTone('sawtooth', mt(root), t, acc ? 0.2 : 0.07, 0.34);
          A._bgmTone('sawtooth', mt(root + 12), t, acc ? 0.24 : 0.06, 0.5, A._guitarBus);
          A._bgmTone('sawtooth', mt(root + 19, 1.003), t, acc ? 0.24 : 0.06, 0.4, A._guitarBus);
        } else if (st % 8 === 4 && chorus) { // サビはスネアに合わせて開放パワーコード
          for (const iv of [0, 7, 12]) A._bgmTone('sawtooth', mt(root + 12 + iv), t, 0.2, 0.4, A._guitarBus);
        }
        // サビのリード(ビブラートつき長音)
        if (chorus) {
          leadPat(bar % 2 === 0 ? T.lead : T.lead2, st, root, th, t, { oct: 24, type: 'sawtooth', type2: 'square', dur: 0.26, vol: 0.14, dest: A._guitarBus, vib: [5.5, 25], det: 1.004 });
        }
      } },

    /* 5: ラテン/ディスコ・ファンク 138BPM Am-D-G-E7: 4つ打ち+オクターブベース+16分カッティング+ブラス */
    { name: 'DISCO FUNK', bpm: 138, swing: 0.1,
      chords: [[45, 3], [50, 4], [43, 4], [52, 3], [45, 3], [50, 4], [43, 4], [52, 4]],
      brass: [null, null, 7, null, null, null, 7, 9, null, null, 10, null, 9, null, 7, null],
      play(s, t) {
        const T = A.tracks[5], bar = Math.floor(s / 16) % 16, st = s % 16, ch = A._chordOf(T, s), root = ch[0], th = ch[1];
        const chorus = bar >= 8, fillB = bar % 4 === 3 && st >= 12;
        if (st % 4 === 0) A._kick(t, 0.95, 150);
        if (st === 4 || st === 12) A._clap(t, 0.55);
        if (fillB && st > 12) A._snare(t, 0.4, 230);
        if (st % 4 === 2) A._hat(t, true, 0.2); else if (st % 2 === 1) A._hat(t, false, 0.09);
        if (st === 0 && bar % 4 === 0) A._crashCym(t, 0.3);
        // コンガ/カウベル風
        if ([3, 6, 10, 14].indexOf(st) >= 0) A._bgmTone('square', st === 3 ? 820 : 640, t, 0.05, 0.07, A._cleanBus);
        // オクターブ・ベース (16分シンコペ)
        const bp = { 0: 0, 2: 12, 3: 0, 6: 12, 8: 0, 10: 12, 11: 0, 14: 12 }, bo = bp[st];
        if (bo !== undefined) A._bgmTone('sawtooth', mt(root + bo), t, 0.1, bo ? 0.26 : 0.34, A._cleanBus);
        // 16分のファンクカッティング
        if ([3, 6, 7, 10, 11, 14].indexOf(st) >= 0) for (const iv of [0, th, 7, 10]) A._bgmTone('square', mt(root + 12 + iv), t, 0.05, 0.1, A._cleanBus);
        // ストリングス風パッド
        if (st === 0) for (const iv of [0, th, 7]) A._bgmTone('sawtooth', mt(root + 24 + iv), t, 0.5, 0.05, A._softBus);
        // ブラス
        if (chorus) leadPat(T.brass, st, root, th, t, { oct: 24, type: 'sawtooth', type2: 'square', dur: 0.12, vol: 0.14, dest: A._cleanBus, vib: [5, 10], det: 1.007 });
      } },
  ];
})();
