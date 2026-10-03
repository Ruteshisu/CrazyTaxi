#!/usr/bin/env python3
"""公開用: index.html + css + 全jsを 1ファイル(dist/index.html)にまとめる。three.js だけCDN参照のまま。
使い方: python tools/build_dist.py   → dist/index.html ができる (これだけを公開リポジトリ/GitHub Pagesに置く)"""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'css/style.css').read_text(encoding='utf-8')
html = re.sub(r'<link rel="stylesheet" href="css/style.css">', lambda m: '<style>\n' + css + '\n</style>', html)
def inline(m):
    src = m.group(1)
    code = (root / src).read_text(encoding='utf-8').replace('</script>', '<\\/script>')
    return '<script>\n/* ' + src + ' */\n' + code + '\n</script>'
html = re.sub(r'<script src="(js/[^"]+)"></script>', inline, html)
out = root / 'dist'; out.mkdir(exist_ok=True)
(out / 'index.html').write_text(html, encoding='utf-8')
(out / '.nojekyll').write_text('', encoding='utf-8')
print('wrote', out / 'index.html', len(html) // 1024, 'KB')
