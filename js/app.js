/* Интерфейс калькулятора: ввод, режимы, величины, валюты, подсказки. */
(function () {
  'use strict';
  const E = window.CalcEngine;
  const C = window.Converters;
  const $ = id => document.getElementById(id);

  // =====================================================================
  // Научный / простой калькулятор
  // =====================================================================
  const OPS = '+-*/^';
  const state = { expr: '', lastExpr: '', ans: 0, justEvaluated: false, deg: true, inv: false, page: 0, history: [], error: '' };

  // Наборы функций (Fn). Слоты: [ряд2-кол2, ряд2-кол3, ряд3-кол2, ряд3-кол3, ряд4-кол2, ряд4-кол3].
  // inv — замена при включённом Inv.
  const PAGES = [
    { name: 'Trig', cls: 'trig', slots: [
      { l: 'sin', v: 'sin(', inv: { l: 'asin', v: 'asin(' } }, { l: 'ln', v: 'ln(', inv: { l: 'eˣ', v: 'exp(' } },
      { l: 'cos', v: 'cos(', inv: { l: 'acos', v: 'acos(' } }, { l: 'log', v: 'log(', inv: { l: '10ˣ', v: '10^' } },
      { l: 'tan', v: 'tan(', inv: { l: 'atan', v: 'atan(' } }, { l: '√', v: 'sqrt(', inv: { l: 'x²', v: '^2' } }] },
    { name: 'Hyp', cls: 'trig', slots: [
      { l: 'sinh', v: 'sinh(', inv: { l: 'asinh', v: 'asinh(' } }, { l: 'log2', v: 'log2(', inv: { l: '2ˣ', v: '2^' } },
      { l: 'cosh', v: 'cosh(', inv: { l: 'acosh', v: 'acosh(' } }, { l: 'cbrt', v: 'cbrt(', inv: { l: 'x³', v: '^3' } },
      { l: 'tanh', v: 'tanh(', inv: { l: 'atanh', v: 'atanh(' } }, { l: 'atan2', v: 'atan2(' }] },
    { name: 'Mat', cls: 'matrix', slots: [
      { l: 'det', v: 'det(' }, { l: 'inv', v: 'inv(' }, { l: 'trans', v: 'transpose(' },
      { l: 'trace', v: 'trace(' }, { l: 'eye', v: 'eye(' }, { l: 'size', v: 'size(' }] },
    { name: 'Stat', cls: 'stat', slots: [
      { l: 'mean', v: 'mean(' }, { l: 'median', v: 'median(' }, { l: 'sum', v: 'sum(' },
      { l: 'std', v: 'std(' }, { l: 'min', v: 'min(' }, { l: 'max', v: 'max(' }] },
    { name: 'Comb', cls: 'const', slots: [
      { l: 'gcd', v: 'gcd(' }, { l: 'lcm', v: 'lcm(' }, { l: 'nCr', v: 'nCr(' },
      { l: 'nPr', v: 'nPr(' }, { l: 'mod', v: 'mod(' }, { l: 'hypot', v: 'hypot(' }] },
    { name: 'Rnd', cls: 'special', slots: [
      { l: 'round', v: 'round(' }, { l: 'floor', v: 'floor(' }, { l: 'ceil', v: 'ceil(' },
      { l: 'trunc', v: 'trunc(' }, { l: 'sign', v: 'sign(' }, { l: 'abs', v: 'abs(' }] }
  ];

  const displayEl = $('display');
  const exprEl = $('expression');
  const errorEl = $('error-msg');
  const historyEl = $('history-lines');
  const slotBtns = Array.from(document.querySelectorAll('[data-slot]'));

  const precision = () => parseInt($('precision-select').value, 10) || 6;
  const fmt = v => E.formatValue(v, precision());
  const pretty = s => s.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−').replace(/\bpi\b/g, 'π').replace(/sqrt\(/g, '√(');

  function render() {
    exprEl.textContent = state.justEvaluated && state.lastExpr ? pretty(state.lastExpr) + ' =' : '';
    const shown = state.expr ? pretty(state.expr) : fmt(state.ans);
    displayEl.textContent = shown;
    displayEl.className = (shown.length > 24 ? 'xlong' : shown.length > 13 ? 'long' : '') + (state.error ? ' error' : '');
    errorEl.textContent = state.error;
    historyEl.textContent = '';
    state.history.slice(-3).forEach(h => {
      const d = document.createElement('div');
      d.className = 'history-item';
      d.textContent = `${pretty(h.expr)} = ${fmt(h.value)}`;
      d.title = 'Нажмите, чтобы вернуть выражение';
      d.addEventListener('click', () => { state.expr = h.expr; state.justEvaluated = false; state.error = ''; render(); });
      historyEl.appendChild(d);
    });
  }

  function renderKeys() {
    const page = PAGES[state.page];
    $('btn-fn').textContent = page.name;
    page.slots.forEach((slot, i) => {
      const b = slotBtns[i];
      const s = state.inv && slot.inv ? slot.inv : slot;
      b.textContent = s.l;
      b.dataset.val = s.v;
      b.className = 'btn func ' + page.cls;
    });
    const invBtn = $('btn-inv');
    invBtn.classList.toggle('active', state.inv);
    invBtn.setAttribute('aria-pressed', String(state.inv));
    const degBtn = $('btn-deg');
    degBtn.textContent = state.deg ? 'Deg' : 'Rad';
    degBtn.style.color = state.deg ? '' : 'var(--danger)';
  }

  const open = (s, a, b) => (s.match(new RegExp('\\' + a, 'g')) || []).length - (s.match(new RegExp('\\' + b, 'g')) || []).length;
  const operandEnd = /[0-9.)\]%!A-Za-z]$/;

  function insert(val) {
    state.error = '';
    let e = state.expr;
    if (state.justEvaluated) {
      state.justEvaluated = false;
      e = /^[+\-*/^%!]/.test(val) ? 'Ans' : '';
    } else if (e === '' && /^[*/^%!]/.test(val)) {
      e = 'Ans';
    }
    const last = e.slice(-1);
    const expPending = /[0-9.]E[+-]?$/.test(e);

    if (val === '+' || val === '*' || val === '/' || val === '^' || val === '-') {
      if (val === '-') {
        e = '+-'.includes(last) && last !== '' ? e.slice(0, -1) + '-' : e + '-';
      } else {
        const stripped = e.replace(/[+\-*/^]+$/, '');
        if (stripped === '' || /[([,]$/.test(stripped)) { state.expr = e; return render(); }
        e = stripped + val;
      }
    } else if (val === '%' || val === '!') {
      if (!operandEnd.test(e) || expPending) { state.expr = e; return render(); }
      e += val;
    } else if (val === ')') {
      if (open(e, '(', ')') <= 0 || /[+\-*/^([,]$/.test(e) || e === '') { state.expr = e; return render(); }
      e += val;
    } else if (val === ']') {
      if (open(e, '[', ']') <= 0 || /[+\-*/^([,]$/.test(e) || e === '') { state.expr = e; return render(); }
      e += val;
    } else if (val === ',') {
      if (open(e, '(', ')') + open(e, '[', ']') <= 0 || !operandEnd.test(e) || expPending) { state.expr = e; return render(); }
      e += val;
    } else if (val === '.') {
      const tail = /[0-9.]*$/.exec(e)[0];
      if (tail.includes('.') || expPending || /E[+-]?[0-9]+$/.test(e)) { state.expr = e; return render(); }
      if (/[0-9]$/.test(e)) e += '.';
      else e += operandEnd.test(e) ? '*0.' : '0.';
    } else if (/^[0-9]$/.test(val)) {
      if (/(^|[^0-9.])0$/.test(e)) e = e.slice(0, -1) + val;
      else if (!expPending && /[)\]!%A-Za-z]$/.test(e)) e += '*' + val;
      else e += val;
    } else if (val === 'E') {
      const m = /[0-9.]+(?:E[+-]?[0-9]*)?$/.exec(e);
      if (m && /[0-9]/.test(m[0])) { if (!m[0].includes('E')) e += 'E'; }
      else e += operandEnd.test(e) ? '*1E' : '1E';
    } else if (/^[A-Za-z]/.test(val)) { // константы и функции
      if (/[A-Za-z]$/.test(e) && !expPending) e += '*';
      else if (val === 'e' && /[0-9.]$/.test(e)) e += '*';
      e += val;
    } else if (val[0] === '^') { // x², x⁻¹, ...: применяются к последнему операнду
      if (!operandEnd.test(e)) { state.expr = e; return render(); }
      e += val;
    } else if (/^[0-9]/.test(val)) { // «10^», «2^» (обратные log и log2)
      e += (operandEnd.test(e) && !expPending ? '*' : '') + val;
    } else { // '(' и '['
      e += val;
    }
    state.expr = e;
    render();
  }

  function backspace() {
    state.error = '';
    if (state.justEvaluated) { state.justEvaluated = false; render(); return; }
    state.expr = state.expr.replace(/(?:[A-Za-z][A-Za-z0-9]*\(|Ans|pi|.)$/, '');
    render();
  }

  function clearAll() {
    Object.assign(state, { expr: '', lastExpr: '', ans: 0, justEvaluated: false, error: '', history: [] });
    render();
  }

  function calculate() {
    if (!state.expr) return;
    try {
      const value = E.evaluate(state.expr, { deg: state.deg, ans: state.ans });
      state.history.push({ expr: state.expr, value });
      if (state.history.length > 50) state.history.shift();
      state.ans = value;
      state.lastExpr = state.expr;
      state.expr = '';
      state.justEvaluated = true;
      state.error = '';
    } catch (err) {
      if (!(err instanceof E.CalcError)) console.error(err);
      state.error = err instanceof E.CalcError ? err.message : 'Внутренняя ошибка';
      state.justEvaluated = false;
    }
    render();
  }

  function onKey(btn) {
    const action = btn.dataset.action;
    if (action === 'ac') clearAll();
    else if (action === 'eq') calculate();
    else if (action === 'back') backspace();
    else if (action === 'deg') { state.deg = !state.deg; renderKeys(); }
    else if (action === 'inv') { state.inv = !state.inv; renderKeys(); }
    else if (action === 'fnmode') { state.page = (state.page + 1) % PAGES.length; renderKeys(); }
    else if (btn.dataset.val) insert(btn.dataset.val);
  }
  document.querySelectorAll('#scientific-btns .btn, #simple-btns .btn').forEach(btn => {
    btn.addEventListener('click', ev => {
      onKey(btn);
      if (ev.detail > 0) btn.blur(); // после мыши/касания Enter должен вычислять, а не нажимать кнопку повторно
    });
  });
  $('precision-select').addEventListener('change', render);

  // ---------- режимы ----------
  let currentMode = 'scientific';
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentMode = btn.dataset.mode;
      document.querySelectorAll('.mode-btn').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', String(b === btn));
      });
      const calc = currentMode === 'scientific' || currentMode === 'simple';
      $('scientific-btns').style.display = currentMode === 'scientific' ? 'grid' : 'none';
      $('simple-btns').style.display = currentMode === 'simple' ? 'grid' : 'none';
      $('calc-display').style.display = calc ? 'block' : 'none';
      $('units-panel').classList.toggle('active', currentMode === 'units');
      $('currency-panel').classList.toggle('active', currentMode === 'currency');
      if (currentMode === 'currency') ensureChart();
    });
  });

  // ---------- клавиатура ----------
  const modalOpen = () => !!document.querySelector('.help-modal.active');
  document.addEventListener('keydown', e => {
    if (modalOpen()) { if (e.key === 'Escape') closeAllHelp(); return; }
    if (currentMode !== 'scientific' && currentMode !== 'simple') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
    if (t === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return; // активация сфокусированной кнопки
    const k = e.key;
    let handled = true;
    if (k.length === 1 && (/[0-9]/.test(k) || '+-*/^()[]!%.'.includes(k))) insert(k);
    else if (k === ',') insert(open(state.expr, '(', ')') + open(state.expr, '[', ']') > 0 ? ',' : '.');
    else if (k === 'x' || k === 'X') insert('*');
    else if (k === 'Enter' || k === '=') calculate();
    else if (k === 'Escape' || k === 'Delete') clearAll();
    else if (k === 'Backspace') backspace();
    else handled = false;
    if (handled) e.preventDefault();
  });

  // =====================================================================
  // Величины
  // =====================================================================
  const UNIT_DEFAULTS = {
    length: ['m', 'km'], mass: ['kg', 'g'], temperature: ['degC', 'degF'], volume: ['l', 'ml'], area: ['m2', 'km2'],
    speed: ['km/h', 'm/s'], time: ['h', 'min'], data: ['MB', 'GB'], astro: ['ly', 'km'],
    old_length: ['verst', 'm'], old_area: ['desyatina', 'ha'], old_mass: ['pood', 'kg']
  };
  const catSel = $('unit-category'), fromSel = $('unit-from'), toSel = $('unit-to'), valInput = $('unit-value');

  Object.entries(C.UNITS).forEach(([code, cat]) => catSel.add(new Option(cat.label, code)));

  function populateUnits() {
    const cat = C.UNITS[catSel.value];
    fromSel.innerHTML = toSel.innerHTML = '';
    Object.entries(cat.units).forEach(([code, u]) => {
      fromSel.add(new Option(u[0], code));
      toSel.add(new Option(u[0], code));
    });
    const [f, t] = UNIT_DEFAULTS[catSel.value];
    fromSel.value = f;
    toSel.value = t;
    convertUnits();
  }
  function convertUnits() {
    const out = $('unit-result');
    const raw = valInput.value.trim();
    if (raw === '' || !Number.isFinite(Number(raw))) { out.textContent = '—'; return; }
    try {
      const r = C.convertUnit(catSel.value, Number(raw), fromSel.value, toSel.value);
      out.textContent = `${C.formatUnitValue(r)} ${C.unitName(catSel.value, toSel.value)}`;
    } catch (err) { out.textContent = err.message; }
  }
  catSel.addEventListener('change', populateUnits);
  valInput.addEventListener('input', convertUnits);
  fromSel.addEventListener('change', convertUnits);
  toSel.addEventListener('change', convertUnits);
  $('unit-swap').addEventListener('click', () => {
    const f = fromSel.value;
    fromSel.value = toSel.value;
    toSel.value = f;
    convertUnits();
  });

  // =====================================================================
  // Валюты
  // =====================================================================
  const fromCur = $('curr-from'), toCur = $('curr-to'), amountEl = $('curr-amount'), resultEl = $('curr-result-input');
  let rates = Object.assign({}, C.FALLBACK_RATES);
  let ratesLive = false;
  let ratesDate = '';
  const historyCache = {};
  const curName = code => (C.CURRENCIES.find(c => c.code === code) || { name: code }).name;

  C.CURRENCIES.forEach(c => { fromCur.add(new Option(c.name, c.code)); toCur.add(new Option(c.name, c.code)); });
  fromCur.value = 'USD';
  toCur.value = 'UAH';

  function fetchJson(url) {
    if (typeof window.fetch !== 'function') return Promise.reject(new Error('fetch недоступен'));
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 8000) : null;
    return window.fetch(url, ctl ? { signal: ctl.signal } : undefined).finally(() => { if (timer) clearTimeout(timer); });
  }

  const trimNum = n => String(Number(n.toFixed(Math.abs(n) < 1 ? 8 : 4)));

  function updateRatesTable() {
    const tbody = document.querySelector('#rates-table tbody');
    tbody.textContent = '';
    C.CURRENCIES.forEach(c => {
      if (!rates[c.code]) return;
      const tr = document.createElement('tr');
      const a = document.createElement('td'), b = document.createElement('td');
      a.textContent = `${c.name} (${c.code})`;
      b.textContent = rates[c.code].toFixed(rates[c.code] < 1 ? 4 : 2);
      tr.append(a, b);
      tbody.appendChild(tr);
    });
  }

  function convertCurrency(fromTop) {
    const from = fromCur.value, to = toCur.value;
    const header = $('curr-header'), big = $('curr-big-result');
    const src = fromTop ? amountEl : resultEl;
    const raw = src.value.trim();
    if (raw === '' || !Number.isFinite(Number(raw)) || !rates[from] || !rates[to]) {
      header.textContent = '';
      big.textContent = '—';
      if (fromTop) resultEl.value = ''; else amountEl.value = '';
      return;
    }
    let amount, result;
    if (fromTop) {
      amount = Number(raw);
      result = C.convertCurrency(amount, from, to, rates);
      resultEl.value = trimNum(result);
    } else {
      result = Number(raw);
      amount = C.convertCurrency(result, to, from, rates);
      amountEl.value = trimNum(amount);
    }
    header.textContent = `${C.formatMoney(amount)} ${curName(from)} равно`;
    big.textContent = '';
    const amt = document.createElement('span'), name = document.createElement('span');
    amt.className = 'amount';
    amt.textContent = C.formatMoney(result);
    name.className = 'currency-name';
    name.textContent = ' ' + curName(to);
    big.append(amt, name);
  }

  async function loadRates() {
    const dateEl = $('rates-date');
    dateEl.textContent = 'Загрузка курсов...';
    try {
      const r = await C.fetchLatestRates(fetchJson);
      rates = r.rates;
      ratesLive = true;
      ratesDate = r.date || '';
      dateEl.textContent = `Курсы на ${ratesDate} · открытые данные`;
    } catch (e) {
      rates = Object.assign({}, C.FALLBACK_RATES);
      ratesLive = false;
      dateEl.textContent = 'Офлайн-курсы (приблизительные): нет связи с источником';
    }
    updateRatesTable();
    convertCurrency(true);
  }
  $('refresh-rates').addEventListener('click', () => loadRates().then(() => loadChart()));

  amountEl.addEventListener('input', () => convertCurrency(true));
  resultEl.addEventListener('input', () => convertCurrency(false));
  fromCur.addEventListener('change', () => { convertCurrency(true); loadChart(); });
  toCur.addEventListener('change', () => { convertCurrency(true); loadChart(); });
  $('curr-swap').addEventListener('click', () => {
    const f = fromCur.value;
    fromCur.value = toCur.value;
    toCur.value = f;
    convertCurrency(true);
    loadChart();
  });

  // ---------- график ----------
  const canvas = $('rate-chart');
  const ctx = canvas.getContext ? canvas.getContext('2d') : null;
  const chart = { points: [], hover: -1, token: 0, days: 7, key: '', note: '' };

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round((rect.width || 300) * dpr));
    const h = Math.max(1, Math.round((rect.height || 170) * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    return { w: w / dpr, h: h / dpr, dpr };
  }
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  const shortDate = d => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8)}.${d.slice(5, 7)}.${d.slice(2, 4)}` : d);
  const fmtRate = r => (r >= 100 ? r.toFixed(2) : r >= 1 ? r.toFixed(4) : r.toPrecision(4));

  function drawChart() {
    if (!ctx) return;
    const { w, h, dpr } = resizeCanvas();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const pts = chart.points;
    ctx.font = '11px system-ui, sans-serif';
    if (pts.length < 2) {
      ctx.fillStyle = cssVar('--text-faint');
      ctx.textAlign = 'center';
      ctx.fillText(chart.note || 'Недостаточно данных', w / 2, h / 2);
      return;
    }
    const accent = cssVar('--accent');
    const rs = pts.map(p => p.rate);
    const min = Math.min(...rs), max = Math.max(...rs);
    const range = max - min || Math.abs(max) * 0.01 || 0.01;
    const L = 8, R = 8, T = 22, B = 22;
    const xAt = i => L + (i / (pts.length - 1)) * (w - L - R);
    const yAt = r => T + (1 - (r - min) / range) * (h - T - B);

    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(xAt(i), yAt(p.rate)) : ctx.moveTo(xAt(i), yAt(p.rate))));
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.lineTo(xAt(pts.length - 1), h - B);
    ctx.lineTo(xAt(0), h - B);
    ctx.closePath();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = cssVar('--text-light');
    ctx.textAlign = 'left';
    ctx.fillText(shortDate(pts[0].date), L, h - 6);
    ctx.textAlign = 'right';
    ctx.fillText(shortDate(pts[pts.length - 1].date), w - R, h - 6);
    ctx.textAlign = 'left';
    ctx.fillText('макс ' + fmtRate(max), L, 12);
    ctx.textAlign = 'right';
    ctx.fillText('мин ' + fmtRate(min), w - R, 12);

    if (chart.hover >= 0 && chart.hover < pts.length) {
      const p = pts[chart.hover], x = xAt(chart.hover), y = yAt(p.rate);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
      const label = `${shortDate(p.date)}: ${fmtRate(p.rate)}`;
      const tw = ctx.measureText(label).width + 12;
      const tx = Math.min(Math.max(x - tw / 2, 2), w - tw - 2);
      ctx.fillStyle = cssVar('--text');
      ctx.fillRect(tx, T - 20 > 0 ? T - 20 : 0, tw, 18);
      ctx.fillStyle = cssVar('--card');
      ctx.textAlign = 'left';
      ctx.fillText(label, tx + 6, (T - 20 > 0 ? T - 20 : 0) + 13);
    }
  }

  function pointFromEvent(ev) {
    if (chart.points.length < 2) return -1;
    const rect = canvas.getBoundingClientRect();
    const ratio = (ev.clientX - rect.left - 8) / Math.max(1, rect.width - 16);
    return Math.max(0, Math.min(chart.points.length - 1, Math.round(ratio * (chart.points.length - 1))));
  }
  canvas.addEventListener('pointermove', ev => { chart.hover = pointFromEvent(ev); drawChart(); });
  canvas.addEventListener('pointerdown', ev => { chart.hover = pointFromEvent(ev); drawChart(); });
  canvas.addEventListener('pointerleave', () => { chart.hover = -1; drawChart(); });

  async function loadChart() {
    const from = fromCur.value, to = toCur.value;
    const info = $('chart-info');
    const token = ++chart.token;
    chart.hover = -1;
    chart.key = `${from}/${to}/${chart.days}`;
    if (from === to) {
      chart.points = [];
      chart.note = 'Одинаковые валюты';
      info.textContent = 'Выберите разные валюты';
      return drawChart();
    }
    info.textContent = 'Загрузка графика...';
    chart.points = [];
    chart.note = 'Загрузка...';
    drawChart();
    let points = [];
    try {
      points = await C.fetchHistory(fetchJson, from, to, chart.days, new Date(), historyCache);
    } catch (e) { points = []; }
    if (token !== chart.token) return; // устаревший запрос
    if (ratesLive && rates[from] && rates[to] && points.length && !points.some(p => p.date === ratesDate)) {
      points.push({ date: ratesDate, rate: rates[to] / rates[from] });
    }
    chart.points = points;
    chart.note = 'Нет данных (нужен интернет)';
    info.textContent = points.length > 1 ? `Курс ${from} → ${to} за ${chart.days} дн.` : 'Нет данных';
    drawChart();
  }
  function ensureChart() {
    if (chart.key === `${fromCur.value}/${toCur.value}/${chart.days}` && chart.points.length) drawChart();
    else loadChart();
  }

  document.querySelectorAll('#chart-periods button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#chart-periods button').forEach(b => b.classList.toggle('active', b === btn));
      chart.days = parseInt(btn.dataset.days, 10);
      loadChart();
    });
  });
  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; if (currentMode === 'currency') drawChart(); });
  });

  // =====================================================================
  // Подсказки
  // =====================================================================
  const openHelp = id => $(id).classList.add('active');
  const closeHelp = id => $(id).classList.remove('active');
  function closeAllHelp() { document.querySelectorAll('.help-modal.active').forEach(m => m.classList.remove('active')); }

  let sciPage = 1;
  const sciTotal = 4;
  function showSciPage(n) {
    sciPage = Math.max(1, Math.min(sciTotal, n));
    document.querySelectorAll('#sci-help-pages .sci-page').forEach(p => {
      p.style.display = parseInt(p.dataset.page, 10) === sciPage ? 'block' : 'none';
    });
    $('sci-help-title').textContent = `Научный калькулятор — стр. ${sciPage}/${sciTotal}`;
    $('sci-prev').disabled = sciPage === 1;
    $('sci-next').textContent = sciPage === sciTotal ? 'Готово' : 'Далее →';
  }
  $('help-sci').addEventListener('click', () => { showSciPage(1); openHelp('modal-sci'); });
  $('help-units').addEventListener('click', () => openHelp('modal-units'));
  $('help-curr').addEventListener('click', () => openHelp('modal-curr'));
  document.querySelectorAll('.help-close').forEach(b => b.addEventListener('click', () => closeHelp(b.dataset.close)));
  document.querySelectorAll('.help-modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('active'); }));
  $('sci-prev').addEventListener('click', () => showSciPage(sciPage - 1));
  $('sci-next').addEventListener('click', () => (sciPage === sciTotal ? closeHelp('modal-sci') : showSciPage(sciPage + 1)));

  // =====================================================================
  // Старт
  // =====================================================================
  renderKeys();
  render();
  showSciPage(1);
  populateUnits();
  updateRatesTable();
  convertCurrency(true);
  loadRates().then(() => { if (currentMode === 'currency') loadChart(); });
})();
