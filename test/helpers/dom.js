'use strict';
// Запускает настоящий index.html (со всеми скриптами) в jsdom с подменой сети и canvas.
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');

function makeFetch(opts = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    if (opts.offline) throw new Error('offline');
    if (opts.delay) await opts.delay(url);
    const m = /@([^/]+)\/v1|https:\/\/([^.]+)\.currency-api/.exec(url);
    const ver = m[1] || m[2];
    const day = ver === 'latest' ? 19 : Number(ver.slice(-2));
    return {
      ok: true, status: 200,
      json: async () => ({ date: ver === 'latest' ? '2026-10-19' : ver, usd: { eur: 0.9, uah: 40 + day / 100, pln: 4, gbp: 0.8, rub: 90, chf: 0.85, jpy: 150, cny: 7, cad: 1.4, czk: 23, try: 34 } })
    };
  };
  fn.calls = calls;
  return fn;
}

async function load(opts = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e));
  vc.on('error', e => errors.push(e));
  const draws = { stroke: 0 };
  const fetch = makeFetch(opts);
  const dom = await JSDOM.fromFile(path.join(ROOT, 'index.html'), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      if (!opts.noFetch) w.fetch = fetch;
      const store = {};
      const ctx = new Proxy(store, {
        get: (t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'stroke' ? () => { draws.stroke++; } : k in t ? t[k] : () => {}),
        set: (t, k, v) => { t[k] = v; return true; }
      });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.addEventListener('error', e => errors.push(e.error || e.message));
      w.addEventListener('unhandledrejection', e => errors.push(e.reason));
    }
  });
  await new Promise(r => (dom.window.document.readyState === 'complete' ? r() : dom.window.addEventListener('load', r)));
  const win = dom.window;
  const doc = win.document;
  const $ = s => doc.querySelector(s);
  const $$ = s => Array.from(doc.querySelectorAll(s));
  const tick = (ms = 15) => new Promise(r => setTimeout(r, ms));

  const api = {
    dom, win, doc, $, $$, errors, fetch, draws, tick,
    async settle() { for (let i = 0; i < 4; i++) await tick(10); },
    mode(name) { $(`.mode-btn[data-mode="${name}"]`).click(); },
    grid() { return $('#simple-btns').style.display === 'none' ? '#scientific-btns' : '#simple-btns'; },
    /** кнопка по тексту или data-val в активной клавиатуре */
    btn(label, grid) {
      const g = grid || api.grid();
      const found = $$(`${g} .btn`).filter(b => b.textContent.trim() === label || b.dataset.val === label);
      if (!found.length) throw new Error(`Нет кнопки «${label}» в ${g}`);
      return found[0];
    },
    press(...labels) { labels.forEach(l => api.btn(l).click()); },
    /** набор строки вида "12+3*4" посимвольно (цифры/операторы/скобки) */
    type(str) {
      for (const ch of str) api.btn(ch === '*' ? '*' : ch).click();
    },
    display: () => $('#display').textContent,
    expr: () => $('#expression').textContent,
    error: () => $('#error-msg').textContent,
    history: () => $$('.history-item').map(d => d.textContent),
    key(k, target) {
      const ev = new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
      (target || doc.body).dispatchEvent(ev);
      return ev;
    },
    setPrecision(v) { const s = $('#precision-select'); s.value = String(v); s.dispatchEvent(new win.Event('change', { bubbles: true })); },
    setValue(sel, v, ev = 'input') { const el = $(sel); el.value = String(v); el.dispatchEvent(new win.Event(ev, { bubbles: true })); },
    select(sel, v) { api.setValue(sel, v, 'change'); },
    close() { win.close(); }
  };
  return api;
}

module.exports = { load, makeFetch };
