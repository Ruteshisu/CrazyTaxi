# 公開手順 (GitHub Pages)

要件: ソース(プロジェクト)は **Private**、遊べる `index.html` だけ **公開**。

GitHub Pages は **無料プランでは Public リポジトリでしか使えない**ため、次の2リポジトリ構成にする。

| リポジトリ | 公開範囲 | 中身 |
|---|---|---|
| `Ruteshisu/crazy-taxi` (任意名) | **Private** | このプロジェクト全体(js/css/docs/tools…) |
| `Ruteshisu/crazytaxi-play` | **Public** | `index.html` 1ファイルのみ (ビルド成果物) |

## 手順
1. GitHub で Private の `crazy-taxi` を作り、このフォルダを push (`git remote add origin ...` → `git push -u origin main`)
2. GitHub で Public の空リポジトリ `crazytaxi-play` を作る → Settings > Pages > Branch `main` / `/ (root)` を選択
3. `powershell -ExecutionPolicy Bypass -File tools\publish_pages.ps1`
   (内部で `python tools/build_dist.py` が `dist/index.html` を作り、`dist` だけを公開リポジトリへ push)
4. 数分後に https://ruteshisu.github.io/crazytaxi-play/ で遊べる
更新するたびに 3 を再実行。GitHub Pro 等で Private のまま Pages を使える場合は、Private リポジトリの `dist/` を公開しても良い。

## 注意
- three.js だけ cdnjs から読み込む(ネット接続が必要)。それ以外は `index.html` に全部入っている。
- 音は最初のキー入力後に鳴る(ブラウザ制限)。
