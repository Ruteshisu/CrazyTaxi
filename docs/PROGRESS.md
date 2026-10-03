# 進捗メモ (経過と、同じ問題を踏まないための記録)

## 現状 (第1回完成)
- 街(7x7ブロック)・タクシー(ドリフト/ブースト)・通行人80人(逃げる/固まる/横断)・ラグドール(6種ギャグ吹っ飛び)
- 客配送(3色)・コンボ・得点・HUD・ミニマップ・結果画面・WebAudio合成のSE/BGM
- 起動直後からAIデモ(開幕に通行人の人だかり→客を拾う→配送→ドリフト)。任意キーでプレイ開始
- 外部アセットなし(three.js r128 CDNのみ)。全モデル/テクスチャ/音はコード生成

## 作業ログ (概略)
1. 計画(docs/PLAN.md) → 質疑: 作業場所/見た目/デモ構成/ルールを確認
2. core(util/config/input/audio) → models → world → taxi → ragdoll/ped → effects/score/fare/camera/hud → AI → game
3. 検証用に Artifact でホスティングして実ブラウザ確認 → 動作OK。細部調整

## ハマりどころ・再発しそうな件
- **クラウド環境から three.js(CDN/npm/pip)に届かない**: 外部通信が許可リスト制でブロック(cdnjs=403)。
  ローカルでのheadlessテストができず、時間がかかった。対処: 検証用ページを Artifact(cdnjs許可)として公開し、アプリ内ブラウザで確認。
  アプリ内ブラウザが claude.ai 未ログインだと開けない → ユーザーにログインしてもらう必要あり。
- **ES Modules不使用**: `file://` ダブルクリック起動で import が CORS で失敗するため、classic script + `window.CT` 名前空間にした。
- Artifact 内ではゲームが iframe になり、外側からJS実行できない。キー1回押し(短押し)しか送れないため、
  `tools/debug.js`(検証用ビルドのみ)でスロットル固定/ワープ等のデバッグキーを用意した。
- three.js r128 は `MeshLambertMaterial.flatShading` が無い等の差異あり。バージョンを上げる場合は色空間/ライト強度の見直しが必要(r155以降)。
- ポイントスプライトの大きさは「メートル単位の直径」で指定(`effects.js` の `resize`)。星/煙が大きすぎると画面を覆うので注意。

## 検証方法
`python3 tools/build_artifact.py /path/out.html --debug` で検証用断片を生成 → Artifactで公開(`files` に js 一式 + tools/debug.js)。
デバッグキー: 1=残り3秒 / 2,3=客・目的地近くへワープ / 4=アクセル固定 / 5=通行人を目の前へ / 画面下にステータス表示。
