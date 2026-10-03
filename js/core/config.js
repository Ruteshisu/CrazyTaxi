/* ゲーム全体の調整値。バランス調整・拡張はまずここを触る */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  CT.config = {
    title: 'ブッ飛びタクシー',
    world: {
      blocks: 7,          // 一辺のブロック数
      blockSize: 50,      // ブロック一辺(m) (歩道含む)
      roadWidth: 20,      // 道幅(m)
      sidewalk: 4,        // 歩道幅(m)
      seed: 20261003,
      fogNear: 120, fogFar: 520,
    },
    taxi: {
      maxSpeed: 34,       // m/s (約122km/h)
      boostSpeed: 46,
      engine: 26,         // 加速力
      brake: 50,
      reverseMax: 11,
      steerRate: 2.15,    // rad/s 最大旋回
      gripNormal: 9.5,    // 横滑りを消す強さ
      gripDrift: 1.5,     // ハンドブレーキ中
      radius: 1.15,       // 当たり判定円(前・中・後の3つ)
      length: 4.4, width: 2.1,
      boostDrain: 0.38, boostRecharge: 0.07, boostDriftGain: 0.22,
      gravity: 24,
      crashSpinTime: 0.85,   // 建物にぶつかった時のきりもみ回転時間
      crashKeepSpeed: 0.8,   // 衝突後に維持する速度の割合
      crashMinSpeed: 19,     // 衝突後の最低速度
    },
    camera: {
      dist: 7.2, height: 2.7, lookAhead: 4.5, lookHeight: 1.5, fov: 66, // 車体後方・低め・近め
    },
    traffic: { cars: 26, parked: 14, speed: [9, 15], laneOffset: 3.7, parkedOffset: 7.4 },
    ramps: { count: 16, length: 13, width: 8.5, height: 3.4, boost: 1.0, vyCap: 14 },
    ped: {
      count: 150,
      scale: 1.45,        // 人物の大きさ(1.0=約1.8m)
      groupSize: [3, 7],  // 人だかりの人数
      respawnTime: 7,     // 倒した後に別の場所へ補充される秒数
      walkSpeed: [1.5, 2.6],
      fleeSpeed: 6.5,
      panicDist: 16,      // 車がこの距離以内で逃げ/硬直
      freezeChance: 0.3,  // 逃げずに固まる確率
      hitHalfWidth: 1.75, // 車のOBB判定(右左)
      hitFront: 2.9, hitBack: 2.2,
    },
    ragdoll: {
      rigs: 44,           // 同時に残せる倒れた人数(古い/遠いものから消える)
      gravity: 17,
      damping: 0.997,
      iterations: 5,
      maxLife: 9,
    },
    score: {
      hit: 100,           // ヒット基本点
      speedBonusPerMs: 4, // 速度(m/s)あたりの加点
      comboWindow: 4.0,   // コンボ継続秒
      comboMax: 10,
      heightPoint: 14,    // ラグドール最高到達高さ(m)あたり
      jumpAirPoint: 220, jumpDistPoint: 14, // ジャンプ台: 滞空秒/飛距離あたり
      airPoint: 40,       // 滞空秒あたり
      wallBonus: 180,
      propHit: 60,
      driftRate: 0.5, driftMinTime: 0.7,
      speedRate: 18,      // 高速走行中の加点/秒
    },
    game: {
      startTime: 75,
      readyTime: 2.2,
      resultAutoReturn: 25, // 結果画面から自動でデモに戻る秒数
      hitStop: 0.11,        // ヒット時スローモーション秒(実時間)。コンボ3以上で発動
    },
    fare: {
      spots: 12,            // 同時に散らばる客の数
      pickupRadius: 7.5, dropRadius: 9, stopSpeed: 13,
      tiers: [ // 距離帯: 色 / 距離(m) / 基本料金 / 時間ボーナス基準
        { name: 'near', color: 0x38e060, dist: [90, 190], base: 180, time: 12 },
        { name: 'mid', color: 0xffd23a, dist: [190, 330], base: 380, time: 20 },
        { name: 'far', color: 0xff4b4b, dist: [330, 520], base: 700, time: 30 },
      ],
    },
    render: {
      maxPixelRatio: 2,
      fixedHeight: null,    // 数値を入れると内部描画高さを固定 (URLの ?h=720 でも可)
      shadows: false,
      aspect: 16 / 9,       // 基本は16:9(黒帯)。URLに ?fit=fill で窓いっぱい(可変)
      maxHeight: 1080,      // 内部描画の最大高さ
    },
  };
})();
