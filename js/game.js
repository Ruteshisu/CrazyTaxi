/* ゲーム本体: 初期化・ステートマシン(attract=デモ / ready / play / result)・メインループ */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const U = CT.util, cfg = () => CT.config;

  class Game {
    constructor(canvas) {
      this.canvas = canvas; this.mode = 'attract'; this.time = 0; this.playTime = 0; this.paused = false;
      this.slowT = 0; this.demoT = 0; this.resultT = 0; this.readyT = 0; this.lastCount = -1; this.fpsAcc = 0; this.fpsN = 0;
      const THREE = window.THREE;
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 1800);
      this.world = new CT.World(this.scene);
      this.taxi = new CT.Taxi(this.scene);
      this.pool = new CT.RagdollPool(this.scene, cfg().ragdoll.rigs);
      this.peds = new CT.Pedestrians(this.scene, this.world, this.pool);
      this.props = new CT.Props(this.scene, this.world, 170);
      this.traffic = new CT.Traffic(this.scene, this.world);
      this.fx = new CT.Effects(this.scene, this.camera);
      this.score = new CT.Score();
      this.fare = new CT.Fare(this.scene, this.world);
      this.cam = new CT.ChaseCamera(this.camera, this.world);
      this.driver = new CT.Driver(this);
      CT.HUD.init(this.camera); CT.HUD.initMinimap(this.world);
      this._bind();
      this.resize(); window.addEventListener('resize', () => this.resize());
      if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(document.documentElement);
      this.startDemo();
    }

    /** 画面は基本 16:9 固定(余白は黒帯)。URL ?fit=fill なら窓いっぱいの可変サイズ。
        内部描画解像度 = 表示サイズ × devicePixelRatio (上限 maxPixelRatio / 高さ maxHeight) */
    resize() {
      const W = window.innerWidth, H = window.innerHeight, c = cfg().render, stage = document.getElementById('stage');
      let sw = W, sh = H;
      if (U.qs('fit') !== 'fill') { if (W / H > c.aspect) { sh = H; sw = Math.round(H * c.aspect); } else { sw = W; sh = Math.round(W / c.aspect); } }
      stage.style.left = Math.round((W - sw) / 2) + 'px'; stage.style.top = Math.round((H - sh) / 2) + 'px';
      stage.style.width = sw + 'px'; stage.style.height = sh + 'px';
      stage.style.setProperty('--u', (Math.min(sw, sh) / 100).toFixed(3) + 'px');
      const fixed = parseInt(U.qs('h') || c.fixedHeight || 0, 10);
      let pr = Math.min(window.devicePixelRatio || 1, c.maxPixelRatio);
      if (fixed) pr = fixed / sh; else if (sh * pr > c.maxHeight) pr = c.maxHeight / sh;
      this.renderer.setPixelRatio(pr); this.renderer.setSize(sw, sh, false);
      this.camera.aspect = sw / sh; this.camera.updateProjectionMatrix();
      this.fx.resize(sh, pr);
    }

    _bind() {
      const bus = CT.bus;
      bus.on('key:down', (code) => this.onKey(code));
      // スローモーションはコンボ3以上の時だけ (1発目はテンポよく)
      bus.on('ped:hit', (e) => { if (e.speed > 7 && this.score.combo >= 3 && this.mode !== 'result') this.slowT = cfg().game.hitStop * (1 + (e.level || 0) * 0.5); });
      // 一定点数を超えた状態でお客さんを乗せるとBGMが切り替わる
      bus.on('pickup', () => {
        if (this.mode !== 'play') return;
        const n = cfg().game.bgmSteps.filter((v) => this.score.total >= v).length;
        if (n > (this.bgmLevel || 0)) { this.bgmLevel = n; CT.Audio.setTrack(n % CT.Audio.tracks.length); }
      });
      bus.on('deliver', (e) => {
        if (this.mode === 'play') this.time += e.timeBonus;
        this.score.deliveries++;
        if (this.mode === 'attract') this.demoEndT = 3.2;
      });
    }

    onKey(code) {
      if (code === 'KeyM') { CT.Audio.init(); CT.Audio.toggleMute(); return; }
      if (code === 'KeyP' && (this.mode === 'play')) { this.paused = !this.paused; return; }
      if (code === 'KeyF') { const f = document.getElementById('fps'); f.style.display = f.style.display === 'block' ? 'none' : 'block'; return; }
      if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'ControlLeft' || code === 'MetaLeft' || code === 'AltLeft') return;
      if (this.mode === 'attract') { CT.Audio.init(); CT.Audio.startBgm(); this.startGame(); return; }
      if (this.mode === 'result' && this.resultT > 1.2 && (code === 'Enter' || code === 'Space' || code === 'NumpadEnter' || code === 'Touch')) { this.startGame(); return; }
      if (code === 'KeyH') CT.bus.emit('horn');
      if (code === 'KeyR' && this.mode === 'play') this.startGame();
      if (code === 'Escape' && (this.mode === 'play' || this.mode === 'result')) this.startDemo();
    }

    /* ---------- シーン準備 (デモ/本番共通) ---------- */
    setupScene() {
      const W = this.world;
      this.pool.clear(); this.fx.clear(); this.props.reset();
      const bi = 4, bj = 5; // 人だかりを作るブロック(道路側の辺)
      const x0 = W.blockCenter(bi) - 120, z0 = W.lineZ(5);
      this.taxi.reset(x0, z0, Math.PI / 2);
      this.peds.reset();
      const crowd = this.peds.list.slice(0, 12);
      crowd.forEach((p, n) => this.peds.placeAt(p, bi, bj, 0, 0.1 + 0.8 * (n / crowd.length) + U.rand(-0.02, 0.02), n % 2 ? 2.2 : -1.3));
      this.score.reset(); this.fare.reset(this.taxi); this.traffic.reset(this.taxi);
      this.cam.snap(this.taxi);
      this.slowT = 0;
    }

    startDemo() {
      this.mode = 'attract'; this.setupScene(); this.driver.reset();
      this.demoT = 0; this.demoEndT = 0; this.time = 999; this.playTime = 0;
      CT.HUD.setMode('attract'); CT.bus.emit('mode', 'attract');
    }
    startGame() {
      this.mode = 'ready'; this.setupScene(); this.bgmLevel = 0; if (CT.Audio.bgmOn) CT.Audio.setTrack(0);
      this.score.reset(); this.time = cfg().game.startTime; this.playTime = 0;
      this.readyT = cfg().game.readyTime; this.lastCount = -1;
      CT.HUD.setMode('play'); CT.bus.emit('mode', 'play');
    }
    endGame() {
      this.mode = 'result'; this.resultT = 0;
      const s = this.score, t = s.total;
      const ranks = [[110000, 'S 伝説の運転手'], [65000, 'A 敏腕ドライバー'], [32000, 'B 腕利き'], [12000, 'C 見習い']];
      const rank = (ranks.find((r) => t >= r[0]) || [0, 'D ペーパー運転手'])[1];
      CT.HUD.showResult({ rank, art: Math.round(s.art), money: Math.round(s.money), total: t, hits: s.hits, maxCombo: s.maxCombo, bestHeight: s.bestHeight, deliveries: s.deliveries });
      CT.HUD.setMode('result'); CT.bus.emit('game:timeup'); this.fare.hideArrow();
    }

    /* ---------- メインループ ---------- */
    start() {
      this.last = performance.now();
      const loop = (now) => { requestAnimationFrame(loop); this.frame(now); };
      requestAnimationFrame(loop);
    }
    frame(now) {
      const real = U.clamp((now - this.last) / 1000, 0.0001, 0.05); this.last = now;
      if (this.paused) { this.render(); return; }
      let dt = real;
      if (this.slowT > 0) { this.slowT -= real; dt *= 0.22; }
      this.update(dt, real);
      this.render();
      this.fpsAcc += real; this.fpsN++;
      if (this.fpsAcc > 0.5) { const f = document.getElementById('fps'); if (f.style.display === 'block') f.textContent = Math.round(this.fpsN / this.fpsAcc) + ' fps  ped:' + this.peds.list.length + ' rig:' + this.pool.activeCount; this.fpsAcc = 0; this.fpsN = 0; }
    }

    update(dt, real) {
      const taxi = this.taxi;
      let ctl;
      if (this.mode === 'attract') {
        ctl = this.driver.update(dt);
        this.demoT += real;
        if (this.demoEndT > 0) { this.demoEndT -= real; if (this.demoEndT <= 0) { this.startDemo(); return; } }
        else if (this.demoT > 75) { this.startDemo(); return; }
      } else if (this.mode === 'play') {
        ctl = CT.Input.getControls(dt);
        if (!this.fare.busy) { this.time -= real; this.playTime += real; }
        if (this.time <= 0) { this.time = 0; this.endGame(); }
      } else if (this.mode === 'ready') {
        CT.Input.getControls(dt); ctl = { throttle: 0, steer: 0, handbrake: false, boost: false };
        this.readyT -= real;
        const n = Math.ceil(this.readyT / (cfg().game.readyTime / 3));
        if (n !== this.lastCount && this.readyT > 0) { this.lastCount = n; CT.HUD.banner('READY', 'ready', 600); CT.Audio.tick(); }
        if (this.readyT <= 0) { this.mode = 'play'; CT.HUD.banner('GO!!', 'ready', 900); CT.Audio.go(); }
      } else { // result: 惰性で停止
        ctl = { throttle: 0, steer: 0, handbrake: false, boost: false }; this.resultT += real;
        if (taxi.totalSpeed > 1) ctl.throttle = -1;
        if (this.resultT > cfg().game.resultAutoReturn) { this.startDemo(); return; }
      }
      taxi.passengerOn = this.fare.onboard || (this.fare.cap && this.fare.cap.kind === 'drop');
      taxi.update(dt, ctl, this.world);
      this.peds.update(dt, taxi, this);
      this.world.update(dt);
      this.props.update(dt, taxi);
      this.traffic.update(dt, taxi);
      this.pool.focus.x = taxi.x; this.pool.focus.z = taxi.z;
      this.pool.update(dt, this.world);
      if (this.mode !== 'result') { this.fare.update(dt, taxi, this); this.score.enabled = true; } else this.score.enabled = false;
      this.score.update(dt, taxi);
      this.fx.update(dt, taxi, this.pool, this.mode !== 'result');
      this.cam.update(dt, taxi);
      CT.Audio.updateDrive(taxi.totalSpeed / cfg().taxi.maxSpeed, ctl.throttle, taxi.drifting ? Math.min(1, taxi.slip / 8) : (ctl.throttle < 0 && taxi.speed > 12 ? 0.6 : 0), this.mode === 'play' || this.mode === 'attract');
      // HUD
      let high = null; for (const r of this.pool.rigs) if (r.active && (!high || r.y > high.y)) high = r;
      CT.HUD.update(real, { time: this.time, mode: this.mode === 'play' || this.mode === 'ready' ? 'play' : this.mode, score: this.score, taxi, target: this.fare.target(taxi), fare: this.fare, camAngle: this.cam.angle, highRig: high });
      for (const a of this._worldAnims || []) a(dt);
    }

    render() { this.renderer.render(this.scene, this.camera); }
  }

  CT.Game = Game;
})();
