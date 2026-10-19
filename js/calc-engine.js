/* Движок научного калькулятора: разбор выражений, вычисление, форматирование.
 * Не зависит от DOM и сторонних библиотек — работает и в браузере, и в Node (тесты). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CalcEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class CalcError extends Error {
    constructor(message) { super(message); this.name = 'CalcError'; }
  }

  class Matrix {
    constructor(rows) { this.rows = rows; }
    get r() { return this.rows.length; }
    get c() { return this.rows[0].length; }
  }

  const DEG = Math.PI / 180;
  const clean15 = x => Number(x.toPrecision(15));
  const isInt = x => Number.isInteger(x);

  function check(x) {
    if (typeof x === 'number') {
      if (Number.isNaN(x)) throw new CalcError('Результат не определён');
      if (!Number.isFinite(x)) throw new CalcError('Переполнение: число слишком велико');
    }
    return x;
  }
  const mapM = (v, f) => (v instanceof Matrix ? new Matrix(v.rows.map(r => r.map(f))) : f(v));

  // ---------- токенизатор ----------
  function normalize(src) {
    return String(src)
      .replace(/[×·⋅]/g, '*').replace(/÷/g, '/').replace(/[−–—]/g, '-')
      .replace(/π/g, 'pi').replace(/√/g, 'sqrt');
  }

  function tokenize(src) {
    const s = normalize(src);
    const out = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      let m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
      if (m) { out.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
      if (m) { out.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
      if ('+-*/^()[],!%'.includes(ch)) { out.push({ t: ch }); i++; continue; }
      throw new CalcError(`Недопустимый символ «${ch}»`);
    }
    out.push({ t: 'end' });
    return out;
  }

  // ---------- разбор в AST ----------
  function parse(src) {
    if (String(src).length > 1000) throw new CalcError('Выражение слишком длинное');
    const toks = tokenize(src);
    let p = 0;
    let depth = 0;
    const nest = f => {
      if (++depth > 100) throw new CalcError('Слишком глубокая вложенность скобок');
      try { return f(); } finally { depth--; }
    };
    const peek = () => toks[p];
    const next = () => toks[p++];
    const show = t => (t.t === 'end' ? 'конец выражения' : t.t === 'num' ? String(t.v) : t.t === 'id' ? t.v : t.t);
    function expect(type) {
      if (peek().t === type) return next();
      if (peek().t === 'end') return null; // недостающие закрывающие скобки добавляются автоматически
      throw new CalcError(`Ожидалось «${type}», найдено «${show(peek())}»`);
    }

    function additive() {
      let left = term();
      while (peek().t === '+' || peek().t === '-') {
        const op = next().t;
        const right = term();
        left = { type: 'add', op, left, right };
      }
      return left;
    }
    function term() {
      let left = unary();
      for (;;) {
        const t = peek().t;
        if (t === '*' || t === '/') { next(); left = { type: 'mul', op: t, left, right: unary() }; }
        else if (t === '(' || t === '[' || t === 'id') left = { type: 'mul', op: '*', left, right: unary() }; // неявное умножение: 2pi, 2(3+4)
        else return left;
      }
    }
    function unary() {
      if (peek().t === '-') { next(); return { type: 'neg', arg: nest(unary) }; }
      if (peek().t === '+') { next(); return nest(unary); }
      return power();
    }
    function power() {
      const base = postfix();
      if (peek().t === '^') { next(); return { type: 'pow', base, exp: nest(unary) }; }
      return base;
    }
    function postfix() {
      let node = primary();
      for (;;) {
        if (peek().t === '!') { next(); node = { type: 'fact', arg: node }; }
        else if (peek().t === '%') { next(); node = { type: 'pct', arg: node }; }
        else return node;
      }
    }
    function primary() {
      const tok = next();
      if (tok.t === 'num') return { type: 'num', v: tok.v };
      if (tok.t === '(') {
        const e = nest(additive);
        expect(')');
        return e;
      }
      if (tok.t === '[') {
        const items = [];
        if (peek().t === ']') throw new CalcError('Пустая матрица');
        items.push(nest(additive));
        while (peek().t === ',') { next(); items.push(nest(additive)); }
        expect(']');
        return { type: 'matrix', items };
      }
      if (tok.t === 'id') {
        const name = tok.v.toLowerCase();
        if (peek().t === '(') {
          next();
          const args = [];
          if (peek().t !== ')' && peek().t !== 'end') {
            args.push(nest(additive));
            while (peek().t === ',') { next(); args.push(nest(additive)); }
          }
          expect(')');
          return { type: 'call', name, args };
        }
        if (tok.v in CONSTANTS || name === 'ans') return { type: 'const', name: tok.v in CONSTANTS ? tok.v : 'ans' };
        if (name in FUNCTIONS) throw new CalcError(`После «${tok.v}» ожидается «(»`);
        throw new CalcError(`Неизвестное имя «${tok.v}»`);
      }
      throw new CalcError(tok.t === 'end' ? 'Выражение неполное' : `Неожиданный символ «${show(tok)}»`);
    }

    if (peek().t === 'end') throw new CalcError('Пустое выражение');
    const ast = additive();
    if (peek().t !== 'end') throw new CalcError(`Неожиданный символ «${show(peek())}»`);
    return ast;
  }

  // ---------- арифметика ----------
  function addSub(a, b, sign) {
    if (a instanceof Matrix || b instanceof Matrix) {
      if (!(a instanceof Matrix && b instanceof Matrix)) throw new CalcError('Нельзя складывать матрицу и число');
      if (a.r !== b.r || a.c !== b.c) throw new CalcError('Размеры матриц не совпадают');
      return new Matrix(a.rows.map((row, i) => row.map((x, j) => addNum(x, b.rows[i][j], sign))));
    }
    return addNum(a, b, sign);
  }
  function addNum(a, b, sign) {
    const r = a + sign * b;
    // гасим шум вычитания близких чисел: 0.1 + 0.2 − 0.3 → 0
    if (r !== 0 && Math.abs(r) < 4 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b))) return 0;
    return check(r);
  }
  function matMul(a, b) {
    if (a.c !== b.r) throw new CalcError(`Нельзя умножить матрицы ${a.r}×${a.c} и ${b.r}×${b.c}`);
    const rows = [];
    for (let i = 0; i < a.r; i++) {
      const row = [];
      for (let j = 0; j < b.c; j++) {
        let s = 0;
        for (let k = 0; k < a.c; k++) s += a.rows[i][k] * b.rows[k][j];
        row.push(check(s));
      }
      rows.push(row);
    }
    return new Matrix(rows);
  }
  function mul(a, b) {
    const am = a instanceof Matrix, bm = b instanceof Matrix;
    if (am && bm) return matMul(a, b);
    if (am) return mapM(a, x => check(x * b));
    if (bm) return mapM(b, x => check(a * x));
    return check(a * b);
  }
  function div(a, b) {
    if (b instanceof Matrix) throw new CalcError('Делить на матрицу нельзя — используйте inv(...)');
    if (b === 0) throw new CalcError('Деление на ноль');
    return mapM(a, x => check(x / b));
  }
  function pow(a, b) {
    if (a instanceof Matrix) {
      if (b instanceof Matrix || !isInt(b)) throw new CalcError('Матрицу можно возводить только в целую степень');
      if (a.r !== a.c) throw new CalcError('Возводить в степень можно только квадратную матрицу');
      let base = b < 0 ? matInv(a) : a;
      let n = Math.abs(b);
      let result = identity(a.r);
      while (n > 0) { if (n & 1) result = matMul(result, base); base = n > 1 ? matMul(base, base) : base; n = Math.floor(n / 2); }
      return result;
    }
    if (b instanceof Matrix) throw new CalcError('Нельзя возводить число в степень матрицы');
    if (a === 0 && b < 0) throw new CalcError('Деление на ноль');
    if (a < 0 && !isInt(b)) throw new CalcError('Результат не является вещественным числом');
    return check(Math.pow(a, b));
  }

  // ---------- матрицы ----------
  function identity(n) {
    return new Matrix(Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
  }
  function needMatrix(v, name) {
    if (!(v instanceof Matrix)) throw new CalcError(`${name}: ожидается матрица, например [[1,2],[3,4]]`);
    return v;
  }
  function needSquare(v, name) {
    needMatrix(v, name);
    if (v.r !== v.c) throw new CalcError(`${name}: матрица должна быть квадратной`);
    return v;
  }
  function matDet(m) {
    const n = m.r;
    const a = m.rows.map(r => r.slice());
    let det = 1;
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
      if (a[piv][c] === 0) return 0;
      if (piv !== c) { [a[piv], a[c]] = [a[c], a[piv]]; det = -det; }
      det *= a[c][c];
      for (let r = c + 1; r < n; r++) {
        const f = a[r][c] / a[c][c];
        for (let k = c; k < n; k++) a[r][k] -= f * a[c][k];
      }
    }
    const allInt = m.rows.every(r => r.every(isInt));
    if (allInt) {
      const rd = Math.round(det);
      if (Math.abs(det - rd) < 1e-9 * Math.max(1, Math.abs(rd))) return rd;
    }
    return check(det);
  }
  function matInv(m) {
    const n = m.r;
    const a = m.rows.map((r, i) => r.concat(identity(n).rows[i]));
    const scale = Math.max(1, ...m.rows.flat().map(Math.abs));
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
      if (Math.abs(a[piv][c]) < 1e-12 * scale) throw new CalcError('Матрица вырождена (определитель равен 0)');
      [a[piv], a[c]] = [a[c], a[piv]];
      const d = a[c][c];
      for (let k = 0; k < 2 * n; k++) a[c][k] /= d;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = a[r][c];
        if (f !== 0) for (let k = 0; k < 2 * n; k++) a[r][k] -= f * a[c][k];
      }
    }
    return new Matrix(a.map(r => r.slice(n).map(x => clean15(x) + 0)));
  }

  // ---------- функции ----------
  const num = (v, name) => {
    if (typeof v !== 'number') throw new CalcError(`${name}: ожидается число`);
    return v;
  };
  const cleanTrig = x => { const r = clean15(x); return Math.abs(r) < 1e-15 ? 0 : r; };
  const flat = (args, name) => {
    const out = [];
    args.forEach(a => (a instanceof Matrix ? a.rows.forEach(r => out.push(...r)) : out.push(a)));
    if (!out.length) throw new CalcError(`${name}: нет данных`);
    return out;
  };
  const ints = (args, name) => args.map(a => {
    const x = num(a, name);
    if (!isInt(x)) throw new CalcError(`${name}: нужны целые числа`);
    return Math.abs(x);
  });
  const gcd2 = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

  // эл-wise: функция одного числа, применяется и к матрице
  const ew = f => (args, ctx, name) => mapM(args[0], x => check(f(x, ctx, name)));
  const FUNCTIONS = {
    sin: { n: [1, 1], f: ew((x, c) => (c.deg ? (x % 180 === 0 ? 0 : cleanTrig(Math.sin(x * DEG))) : cleanTrig(Math.sin(x)))) },
    cos: { n: [1, 1], f: ew((x, c) => (c.deg ? (Math.abs(x % 180) === 90 ? 0 : cleanTrig(Math.cos(x * DEG))) : cleanTrig(Math.cos(x)))) },
    tan: { n: [1, 1], f: ew((x, c) => {
      if (c.deg) {
        const m = ((x % 180) + 180) % 180;
        if (m === 90) throw new CalcError('tan не определён для этого угла');
        if (m === 0) return 0;
        return cleanTrig(Math.tan(x * DEG));
      }
      return cleanTrig(Math.tan(x));
    }) },
    asin: { n: [1, 1], f: ew((x, c) => {
      if (Math.abs(x) > 1) throw new CalcError('asin: аргумент должен быть от −1 до 1');
      return clean15(c.deg ? Math.asin(x) / DEG : Math.asin(x));
    }) },
    acos: { n: [1, 1], f: ew((x, c) => {
      if (Math.abs(x) > 1) throw new CalcError('acos: аргумент должен быть от −1 до 1');
      return clean15(c.deg ? Math.acos(x) / DEG : Math.acos(x));
    }) },
    atan: { n: [1, 1], f: ew((x, c) => clean15(c.deg ? Math.atan(x) / DEG : Math.atan(x))) },
    atan2: { n: [2, 2], f: (a, c) => {
      const y = num(a[0], 'atan2'), x = num(a[1], 'atan2');
      if (x === 0 && y === 0) throw new CalcError('atan2(0, 0) не определён');
      return clean15(c.deg ? Math.atan2(y, x) / DEG : Math.atan2(y, x));
    } },
    sinh: { n: [1, 1], f: ew(x => Math.sinh(x)) },
    cosh: { n: [1, 1], f: ew(x => Math.cosh(x)) },
    tanh: { n: [1, 1], f: ew(x => Math.tanh(x)) },
    asinh: { n: [1, 1], f: ew(x => clean15(Math.asinh(x))) },
    acosh: { n: [1, 1], f: ew(x => {
      if (x < 1) throw new CalcError('acosh: аргумент должен быть не меньше 1');
      return clean15(Math.acosh(x));
    }) },
    atanh: { n: [1, 1], f: ew(x => {
      if (Math.abs(x) >= 1) throw new CalcError('atanh: аргумент должен быть строго между −1 и 1');
      return clean15(Math.atanh(x));
    }) },
    exp: { n: [1, 1], f: ew(x => Math.exp(x)) },
    ln: { n: [1, 1], f: ew(x => {
      if (x <= 0) throw new CalcError('Логарифм определён только для x > 0');
      return clean15(Math.log(x));
    }) },
    log10: { n: [1, 1], f: ew(x => {
      if (x <= 0) throw new CalcError('Логарифм определён только для x > 0');
      return clean15(Math.log10(x));
    }) },
    log2: { n: [1, 1], f: ew(x => {
      if (x <= 0) throw new CalcError('Логарифм определён только для x > 0');
      return clean15(Math.log2(x));
    }) },
    log: { n: [1, 2], f: (a) => {
      const x = num(a[0], 'log');
      if (x <= 0) throw new CalcError('Логарифм определён только для x > 0');
      if (a.length === 1) return clean15(Math.log10(x));
      const b = num(a[1], 'log');
      if (b <= 0 || b === 1) throw new CalcError('Основание логарифма должно быть > 0 и ≠ 1');
      return clean15(Math.log(x) / Math.log(b));
    } },
    sqrt: { n: [1, 1], f: ew(x => {
      if (x < 0) throw new CalcError('Корень из отрицательного числа');
      return Math.sqrt(x);
    }) },
    cbrt: { n: [1, 1], f: ew(x => clean15(Math.cbrt(x))) },
    hypot: { n: [1, 8], f: a => check(Math.hypot(...a.map(x => num(x, 'hypot')))) },
    abs: { n: [1, 1], f: ew(x => Math.abs(x)) },
    sign: { n: [1, 1], f: ew(x => Math.sign(x)) },
    floor: { n: [1, 1], f: ew(x => Math.floor(x)) },
    ceil: { n: [1, 1], f: ew(x => Math.ceil(x)) },
    trunc: { n: [1, 1], f: ew(x => Math.trunc(x)) },
    round: { n: [1, 2], f: (a) => {
      const x = num(a[0], 'round');
      const d = a.length > 1 ? num(a[1], 'round') : 0;
      if (!isInt(d) || d < 0 || d > 14) throw new CalcError('round: число знаков — целое от 0 до 14');
      const ax = Math.abs(x);
      if (ax >= 1e15) return x;
      const r = Number(Math.round(Number(`${ax}e${d}`)) + `e-${d}`);
      return Math.sign(x) * r;
    } },
    factorial: { n: [1, 1], f: ew(x => {
      if (!isInt(x) || x < 0 || x > 170) throw new CalcError('Факториал определён для целых от 0 до 170');
      let r = 1;
      for (let i = 2; i <= x; i++) r *= i;
      return r;
    }) },
    ncr: { n: [2, 2], f: (a) => {
      const [n, k] = a.map(x => num(x, 'nCr'));
      if (!isInt(n) || !isInt(k) || k < 0 || k > n) throw new CalcError('nCr(n, k): целые числа, 0 ≤ k ≤ n');
      const kk = Math.min(k, n - k);
      let r = 1;
      for (let i = 1; i <= kk; i++) { r = (r * (n - kk + i)) / i; check(r); }
      return check(Math.round(r));
    } },
    npr: { n: [2, 2], f: (a) => {
      const [n, k] = a.map(x => num(x, 'nPr'));
      if (!isInt(n) || !isInt(k) || k < 0 || k > n) throw new CalcError('nPr(n, k): целые числа, 0 ≤ k ≤ n');
      let r = 1;
      for (let i = 0; i < k; i++) { r *= n - i; check(r); }
      return check(r);
    } },
    gcd: { n: [2, 8], f: a => ints(a, 'gcd').reduce(gcd2) },
    lcm: { n: [2, 8], f: a => check(ints(a, 'lcm').reduce((x, y) => (x === 0 || y === 0 ? 0 : (x / gcd2(x, y)) * y))) },
    mod: { n: [2, 2], f: (a) => {
      const x = num(a[0], 'mod'), y = num(a[1], 'mod');
      if (y === 0) throw new CalcError('Деление на ноль');
      let r = x % y;
      if (r !== 0 && (r < 0) !== (y < 0)) r += y;
      return r;
    } },
    sum: { n: [1, 64], f: a => check(flat(a, 'sum').reduce((s, x) => s + x, 0)) },
    mean: { n: [1, 64], f: (a) => { const v = flat(a, 'mean'); return v.reduce((s, x) => s + x, 0) / v.length; } },
    median: { n: [1, 64], f: (a) => {
      const v = flat(a, 'median').sort((x, y) => x - y);
      const m = v.length >> 1;
      return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
    } },
    min: { n: [1, 64], f: a => Math.min(...flat(a, 'min')) },
    max: { n: [1, 64], f: a => Math.max(...flat(a, 'max')) },
    std: { n: [1, 64], f: (a) => {
      const v = flat(a, 'std');
      if (v.length < 2) throw new CalcError('std: нужно минимум 2 значения');
      const m = v.reduce((s, x) => s + x, 0) / v.length;
      return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
    } },
    stdp: { n: [1, 64], f: (a) => {
      const v = flat(a, 'stdp');
      const m = v.reduce((s, x) => s + x, 0) / v.length;
      return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
    } },
    det: { n: [1, 1], f: a => matDet(needSquare(a[0], 'det')) },
    inv: { n: [1, 1], f: a => matInv(needSquare(a[0], 'inv')) },
    transpose: { n: [1, 1], f: (a) => {
      const m = needMatrix(a[0], 'transpose');
      return new Matrix(m.rows[0].map((_, j) => m.rows.map(r => r[j])));
    } },
    trace: { n: [1, 1], f: (a) => { const m = needSquare(a[0], 'trace'); return m.rows.reduce((s, r, i) => s + r[i], 0); } },
    eye: { n: [1, 1], f: (a) => {
      const n = num(a[0], 'eye');
      if (!isInt(n) || n < 1 || n > 50) throw new CalcError('eye(n): n — целое от 1 до 50');
      return identity(n);
    } },
    size: { n: [1, 1], f: (a) => { const m = needMatrix(a[0], 'size'); return new Matrix([[m.r, m.c]]); } }
  };
  FUNCTIONS.trans = FUNCTIONS.transpose;
  FUNCTIONS.identity = FUNCTIONS.eye;
  FUNCTIONS.fact = FUNCTIONS.factorial;

  const CONSTANTS = { pi: Math.PI, e: Math.E };

  // Основные имена функций (без синонимов) — для документации и тестов.
  const FUNCTION_NAMES = Object.keys(FUNCTIONS).filter(n => !['trans', 'identity', 'fact'].includes(n));

  // ---------- вычисление ----------
  function evalNode(n, ctx) {
    switch (n.type) {
      case 'num': return check(n.v);
      case 'const': return n.name === 'ans' ? ctx.ans : CONSTANTS[n.name];
      case 'neg': return mapM(evalNode(n.arg, ctx), x => -x);
      case 'add': {
        const right = n.right;
        // «200 + 10%» = 200 + 10% от 200
        if (right.type === 'pct') {
          const a = evalNode(n.left, ctx);
          const b = evalNode(right.arg, ctx);
          if (typeof a !== 'number' || typeof b !== 'number') throw new CalcError('Проценты применимы только к числам');
          return addNum(a, (n.op === '+' ? 1 : -1) * ((a * b) / 100), 1);
        }
        return addSub(evalNode(n.left, ctx), evalNode(right, ctx), n.op === '+' ? 1 : -1);
      }
      case 'mul': {
        const a = evalNode(n.left, ctx), b = evalNode(n.right, ctx);
        return n.op === '*' ? mul(a, b) : div(a, b);
      }
      case 'pow': return pow(evalNode(n.base, ctx), evalNode(n.exp, ctx));
      case 'pct': {
        const v = evalNode(n.arg, ctx);
        if (typeof v !== 'number') throw new CalcError('Проценты применимы только к числам');
        return v / 100;
      }
      case 'fact': return FUNCTIONS.factorial.f([evalNode(n.arg, ctx)], ctx, 'factorial');
      case 'matrix': {
        const vals = n.items.map(i => evalNode(i, ctx));
        if (vals.every(v => typeof v === 'number')) return new Matrix([vals]);
        if (vals.every(v => v instanceof Matrix && v.r === 1) && vals.every(v => v.c === vals[0].c)) {
          return new Matrix(vals.map(v => v.rows[0]));
        }
        throw new CalcError('Некорректная матрица: строки должны быть одной длины');
      }
      case 'call': {
        const fn = FUNCTIONS[n.name];
        if (!fn) throw new CalcError(`Неизвестная функция «${n.name}»`);
        const [lo, hi] = fn.n;
        if (n.args.length < lo || n.args.length > hi) {
          throw new CalcError(`${n.name}: ${lo === hi ? `нужно аргументов: ${lo}` : `аргументов от ${lo} до ${hi}`}`);
        }
        const args = n.args.map(a => evalNode(a, ctx));
        return check(fn.f(args, ctx, n.name));
      }
      default: throw new CalcError('Внутренняя ошибка разбора');
    }
  }

  /** evaluate(expr, { deg: true, ans: 0 }) → number | Matrix. Бросает CalcError. */
  function evaluate(expr, opts) {
    const ctx = { deg: !opts || opts.deg !== false, ans: opts && opts.ans !== undefined ? opts.ans : 0 };
    const value = evalNode(parse(expr), ctx);
    return mapM(value, x => (x === 0 ? 0 : x)); // убираем «−0»
  }

  // ---------- форматирование ----------
  function formatNumber(v, places) {
    const p = Math.max(0, Math.min(14, places == null ? 6 : places));
    if (v === 0) return '0';
    const abs = Math.abs(v);
    const expo = () => {
      const s = v.toExponential(Math.min(p, 14));
      return s.replace(/\.?0+e/, 'e').replace('e+', 'e');
    };
    if (abs >= 1e15) return expo();
    const cleaned = clean15(v);
    const fixed = cleaned.toFixed(p);
    if (Number(fixed) === 0) return expo(); // слишком мало для выбранной точности
    return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  }
  function formatValue(v, places) {
    if (v instanceof Matrix) {
      const rows = v.rows.map(r => '[' + r.map(x => formatNumber(x, places)).join(', ') + ']');
      return v.r === 1 ? rows[0] : '[' + rows.join(', ') + ']';
    }
    return formatNumber(v, places);
  }

  return { evaluate, parse, tokenize, formatNumber, formatValue, Matrix, CalcError, FUNCTIONS, FUNCTION_NAMES, CONSTANTS };
});
