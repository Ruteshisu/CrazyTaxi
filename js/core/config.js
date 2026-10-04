/* ゲーム全体の調整値。バランス調整・拡張はまずここを触る */
(function () {
  'use strict';
  const CT = (window.CT = window.CT || {});
  CT.config = {
    title: 'ブッ飛びタクシー',
    world: {
      blocks: 11,         // 一辺のブロック数
      blockSize: 50,      // ブロック一辺(m) (歩道含む)
      roadWidth: 20,      // 道幅(m)
      sidewalk: 4,        // 歩道幅(m)
      seed: 20261003,
      fogNear: 170, fogFar: 760,
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
      crashSpinMin: 13,      // 壁への法線方向速度(m/s)がこれ未満の衝突は回転せず滑る (ゆっくりぶつけても飛ばない)
    },
    camera: {
      dist: 4.1, height: 1.8, lookAhead: 3.0, lookHeight: 1.2, fov: 60, // 車体後方・低め・近め
    },
    traffic: { cars: 40, parked: 24, speed: [9, 15], laneOffset: 3.7, parkedOffset: 7.4 },
    ramps: { count: 26, length: 13, width: 8.5, height: 3.4, boost: 1.0, vyCap: 14 },
    ped: {
      count: 320,         // 街中の通行人 (別に公園へ群衆が入る)
      scale: 1.0,         // 人物の大きさ(1.0=約1.8m)
      groupSize: [4, 9],  // 人だかりの人数 (ほぼ全員グループで歩く)
      parkCrowd: 96,      // 中央の大きな公園の人数 (ボーナスステージ)
      parkCrowdSmall: 24, // その他の公園の人数
      cullDist: 190,      // これより遠い通行人は描画/アニメを止める
      respawnTime: 7,     // 倒した後に別の場所へ補充される秒数
      walkSpeed: [1.5, 2.6],
      fleeSpeed: 6.5,
      panicDist: 16,      // 車がこの距離以内で逃げ/硬直
      freezeChance: 0.3,  // 逃げずに固まる確率
      hitHalfWidth: 1.75, // 車のOBB判定(右左)
      hitFront: 2.9, hitBack: 2.2,
    },
    ragdoll: {
      rigs: 56,           // 同時に残せる倒れた人数(古い/遠いものから消える)
      gravity: 17,
      damping: 0.997,
      iterations: 5,
      maxLife: 9,
      vanishDist: 120,    // 倒れた人が車からこの距離より離れたら消える
    },
    score: {
      hit: 100,           // ヒット基本点
      speedBonusPerMs: 4, // 速度(m/s)あたりの加点
      comboWindow: 4.0,   // コンボ継続秒
      comboMax: 10,
      flyDistPoint: 12,   // 飛距離(m)あたり
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
      bgmSteps: [5000, 15000, 30000, 50000, 75000], // 超えた状態で客を乗せるとBGM切替(曲0→1→2…)
      hitStop: 0.11,        // ヒット時スローモーション秒(実時間)。コンボ3以上で発動
    },
    fare: {
      spots: 16,            // 同時に散らばる客の数
      pickupRadius: 11, dropRadius: 17, stopSpeed: 13, // 輪に入ると自動で急ブレーキ→乗降
      tiers: [ // 距離帯: 色 / 距離(m) / 基本料金 / 時間ボーナス基準
        { name: 'near', color: 0x38e060, dist: [110, 230], base: 180, time: 12 },
        { name: 'mid', color: 0xffd23a, dist: [230, 430], base: 380, time: 20 },
        { name: 'far', color: 0xff4b4b, dist: [430, 720], base: 700, time: 30 },
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
