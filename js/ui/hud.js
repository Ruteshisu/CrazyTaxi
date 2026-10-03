/* HUD: DOMオーバーレイ(時間/得点/コンボ/方向矢印/速度/ミニマップ/ポップアップ/バナー/客のセリフ)。
   サイズ指定は vmin 基準(CSS側)なので解像度に依存しない */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  const U = CT.util;
  const $ = (id) => document.getElementById(id);

  const CUSTOMER_LINES = {
    hit: ['オイオイ!', 'オイオイオイ!!', 'うわっ飛んだ!', 'いまの大丈夫!?', 'やりすぎでは…?', 'ナイスぅ〜!', 'ええっ!?', '見なかったことにしよう'],
    drift: ['ひぃぃぃ!', 'ドリフトぉぉ!', 'うおおお!'],
    pickup: ['お願いしまーす!', '急いでね!', 'ブッ飛ばして!'],
    crash: ['いてっ!', '壁はやめて〜'],
    deliver: ['ありがとう!', 'スリル満点!', 'またお願い!'],
  };

  const HUD = (CT.HUD = {
    popups: [], chatT: 0, lastChat: 0,
    init(camera) {
      this.cam = camera;
      this.el = { time: $('timeVal'), art: $('artVal'), fare: $('fareVal'), comboBox: $('combo'), comboNum: $('comboNum'), mult: $('multVal'), comboBar: $('comboBar'),
        arrow: $('arrow'), arrowDist: $('arrowDist'), arrowWrap: $('arrowWrap'), speed: $('speedVal'), boost: $('boostBar'), popups: $('popups'), banner: $('banner'),
        chat: $('chat'), skyMark: $('skyMark'), speedlines: $('speedlines'), title: $('title'), result: $('result'), hud: $('hud'), mini: $('minimap'), timeBox: $('time'), driftBox: $('driftBox'), driftVal: $('driftVal') };
      this._bind();
    },
    _bind() {
      const bus = CT.bus;
      bus.on('art:add', (e) => this.onArt(e));
      bus.on('pickup', (e) => { this.banner('お客さんGET! 目的地へ!', 'good', 1800); this.say('pickup'); });
      bus.on('deliver', (e) => {
        this.banner(e.rating + '  +' + (e.money + e.tip).toLocaleString() + '円  +' + e.timeBonus + '秒', 'gold', 2600);
        this.pop3d('+' + e.timeBonus + 's', e.x, 4, e.z, 'pop-time');
        this.say('deliver');
      });
      bus.on('ped:hit', (e) => { this.say('hit', 0.55); if ((e.level || 0) >= 3) this.flash(); });
      bus.on('crash', (e) => { if (e.power > 0.35) this.say('crash', 0.6); });
      bus.on('ped:apex', (e) => this.pop3d('キラーン☆', e.x, e.y, e.z, 'pop-star'));
    },
    flash() { const f = document.getElementById('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); },
    setMode(m) {
      document.body.dataset.mode = m;
    },
    onArt(e) {
      if (e.x === undefined) return;
      const cls = { hit: 'pop-hit lv' + (e.level || 0), jump: 'pop-jump', car: 'pop-car', land: 'pop-land', wall: 'pop-wall', drift: 'pop-drift', speed: 'pop-small', prop: 'pop-small' }[e.kind] || 'pop-small';
      let txt = e.label;
      if (e.kind === 'hit') txt = e.label + ' +' + e.pts + (e.mult > 1 ? ' ×' + e.mult : '');
      else txt = e.label + ' +' + e.pts;
      this.pop3d(txt, e.x, e.y, e.z, cls);
    },
    /** ワールド座標に追従するポップアップ */
    pop3d(text, x, y, z, cls) {
      if (this.popups.length > 16) { const o = this.popups.shift(); o.el.remove(); }
      const el = document.createElement('div'); el.className = 'pop ' + (cls || ''); el.textContent = text;
      el.style.setProperty('--rot', U.rand(-7, 7).toFixed(1) + 'deg');
      this.el.popups.appendChild(el);
      const o = { el, x, y, z, t: 0, life: cls === 'pop-small' ? 1.1 : 1.9 };
      this.popups.push(o); this._place(o);
    },
    _place(o) {
      const v = this._v = this._v || new THREE.Vector3();
      v.set(o.x, o.y + o.t * 2.4, o.z).project(this.cam);
      if (v.z > 1) { o.el.style.display = 'none'; return; }
      o.el.style.display = '';
      o.el.style.left = ((v.x * 0.5 + 0.5) * 100) + '%'; o.el.style.top = ((-v.y * 0.5 + 0.5) * 100) + '%';
    },
    banner(text, cls, ms) {
      const b = this.el.banner; b.textContent = text; b.className = 'show ' + (cls || '');
      clearTimeout(this._bt); this._bt = setTimeout(() => { b.className = ''; }, ms || 1500);
    },
    say(kind, prob) {
      if (document.body.dataset.mode === 'result') return;
      if (prob !== undefined && Math.random() > prob) return;
      const now = performance.now(); if (now - this.lastChat < 1400) return; this.lastChat = now;
      const c = this.el.chat; c.textContent = U.pick(CUSTOMER_LINES[kind]); c.className = 'show';
      clearTimeout(this._ct); this._ct = setTimeout(() => { c.className = ''; }, 1700);
    },
    showResult(d) {
      this.el.result.innerHTML =
        '<div class="rbox"><div class="rtitle">TIME UP!</div>' +
        '<div class="rrank">' + d.rank + '</div>' +
        '<div class="rrow"><span>芸術ポイント</span><b>' + d.art.toLocaleString() + '</b></div>' +
        '<div class="rrow"><span>料金</span><b>¥' + d.money.toLocaleString() + '</b></div>' +
        '<div class="rrow big"><span>TOTAL</span><b>' + d.total.toLocaleString() + '</b></div>' +
        '<div class="rsub">吹っ飛ばし ' + d.hits + '人 / 最大コンボ ' + d.maxCombo + ' / 最高到達 ' + Math.round(d.bestHeight) + 'm / 配送 ' + d.deliveries + '件</div>' +
        '<div class="rhint">ENTER / SPACE でもう一度</div></div>';
    },

    /** 毎フレーム */
    update(dt, s) {
      const e = this.el;
      e.time.textContent = Math.max(0, s.time).toFixed(1);
      e.timeBox.classList.toggle('warn', s.time < 10 && s.mode === 'play');
      e.art.textContent = Math.round(s.score.art).toLocaleString();
      e.fare.textContent = Math.round(s.score.money).toLocaleString();
      const cb = s.score;
      if (cb.combo > 1) { e.comboBox.classList.add('on'); e.comboNum.textContent = cb.combo; e.mult.textContent = '×' + cb.mult; e.comboBar.style.width = (cb.comboTimer / CT.config.score.comboWindow * 100) + '%'; }
      else e.comboBox.classList.remove('on');
      e.speed.textContent = Math.round(s.taxi.totalSpeed * 3.6);
      e.boost.style.width = (s.taxi.boost * 100) + '%';
      e.speedlines.style.opacity = U.clamp((s.taxi.totalSpeed - 24) / 16, 0, 0.85);
      if (s.score.driftNow > 20) { e.driftBox.classList.add('on'); e.driftVal.textContent = Math.round(s.score.driftNow); } else e.driftBox.classList.remove('on');
      // 方向矢印
      const t = s.target;
      if (t) {
        const dx = t.x - s.taxi.x, dz = t.z - s.taxi.z, d = Math.hypot(dx, dz);
        const camAng = s.camAngle;
        // 画面上の向き: カメラ前方に対する相対角
        const a = Math.atan2(dx, dz) - camAng;
        e.arrow.style.transform = 'rotate(' + (-a * 180 / Math.PI) + 'deg)';
        e.arrow.style.borderBottomColor = '#' + ('000000' + t.color.toString(16)).slice(-6);
        e.arrowDist.textContent = (t.kind === 'dest' ? '目的地 ' : 'お客さん ') + Math.round(d) + 'm';
        e.arrowWrap.style.display = '';
      } else e.arrowWrap.style.display = 'none';
      // ポップアップ追従
      for (let i = this.popups.length - 1; i >= 0; i--) {
        const o = this.popups[i]; o.t += dt;
        if (o.t > o.life) { o.el.remove(); this.popups.splice(i, 1); continue; }
        this._place(o);
      }
      // 画面外(上空)の通行人マーカー
      const hi = s.highRig;
      if (hi && hi.y > 6) {
        const v = this._v2 = this._v2 || new THREE.Vector3(); v.set(hi.x, hi.y, hi.z).project(this.cam);
        if (v.y > 0.92 && v.z < 1) { e.skyMark.style.display = 'block'; e.skyMark.style.left = U.clamp((v.x * 0.5 + 0.5) * 100, 5, 95) + '%'; e.skyMark.textContent = '↑ ' + Math.round(hi.y) + 'm'; }
        else e.skyMark.style.display = 'none';
      } else e.skyMark.style.display = 'none';
      this.drawMinimap(s);
    },

    /* ---- ミニマップ ---- */
    initMinimap(world) {
      this.world = world;
      const c = this.el.mini, S = c.width = c.height = 256; this.mctx = c.getContext('2d');
      const bg = (this.mbg = document.createElement('canvas')); bg.width = bg.height = S;
      const g = bg.getContext('2d'), ext = world.half + world.R / 2 + 4, k = S / (2 * ext);
      this.mk = k; this.mext = ext;
      g.fillStyle = '#1b2433'; g.fillRect(0, 0, S, S);
      for (const b of world.blocks) {
        g.fillStyle = b.type === 'park' ? '#3b8c4c' : '#4a566b';
        g.fillRect((b.cx - world.B / 2 + ext) * k, (b.cz - world.B / 2 + ext) * k, world.B * k, world.B * k);
      }
    },
    drawMinimap(s) {
      if (!this.mctx) return;
      const g = this.mctx, S = 256, k = this.mk, ext = this.mext, X = (x) => (x + ext) * k;
      g.drawImage(this.mbg, 0, 0);
      const t = s.target;
      if (s.fare) {
        for (const sp of s.fare.spots) { g.fillStyle = '#' + ('000000' + sp.tier.color.toString(16)).slice(-6); g.beginPath(); g.arc(X(sp.x), X(sp.z), 5, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); }
        if (s.fare.dest) { g.fillStyle = '#fff'; g.beginPath(); g.arc(X(s.fare.dest.x), X(s.fare.dest.z), 7, 0, 7); g.fill(); g.fillStyle = '#' + ('000000' + s.fare.current.tier.color.toString(16)).slice(-6); g.beginPath(); g.arc(X(s.fare.dest.x), X(s.fare.dest.z), 4.5, 0, 7); g.fill(); }
      }
      // タクシー
      const tx = X(s.taxi.x), tz = X(s.taxi.z);
      g.save(); g.translate(tx, tz); g.rotate(-s.taxi.h);
      g.fillStyle = '#ffd400'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 9); g.lineTo(-6, -7); g.lineTo(6, -7); g.closePath(); g.fill(); g.stroke(); g.restore();
      void t;
    },
  });
})();
