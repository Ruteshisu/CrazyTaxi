#!/usr/bin/env python3
"""index.html から、Artifact(検証用ホスティング)向けの断片 HTML を生成する。
 - CSSをインライン化、<html>/<head>/<body>を除去、タイトルを付与
 - jsファイルはそのまま相対パスで公開する(files指定)"""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root/'index.html').read_text(encoding='utf-8')
css = (root/'css/style.css').read_text(encoding='utf-8')
body = re.search(r'<body[^>]*>(.*)</body>', html, re.S).group(1)
body = re.sub(r'<link rel="stylesheet"[^>]*>', '', body)
if '--debug' in sys.argv:
    body = body.replace('<script src="js/main.js"></script>', '<script src="js/main.js"></script>\n<script src="tools/debug.js"></script>')
out = '<title>ブッ飛びタクシー</title>\n<style>\n' + css + '\n</style>\n' + body
args=[a for a in sys.argv[1:] if not a.startswith('--')]
dst = pathlib.Path(args[0] if args else '/tmp/artifact.html')
dst.write_text(out, encoding='utf-8'); print('wrote', dst, len(out))
