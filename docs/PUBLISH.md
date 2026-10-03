# 公開手順 (GitHub Pages / 全公開)

リポジトリ: https://github.com/Ruteshisu/CrazyTaxi (Public)

## どこをpushするか
**プロジェクトのルートフォルダ(`CrazyTaxi` フォルダ)ごと**全部pushします。
`index.html` を含むフォルダがリポジトリのルートになるのが大事です。

```
CrazyTaxi/            ← ここでgit操作
├─ index.html         ← 遊ぶ入口 (Pagesがこれを開く)
├─ css/  js/          ← ゲーム本体 (index.htmlから相対パスで読み込み)
├─ docs/  tools/      ← ドキュメント/開発ツール (あっても無害)
└─ .gitignore         (dist/ は除外)
```
ビルド不要。`dist/` や `tools/build_dist.py` は使いません(単一ファイル配布したい時用のおまけ)。

## コマンド (PowerShell / ターミナル、`CrazyTaxi` フォルダ内で)
```
git status
git branch            # 現在のブランチ名を確認 (main でなければ下の -M main で揃える)
git remote add origin https://github.com/Ruteshisu/CrazyTaxi.git
git branch -M main
git push -u origin main
```
`remote origin already exists` と出たら `git remote set-url origin https://github.com/Ruteshisu/CrazyTaxi.git`。
初回pushはブラウザでGitHubのログインが求められます。

## Pagesを有効化
1. GitHubのリポジトリ → Settings → Pages
2. Source: **Deploy from a branch** / Branch: **main** / Folder: **/ (root)** → Save
3. 1〜2分後に https://ruteshisu.github.io/CrazyTaxi/ で遊べる

## 更新するとき
`git add -A && git commit -m "..." && git push` だけ。数分でサイトに反映。

## 注意
- three.js だけ cdnjs から読み込む(ネット接続が必要)。それ以外は全部リポジトリ内。
- 音は最初のキー入力/タップ後に鳴る(ブラウザの制限)。
- スマホ(Android/iOS)は同じURLを開けばタッチ操作で遊べる (docs/CONTROLS.md 参照)。
