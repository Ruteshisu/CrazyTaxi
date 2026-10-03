# ブッ飛びタクシー (BOING TAXI) 開発計画

## コンセプト
クレイジータクシー風の爽快ドライブ + 通行人をはねるとギャグ調ラグドールで吹っ飛び「芸術ポイント」が入る。
血や生々しさは一切なし。真上にロケット発射・星になる・目が点になる等のコミカル演出で「オイオイ(笑)」を狙う。

## 決定事項 (計画段階の質疑結果)
- 作業: クラウドで開発しgit管理 → 節目と最後に C:\Users\nanan\Project\CrazyTaxi へ書き戻し
- 見た目: three.js(CDN r128)によるローポリ3D・オープンワールド風。モデル/テクスチャ/音は全てコードで生成
- デモ: 起動直後からAI運転。開幕で通行人を吹っ飛ばす→客を拾って配送→ドリフト(約30〜40秒で1ループ)。任意キーで即プレイヤー操作
- ルール: 制限時間つき。客を送ると時間延長 + 芸術ポイント自由加算(コンボ倍率)

## アーキテクチャ (再利用・拡張しやすさ重視)
- `file://` でダブルクリックして動くよう **ES Modulesを使わず**、`window.CT` 名前空間 + 通常scriptタグ(読込順は index.html)
- 疎結合: `CT.bus`(イベントバス)で ped:hit / ped:land / crash / pickup / deliver 等を配信。スコア・音・演出・HUDが各自購読
- 設定値は `CT.config` に集約 (マップサイズ・物理・得点)。解像度は固定せずウィンドウサイズ追従(`?h=720` で内部描画高さ指定可)
```
index.html
css/style.css          HUD/タイトル/結果のCSS (vmin基準で解像度非依存)
js/core/               util(数学・乱数・bus) config input audio(WebAudio合成)
js/models/models.js    タクシー・人間・ラグドール部品・小物のメッシュ生成(全て手続き生成)
js/world/city.js       街生成(道路/歩道/建物/公園/看板/当たり判定/経路用交差点)
js/entities/           taxi(車両物理) ragdoll(Verlet) pedestrian props(吹っ飛ぶ小物)
js/systems/            effects(粒子/タイヤ痕) score fare camera
js/ai/driver.js        自動運転(デモ)
js/ui/hud.js           HUD/ポップアップ/ミニマップ
js/game.js, main.js    ステートマシン(attract/playing/result)・起動
docs/                  PLAN / CONTROLS / PROGRESS / NOTES
tools/                 検証用スクリプト
```

## 作業ステップ
1. 土台(core) → 2. 街・タクシー → 3. 通行人+ラグドール+得点 → 4. 客配送・HUD → 5. AIデモ → 6. ブラウザ検証/修正 → 7. 書き戻し・報告
各ステップ終了ごとに git commit。
