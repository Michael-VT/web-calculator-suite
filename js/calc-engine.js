/* Движок научного калькулятора: разбор выражений, вычисление, форматирование.
 * Не зависит от DOM и сторонних библиотек — работает и в браузере, и в Node (тесты). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./numeric.js'));
  else root.CalcEngine = factory(root.CalcNumeric);
})(typeof self !== 'undefined' ? self : this, function (N) {
  'use strict';

  class CalcError extends Error {
    constructor(message) { super(message); this.name = 'CalcError'; }
  }

  class Matrix {
    constructor(rows) { this.rows = rows; }
    get r() { return this.rows.length; }
    get c() { return this.rows[0].length; }
  }
  // формы, у которых второй аргумент — имя переменной: [мин, макс] числа аргументов
  const SPECIAL = { solve: [2, 3], diff: [3, 3], integral: [4, 4], limit: [3, 3], sigma: [4, 4], product: [4, 4] };
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  class Complex {
    constructor(re, im) { this.re = re; this.im = im; }
  }
  /** Текстовый результат (bin, hex, frac…): s — что показать, n — числовое значение для Ans. */
  class Text {
    constructor(s, n) { this.s = s; this.n = n; }
  }

  const DEG = Math.PI / 180;
  const clean15 = x => Number(x.toPrecision(15));
  const isInt = x => Number.isInteger(x);

  function check(x) {
    if (typeof x === 'number') {
      if (Number.isNaN(x)) throw new CalcError('Результат не определён');
      if (!Number.isFinite(x)) throw new CalcError('Переполнение: число слишком велико');
    } else if (x instanceof Complex) {
      if (Number.isNaN(x.re) || Number.isNaN(x.im)) throw new CalcError('Результат не определён');
      if (!Number.isFinite(x.re) || !Number.isFinite(x.im)) throw new CalcError('Переполнение: число слишком велико');
    }
    return x;
  }
  const mapM = (v, f) => (v instanceof Matrix ? new Matrix(v.rows.map(r => r.map(f))) : f(v));

  // ---------- комплексные числа ----------
  const isC = v => v instanceof Complex;
  const cr = v => (isC(v) ? v.re : v);
  const ci = v => (isC(v) ? v.im : 0);
  /** Собирает число; пренебрежимо малую мнимую (или вещественную) часть отбрасывает. */
  function cx(re, im) {
    const m = Math.max(Math.abs(re), Math.abs(im));
    if (Math.abs(im) <= 1e-14 * m) return re;
    return new Complex(Math.abs(re) <= 1e-14 * m ? 0 : re, im);
  }
  const cabs = a => Math.hypot(cr(a), ci(a));
  const carg = a => Math.atan2(ci(a), cr(a));
  const cadd = (a, b, s) => cx(cr(a) + s * cr(b), ci(a) + s * ci(b));
  const cmul = (a, b) => cx(cr(a) * cr(b) - ci(a) * ci(b), cr(a) * ci(b) + ci(a) * cr(b));
  function cdiv(a, b) {
    const d = cr(b) ** 2 + ci(b) ** 2;
    if (d === 0) throw new CalcError('Деление на ноль');
    return cx((cr(a) * cr(b) + ci(a) * ci(b)) / d, (ci(a) * cr(b) - cr(a) * ci(b)) / d);
  }
  const cexp = a => { const e = Math.exp(cr(a)); return cx(e * Math.cos(ci(a)), e * Math.sin(ci(a))); };
  function cln(a) {
    if (cabs(a) === 0) throw new CalcError('Логарифм определён только для x ≠ 0');
    return cx(Math.log(cabs(a)), carg(a));
  }
  function csqrt(a) {
    const r = cabs(a);
    const im = Math.sqrt((r - cr(a)) / 2);
    return cx(Math.sqrt((r + cr(a)) / 2), ci(a) < 0 ? -im : im);
  }
  function cpow(a, b) {
    if (cabs(a) === 0) {
      if (cr(b) > 0 && ci(b) === 0) return 0;
      throw new CalcError(ci(b) === 0 && cr(b) === 0 ? 'Выражение 0^0 не определено' : 'Деление на ноль');
    }
    if (!isC(b) && Number.isInteger(b) && Math.abs(b) <= 64) {
      let r = 1, base = a, n = Math.abs(b);
      while (n > 0) { if (n & 1) r = cmul(r, base); base = cmul(base, base); n = Math.floor(n / 2); }
      return b < 0 ? cdiv(1, r) : r;
    }
    return cexp(cmul(b, cln(a)));
  }
  const csin = a => cx(Math.sin(cr(a)) * Math.cosh(ci(a)), Math.cos(cr(a)) * Math.sinh(ci(a)));
  const ccos = a => cx(Math.cos(cr(a)) * Math.cosh(ci(a)), -Math.sin(cr(a)) * Math.sinh(ci(a)));
  const csinh = a => cx(Math.sinh(cr(a)) * Math.cos(ci(a)), Math.cosh(cr(a)) * Math.sin(ci(a)));
  const ccosh = a => cx(Math.cosh(cr(a)) * Math.cos(ci(a)), Math.sinh(cr(a)) * Math.sin(ci(a)));
  const hasComplex = v => isC(v) || (v instanceof Matrix && v.rows.some(r => r.some(isC)));
  /** Значение, пригодное для вычислений: не Text и не матрица с комплексными элементами. */
  function plain(v) {
    if (v instanceof Text) throw new CalcError('Текстовый результат нельзя использовать в вычислениях');
    if (v instanceof Matrix && v.rows.some(r => r.some(isC))) {
      throw new CalcError('Матрицы с комплексными элементами доступны только как результат');
    }
    return v;
  }

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
      let m = /^0(?:[xX]([0-9a-fA-F]+)|[bB]([01]+)|[oO]([0-7]+))/.exec(s.slice(i));
      if (m) {
        const radix = m[1] ? 16 : m[2] ? 2 : 8;
        out.push({ t: 'num', v: parseInt(m[1] || m[2] || m[3], radix) });
        i += m[0].length;
        continue;
      }
      m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
      if (m) { out.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
      if (m) { out.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
      if ('+-*/^()[],!%='.includes(ch)) { out.push({ t: ch }); i++; continue; }
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
          const arg = () => {
            const left = nest(additive);
            if (peek().t !== '=') return left;
            next();
            return { type: 'eq', left, right: nest(additive) };
          };
          if (peek().t !== ')' && peek().t !== 'end') {
            args.push(arg());
            while (peek().t === ',') { next(); args.push(arg()); }
          }
          expect(')');
          return { type: 'call', name, raw: tok.v, args };
        }
        if (has(CONSTANTS, tok.v) || name === 'ans') return { type: 'const', name: has(CONSTANTS, tok.v) ? tok.v : 'ans' };
        if (has(FUNCTIONS, name) || has(SPECIAL, name)) throw new CalcError(`После «${tok.v}» ожидается «(»`);
        return { type: 'var', name: tok.v }; // имя переменной: значение подставляется при вычислении
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
    if (isC(a) || isC(b)) {
      if (a instanceof Matrix || b instanceof Matrix) throw new CalcError('Нельзя складывать матрицу и число');
      return cadd(a, b, sign);
    }
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
    if (isC(a) || isC(b)) {
      if (am || bm) throw new CalcError('Матрицу нельзя умножать на комплексное число');
      return check(cmul(a, b));
    }
    if (am) return mapM(a, x => check(x * b));
    if (bm) return mapM(b, x => check(a * x));
    return check(a * b);
  }
  function div(a, b) {
    if (b instanceof Matrix) throw new CalcError('Делить на матрицу нельзя — используйте inv(...)');
    if (isC(a) || isC(b)) {
      if (a instanceof Matrix) throw new CalcError('Матрицу нельзя делить на комплексное число');
      return check(cdiv(a, b));
    }
    if (b === 0) throw new CalcError('Деление на ноль');
    return mapM(a, x => check(x / b));
  }
  function pow(a, b) {
    if (a instanceof Matrix) {
      if (b instanceof Matrix || isC(b) || !isInt(b)) throw new CalcError('Матрицу можно возводить только в целую степень');
      if (a.r !== a.c) throw new CalcError('Возводить в степень можно только квадратную матрицу');
      let base = b < 0 ? matInv(a) : a;
      let n = Math.abs(b);
      let result = identity(a.r);
      while (n > 0) { if (n & 1) result = matMul(result, base); base = n > 1 ? matMul(base, base) : base; n = Math.floor(n / 2); }
      return result;
    }
    if (b instanceof Matrix) throw new CalcError('Нельзя возводить число в степень матрицы');
    if (isC(a) || isC(b) || (a < 0 && !isInt(b))) return check(cpow(a, b));
    if (a === 0 && b < 0) throw new CalcError('Деление на ноль');
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
      if (x === 0) throw new CalcError('Логарифм определён только для x > 0');
      if (x < 0) return cln(x);
      return clean15(Math.log(x));
    }) },
    log10: { n: [1, 1], f: ew(x => {
      if (x === 0) throw new CalcError('Логарифм определён только для x > 0');
      if (x < 0) return cdiv(cln(x), Math.LN10);
      return clean15(Math.log10(x));
    }) },
    log2: { n: [1, 1], f: ew(x => {
      if (x === 0) throw new CalcError('Логарифм определён только для x > 0');
      if (x < 0) return cdiv(cln(x), Math.LN2);
      return clean15(Math.log2(x));
    }) },
    log: { n: [1, 2], f: (a) => {
      const x = num(a[0], 'log');
      if (a.length === 1 && x < 0) return cdiv(cln(x), Math.LN10);
      if (x <= 0) throw new CalcError('Логарифм определён только для x > 0');
      if (a.length === 1) return clean15(Math.log10(x));
      const b = num(a[1], 'log');
      if (b <= 0 || b === 1) throw new CalcError('Основание логарифма должно быть > 0 и ≠ 1');
      return clean15(Math.log(x) / Math.log(b));
    } },
    sqrt: { n: [1, 1], f: ew(x => {
      if (x < 0) return csqrt(x);
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
  // ---------- комплексные варианты существующих функций ----------
  function wrapC(name, g) {
    const orig = FUNCTIONS[name].f;
    FUNCTIONS[name].f = (args, ctx, nm) => (hasComplex(args[0])
      ? mapM(args[0], x => check(isC(x) ? g(x, ctx) : orig([x], ctx, nm)))
      : orig(args, ctx, nm));
    FUNCTIONS[name].cx = true;
  }
  wrapC('sqrt', csqrt);
  wrapC('exp', cexp);
  wrapC('ln', cln);
  wrapC('log10', z => cdiv(cln(z), Math.LN10));
  wrapC('log2', z => cdiv(cln(z), Math.LN2));
  wrapC('sin', csin);
  wrapC('cos', ccos);
  wrapC('sinh', csinh);
  wrapC('cosh', ccosh);
  wrapC('abs', cabs);
  {
    const origLog = FUNCTIONS.log.f;
    FUNCTIONS.log.f = (a, c, nm) => (a.length === 1 && isC(a[0]) ? cdiv(cln(a[0]), Math.LN10) : origLog(a, c, nm));
    FUNCTIONS.log.cx = true;
  }

  const scalar = (v, name) => {
    if (v instanceof Matrix || v instanceof Text) throw new CalcError(`${name}: ожидается число`);
    return v;
  };
  const pairs = (a, name) => {
    const x = flat([a[0]], name), y = flat([a[1]], name);
    if (x.length !== y.length) throw new CalcError(`${name}: наборы должны быть одной длины`);
    if (x.length < 2) throw new CalcError(`${name}: нужно минимум 2 пары значений`);
    const n = x.length;
    const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; sxy += (x[i] - mx) * (y[i] - my); }
    return { n, mx, my, sxx, syy, sxy };
  };
  const intIn = (v, name, lo, hi) => {
    const x = num(v, name);
    if (!isInt(x) || x < lo || x > hi) throw new CalcError(`${name}: нужно целое от ${lo} до ${hi}`);
    return x;
  };
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const toBase = (n, b, name, prefix) => {
    const x = intIn(n, name, -(2 ** 53), 2 ** 53);
    const s = Math.abs(x).toString(b).toUpperCase();
    return new Text((x < 0 ? '-' : '') + prefix + s, x);
  };
  const bitOp = (a, name, op) => {
    const x = intIn(a[0], name, 0, 2 ** 53 - 1), y = intIn(a[1], name, 0, 2 ** 53 - 1);
    return Number(op(BigInt(x), BigInt(y)));
  };
  const flatVec = (v, name) => {
    if (!(v instanceof Matrix)) throw new CalcError(`${name}: ожидается вектор, например [1,2,3]`);
    return v.rows.flat();
  };
  const trigNoAngle = name => new CalcError(`${name} не определён для этого угла`);
  const sinD = (x, c) => (c.deg ? (x % 180 === 0 ? 0 : cleanTrig(Math.sin(x * DEG))) : cleanTrig(Math.sin(x)));
  const cosD = (x, c) => (c.deg ? (Math.abs(x % 180) === 90 ? 0 : cleanTrig(Math.cos(x * DEG))) : cleanTrig(Math.cos(x)));
  const outAngle = (r, c) => clean15(c.deg ? r / DEG : r);

  /** Характеристический многочлен (Фаддеев — Леверье): коэффициенты от старшей степени. */
  function charPoly(m) {
    const n = m.r;
    const A = m.rows;
    let M = Array.from({ length: n }, () => new Array(n).fill(0));
    const coef = [1];
    for (let k = 1; k <= n; k++) {
      // M = A*M + c*I
      const cPrev = coef[k - 1];
      const AM = A.map((row, i) => row.map((_, j) => row.reduce((s, _v, t) => s + A[i][t] * M[t][j], 0)));
      M = AM.map((row, i) => row.map((v, j) => v + (i === j ? cPrev : 0)));
      const AMk = A.map((row, i) => row.map((_, j) => row.reduce((s, _v, t) => s + A[i][t] * M[t][j], 0)));
      const tr = AMk.reduce((s, row, i) => s + row[i], 0);
      coef.push(-tr / k);
    }
    return coef;
  }
  function rankOf(m) {
    const a = m.rows.map(r => r.slice());
    const scale = Math.max(1e-300, ...a.flat().map(Math.abs));
    let rank = 0;
    for (let c = 0; c < m.c && rank < m.r; c++) {
      let piv = rank;
      for (let r = rank + 1; r < m.r; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
      if (Math.abs(a[piv][c]) <= 1e-10 * scale) continue;
      [a[piv], a[rank]] = [a[rank], a[piv]];
      for (let r = rank + 1; r < m.r; r++) {
        const f = a[r][c] / a[rank][c];
        for (let k = c; k < m.c; k++) a[r][k] -= f * a[rank][k];
      }
      rank++;
    }
    return rank;
  }

  Object.assign(FUNCTIONS, {
    // тригонометрия: дополнительные функции
    sec: { n: [1, 1], f: ew((x, c) => { const d = cosD(x, c); if (d === 0) throw trigNoAngle('sec'); return clean15(1 / d); }) },
    csc: { n: [1, 1], f: ew((x, c) => { const d = sinD(x, c); if (d === 0) throw trigNoAngle('csc'); return clean15(1 / d); }) },
    cot: { n: [1, 1], f: ew((x, c) => { const d = sinD(x, c); if (d === 0) throw trigNoAngle('cot'); return clean15(cosD(x, c) / d); }) },
    asec: { n: [1, 1], f: ew((x, c) => {
      if (Math.abs(x) < 1) throw new CalcError('asec: |x| должен быть не меньше 1');
      return outAngle(Math.acos(1 / x), c);
    }) },
    acsc: { n: [1, 1], f: ew((x, c) => {
      if (Math.abs(x) < 1) throw new CalcError('acsc: |x| должен быть не меньше 1');
      return outAngle(Math.asin(1 / x), c);
    }) },
    acot: { n: [1, 1], f: ew((x, c) => outAngle(x === 0 ? Math.PI / 2 : Math.atan(1 / x), c)) },
    sech: { n: [1, 1], f: ew(x => clean15(1 / Math.cosh(x))) },
    csch: { n: [1, 1], f: ew(x => { if (x === 0) throw new CalcError('csch не определён при x = 0'); return clean15(1 / Math.sinh(x)); }) },
    coth: { n: [1, 1], f: ew(x => { if (x === 0) throw new CalcError('coth не определён при x = 0'); return clean15(1 / Math.tanh(x)); }) },
    deg: { n: [1, 1], f: ew(x => clean15(x / DEG)) },
    rad: { n: [1, 1], f: ew(x => clean15(x * DEG)) },

    // комплексные числа
    arg: { n: [1, 1], cx: true, f: (a, c) => {
      const z = scalar(a[0], 'arg');
      if (cr(z) === 0 && ci(z) === 0) throw new CalcError('arg(0) не определён');
      return outAngle(carg(z), c);
    } },
    conj: { n: [1, 1], cx: true, f: a => { const z = scalar(a[0], 'conj'); return isC(z) ? new Complex(z.re, -z.im) : z; } },
    re: { n: [1, 1], cx: true, f: a => cr(scalar(a[0], 're')) },
    im: { n: [1, 1], cx: true, f: a => ci(scalar(a[0], 'im')) },

    // числа
    nthroot: { n: [2, 2], f: (a) => {
      const x = num(a[0], 'nthroot'), k = num(a[1], 'nthroot');
      if (!isInt(k) || k === 0) throw new CalcError('nthroot: степень корня — целое число, не равное 0');
      if (x === 0) { if (k > 0) return 0; throw new CalcError('Деление на ноль'); }
      if (x < 0) return k % 2 !== 0 ? -FUNCTIONS.nthroot.f([-x, k]) : cpow(x, 1 / k);
      const r = Math.pow(x, 1 / k), rr = Math.round(r);
      return Math.pow(rr, k) === x ? rr : clean15(r);
    } },
    random: { n: [0, 0], f: () => Math.random() },
    randint: { n: [2, 2], f: (a) => {
      const lo = intIn(a[0], 'randint', -(2 ** 52), 2 ** 52), hi = intIn(a[1], 'randint', -(2 ** 52), 2 ** 52);
      if (lo > hi) throw new CalcError('randint(a, b): нужно a ≤ b');
      return lo + Math.floor(Math.random() * (hi - lo + 1));
    } },
    isprime: { n: [1, 1], f: a => (N.isPrime(intIn(a[0], 'isprime', 0, 2 ** 53)) ? 1 : 0) },
    factor: { n: [1, 1], f: (a) => {
      const n = intIn(a[0], 'factor', 1, 2 ** 53);
      return new Matrix([n === 1 ? [1] : N.factorize(n)]);
    } },
    fib: { n: [1, 1], f: a => {
      const n = intIn(a[0], 'fib', 0, 1476);
      let x = 0, y = 1;
      for (let i = 0; i < n; i++) [x, y] = [y, x + y];
      return check(x);
    } },
    frac: { n: [1, 1], f: (a) => {
      const x = num(a[0], 'frac');
      if (isInt(x)) return new Text(String(x), x);
      const fr = N.toFraction(x, 1e4);
      if (!fr) throw new CalcError('frac: подходящей простой дроби нет');
      return new Text(`${fr[0]}/${fr[1]}`, x);
    } },

    // системы счисления и биты
    bin: { n: [1, 1], f: a => toBase(a[0], 2, 'bin', '0b') },
    oct: { n: [1, 1], f: a => toBase(a[0], 8, 'oct', '0o') },
    hex: { n: [1, 1], f: a => toBase(a[0], 16, 'hex', '0x') },
    base: { n: [2, 2], f: (a) => {
      const b = intIn(a[1], 'base', 2, 36);
      const t = toBase(a[0], b, 'base', '');
      return new Text(t.s + String(b).split('').map(d => SUB[Number(d)]).join(''), t.n);
    } },
    band: { n: [2, 2], f: a => bitOp(a, 'band', (x, y) => x & y) },
    bor: { n: [2, 2], f: a => bitOp(a, 'bor', (x, y) => x | y) },
    bxor: { n: [2, 2], f: a => bitOp(a, 'bxor', (x, y) => x ^ y) },
    shl: { n: [2, 2], f: (a) => {
      const x = intIn(a[0], 'shl', 0, 2 ** 53 - 1), k = intIn(a[1], 'shl', 0, 52);
      return check(x * 2 ** k < 2 ** 53 ? x * 2 ** k : NaN);
    } },
    shr: { n: [2, 2], f: (a) => {
      const x = intIn(a[0], 'shr', 0, 2 ** 53 - 1), k = intIn(a[1], 'shr', 0, 52);
      return Math.floor(x / 2 ** k);
    } },

    // статистика и вероятность
    mode: { n: [1, 64], f: (a) => {
      const v = flat(a, 'mode');
      const cnt = new Map();
      v.forEach(x => cnt.set(x, (cnt.get(x) || 0) + 1));
      const top = Math.max(...cnt.values());
      if (top === 1 && v.length > 1) throw new CalcError('mode: ни одно значение не повторяется');
      const modes = [...cnt].filter(([, c]) => c === top).map(([x]) => x).sort((p, q) => p - q);
      return modes.length === 1 ? modes[0] : new Matrix([modes]);
    } },
    var: { n: [1, 64], f: (a) => {
      const v = flat(a, 'var');
      if (v.length < 2) throw new CalcError('var: нужно минимум 2 значения');
      const m = v.reduce((s, x) => s + x, 0) / v.length;
      return check(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
    } },
    varp: { n: [1, 64], f: (a) => {
      const v = flat(a, 'varp');
      const m = v.reduce((s, x) => s + x, 0) / v.length;
      return check(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
    } },
    percentile: { n: [2, 64], f: (a) => {
      const p = num(a[0], 'percentile');
      if (p < 0 || p > 100) throw new CalcError('percentile: процент должен быть от 0 до 100');
      const v = flat(a.slice(1), 'percentile').sort((x, y) => x - y);
      const pos = ((v.length - 1) * p) / 100, lo = Math.floor(pos), fr = pos - lo;
      return lo + 1 < v.length ? v[lo] + fr * (v[lo + 1] - v[lo]) : v[lo];
    } },
    cov: { n: [2, 2], f: (a) => { const s = pairs(a, 'cov'); return check(s.sxy / (s.n - 1)); } },
    corr: { n: [2, 2], f: (a) => {
      const s = pairs(a, 'corr');
      if (s.sxx === 0 || s.syy === 0) throw new CalcError('corr: значения одного из наборов совпадают');
      return clean15(s.sxy / Math.sqrt(s.sxx * s.syy));
    } },
    linreg: { n: [2, 2], f: (a) => {
      const s = pairs(a, 'linreg');
      if (s.sxx === 0) throw new CalcError('linreg: все значения x одинаковы');
      const slope = s.sxy / s.sxx;
      const r = s.syy === 0 ? 1 : s.sxy / Math.sqrt(s.sxx * s.syy);
      return new Matrix([[clean15(slope), clean15(s.my - slope * s.mx), clean15(r)]]);
    } },
    normpdf: { n: [1, 3], f: (a) => {
      const x = num(a[0], 'normpdf'), mu = a.length > 1 ? num(a[1], 'normpdf') : 0, sd = a.length > 2 ? num(a[2], 'normpdf') : 1;
      if (sd <= 0) throw new CalcError('normpdf: σ должна быть > 0');
      const z = (x - mu) / sd;
      return clean15(Math.exp(-z * z / 2) / (sd * Math.sqrt(2 * Math.PI)));
    } },
    normcdf: { n: [1, 3], f: (a) => {
      const x = num(a[0], 'normcdf'), mu = a.length > 1 ? num(a[1], 'normcdf') : 0, sd = a.length > 2 ? num(a[2], 'normcdf') : 1;
      if (sd <= 0) throw new CalcError('normcdf: σ должна быть > 0');
      return clean15(N.normCdf((x - mu) / sd));
    } },
    binom: { n: [3, 3], f: (a) => {
      const n = intIn(a[0], 'binom', 0, 1e6), k = intIn(a[1], 'binom', 0, n), p = num(a[2], 'binom');
      if (p < 0 || p > 1) throw new CalcError('binom: вероятность должна быть от 0 до 1');
      if (p === 0) return k === 0 ? 1 : 0;
      if (p === 1) return k === n ? 1 : 0;
      const logC = n <= 170 ? Math.log(FUNCTIONS.ncr.f([n, k])) : (() => {
        let r = 0;
        const kk = Math.min(k, n - k);
        for (let i = 1; i <= kk; i++) r += Math.log((n - kk + i) / i);
        return r;
      })();
      return clean15(Math.exp(logC + k * Math.log(p) + (n - k) * Math.log(1 - p)));
    } },
    erf: { n: [1, 1], f: ew(x => N.erf(x)) },
    gamma: { n: [1, 1], f: ew(x => {
      if (x <= 0 && isInt(x)) throw new CalcError('gamma не определена для 0 и отрицательных целых');
      if (x > 171.6) throw new CalcError('Переполнение: число слишком велико');
      return N.gamma(x);
    }) },

    // матрицы и векторы
    rank: { n: [1, 1], f: a => rankOf(needMatrix(a[0], 'rank')) },
    lsolve: { n: [2, 2], f: (a) => {
      const A = needSquare(a[0], 'lsolve');
      const b = flatVec(a[1], 'lsolve');
      const n = A.r;
      if (b.length !== n) throw new CalcError(`lsolve: правая часть должна содержать ${n} чисел`);
      const m = A.rows.map((row, i) => row.concat(b[i]));
      const scale = Math.max(1, ...A.rows.flat().map(Math.abs));
      for (let c = 0; c < n; c++) {
        let piv = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
        if (Math.abs(m[piv][c]) < 1e-12 * scale) throw new CalcError('Система вырождена: решение не единственно');
        [m[piv], m[c]] = [m[c], m[piv]];
        for (let r = 0; r < n; r++) {
          if (r === c) continue;
          const f = m[r][c] / m[c][c];
          if (f !== 0) for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
        }
      }
      return new Matrix([m.map((row, i) => clean15(row[n] / row[i]) + 0)]);
    } },
    dot: { n: [2, 2], f: (a) => {
      const u = flatVec(a[0], 'dot'), v = flatVec(a[1], 'dot');
      if (u.length !== v.length) throw new CalcError('dot: векторы разной длины');
      return check(u.reduce((s, x, i) => s + x * v[i], 0));
    } },
    cross: { n: [2, 2], f: (a) => {
      const u = flatVec(a[0], 'cross'), v = flatVec(a[1], 'cross');
      if (u.length !== 3 || v.length !== 3) throw new CalcError('cross: нужны векторы из 3 чисел');
      return new Matrix([[u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]].map(x => check(x) + 0)]);
    } },
    norm: { n: [1, 1], f: (a) => {
      const v = flat([needMatrix(a[0], 'norm')], 'norm');
      return check(Math.hypot(...v));
    } },
    eig: { n: [1, 1], f: (a) => {
      const m = needSquare(a[0], 'eig');
      if (m.r > 10) throw new CalcError('eig: матрица не больше 10×10');
      const roots = N.polyRoots(charPoly(m)).map(([re, im]) => cx(re, im));
      roots.sort((p, q) => cr(q) - cr(p) || ci(q) - ci(p));
      return new Matrix([roots]);
    } }
  });

  FUNCTIONS.trans = FUNCTIONS.transpose;
  FUNCTIONS.identity = FUNCTIONS.eye;
  FUNCTIONS.fact = FUNCTIONS.factorial;

  const CONSTANTS = { pi: Math.PI, e: Math.E, phi: (1 + Math.sqrt(5)) / 2, i: new Complex(0, 1) };

  // Основные имена функций (без синонимов) — для документации и тестов.
  const FUNCTION_NAMES = Object.keys(FUNCTIONS).filter(n => !['trans', 'identity', 'fact'].includes(n)).concat(Object.keys(SPECIAL));

  // ---------- формы с переменной: solve, diff, integral, limit, sigma, product ----------
  /** Ошибка структуры выражения (не область определения): не глушится при переборе точек. */
  class StructError extends CalcError {}

  const withVar = (ctx, name, v) => Object.assign({}, ctx, { vars: Object.assign({}, ctx.vars, { [name]: v }) });
  function varName(node, fname) {
    if (node.type === 'var' || (node.type === 'const' && node.name !== 'ans')) return node.type === 'var' ? node.name : node.name;
    throw new StructError(`${fname}: второй аргумент — имя переменной, например x`);
  }
  /** Вещественная функция переменной; вне области определения и при комплексном значении даёт NaN. */
  function realFn(node, name, ctx, fname) {
    return (x) => {
      const c = withVar(ctx, name, x);
      try {
        const v = node.type === 'eq'
          ? addSub(plain(evalNode(node.left, c)), plain(evalNode(node.right, c)), -1)
          : plain(evalNode(node, c));
        if (isC(v)) return NaN;
        if (typeof v !== 'number') throw new StructError(`${fname}: выражение должно давать число`);
        return v;
      } catch (e) {
        if (e instanceof CalcError && !(e instanceof StructError)) return NaN;
        throw e;
      }
    };
  }
  const tidy = (v, digits) => {
    const r = Number(v.toPrecision(digits));
    return Math.abs(r - Math.round(r)) < 10 ** -(digits - 2) * Math.max(1, Math.abs(r)) ? Math.round(r) + 0 : r;
  };
  const realArg = (v, fname) => {
    if (typeof v !== 'number') throw new CalcError(`${fname}: ожидается число`);
    return v;
  };

  /** Коэффициенты многочлена (от старшей степени), если f — многочлен степени ≤ 8; иначе null. */
  function polyCoefs(f) {
    const K = 10, ys = [];
    for (let k = 0; k < K; k++) {
      const y = f(k);
      if (!Number.isFinite(y)) return null;
      ys.push(y);
    }
    const scale = Math.max(...ys.map(Math.abs));
    const diffs = [ys];
    for (let m = 1; m < K; m++) diffs.push(diffs[m - 1].slice(1).map((v, i) => v - diffs[m - 1][i]));
    let d = -1;
    for (let k = 0; k <= 8 && d < 0; k++) if (diffs[k + 1].every(v => Math.abs(v) <= 1e-9 * scale)) d = k;
    if (d < 0) return null;
    // форма Ньютона → одночлены (от младшей степени)
    const coef = new Array(d + 1).fill(0);
    let basis = [1];
    for (let m = 0; m <= d; m++) {
      if (m > 0) {
        const nb = new Array(basis.length + 1).fill(0);
        basis.forEach((c, j) => { nb[j + 1] += c / m; nb[j] -= (c * (m - 1)) / m; });
        basis = nb;
      }
      basis.forEach((c, j) => { coef[j] += diffs[m][0] * c; });
    }
    const high = coef.map(c => Number(c.toPrecision(12))).reverse();
    // близкая к многочлену функция на малом отрезке (sin в градусах) не должна приниматься за многочлен
    for (const x of [-23.7, 0.37, 7.7, 41.1, 100.3]) {
      const fx = f(x);
      const px = high.reduce((acc, c) => acc * x + c, 0);
      if (!Number.isFinite(fx) || Math.abs(fx - px) > 1e-8 * Math.max(1, Math.abs(fx), Math.abs(px))) return null;
    }
    return high;
  }

  function solveForm(node, name, guess, ctx) {
    const f = realFn(node, name, ctx, 'solve');
    f(1); // структурные ошибки (неизвестное имя, не число) всплывают сразу
    // корень, найденный приближённо, «прилипает» к 0 или к целому, если f там точно обращается в ноль
    const snapRoot = (r) => {
      for (const c of [0, Math.round(r)]) if (Math.abs(r - c) < 1e-5 * Math.max(1, Math.abs(c)) && f(c) === 0) return c;
      return tidy(r, 12);
    };
    if (guess !== undefined) {
      const r = N.newton(f, realArg(guess, 'solve'));
      if (!Number.isFinite(r)) throw new CalcError('solve: корень рядом с указанной точкой не найден');
      return snapRoot(r);
    }
    const coefs = polyCoefs(f);
    if (coefs) {
      while (coefs.length > 1 && coefs[0] === 0) coefs.shift();
      if (coefs.length === 1) {
        throw new CalcError(coefs[0] === 0 ? 'solve: уравнению удовлетворяет любое x' : 'solve: решений нет');
      }
      const vals = [];
      N.polyRoots(coefs).forEach(([re, im]) => {
        let z = im === 0 ? re : new Complex(re, im);
        if (im === 0) {
          const r2 = N.newton(f, re);
          if (Number.isFinite(r2) && Math.abs(r2 - re) <= 1e-6 * Math.max(1, Math.abs(re))) z = snapRoot(r2);
        }
        if (!vals.some(v => Math.abs(cr(v) - cr(z)) <= 1e-6 * Math.max(1, Math.abs(cr(z))) && Math.abs(ci(v) - ci(z)) <= 1e-6 * Math.max(1, Math.abs(ci(z))))) vals.push(z);
      });
      vals.sort((p, q) => (ci(p) !== 0) - (ci(q) !== 0) || cr(p) - cr(q) || ci(p) - ci(q));
      return vals.length === 1 ? vals[0] : new Matrix([vals]);
    }
    // ищем всё шире: [-10; 10], затем [-100; 100] и [-1000; 1000]
    for (const R of [10, 100, 1000]) {
      const roots = N.findRealRoots(f, -R, R, 8000).slice(0, 30).map(snapRoot);
      if (roots.length) return roots.length === 1 ? roots[0] : new Matrix([roots]);
    }
    throw new CalcError('solve: корней на [−1000; 1000] не найдено — укажите начальное приближение третьим аргументом');
  }

  function limitForm(f, a) {
    const side = (dir) => {
      const at = h => f(a + dir * h);
      const est = (h) => { const v1 = at(h), v2 = at(h / 2); return 2 * v2 - v1; };
      const e1 = est(1e-4), e2 = est(1e-5);
      if (Number.isNaN(e1) || Number.isNaN(e2)) return NaN;
      if (Math.abs(e1 - e2) > 1e-4 * Math.max(1, Math.abs(e2))) return Infinity; // не сходится
      return e2;
    };
    let L = side(-1), R = side(1);
    const ok = v => Number.isFinite(v);
    // очень близко к точке: нужно для негладких функций (√x, |x|ᵖ) и для малых пределов (x·ln x → 0)
    const near = (dir) => {
      const v = [1e-12, 1e-13, 1e-14].map(h => f(a + dir * h));
      if (v.some(Number.isNaN)) return NaN;
      if (Math.abs(v[2] - v[1]) > 1e-3 * Math.max(1, Math.abs(v[2]))) return Infinity;
      return Math.abs(v[2]) < 1e-6 ? 0 : v[2];
    };
    const small = v => !Number.isFinite(v) || Math.abs(v) < 1e-3;
    if (small(L) && !(Number.isNaN(L) && Number.isNaN(R)) && !(Number.isNaN(L) && small(R) === false)) {
      const nl = near(-1); if (Number.isFinite(nl) || !ok(L)) L = nl;
    }
    if (small(R) && !(Number.isNaN(R) && Number.isNaN(L))) {
      const nr = near(1); if (Number.isFinite(nr) || !ok(R)) R = nr;
    }
    let v;
    if (ok(L) && ok(R)) {
      if (Math.abs(L - R) > 1e-4 * Math.max(1, Math.abs(L), Math.abs(R))) throw new CalcError('limit: односторонние пределы различаются — предела нет');
      v = (L + R) / 2;
    } else if (ok(L) && Number.isNaN(R)) v = L;
    else if (ok(R) && Number.isNaN(L)) v = R;
    else throw new CalcError('limit: предел не существует или бесконечен');
    return tidy(v, 8);
  }

  function special(n, ctx) {
    const fname = n.name;
    const [lo, hi] = SPECIAL[fname];
    if (n.args.length < lo || n.args.length > hi) {
      throw new CalcError(`${fname}: ${lo === hi ? `нужно аргументов: ${lo}` : `аргументов от ${lo} до ${hi}`}`);
    }
    const name = varName(n.args[1], fname);
    const val = i => realArg(plain(evalNode(n.args[i], ctx)), fname);
    if (fname === 'solve') return solveForm(n.args[0], name, n.args[2] ? val(2) : undefined, ctx);
    if (n.args[0].type === 'eq') throw new StructError('Знак «=» допустим только внутри solve(...)');
    const f = realFn(n.args[0], name, ctx, fname);
    f(0.5);
    if (fname === 'diff') {
      const a = val(2), r = N.derivative(f, a);
      if (!Number.isFinite(r)) throw new CalcError('diff: функция не дифференцируема в этой точке');
      return tidy(r, 10);
    }
    if (fname === 'integral') {
      const a = val(2), b = val(3);
      let r;
      try { r = N.integrate(f, a, b); } catch (e) { r = NaN; }
      if (!Number.isFinite(r)) throw new CalcError('integral: интеграл не сходится или функция неопределена на отрезке');
      return tidy(r, 12);
    }
    if (fname === 'limit') return limitForm(f, val(2));
    // sigma / product: значения могут быть комплексными, поэтому считаем без realFn
    const a = val(2), b = val(3);
    if (!isInt(a) || !isInt(b)) throw new CalcError(`${fname}: границы — целые числа`);
    if (b - a > 1e6) throw new CalcError(`${fname}: слишком много слагаемых (не более 1 000 000)`);
    let acc = fname === 'sigma' ? 0 : 1;
    for (let k = a; k <= b; k++) {
      const v = plain(evalNode(n.args[0], withVar(ctx, name, k)));
      if (typeof v !== 'number' && !isC(v)) throw new CalcError(`${fname}: слагаемое должно быть числом`);
      acc = fname === 'sigma' ? addSub(acc, v, 1) : mul(acc, v);
    }
    return check(acc);
  }

  // ---------- вычисление ----------
  function evalNode(n, ctx) {
    switch (n.type) {
      case 'num': return check(n.v);
      case 'const': {
        if (n.name === 'ans') return ctx.ans instanceof Text ? ctx.ans.n : ctx.ans;
        if (ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, n.name)) return ctx.vars[n.name];
        return CONSTANTS[n.name];
      }
      case 'var': {
        if (ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, n.name)) return ctx.vars[n.name];
        throw new StructError(`Неизвестное имя «${n.name}»`);
      }
      case 'eq': throw new StructError('Знак «=» допустим только внутри solve(...)');
      case 'neg': {
        const v = plain(evalNode(n.arg, ctx));
        return mapM(v, x => (isC(x) ? new Complex(-x.re, -x.im) : -x));
      }
      case 'add': {
        const right = n.right;
        // «200 + 10%» = 200 + 10% от 200
        if (right.type === 'pct') {
          const a = evalNode(n.left, ctx);
          const b = evalNode(right.arg, ctx);
          if (typeof a !== 'number' || typeof b !== 'number') throw new CalcError('Проценты применимы только к числам');
          return addNum(a, (n.op === '+' ? 1 : -1) * ((a * b) / 100), 1);
        }
        return addSub(plain(evalNode(n.left, ctx)), plain(evalNode(right, ctx)), n.op === '+' ? 1 : -1);
      }
      case 'mul': {
        const a = plain(evalNode(n.left, ctx)), b = plain(evalNode(n.right, ctx));
        return n.op === '*' ? mul(a, b) : div(a, b);
      }
      case 'pow': return pow(plain(evalNode(n.base, ctx)), plain(evalNode(n.exp, ctx)));
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
        if (has(SPECIAL, n.name)) return special(n, ctx);
        const fn = has(FUNCTIONS, n.name) ? FUNCTIONS[n.name] : undefined;
        if (!fn) {
          // «k(k+1)»: переменная, за которой идут скобки, — неявное умножение
          if (ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, n.raw) && n.args.length === 1) {
            return mul(plain(ctx.vars[n.raw]), plain(evalNode(n.args[0], ctx)));
          }
          throw new CalcError(`Неизвестная функция «${n.name}»`);
        }
        const [lo, hi] = fn.n;
        if (n.args.length < lo || n.args.length > hi) {
          throw new CalcError(`${n.name}: ${lo === hi ? `нужно аргументов: ${lo}` : `аргументов от ${lo} до ${hi}`}`);
        }
        const args = n.args.map(a => evalNode(a, ctx));
        args.forEach((a) => {
          if (a instanceof Text) plain(a);
          if (hasComplex(a) && !fn.cx) throw new CalcError(`${n.name}: комплексные числа не поддерживаются`);
        });
        return check(fn.f(args, ctx, n.name));
      }
      default: throw new CalcError('Внутренняя ошибка разбора');
    }
  }

  /** evaluate(expr, { deg: true, ans: 0 }) → number | Matrix. Бросает CalcError. */
  function evaluate(expr, opts) {
    const ctx = { deg: !opts || opts.deg !== false, ans: opts && opts.ans !== undefined ? opts.ans : 0, vars: (opts && opts.vars) || {} };
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
  function formatComplex(z, places) {
    const im = Math.abs(z.im) === 1 ? '' : formatNumber(Math.abs(z.im), places);
    if (z.re === 0) return (z.im < 0 ? '-' : '') + im + 'i';
    return formatNumber(z.re, places) + (z.im < 0 ? '-' : '+') + im + 'i';
  }
  function formatValue(v, places) {
    const one = x => (isC(x) ? formatComplex(x, places) : formatNumber(x, places));
    if (v instanceof Text) return v.s;
    if (v instanceof Matrix) {
      const rows = v.rows.map(r => '[' + r.map(one).join(', ') + ']');
      return v.r === 1 ? rows[0] : '[' + rows.join(', ') + ']';
    }
    return one(v);
  }

  return { evaluate, parse, tokenize, formatNumber, formatValue, Matrix, Complex, Text, CalcError, FUNCTIONS, SPECIAL, FUNCTION_NAMES, CONSTANTS };
});
