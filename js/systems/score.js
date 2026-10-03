/* 得点管理: 芸術ポイント(art) + 料金(money)。コンボ倍率・着地ボーナス・ドリフト/スピード加点。
   加点は必ず CT.bus 'art:add' を発行 → HUD/音が反応する */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});

  class Score {
    constructor() {
      this.cfg = CT.config.score;
      this.reset();
      const bus = CT.bus;
      bus.on('ped:hit', (e) => this.onHit(e));
      bus.on('ped:land', (e) => this.onLand(e));
      bus.on('ped:wall', (e) => this.onWall(e));
      bus.on('prop:hit', (e) => this.onProp(e));
      bus.on('jump:land', (e) => this.onJump(e));
      bus.on('deliver', (e) => { this.money += e.money + e.tip; });
    }
    reset() {
      this.art = 0; this.money = 0; this.combo = 0; this.comboTimer = 0; this.maxCombo = 0;
      this.hits = 0; this.bestHeight = 0; this.bestHit = 0; this.deliveries = 0;
      this._driftAcc = 0; this._wasDrifting = false; this._speedAcc = 0; this._speedT = 0;
      this.enabled = true;
    }
    get total() { return Math.round(this.art + this.money); }
    get mult() { return Math.min(this.cfg.comboMax, Math.max(1, this.combo)); }

    add(pts, o) {
      if (!this.enabled) return;
      pts = Math.round(pts); this.art += pts;
      CT.bus.emit('art:add', Object.assign({ pts, combo: this.combo, mult: this.mult }, o));
    }
    onHit(e) {
      if (!this.enabled) return;
      this.combo++; this.comboTimer = this.cfg.comboWindow; this.hits++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const mult = this.mult;
      e.mult = mult;
      const pts = (this.cfg.hit + e.speed * this.cfg.speedBonusPerMs) * mult * e.gag.mult;
      this.bestHit = Math.max(this.bestHit, pts);
      this.add(pts, { kind: 'hit', label: e.gag.label, x: e.x, y: 2.2, z: e.z, big: true, gag: e.gag.id, level: e.level || 0 });
      CT.bus.emit('combo', { combo: this.combo, mult });
    }
    onLand(e) {
      if (!this.enabled) return;
      const mult = 1 + (((e.info && e.info.mult) || 1) - 1) * 0.4;
      this.bestHeight = Math.max(this.bestHeight, e.peak);
      const pts = (e.peak * this.cfg.heightPoint + e.air * this.cfg.airPoint) * mult;
      if (pts < 60) return;
      const lbl = e.peak > 22 ? '大気圏突破!' : e.peak > 14 ? 'ナイスなアート!' : e.peak > 7 ? 'まあまあアート' : 'ちょい跳ね';
      this.add(pts, { kind: 'land', label: lbl + ' ' + Math.round(e.peak) + 'm', x: e.x, y: 1.5, z: e.z });
    }
    onWall(e) {
      if (!this.enabled) return;
      this.add(this.cfg.wallBonus * ((e.info && e.info.mult) || 1) * 0.6, { kind: 'wall', label: '壁ドン!', x: e.x, y: e.y + 1, z: e.z });
    }
    onProp(e) { if (this.enabled) this.add(this.cfg.propHit * (e.pts || 1) * Math.max(1, this.mult * 0.5), { kind: e.big ? 'car' : 'prop', label: e.label || 'ガシャーン', x: e.x, y: 2, z: e.z }); }
    onJump(e) {
      if (!this.enabled) return;
      const pts = (e.air * this.cfg.jumpAirPoint + e.dist * this.cfg.jumpDistPoint) * Math.max(1, this.mult * 0.5);
      const lbl = e.dist > 30 ? 'ジャンプ大成功!' : e.dist > 18 ? 'ナイスジャンプ!' : 'ジャンプ!';
      this.add(pts, { kind: 'jump', label: lbl + ' ' + Math.round(e.dist) + 'm', x: e.x, y: 3, z: e.z });
    }

    update(dt, taxi) {
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) { CT.bus.emit('combo:end', { combo: this.combo }); this.combo = 0; }
      }
      if (!this.enabled) return;
      // ドリフト
      if (taxi.drifting) {
        this._driftAcc += dt * taxi.slip * Math.abs(taxi.speed) * this.cfg.driftRate;
        this._wasDrifting = true;
      } else if (this._wasDrifting) {
        this._wasDrifting = false;
        if (this._driftAcc > 40) this.add(this._driftAcc, { kind: 'drift', label: 'DRIFT!', x: taxi.x, y: 2.8, z: taxi.z });
        this._driftAcc = 0;
      }
      // 高速走行
      if (taxi.speed > CT.config.taxi.maxSpeed * 0.82 && taxi.y < 0.3) {
        this._speedAcc += dt * this.cfg.speedRate; this._speedT += dt;
        if (this._speedT > 1.5) {
          this.add(this._speedAcc, { kind: 'speed', label: 'SPEED', x: taxi.x, y: 3.2, z: taxi.z });
          this._speedAcc = 0; this._speedT = 0;
        }
      } else { this._speedT = Math.max(0, this._speedT - dt); }
    }
    get driftNow() { return this._wasDrifting ? this._driftAcc : 0; }
  }
  CT.Score = Score;
})();
