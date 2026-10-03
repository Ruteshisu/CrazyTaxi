# 公開用 index.html だけを「公開リポジトリ」に push するスクリプト (Windows PowerShell)
# 使い方:  プロジェクトのルートで  powershell -ExecutionPolicy Bypass -File tools\publish_pages.ps1
# 事前準備: GitHub に公開(Public)の空リポジトリ "crazytaxi-play" を作る (Settings > Pages で Branch: main / root を有効化)
#   -> 公開URL: https://ruteshisu.github.io/crazytaxi-play/
# ソース(このプロジェクト)は Private リポジトリのまま。公開側には dist/index.html (1ファイル) しか置かれない。
param([string]$Repo = "https://github.com/Ruteshisu/crazytaxi-play.git")
$ErrorActionPreference = "Stop"
python tools/build_dist.py
Push-Location dist
if (-not (Test-Path .git)) { git init -b main | Out-Null; git remote add origin $Repo }
git add -A
git commit -m "publish $(Get-Date -Format s)" 2>$null
git push -u origin main --force
Pop-Location
Write-Host "公開しました: https://ruteshisu.github.io/crazytaxi-play/"
