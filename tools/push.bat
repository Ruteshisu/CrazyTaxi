@echo off
rem CrazyTaxi を GitHub へ push する (ダブルクリックで実行)。コミットは Claude が作業ごとに済ませてあります
cd /d %~dp0..
git status -sb
git push -u origin main
pause
