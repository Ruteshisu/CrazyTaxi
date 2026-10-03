/* three.js のスタブ(何でも受け付けて何もしない)。ブラウザ無し/CDN無しで、ゲームのロジック(物理/AI/得点)だけを
   Playwright+Chromium で高速に回すための開発用。描画は一切されない。 */
(function () {
  const cache = new Map();
  function mk() {
    const f = function () {};
    const p = new Proxy(f, {
      get(t, k) {
        if (k === Symbol.toPrimitive) return () => 0;
        if (k === 'then') return undefined;
        if (k === Symbol.iterator) return function* () {};
        if (!cache.has(p)) cache.set(p, {});
        const c = cache.get(p); if (!(k in c)) c[k] = mk(); return c[k];
      },
      set(t, k, v) { if (!cache.has(p)) cache.set(p, {}); cache.get(p)[k] = v; return true; },
      apply() { return mk(); }, construct() { return mk(); },
    });
    return p;
  }
  window.THREE = new Proxy({}, { get(t, k) { if (!(k in t)) t[k] = function () { return mk(); }; return t[k]; } });
})();
