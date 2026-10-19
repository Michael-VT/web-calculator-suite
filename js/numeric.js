/* Численные алгоритмы без DOM и без зависимостей: спецфункции, корни, интегралы, простые числа.
 * Работают с обычными числами; комплексные корни возвращаются парами [re, im]. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CalcNumeric = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clean15 = x => Number(x.toPrecision(15));

  // ---------- спецфункции ----------
  const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

  function gamma(x) {
    if (Number.isInteger(x) && x > 0 && x <= 171) {
      let r = 1;
      for (let i = 2; i < x; i++) r *= i;
      return r;
    }
    if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
    x -= 1;
    let a = LANCZOS[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
    return clean15(Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a);
  }

  // erf: ряд с положительными слагаемыми (нет потери точности), для |x| ≥ 6 результат ±1
  function erf(x) {
    const ax = Math.abs(x);
    if (ax >= 6) return Math.sign(x);
    let term = ax, sum = ax;
    for (let n = 1; n < 400; n++) {
      term *= (2 * ax * ax) / (2 * n + 1);
      sum += term;
      if (term < 1e-17 * sum) break;
    }
    return Math.sign(x) * clean15((2 / Math.sqrt(Math.PI)) * Math.exp(-ax * ax) * sum);
  }

  function normCdf(z) {
    return z < 0 ? 0.5 * (1 - erf(-z / Math.SQRT2)) : 0.5 * (1 + erf(z / Math.SQRT2));
  }

  // ---------- многочлены ----------
  /** Корни многочлена; coeffs — от старшей степени к младшей. Метод Аберта + доводка Ньютоном. */
  function polyRoots(coeffs) {
    const c = coeffs.slice();
    while (c.length > 1 && c[0] === 0) c.shift();
    let zeros = 0;
    while (c.length > 1 && c[c.length - 1] === 0) { c.pop(); zeros++; }
    const n = c.length - 1;
    const roots = [];
    if (n >= 1) {
      const a = c.map(v => v / c[0]);
      if (n === 1) roots.push([-a[1], 0]);
      else if (n === 2) {
        const d = a[1] * a[1] - 4 * a[2];
        if (d >= 0) {
          // устойчивая формула без вычитания близких чисел
          const q = -0.5 * (a[1] + (a[1] >= 0 ? 1 : -1) * Math.sqrt(d));
          const r1 = q, r2 = q !== 0 ? a[2] / q : 0;
          if (q === 0) roots.push([0, 0], [0, 0]); else roots.push([r1, 0], [r2, 0]);
        } else {
          const s = Math.sqrt(-d) / 2;
          roots.push([-a[1] / 2, s], [-a[1] / 2, -s]);
        }
      } else {
        const R = 1 + Math.max(...a.slice(1).map(Math.abs));
        const z = Array.from({ length: n }, (_, k) => {
          const ang = (2 * Math.PI * k) / n + 0.4;
          return [R * 0.5 * Math.cos(ang), R * 0.5 * Math.sin(ang)];
        });
        const evalP = (zr, zi) => {
          let pr = 1, pi = 0, dr = 0, di = 0;
          for (let k = 1; k <= n; k++) {
            const ndr = dr * zr - di * zi + pr, ndi = dr * zi + di * zr + pi;
            dr = ndr; di = ndi;
            const npr = pr * zr - pi * zi + a[k], npi = pr * zi + pi * zr;
            pr = npr; pi = npi;
          }
          return [pr, pi, dr, di];
        };
        for (let it = 0; it < 500; it++) {
          let moved = 0;
          for (let k = 0; k < n; k++) {
            const [pr, pi, dr, di] = evalP(z[k][0], z[k][1]);
            const den = dr * dr + di * di;
            if (den === 0) { z[k][0] += 1e-6; continue; }
            // w = P/P'
            const wr = (pr * dr + pi * di) / den, wi = (pi * dr - pr * di) / den;
            let sr = 0, si = 0;
            for (let j = 0; j < n; j++) {
              if (j === k) continue;
              const xr = z[k][0] - z[j][0], xi = z[k][1] - z[j][1];
              const d2 = xr * xr + xi * xi || 1e-300;
              sr += xr / d2; si += -xi / d2;
            }
            // Аберт: w / (1 - w * s)
            const mr = 1 - (wr * sr - wi * si), mi = -(wr * si + wi * sr);
            const m2 = mr * mr + mi * mi || 1e-300;
            const stepr = (wr * mr + wi * mi) / m2, stepi = (wi * mr - wr * mi) / m2;
            z[k][0] -= stepr; z[k][1] -= stepi;
            moved = Math.max(moved, Math.abs(stepr) + Math.abs(stepi));
          }
          if (moved < 1e-15 * R) break;
        }
        z.forEach(r => roots.push(r));
      }
    }
    for (let i = 0; i < zeros; i++) roots.push([0, 0]);
    const scale = Math.max(1, ...roots.map(r => Math.hypot(r[0], r[1])));
    return roots.map(([re, im]) => {
      const snap = v => (Math.abs(v - Math.round(v)) < 1e-9 * scale ? Math.round(v) : clean15(v)) + 0; // «+ 0» убирает −0
      if (Math.abs(im) < 1e-9 * scale) return [snap(re), 0];
      return [snap(re), snap(im)];
    });
  }

  // ---------- поиск корней функции ----------
  /** Все вещественные корни f на [lo, hi]: сканирование по сетке, затем бисекция/золотое сечение для касаний. */
  function findRealRoots(f, lo, hi, steps) {
    const n = steps || 4000;
    const h = (hi - lo) / n;
    const xs = [], ys = [];
    for (let i = 0; i <= n; i++) {
      const x = lo + i * h;
      let y;
      try { y = f(x); } catch (e) { y = NaN; }
      xs.push(x); ys.push(typeof y === 'number' && Number.isFinite(y) ? y : NaN);
    }
    const roots = [];
    const add = r => { if (!roots.some(q => Math.abs(q - r) < 1e-7 * Math.max(1, Math.abs(r)))) roots.push(r); };
    const bisect = (a, b, fa) => {
      for (let k = 0; k < 200; k++) {
        const m = (a + b) / 2;
        const fm = f(m);
        if (fm === 0) return m;
        if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else b = m;
        if (Math.abs(b - a) < 1e-15 * Math.max(1, Math.abs(a))) break;
      }
      return (a + b) / 2;
    };
    for (let i = 0; i < n; i++) {
      const y0 = ys[i], y1 = ys[i + 1];
      if (Number.isNaN(y0) || Number.isNaN(y1)) continue;
      if (y0 === 0) add(xs[i]);
      else if (y0 * y1 < 0) {
        const r = bisect(xs[i], xs[i + 1], y0);
        // разрыв (1/x) не считаем корнем
        if (Math.abs(f(r)) < 1e-6 * Math.max(Math.abs(y0), Math.abs(y1), 1)) add(r);
      } else if (i > 0 && !Number.isNaN(ys[i - 1])) {
        // касание: локальный минимум |f| без смены знака
        const a0 = Math.abs(ys[i - 1]), a1 = Math.abs(y0), a2 = Math.abs(y1);
        if (a1 < a0 && a1 <= a2 && a1 < 1e-2) {
          let a = xs[i - 1], b = xs[i + 1];
          for (let k = 0; k < 120; k++) {
            const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3;
            if (Math.abs(f(m1)) < Math.abs(f(m2))) b = m2; else a = m1;
          }
          const r = (a + b) / 2;
          if (Math.abs(f(r)) < 1e-9) add(r);
        }
      }
    }
    if (!Number.isNaN(ys[n]) && ys[n] === 0) add(xs[n]);
    return roots.sort((p, q) => p - q);
  }

  /** Метод Ньютона из заданной точки. */
  function newton(f, x0) {
    let x = x0;
    for (let k = 0; k < 100; k++) {
      const fx = f(x);
      if (fx === 0) return x;
      const h = 1e-6 * Math.max(1, Math.abs(x));
      const d = (f(x + h) - f(x - h)) / (2 * h);
      if (!Number.isFinite(d) || d === 0) return NaN;
      const nx = x - fx / d;
      if (!Number.isFinite(nx)) return NaN;
      if (Math.abs(nx - x) < 1e-14 * Math.max(1, Math.abs(nx))) return nx;
      x = nx;
    }
    return NaN;
  }

  // ---------- анализ ----------
  /** Производная в точке: экстраполяция Ричардсона по центральным разностям. */
  function derivative(f, x) {
    const h0 = 0.1 * Math.max(1, Math.abs(x));
    const T = [];
    for (let i = 0; i < 8; i++) {
      const h = h0 / Math.pow(2, i);
      T.push([(f(x + h) - f(x - h)) / (2 * h)]);
      for (let j = 1; j <= i; j++) T[i][j] = T[i][j - 1] + (T[i][j - 1] - T[i - 1][j - 1]) / (Math.pow(4, j) - 1);
    }
    return T[7][7];
  }

  const GK_X = [0.991455371120813, 0.949107912342759, 0.864864423359769, 0.741531185599394, 0.586087235467691,
    0.405845151377397, 0.207784955007898, 0];
  const GK_WK = [0.022935322010529, 0.063092092629979, 0.104790010322250, 0.140653259715525, 0.169004726639267,
    0.190350578064785, 0.204432940075298, 0.209482141084728];
  const GK_WG = [0, 0.129484966168870, 0, 0.279705391489277, 0, 0.381830050505119, 0, 0.417959183673469];

  function gk15(f, a, b) {
    const c = (a + b) / 2, h = (b - a) / 2;
    const fc = f(c);
    let k = fc * GK_WK[7], g = fc * GK_WG[7];
    for (let i = 0; i < 7; i++) {
      const dx = h * GK_X[i];
      const s = f(c - dx) + f(c + dx);
      k += GK_WK[i] * s;
      g += GK_WG[i] * s;
    }
    return [k * h, Math.abs((k - g) * h)];
  }

  /** Адаптивный интеграл Гаусса — Кронрода. Бросает Error при расходимости/особенности. */
  function integrate(f, a, b) {
    if (a === b) return 0;
    if (a > b) return -integrate(f, b, a);
    let total = 0, calls = 0;
    const rec = (lo, hi, tol, depth) => {
      if (++calls > 20000) throw new Error('slow');
      const [v, err] = gk15(f, lo, hi);
      if (!Number.isFinite(v)) throw new Error('nonfinite');
      if (err <= Math.max(tol, 1e-14 * Math.abs(v)) || depth >= 30) return v;
      const m = (lo + hi) / 2;
      return rec(lo, m, tol / 2, depth + 1) + rec(m, hi, tol / 2, depth + 1);
    };
    total = rec(a, b, 1e-12 * Math.max(1, Math.abs(b - a)), 0);
    return total;
  }

  // ---------- целые числа ----------
  function modPow(b, e, m) {
    let r = 1n;
    b %= m;
    while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; }
    return r;
  }
  function isPrime(n) {
    if (n < 2) return false;
    if (n < 4) return true;
    if (n % 2 === 0 || n % 3 === 0) return false;
    const N = BigInt(n);
    const d0 = N - 1n;
    let d = d0, s = 0;
    while (d % 2n === 0n) { d /= 2n; s++; }
    for (const a of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
      if (a % N === 0n) continue;
      let x = modPow(a, d, N);
      if (x === 1n || x === d0) continue;
      let comp = true;
      for (let r = 1; r < s; r++) { x = (x * x) % N; if (x === d0) { comp = false; break; } }
      if (comp) return false;
    }
    return true;
  }
  function factorize(n) {
    const out = [];
    for (const p of [2, 3]) while (n % p === 0) { out.push(p); n /= p; }
    for (let p = 5; p * p <= n; p += 6) {
      while (n % p === 0) { out.push(p); n /= p; }
      while (n % (p + 2) === 0) { out.push(p + 2); n /= p + 2; }
    }
    if (n > 1) out.push(n);
    return out;
  }

  /** Лучшая рациональная дробь (цепная дробь) с знаменателем ≤ maxDen; null, если точной дроби нет. */
  function toFraction(x, maxDen) {
    const neg = x < 0;
    const ax = Math.abs(x);
    let h1 = 1, h0 = 0, k1 = 0, k0 = 1, y = ax;
    for (let i = 0; i < 40; i++) {
      const a = Math.floor(y);
      const h2 = a * h1 + h0, k2 = a * k1 + k0;
      if (k2 > maxDen) break;
      h0 = h1; h1 = h2; k0 = k1; k1 = k2;
      if (Math.abs(ax - h1 / k1) < 1e-12 * Math.max(1, ax)) break;
      const frac = y - a;
      if (frac < 1e-15) break;
      y = 1 / frac;
    }
    if (k1 === 0 || Math.abs(ax - h1 / k1) > 1e-9 * Math.max(1, ax)) return null;
    return [neg ? -h1 : h1, k1];
  }

  return { gamma, erf, normCdf, polyRoots, findRealRoots, newton, derivative, integrate, isPrime, factorize, toFraction, clean15 };
});
