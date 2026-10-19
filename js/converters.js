/* Перевод величин и валют. Без DOM: работает в браузере и в Node (тесты). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Converters = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- величины ----------
  // factor — сколько базовых единиц категории в одной данной единице.
  const SAZHEN = 2.1336, ARSHIN = 0.7112, VERST = 500 * SAZHEN;
  const FUNT = 0.40951241; // кг (409,51241 г)

  const UNITS = {
    length: { label: 'Длина', units: {
      mm: ['мм', 0.001], cm: ['см', 0.01], m: ['метр', 1], km: ['км', 1000],
      inch: ['дюйм', 0.0254], ft: ['фут', 0.3048], yd: ['ярд', 0.9144], mi: ['миля', 1609.344], nmi: ['морская миля', 1852]
    } },
    mass: { label: 'Масса', units: {
      mg: ['мг', 1e-6], g: ['грамм', 1e-3], kg: ['кг', 1], t: ['тонна', 1000],
      oz: ['унция', 0.028349523125], lb: ['фунт (англ.)', 0.45359237]
    } },
    temperature: { label: 'Температура', special: true, units: {
      degC: ['°C'], degF: ['°F'], K: ['Кельвин']
    } },
    volume: { label: 'Объём', units: {
      ml: ['мл', 0.001], l: ['литр', 1], m3: ['м³', 1000],
      tsp: ['чайная ложка (US)', 0.00492892159375], tbsp: ['столовая ложка (US)', 0.01478676478125],
      floz: ['жидкая унция (US)', 0.0295735295625], cup: ['чашка (US)', 0.2365882365], gal: ['галлон (US)', 3.785411784]
    } },
    area: { label: 'Площадь', units: {
      cm2: ['см²', 1e-4], m2: ['м²', 1], ha: ['гектар', 1e4], km2: ['км²', 1e6],
      ft2: ['фут²', 0.09290304], acre: ['акр', 4046.8564224], mi2: ['миля²', 2589988.110336]
    } },
    speed: { label: 'Скорость', units: {
      'm/s': ['м/с', 1], 'km/h': ['км/ч', 1 / 3.6], mph: ['миль/ч', 0.44704], knot: ['узел', 1852 / 3600], 'ft/s': ['фут/с', 0.3048]
    } },
    time: { label: 'Время', units: {
      ms: ['мс', 0.001], s: ['сек', 1], min: ['мин', 60], h: ['час', 3600], d: ['день', 86400],
      week: ['неделя', 604800], year: ['год (365,25 дн.)', 31557600]
    } },
    data: { label: 'Данные', units: {
      bit: ['бит', 0.125], B: ['байт', 1],
      kB: ['КБ (1000 Б)', 1e3], MB: ['МБ (10⁶ Б)', 1e6], GB: ['ГБ (10⁹ Б)', 1e9], TB: ['ТБ (10¹² Б)', 1e12],
      KiB: ['КиБ (1024 Б)', 1024], MiB: ['МиБ (1024² Б)', 1024 ** 2], GiB: ['ГиБ (1024³ Б)', 1024 ** 3], TiB: ['ТиБ (1024⁴ Б)', 1024 ** 4]
    } },
    astro: { label: 'Астрономические', units: {
      m: ['метр', 1], km: ['км', 1000], R_earth: ['радиус Земли', 6371000], R_sun: ['радиус Солнца', 695700000],
      AU: ['а.е.', 149597870700], ly: ['световой год', 9460730472580800], pc: ['парсек', 3.0856775814913673e16]
    } },
    old_length: { label: 'Старинные (длина)', units: {
      cm: ['см', 0.01], m: ['метр', 1], vershok: ['вершок', 0.04445], pyad: ['пядь', 0.1778], fut: ['фут', 0.3048],
      arshin: ['аршин', ARSHIN], sazhen: ['сажень', SAZHEN], verst: ['верста', VERST]
    } },
    old_area: { label: 'Старинные (площадь)', units: {
      m2: ['м²', 1], ha: ['гектар', 1e4], arshin2: ['кв. аршин', ARSHIN ** 2], sazhen2: ['кв. сажень', SAZHEN ** 2],
      desyatina: ['десятина (2400 кв. саж.)', 2400 * SAZHEN ** 2], verst2: ['кв. верста', VERST ** 2]
    } },
    old_mass: { label: 'Старинные (вес)', units: {
      g: ['грамм', 1e-3], kg: ['кг', 1], zolotnik: ['золотник', FUNT / 96], lot: ['лот', FUNT / 32],
      funt: ['фунт (русский)', FUNT], pood: ['пуд (40 фунтов)', 40 * FUNT]
    } }
  };

  const toKelvin = { degC: v => v + 273.15, degF: v => ((v - 32) * 5) / 9 + 273.15, K: v => v };
  const fromKelvin = { degC: k => k - 273.15, degF: k => ((k - 273.15) * 9) / 5 + 32, K: k => k };

  function unitName(category, code) {
    const u = UNITS[category] && UNITS[category].units[code];
    return u ? u[0] : code;
  }

  function convertUnit(category, value, from, to) {
    const cat = UNITS[category];
    if (!cat) throw new Error(`Неизвестная категория: ${category}`);
    if (!cat.units[from] || !cat.units[to]) throw new Error('Неизвестная единица измерения');
    if (!Number.isFinite(value)) throw new Error('Введите число');
    if (cat.special) {
      const k = toKelvin[from](value);
      if (k < -1e-9) throw new Error('Ниже абсолютного нуля');
      return fromKelvin[to](k);
    }
    return (value * cat.units[from][1]) / cat.units[to][1];
  }

  function formatUnitValue(v) {
    if (v === 0 || Object.is(v, -0)) return '0';
    const a = Math.abs(v);
    if (a >= 1e15 || a < 1e-6) return v.toExponential(9).replace(/\.?0+e/, 'e').replace('e+', 'e');
    return String(Number(v.toPrecision(10)));
  }

  // ---------- валюты ----------
  const CURRENCIES = [
    ['USD', 'Доллар США'], ['EUR', 'Евро'], ['UAH', 'Гривна'], ['PLN', 'Польский злотый'],
    ['RUB', 'Российский рубль'], ['GBP', 'Фунт стерлингов'], ['CHF', 'Швейцарский франк'],
    ['JPY', 'Японская иена'], ['CNY', 'Китайский юань'], ['CAD', 'Канадский доллар'],
    ['CZK', 'Чешская крона'], ['TRY', 'Турецкая лира']
  ].map(([code, name]) => ({ code, name }));

  // Запасные курсы к USD на случай отсутствия сети (приблизительные).
  const FALLBACK_RATES = {
    USD: 1, EUR: 0.89, UAH: 41.5, PLN: 3.85, RUB: 90, GBP: 0.76, CHF: 0.82, JPY: 150, CNY: 7.2, CAD: 1.37, CZK: 22.5, TRY: 34
  };

  const rateUrls = (version) => [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${version}/v1/currencies/usd.min.json`,
    `https://${version}.currency-api.pages.dev/v1/currencies/usd.min.json`
  ];

  async function fetchRatesFile(fetchFn, version) {
    let lastErr;
    for (const url of rateUrls(version)) {
      try {
        const res = await fetchFn(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const rates = {};
        for (const [k, v] of Object.entries(data.usd || {})) if (typeof v === 'number' && v > 0) rates[k.toUpperCase()] = v;
        rates.USD = 1;
        if (Object.keys(rates).length < 2) throw new Error('Пустой ответ');
        return { rates, date: data.date };
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Нет данных');
  }

  const fetchLatestRates = fetchFn => fetchRatesFile(fetchFn, 'latest');
  const fetchRatesOn = (fetchFn, isoDate) => fetchRatesFile(fetchFn, isoDate);

  function convertCurrency(amount, from, to, rates) {
    if (!rates || !rates[from] || !rates[to]) throw new Error('Нет курса для выбранной пары');
    return (amount * rates[to]) / rates[from];
  }

  /** Даты ISO (UTC) для графика: от (today − days) до today, не более maxPoints штук, по возрастанию. */
  function chartDates(days, today, maxPoints) {
    const max = maxPoints || 24;
    const step = Math.max(1, Math.ceil(days / (max - 1)));
    const base = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const out = [];
    for (let i = days; i >= 0; i -= step) out.push(new Date(base - i * 86400000).toISOString().slice(0, 10));
    const last = new Date(base).toISOString().slice(0, 10);
    if (out[out.length - 1] !== last) out.push(last);
    return out;
  }

  /** Исторические точки {date, rate}; cache — объект {дата: rates} для повторного использования. */
  async function fetchHistory(fetchFn, from, to, days, today, cache) {
    const store = cache || {};
    const dates = chartDates(days, today);
    const results = await Promise.all(dates.map(async (date) => {
      try {
        if (!store[date]) store[date] = (await fetchRatesOn(fetchFn, date)).rates;
        const r = store[date];
        if (!r[from] || !r[to]) return null;
        return { date, rate: r[to] / r[from] };
      } catch (e) { return null; }
    }));
    return results.filter(Boolean);
  }

  function formatMoney(n, locale) {
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    const maxFrac = abs === 0 || abs >= 1 ? 2 : abs >= 0.01 ? 4 : 8;
    return n.toLocaleString(locale || 'ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: maxFrac });
  }

  return {
    UNITS, CURRENCIES, FALLBACK_RATES, unitName, convertUnit, formatUnitValue,
    fetchLatestRates, fetchRatesOn, convertCurrency, chartDates, fetchHistory, formatMoney
  };
});
