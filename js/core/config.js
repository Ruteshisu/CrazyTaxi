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
    },
    ped: {
      count: 80,
      walkSpeed: [1.5, 2.6],
      fleeSpeed: 6.5,
      panicDist: 16,      // 車がこの距離以内で逃げ/硬直
      freezeChance: 0.3,  // 逃げずに固まる確率
      hitHalfWidth: 1.45, // 車のOBB判定(右左)
      hitFront: 2.7, hitBack: 2.2,
      dizzyTime: 3.2,     // 吹っ飛んだ後ふらふらしてる時間
    },
    ragdoll: {
      rigs: 14,
      gravity: 15.5,
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
      airPoint: 60,       // 滞空秒あたり
      wallBonus: 180,
      propHit: 60,
      driftRate: 0.5, driftMinTime: 0.7,
      speedRate: 18,      // 高速走行中の加点/秒
    },
    game: {
      startTime: 75,
      readyTime: 2.2,
      resultAutoReturn: 25, // 結果画面から自動でデモに戻る秒数
      hitStop: 0.11,        // ヒット時スローモーション秒(実時間)
    },
    fare: {
      spots: 3,
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
    },
  };
})();
