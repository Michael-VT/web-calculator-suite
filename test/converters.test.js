'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/converters.js');

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('величины: типовые перевода', () => {
  const cases = [
    ['length', 1, 'm', 'km', 0.001], ['length', 1, 'mi', 'm', 1609.344], ['length', 1, 'ft', 'inch', 12],
    ['length', 1, 'yd', 'ft', 3], ['length', 1, 'nmi', 'm', 1852],
    ['mass', 1, 'kg', 'g', 1000], ['mass', 1, 'lb', 'oz', 16], ['mass', 1, 't', 'kg', 1000],
    ['volume', 1, 'l', 'ml', 1000], ['volume', 1, 'm3', 'l', 1000], ['volume', 1, 'gal', 'cup', 16], ['volume', 1, 'cup', 'floz', 8],
    ['area', 1, 'ha', 'm2', 10000], ['area', 1, 'km2', 'ha', 100], ['area', 1, 'acre', 'm2', 4046.8564224],
    ['speed', 36, 'km/h', 'm/s', 10], ['speed', 1, 'knot', 'km/h', 1.852], ['speed', 60, 'mph', 'km/h', 96.56064],
    ['time', 1, 'h', 'min', 60], ['time', 1, 'd', 's', 86400], ['time', 1, 'week', 'd', 7], ['time', 1, 'year', 'd', 365.25],
    ['data', 1, 'B', 'bit', 8], ['data', 1, 'KiB', 'B', 1024], ['data', 1, 'kB', 'B', 1000], ['data', 1, 'GiB', 'MiB', 1024],
    ['astro', 1, 'AU', 'km', 149597870.7], ['astro', 1, 'pc', 'ly', 3.2615637769], ['astro', 1, 'R_earth', 'km', 6371],
    ['astro', 1, 'ly', 'km', 9460730472580.8],
    ['old_length', 1, 'verst', 'sazhen', 500], ['old_length', 1, 'sazhen', 'arshin', 3], ['old_length', 1, 'arshin', 'vershok', 16],
    ['old_length', 1, 'verst', 'm', 1066.8], ['old_length', 1, 'sazhen', 'fut', 7],
    ['old_area', 1, 'desyatina', 'sazhen2', 2400], ['old_area', 1, 'desyatina', 'ha', 1.0925397504],
    ['old_mass', 1, 'pood', 'funt', 40], ['old_mass', 1, 'pood', 'kg', 16.3804964], ['old_mass', 1, 'funt', 'lot', 32],
    ['old_mass', 1, 'funt', 'zolotnik', 96]
  ];
  for (const [cat, v, from, to, want] of cases) close(C.convertUnit(cat, v, from, to), want, 1e-7);
});

test('температура', () => {
  const t = (v, a, b) => C.convertUnit('temperature', v, a, b);
  close(t(0, 'degC', 'degF'), 32);
  close(t(100, 'degC', 'degF'), 212);
  close(t(-40, 'degC', 'degF'), -40);
  close(t(32, 'degF', 'degC'), 0);
  close(t(0, 'degC', 'K'), 273.15);
  close(t(0, 'K', 'degC'), -273.15);
  close(t(300, 'K', 'degF'), 80.33);
  close(t(5, 'degC', 'degC'), 5);
  assert.throws(() => t(-300, 'degC', 'K'), /абсолютного нуля/);
  assert.throws(() => t(-1, 'K', 'degC'), /абсолютного нуля/);
});

test('величины: полный перебор пар в каждой категории даёт конечные числа и обратимость', () => {
  for (const [cat, def] of Object.entries(C.UNITS)) {
    const codes = Object.keys(def.units);
    assert.ok(codes.length >= 3, cat);
    for (const a of codes) for (const b of codes) {
      const v = C.convertUnit(cat, 7, a, b);
      assert.ok(Number.isFinite(v), `${cat} ${a}→${b}`);
      close(C.convertUnit(cat, v, b, a), 7, 1e-9);
      if (a === b) close(v, 7);
      if (!def.special) assert.ok(v > 0, `${cat} ${a}→${b} = ${v}`);
    }
    for (const code of codes) assert.ok(C.unitName(cat, code).length > 0);
  }
});

test('величины: ошибки', () => {
  assert.throws(() => C.convertUnit('nope', 1, 'm', 'km'), /категория/);
  assert.throws(() => C.convertUnit('length', 1, 'xx', 'km'), /единица/);
  assert.throws(() => C.convertUnit('length', NaN, 'm', 'km'), /число/);
  assert.throws(() => C.convertUnit('length', Infinity, 'm', 'km'), /число/);
});

test('форматирование значения величины', () => {
  assert.equal(C.formatUnitValue(0), '0');
  assert.equal(C.formatUnitValue(0.001), '0.001');
  assert.equal(C.formatUnitValue(1000), '1000');
  assert.equal(C.formatUnitValue(1 / 3), '0.3333333333');
  assert.equal(C.formatUnitValue(0.1 + 0.2), '0.3');
  assert.equal(C.formatUnitValue(9.4607304725808e15), '9.460730473e15');
  assert.equal(C.formatUnitValue(1.5e-9), '1.5e-9');
  assert.equal(C.formatUnitValue(-40), '-40');
});

test('валюты: пересчёт', () => {
  const rates = { USD: 1, EUR: 0.5, UAH: 40 };
  assert.equal(C.convertCurrency(100, 'USD', 'UAH', rates), 4000);
  assert.equal(C.convertCurrency(100, 'UAH', 'USD', rates), 2.5);
  assert.equal(C.convertCurrency(10, 'EUR', 'UAH', rates), 800);
  assert.equal(C.convertCurrency(7, 'EUR', 'EUR', rates), 7);
  assert.equal(C.convertCurrency(0, 'USD', 'EUR', rates), 0);
  assert.throws(() => C.convertCurrency(1, 'USD', 'XXX', rates), /курса/);
  assert.throws(() => C.convertCurrency(1, 'USD', 'EUR', null), /курса/);
  for (const c of C.CURRENCIES) assert.ok(C.FALLBACK_RATES[c.code] > 0, c.code);
});

test('валюты: даты графика', () => {
  const today = new Date(Date.UTC(2026, 9, 19, 23, 59));
  const d7 = C.chartDates(7, today);
  assert.equal(d7.length, 8);
  assert.equal(d7[0], '2026-10-12');
  assert.equal(d7[7], '2026-10-19');
  const d365 = C.chartDates(365, today);
  assert.ok(d365.length <= 25 && d365.length >= 20, String(d365.length));
  assert.equal(d365[d365.length - 1], '2026-10-19');
  assert.deepEqual([...d365].sort(), d365);
  assert.equal(new Set(d365).size, d365.length);
  const cross = C.chartDates(3, new Date(Date.UTC(2026, 2, 2)));
  assert.deepEqual(cross, ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
});

function mockFetch(opts = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    if (opts.fail && opts.fail(url)) throw new Error('network');
    const m = /@([^/]+)\/v1|https:\/\/([^.]+)\.currency-api/.exec(url);
    const ver = m[1] || m[2];
    const day = ver === 'latest' ? 19 : Number(ver.slice(-2));
    return { ok: !(opts.notOk && opts.notOk(url)), status: 200, json: async () => ({ date: ver === 'latest' ? '2026-10-19' : ver, usd: { eur: 0.9, uah: 40 + day, bad: 'x', zero: 0 } }) };
  };
  fn.calls = calls;
  return fn;
}

test('валюты: загрузка курсов, запасной адрес, ошибки', async () => {
  const f = mockFetch();
  const r = await C.fetchLatestRates(f);
  assert.equal(r.date, '2026-10-19');
  assert.deepEqual(r.rates, { EUR: 0.9, UAH: 59, USD: 1 });
  assert.equal(f.calls.length, 1);

  const f2 = mockFetch({ fail: u => u.includes('jsdelivr') });
  const r2 = await C.fetchLatestRates(f2);
  assert.equal(r2.rates.UAH, 59);
  assert.equal(f2.calls.length, 2);

  const f3 = mockFetch({ notOk: () => true });
  await assert.rejects(() => C.fetchLatestRates(f3));
  await assert.rejects(() => C.fetchLatestRates(async () => ({ ok: true, json: async () => ({ usd: {} }) })));
  await assert.rejects(() => C.fetchLatestRates(async () => { throw new Error('offline'); }), /offline/);
});

test('валюты: история — параллельно, с кэшем и пропуском недоступных дат', async () => {
  const today = new Date(Date.UTC(2026, 9, 19));
  const f = mockFetch({ fail: u => u.includes('2026-10-15') });
  const cache = {};
  const pts = await C.fetchHistory(f, 'USD', 'UAH', 7, today, cache);
  assert.equal(pts.length, 7); // одна дата недоступна
  assert.ok(pts.every(p => p.rate > 40));
  assert.deepEqual(pts.map(p => p.date), [...pts.map(p => p.date)].sort());
  const before = f.calls.length;
  const pts2 = await C.fetchHistory(f, 'EUR', 'UAH', 7, today, cache);
  assert.equal(pts2.length, 7);
  assert.ok(f.calls.length - before <= 2, 'кэш должен использоваться (только недоступная дата перезапрашивается)');
  close(pts2[0].rate, pts[0].rate / 0.9, 1e-9);
  const none = await C.fetchHistory(f, 'USD', 'XXX', 7, today, {});
  assert.equal(none.length, 0);
  const off = await C.fetchHistory(async () => { throw new Error('x'); }, 'USD', 'UAH', 7, today, {});
  assert.deepEqual(off, []);
});

test('формат денег', () => {
  const norm = s => s.replace(/[\s  ]/g, '');
  assert.equal(norm(C.formatMoney(4497.5149)), '4497,51');
  assert.equal(norm(C.formatMoney(0)), '0,00');
  assert.equal(norm(C.formatMoney(1234567.891)), '1234567,89');
  assert.equal(norm(C.formatMoney(0.0066)), '0,0066');
  assert.equal(norm(C.formatMoney(0.00001234)), '0,00001234');
  assert.equal(C.formatMoney(NaN), '—');
  assert.equal(C.formatMoney(1.5, 'en-US'), '1.50');
});
