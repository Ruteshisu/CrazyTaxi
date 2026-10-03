#!/usr/bin/env python3
"""ヘッドレスでデモAIを走らせて衝突回数などを測る。 python3 tools/headless_sim.py [秒数] [seed回数]"""
import sys, json, pathlib
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
secs = int(sys.argv[1]) if len(sys.argv) > 1 else 180
runs = int(sys.argv[2]) if len(sys.argv) > 2 else 3
stub = (root/'tools/headless_stub_three.js').read_text()
JS = """
([secs]) => {
  const g = CT.game, st = {crash:0, spin:0, deliv:0, pick:0, hits:0, stuck:0, wall:0}, T = g.taxi;
  st.log=[]; const hist=[]; CT.bus.on('crash', e => { if (!st.first) st.first = hist.slice(-8); st.crash++; if (e.spin) st.spin++; if (st.log.length<6) st.log.push([Math.round(e.x),Math.round(e.z),Math.round(e.speed),g.driver.dbg]); });
  CT.bus.on('deliver', () => st.deliv++); CT.bus.on('pickup', () => st.pick++);
  g.startDemo(); g.demoT = 0; g.demoEndT = 0;
  let slow = 0, dist = 0, px = T.x, pz = T.z;
  const dt = 1/60;
  for (let i = 0; i < secs*60; i++) {
    g.demoT = 0; g.update(dt, dt);
    if (i % 20 === 0) { hist.push([+(i/60).toFixed(1), Math.round(T.x), Math.round(T.z), +T.h.toFixed(2), +T.speed.toFixed(0), g.driver.dbg]); if (hist.length>12) hist.shift(); }
    dist += Math.hypot(T.x-px, T.z-pz); px = T.x; pz = T.z;
    if (T.totalSpeed < 3 && !g.fare.busy) slow += dt;
  }
  st.hits = g.score.hits; st.slowSec = +slow.toFixed(1); st.dist = Math.round(dist); st.art = Math.round(g.score.art);
  return st;
}
"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
    for r in range(runs):
        pg = b.new_page()
        pg.route('**/three.min.js', lambda route: route.fulfill(body=stub, content_type='application/javascript'))
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: print('C', m.text[:300]) if m.type == 'error' else None)
        pg.goto('file://' + str(root/'index.html'))
        pg.wait_for_timeout(800)
        if errs: print('PAGE ERR', errs[:3]); break
        pg.evaluate("() => { CT.game.start = () => {}; }")
        print(json.dumps(pg.evaluate(JS, [secs])), errs[:2])
        pg.close()
    b.close()
