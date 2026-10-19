'use strict';
// Расширенная математика: комплексные числа, уравнения, анализ, теория чисел, статистика, векторы.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/calc-engine.js');
const N = require('../js/numeric.js');

const show = (expr, deg = true, places = 6) => E.formatValue(E.evaluate(expr, { deg }), places);
const num = (expr, deg = true) => E.evaluate(expr, { deg });
const close = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const fails = (expr, re) => assert.throws(() => E.evaluate(expr, { deg: true }),
  e => e instanceof E.CalcError && (!re || re.test(e.message)), expr);

test('числовые алгоритмы: erf, gamma, normCdf против известных значений', () => {
  close(N.erf(0.5), 0.5204998778130465, 1e-14);
  close(N.erf(1), 0.8427007929497149, 1e-14);
  close(N.erf(2), 0.9953222650189527, 1e-14);
  assert.equal(N.erf(0), 0);
  assert.equal(N.erf(7), 1);
  assert.equal(N.erf(-7), -1);
  close(N.erf(-1), -N.erf(1), 1e-15);
  close(N.gamma(0.5), Math.sqrt(Math.PI), 1e-14);
  close(N.gamma(10.5), 1133278.3889487855, 1e-13);
  close(N.gamma(-0.5), -2 * Math.sqrt(Math.PI), 1e-13);
  assert.equal(N.gamma(10), 362880);
  close(N.normCdf(1.959963984540054), 0.975, 1e-12);
  close(N.normCdf(-3), 0.0013498980316301, 1e-12);
});

test('числовые алгоритмы: простые числа сверены с решетом', () => {
  const LIM = 20000;
  const sieve = new Array(LIM).fill(true);
  sieve[0] = sieve[1] = false;
  for (let i = 2; i * i < LIM; i++) if (sieve[i]) for (let j = i * i; j < LIM; j += i) sieve[j] = false;
  for (let n = 0; n < LIM; n++) assert.equal(N.isPrime(n), sieve[n], String(n));
  assert.equal(N.isPrime(1000000007), true);
  assert.equal(N.isPrime(1000000007 * 3), false);
  assert.equal(N.isPrime(2 ** 31 - 1), true);
  assert.equal(N.isPrime(9007199254740881), true); // наибольшее простое < 2^53
  assert.equal(N.isPrime(9007199254740991), false);
  for (const n of [2, 12, 97, 360, 1001, 65536, 999999, 123456789, 9007199254740991]) {
    const f = N.factorize(n);
    assert.equal(f.reduce((a, b) => a * b, 1), n);
    assert.ok(f.every(p => N.isPrime(p)), `${n}: ${f}`);
    assert.deepEqual(f, f.slice().sort((a, b) => a - b));
  }
});

test('числовые алгоритмы: корни многочленов', () => {
  const sortR = r => r.map(([a, b]) => [a, b]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  assert.deepEqual(sortR(N.polyRoots([1, -3, 2])), [[1, 0], [2, 0]]);
  assert.deepEqual(sortR(N.polyRoots([1, 0, 1])), [[0, -1], [0, 1]]);
  assert.deepEqual(sortR(N.polyRoots([1, -6, 11, -6])), [[1, 0], [2, 0], [3, 0]]);
  assert.deepEqual(sortR(N.polyRoots([2, 0, -8])), [[-2, 0], [2, 0]]);
  assert.deepEqual(sortR(N.polyRoots([1, 0, 0])), [[0, 0], [0, 0]]);
  // случайные многочлены: подстановка корней даёт почти ноль
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let t = 0; t < 200; t++) {
    const deg = 3 + Math.floor(rnd() * 5);
    const c = Array.from({ length: deg + 1 }, () => Math.round((rnd() - 0.5) * 20));
    if (c[0] === 0) c[0] = 1;
    for (const [re, im] of N.polyRoots(c)) {
      let pr = 0, pi = 0;
      for (const a of c) { const nr = pr * re - pi * im + a; pi = pr * im + pi * re; pr = nr; }
      const mag = Math.max(1, ...c.map(Math.abs)) * Math.max(1, Math.hypot(re, im)) ** deg;
      assert.ok(Math.hypot(pr, pi) < 1e-7 * mag, `${c}: корень ${re}+${im}i, невязка ${Math.hypot(pr, pi)}`);
    }
  }
});

test('числовые алгоритмы: интеграл, производная, корни функции', () => {
  close(N.integrate(Math.sin, 0, Math.PI), 2, 1e-12);
  close(N.integrate(x => x * x, 0, 3), 9, 1e-12);
  close(N.integrate(x => Math.exp(-x * x), -8, 8), Math.sqrt(Math.PI), 1e-10);
  close(N.integrate(Math.sqrt, 0, 4), 16 / 3, 1e-9);
  close(N.integrate(x => x, 3, 1), -4, 1e-12);
  assert.throws(() => N.integrate(x => 1 / x, -1, 1));
  close(N.derivative(Math.sin, 0), 1, 1e-9);
  close(N.derivative(x => x ** 3, 2), 12, 1e-9);
  close(N.derivative(Math.exp, 1), Math.E, 1e-9);
  const roots = N.findRealRoots(x => Math.cos(x) - x, -10, 10);
  assert.equal(roots.length, 1);
  close(roots[0], 0.7390851332151607, 1e-12);
  assert.equal(N.findRealRoots(x => x * x + 1, -10, 10).length, 0);
  assert.deepEqual(N.findRealRoots(x => (x - 1) ** 2, -10, 10).map(r => Math.round(r * 1e6) / 1e6), [1]); // касание
  assert.equal(N.findRealRoots(x => 1 / x, -10, 10).length, 0); // разрыв — не корень
  assert.deepEqual(N.toFraction(0.75, 1e4), [3, 4]);
  assert.deepEqual(N.toFraction(-2.5, 1e4), [-5, 2]);
  assert.equal(N.toFraction(Math.PI, 1e4), null);
});

test('комплексные числа: арифметика и тождества', () => {
  assert.equal(show('i*i'), '-1');
  assert.equal(show('i^2'), '-1');
  assert.equal(show('i^4'), '1');
  assert.equal(show('(1+2i)*(3-4i)'), '11+2i');
  assert.equal(show('(1+2i)+(3-4i)'), '4-2i');
  assert.equal(show('(1+2i)-(1+2i)'), '0');
  assert.equal(show('(1+2i)/(3-4i)'), '-0.2+0.4i');
  assert.equal(show('1/i'), '-i');
  assert.equal(show('-i'), '-i');
  assert.equal(show('2i'), '2i');
  assert.equal(show('3+i'), '3+i');
  assert.equal(show('3-i'), '3-i');
  assert.equal(show('abs(3+4i)'), '5');
  assert.equal(show('conj(2+3i)'), '2-3i');
  assert.equal(show('re(2+3i)'), '2');
  assert.equal(show('im(2+3i)'), '3');
  assert.equal(show('re(5)'), '5');
  assert.equal(show('im(5)'), '0');
  assert.equal(show('arg(-1)'), '180');
  assert.equal(show('arg(1+i)'), '45');
  assert.equal(show('arg(-1)', false), '3.141593');
  assert.equal(show('sqrt(-9)'), '3i');
  assert.equal(show('sqrt(3+4i)'), '2+i');
  assert.equal(show('exp(i*pi)'), '-1');
  assert.equal(show('ln(i)'), '1.570796i');
  assert.equal(show('(1+i)^2'), '2i');
  assert.equal(show('(1+i)^8'), '16');
  assert.equal(show('(2+3i)^-1', true, 4), '0.1538-0.2308i');
  assert.equal(show('cos(i)', true, 4), '1.5431');
  assert.equal(show('sinh(i)', true, 4), '0.8415i');
  assert.equal(show('2^i', true, 4), '0.7692+0.639i');
  assert.equal(show('(-1)^0.5'), 'i');
  assert.equal(show('(-8)^(1/3)'), '1+1.732051i');
  assert.equal(show('log(-100)', true, 4), '2+1.3644i');
  // тождества на случайных числах
  let seed = 99;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 4294967296 - 0.5) * 10; };
  for (let t = 0; t < 300; t++) {
    const a = rnd(), b = rnd(), c = rnd(), d = rnd();
    const z = `(${a}+${b}i)`, w = `(${c}+${d}i)`;
    const re = x => E.evaluate(`re(${x})`), im = x => E.evaluate(`im(${x})`);
    close(re(`${z}*${w}`), a * c - b * d, 1e-9);
    close(im(`${z}*${w}`), a * d + b * c, 1e-9);
    close(num(`abs(${z}*${w})`), num(`abs(${z})*abs(${w})`), 1e-9);
    close(re(`${z}/${w}*${w}`), a, 1e-9);
    close(im(`${z}/${w}*${w}`), b, 1e-9);
    close(re(`sqrt(${z})^2`), a, 1e-9);
    close(im(`sqrt(${z})^2`), b, 1e-9);
    close(re(`exp(ln(${z}))`), a, 1e-9);
    close(im(`exp(ln(${z}))`), b, 1e-9);
  }
});

test('комплексные числа: ошибки и ограничения', () => {
  fails('atan(i)', /комплексные числа не поддерживаются/);
  fails('floor(1+i)', /комплексные/);
  fails('[[1,2],[3,4]]*i', /Матрицу нельзя умножать на комплексное/);
  fails('[[1,2],[3,4]]^i', /целую степень/);
  fails('eig([[0,-1],[1,0]])*2', /Матрицы с комплексными элементами/);
  fails('eig([[0,-1],[1,0]])+1', /Матрицы с комплексными/);
  fails('arg(0)', /arg\(0\)/);
  fails('ln(0)', /x > 0/);
  fails('0^i', /Деление на ноль/);
  fails('i/0', /Деление на ноль/);
  fails('1/(1-1i*i-1+i*i)', /Деление на ноль/);
  assert.equal(show('0^0'), '1');
});

test('solve: многочлены, комплексные корни, кратные корни', () => {
  assert.equal(show('solve(x^2-4,x)'), '[-2, 2]');
  assert.equal(show('solve(x^2=4,x)'), '[-2, 2]');
  assert.equal(show('solve(4=x^2,x)'), '[-2, 2]');
  assert.equal(show('solve(x^2+4,x)'), '[-2i, 2i]');
  assert.equal(show('solve(x^2-2x+1,x)'), '1');
  assert.equal(show('solve(x^3,x)'), '0');
  assert.equal(show('solve(2x+3=0,x)'), '-1.5');
  assert.equal(show('solve(x^3-6x^2+11x-6,x)'), '[1, 2, 3]');
  assert.equal(show('solve((x-1)(x-2)(x-3)(x-4),x)'), '[1, 2, 3, 4]');
  assert.equal(show('solve(x^4-1,x)'), '[-1, 1, -i, i]');
  assert.equal(show('solve(x^2-2,x)', true, 4), '[-1.4142, 1.4142]');
  assert.equal(show('solve(x^2+x+1,x)', true, 4), '[-0.5-0.866i, -0.5+0.866i]');
  assert.equal(show('solve(x^5-x-1,x)', true, 4), '[1.1673, -0.7649-0.3525i, -0.7649+0.3525i, 0.1812-1.084i, 0.1812+1.084i]');
  assert.equal(show('solve(1/x-2,x)'), '0.5');
  assert.equal(show('solve(sqrt(x)-3,x)'), '9');
  assert.equal(show('solve(abs(x)-3,x)'), '[-3, 3]');
  assert.equal(show('solve(a^2-9,a)'), '[-3, 3]'); // имя переменной — любое
  assert.equal(show('solve(y^2-9,y)'), '[-3, 3]');
  assert.equal(show('solve(x^2-4,x,5)'), '2');
  assert.equal(show('solve(x^2-4,x,-5)'), '-2');
  fails('solve(x+1-x,x)', /решений нет/);
  fails('solve(0*x,x)', /любое x/);
  fails('solve(y,x)', /Неизвестное имя «y»/);
  fails('solve(x^2-4,3)', /имя переменной/);
  fails('solve(x^2-4)', /аргументов/);
  fails('solve(x^2+1,x,5)', /не найден/);
  fails('solve(e^x+1,x)', /не найдено/);
  // подстановка корней обратно
  for (const [a, b, c] of [[1, -5, 6], [2, 3, -2], [1, 2, 5], [3, 0, -12], [1, 1, 1], [-1, 4, 4]]) {
    const r = E.evaluate(`solve(${a}x^2+${b}x+${c},x)`);
    const cells = r instanceof E.Matrix ? r.rows[0] : [r];
    assert.equal(cells.length, a === 1 && b === 2 && c === 1 ? 1 : 2);
    for (const z of cells) {
      const re = typeof z === 'number' ? z : z.re, im = typeof z === 'number' ? 0 : z.im;
      const pr = a * (re * re - im * im) + b * re + c, pi = a * 2 * re * im + b * im;
      assert.ok(Math.hypot(pr, pi) < 1e-9, `${a},${b},${c}: ${re}+${im}i`);
    }
  }
});

test('solve: уравнения с функциями, углы в градусах и радианах', () => {
  assert.equal(show('solve(cos(x)-x,x)', false), '0.739085');
  assert.equal(show('solve(cos(x)=x,x,0.5)', false), '0.739085');
  assert.equal(show('solve(sin(x)-x,x,1)', false), '0');
  assert.equal(show('solve(e^x-5,x)'), '1.609438');
  assert.equal(show('solve(ln(x)=1,x)'), '2.718282');
  assert.equal(show('solve(2^x=1024,x)'), '10');
  assert.equal(show('solve(x*e^x=1,x)'), '0.567143');
  const r = num('solve(sin(x)=0.5,x)'); // в градусах: 30, 150, … в окне [-1000; 1000] поиск идёт по расширяющимся окнам
  const list = r instanceof E.Matrix ? r.rows[0] : [r];
  for (const v of list) close(Math.sin(v * Math.PI / 180), 0.5, 1e-9);
  assert.ok(list.some(v => Math.abs(v - 30) < 1e-6));
  const rr = num('solve(sin(x),x)', false).rows[0];
  assert.ok(rr.some(v => v === 0) && rr.some(v => Math.abs(v - Math.PI) < 1e-9) && rr.length <= 30);
});

test('diff, integral, limit', () => {
  assert.equal(show('diff(x^3,x,2)'), '12');
  assert.equal(show('diff(x^2,x,3)'), '6');
  assert.equal(show('diff(x^3-2x,x,0)'), '-2');
  assert.equal(show('diff(sin(x),x,0)', false), '1');
  assert.equal(show('diff(sin(x),x,0)'), '0.017453');
  assert.equal(show('diff(cos(x),x,pi/2)', false), '-1');
  assert.equal(show('diff(e^x,x,1)'), '2.718282');
  assert.equal(show('diff(ln(x),x,2)'), '0.5');
  assert.equal(show('diff(sqrt(x),x,4)'), '0.25');
  assert.equal(show('diff(1/x,x,2)'), '-0.25');
  assert.equal(show('diff(abs(x),x,3)'), '1');
  assert.equal(show('diff(t^2,t,5)'), '10');
  fails('diff(x^2,x)', /аргументов/);
  fails('diff(x^2,2,3)', /имя переменной/);
  fails('diff(x^2,x,y)', /Неизвестное имя «y»/);
  assert.equal(show('integral(x^2,x,0,3)'), '9');
  assert.equal(show('integral(sin(x),x,0,pi)', false), '2');
  assert.equal(show('integral(cos(x),x,0,pi/2)', false), '1');
  assert.equal(show('integral(1/x,x,1,e)'), '1');
  assert.equal(show('integral(e^(-x^2),x,-5,5)'), '1.772454');
  assert.equal(show('integral(sqrt(x),x,0,4)'), '5.333333');
  assert.equal(show('integral(x,x,3,1)'), '-4');
  assert.equal(show('integral(5,x,0,2)'), '10');
  assert.equal(show('integral(1/(1+x^2),x,0,1)', true, 8), '0.78539816');
  assert.equal(show('integral(x*e^x,x,0,1)'), '1');
  assert.equal(show('integral(x^2,x,2,2)'), '0');
  fails('integral(1/x,x,-1,1)', /не сходится/);
  fails('integral(x,x,0)', /аргументов/);
  fails('integral(x,x,0,y)', /Неизвестное имя «y»/);
  assert.equal(show('limit(sin(x)/x,x,0)', false), '1');
  assert.equal(show('limit(sin(x)/x,x,0)', true, 4), '0.0175'); // в градусах sin(x)/x → π/180
  assert.equal(show('limit((x^2-1)/(x-1),x,1)'), '2');
  assert.equal(show('limit((e^x-1)/x,x,0)'), '1');
  assert.equal(show('limit((1+x)^(1/x),x,0)'), '2.718282');
  assert.equal(show('limit(x*ln(x),x,0)'), '0');
  assert.equal(show('limit(sqrt(x),x,0)'), '0');
  assert.equal(show('limit(x^2,x,3)'), '9');
  assert.equal(show('limit((cos(x)-1)/x^2,x,0)', false), '-0.5');
  fails('limit(1/x,x,0)', /не существует/);
  fails('limit(1/x^2,x,0)', /не существует/);
  fails('limit(abs(x)/x,x,0)', /различаются/);
  fails('limit(ln(x),x,0)', /не существует/);
});

test('sigma, product и переменные', () => {
  assert.equal(show('sigma(k,k,1,100)'), '5050');
  assert.equal(show('sigma(k^2,k,1,10)'), '385');
  assert.equal(show('sigma(1/k!,k,0,20)'), '2.718282');
  assert.equal(show('sigma(2k,k,1,3)'), '12');
  assert.equal(show('sigma(k(k+1),k,1,3)'), '20');
  assert.equal(show('sigma(i^2,i,1,10)'), '385'); // i как индекс — не мнимая единица
  assert.equal(show('sigma(x,x,5,1)'), '0');
  assert.equal(show('product(k,k,1,5)'), '120');
  assert.equal(show('product(k,k,5,1)'), '1');
  assert.equal(show('sigma(1/2^k,k,1,40)', true, 10), '1');
  assert.equal(show('sigma(k,k,1,3)+sigma(k,k,1,4)'), '16');
  assert.equal(show('sigma(sigma(j,j,1,k),k,1,3)'), '10');
  assert.equal(show('sigma(i^k,k,0,3)'), '0'); // 1 + i − 1 − i
  fails('sigma(k,k,1,10000000)', /слишком много/);
  fails('sigma(k,k,1.5,3)', /целые/);
  fails('sigma(k,k,1)', /аргументов/);
  fails('sigma(k=1,k,1,3)', /Знак «=»/);
  fails('sigma(k,3,1,3)', /имя переменной/);
  fails('k', /Неизвестное имя «k»/);
  fails('x+1', /Неизвестное имя «x»/);
  fails('2x', /Неизвестное имя «x»/);
  fails('x=3', /Неожиданный/);
  fails('foo(1)', /Неизвестная функция/);
  fails('constructor(1)', /Неизвестная функция/);
  fails('toString', /Неизвестное имя/);
});

test('теория чисел и системы счисления', () => {
  assert.equal(show('isprime(97)'), '1');
  assert.equal(show('isprime(100)'), '0');
  assert.equal(show('isprime(0)'), '0');
  assert.equal(show('isprime(2)'), '1');
  assert.equal(show('factor(360)'), '[2, 2, 2, 3, 3, 5]');
  assert.equal(show('factor(1)'), '[1]');
  assert.equal(show('factor(97)'), '[97]');
  assert.equal(show('factor(9007199254740991)'), '[6361, 69431, 20394401]');
  fails('factor(0)', /нужно целое/);
  fails('factor(2.5)', /нужно целое/);
  assert.equal(show('fib(0)'), '0');
  assert.equal(show('fib(1)'), '1');
  assert.equal(show('fib(10)'), '55');
  assert.equal(show('fib(50)'), '12586269025');
  fails('fib(-1)', /нужно целое/);
  assert.equal(show('nthroot(27,3)'), '3');
  assert.equal(show('nthroot(-8,3)'), '-2');
  assert.equal(show('nthroot(16,4)'), '2');
  assert.equal(show('nthroot(2,2)'), '1.414214');
  assert.equal(show('nthroot(8,-3)'), '0.5');
  assert.equal(show('nthroot(0,5)'), '0');
  assert.equal(show('nthroot(-4,2)'), '2i');
  fails('nthroot(8,0)', /не равное 0/);
  fails('nthroot(8,2.5)', /целое/);
  assert.equal(show('frac(0.75)'), '3/4');
  assert.equal(show('frac(-0.5)'), '-1/2');
  assert.equal(show('frac(3)'), '3');
  assert.equal(show('frac(0.125)'), '1/8');
  assert.equal(show('frac(1/3)'), '1/3');
  assert.equal(show('frac(2/7)'), '2/7');
  fails('frac(pi)', /простой дроби нет/);
  assert.equal(show('bin(10)'), '0b1010');
  assert.equal(show('bin(-5)'), '-0b101');
  assert.equal(show('oct(8)'), '0o10');
  assert.equal(show('hex(255)'), '0xFF');
  assert.equal(show('hex(0)'), '0x0');
  assert.equal(show('base(255,16)'), 'FF₁₆');
  assert.equal(show('base(10,2)'), '1010₂');
  assert.equal(show('base(35,36)'), 'Z₃₆');
  fails('base(5,1)', /от 2 до 36/);
  fails('bin(2.5)', /нужно целое/);
  assert.equal(show('0xFF+1'), '256');
  assert.equal(show('0b101*2'), '10');
  assert.equal(show('0o17'), '15');
  assert.equal(show('0XaB'), '171');
  assert.equal(show('band(12,10)'), '8');
  assert.equal(show('bor(12,10)'), '14');
  assert.equal(show('bxor(12,10)'), '6');
  assert.equal(show('shl(1,10)'), '1024');
  assert.equal(show('shr(1024,3)'), '128');
  assert.equal(show('band(2^52+1,1)'), '1');
  fails('shl(1,60)', /от 0 до 52/);
  fails('shl(2^52,2)', /Результат не определён/);
  fails('band(-1,1)', /нужно целое/);
  fails('bin(5)+1', /Текстовый результат/);
  fails('2*hex(5)', /Текстовый результат/);
  fails('-bin(5)', /Текстовый результат/);
  fails('sin(bin(5))', /Текстовый результат/);
  // Ans после текстового результата — число
  const t = E.evaluate('bin(10)');
  assert.ok(t instanceof E.Text);
  assert.equal(E.formatValue(E.evaluate('Ans+1', { ans: t })), '11');
  const r = E.evaluate('random()');
  assert.ok(r >= 0 && r < 1);
  for (let i = 0; i < 200; i++) { const v = E.evaluate('randint(3,5)'); assert.ok([3, 4, 5].includes(v)); }
  assert.equal(show('randint(5,5)'), '5');
  fails('randint(5,3)', /a ≤ b/);
  fails('random(1)', /аргументов/);
  assert.equal(show('phi', true, 8), '1.61803399');
});

test('тригонометрия: sec, csc, cot и обратные, deg/rad, гиперболические', () => {
  assert.equal(show('sec(60)'), '2');
  assert.equal(show('csc(30)'), '2');
  assert.equal(show('cot(45)'), '1');
  assert.equal(show('sec(0)'), '1');
  assert.equal(show('cot(135)'), '-1');
  assert.equal(show('asec(2)'), '60');
  assert.equal(show('acsc(2)'), '30');
  assert.equal(show('acot(1)'), '45');
  assert.equal(show('acot(0)'), '90');
  assert.equal(show('sec(pi/3)', false), '2');
  assert.equal(show('asec(2)', false), '1.047198');
  fails('sec(90)', /sec не определён/);
  fails('csc(0)', /csc не определён/);
  fails('cot(180)', /cot не определён/);
  fails('asec(0.5)', /не меньше 1/);
  fails('acsc(0)', /не меньше 1/);
  assert.equal(show('deg(pi)'), '180');
  assert.equal(show('deg(pi/2)'), '90');
  assert.equal(show('rad(180)'), '3.141593');
  assert.equal(show('sin(rad(30))', false), '0.5');
  assert.equal(show('sech(0)'), '1');
  assert.equal(show('csch(1)'), '0.850918');
  assert.equal(show('coth(1)'), '1.313035');
  fails('csch(0)', /не определён/);
  fails('coth(0)', /не определён/);
  // тождества
  for (const a of [10, 20, 33, 47, 65, 80, 100, 123, 200, 301]) {
    close(num(`sec(${a})*cos(${a})`), 1, 1e-12);
    close(num(`csc(${a})*sin(${a})`), 1, 1e-12);
    close(num(`cot(${a})*tan(${a})`), 1, 1e-12);
    close(num(`sec(${a})^2-tan(${a})^2`), 1, 1e-9);
    close(num(`csc(${a})^2-cot(${a})^2`), 1, 1e-9);
  }
});

test('статистика и вероятность', () => {
  assert.equal(show('mode(1,2,2,3)'), '2');
  assert.equal(show('mode(1,1,2,2)'), '[1, 2]');
  assert.equal(show('mode(5)'), '5');
  assert.equal(show('mode([1,2,2,3,3])'), '[2, 3]');
  fails('mode(1,2,3)', /не повторяется/);
  assert.equal(show('var(2,4,4,4,5,5,7,9)'), '4.571429');
  assert.equal(show('varp(2,4,4,4,5,5,7,9)'), '4');
  fails('var(1)', /минимум 2/);
  assert.equal(show('varp(5)'), '0');
  assert.equal(show('percentile(50,1,2,3,4)'), '2.5');
  assert.equal(show('percentile(0,5,1,3)'), '1');
  assert.equal(show('percentile(100,5,1,3)'), '5');
  assert.equal(show('percentile(25,1,2,3,4,5)'), '2');
  assert.equal(show('percentile(90,1,2,3,4,5,6,7,8,9,10)'), '9.1');
  assert.equal(show('percentile(50,[3,1,2])'), '2');
  assert.equal(show('percentile(50,7)'), '7');
  fails('percentile(101,1,2)', /от 0 до 100/);
  assert.equal(show('cov([1,2,3,4],[2,4,6,8])'), '3.333333');
  assert.equal(show('corr([1,2,3,4],[2,4,6,8.5])'), '0.998381');
  assert.equal(show('corr([1,2,3],[3,2,1])'), '-1');
  assert.equal(show('corr([1,2,3],[1,2,3])'), '1');
  fails('corr([1,1,1],[1,2,3])', /совпадают/);
  fails('cov([1,2],[1,2,3])', /одной длины/);
  fails('cov([1],[2])', /минимум 2/);
  assert.equal(show('linreg([1,2,3,4],[3,5,7,9])'), '[2, 1, 1]');
  assert.equal(show('linreg([0,1,2],[5,3,1])'), '[-2, 5, -1]');
  assert.equal(show('linreg([1,2,3,4,5],[2.2,4.1,6.2,7.9,10.1])', true, 4), '[1.96, 0.22, 0.9994]');
  fails('linreg([1,1],[1,2])', /одинаковы/);
  assert.equal(show('normpdf(0)'), '0.398942');
  assert.equal(show('normpdf(1,1,2)', true, 6), '0.199471');
  assert.equal(show('normcdf(0)'), '0.5');
  assert.equal(show('normcdf(1.96)'), '0.975002');
  assert.equal(show('normcdf(10,8,2)'), '0.841345');
  assert.equal(show('normcdf(-1)+normcdf(1)'), '1');
  fails('normpdf(0,0,0)', /σ/);
  fails('normcdf(0,0,-1)', /σ/);
  assert.equal(show('binom(10,3,0.5)'), '0.117188');
  assert.equal(show('binom(10,0,0.5)', true, 8), '0.00097656');
  assert.equal(show('binom(5,5,1)'), '1');
  assert.equal(show('binom(5,2,0)'), '0');
  assert.equal(show('sigma(binom(20,k,0.3),k,0,20)', true, 10), '1');
  assert.equal(show('binom(1000,500,0.5)', true, 6), '0.025225');
  fails('binom(5,2,1.5)', /от 0 до 1/);
  fails('binom(5,6,0.5)', /нужно целое/);
  assert.equal(show('erf(1)'), '0.842701');
  assert.equal(show('erf(-1)'), '-0.842701');
  assert.equal(show('gamma(5)'), '24');
  assert.equal(show('gamma(0.5)'), '1.772454');
  assert.equal(show('gamma(1)'), '1');
  assert.equal(show('gamma(-1.5)'), '2.363272');
  fails('gamma(0)', /не определена/);
  fails('gamma(-3)', /не определена/);
  fails('gamma(200)', /Переполнение/);
});

test('векторы, ранг, системы уравнений, собственные числа', () => {
  assert.equal(show('rank([[1,2],[2,4]])'), '1');
  assert.equal(show('rank([[1,2],[3,4]])'), '2');
  assert.equal(show('rank([[0,0],[0,0]])'), '0');
  assert.equal(show('rank([[1,2,3],[4,5,6],[7,8,9]])'), '2');
  assert.equal(show('rank([[1,2,3],[4,5,6]])'), '2');
  assert.equal(show('rank([1,2,3])'), '1');
  assert.equal(show('lsolve([[2,1],[1,3]],[3,5])'), '[0.8, 1.4]');
  assert.equal(show('lsolve([[1,1],[1,-1]],[3,1])'), '[2, 1]');
  assert.equal(show('lsolve([[2,0,0],[0,3,0],[0,0,4]],[2,6,12])'), '[1, 2, 3]');
  assert.equal(show('lsolve([[0,1],[1,0]],[1,2])'), '[2, 1]'); // нужна перестановка строк
  assert.equal(show('lsolve([[1,2],[3,4]],[[5],[6]])'), '[-4, 4.5]'); // правая часть — столбец
  fails('lsolve([[1,2],[2,4]],[1,2])', /вырождена/);
  fails('lsolve([[1,2],[3,4]],[1,2,3])', /должна содержать 2/);
  fails('lsolve([[1,2,3],[4,5,6]],[1,2])', /квадратной/);
  fails('lsolve([[1,2],[3,4]],5)', /вектор/);
  assert.equal(show('dot([1,2,3],[4,5,6])'), '32');
  assert.equal(show('dot([[1],[2]],[[3],[4]])'), '11');
  fails('dot([1,2],[1,2,3])', /разной длины/);
  assert.equal(show('cross([1,0,0],[0,1,0])'), '[0, 0, 1]');
  assert.equal(show('cross([1,2,3],[4,5,6])'), '[-3, 6, -3]');
  assert.equal(show('cross([1,2,3],[1,2,3])'), '[0, 0, 0]');
  fails('cross([1,2],[3,4])', /3 чисел/);
  assert.equal(show('norm([3,4])'), '5');
  assert.equal(show('norm([[1,2],[2,4]])'), '5');
  assert.equal(show('eig([[2,0],[0,3]])'), '[3, 2]');
  assert.equal(show('eig([[1,2],[3,4]])'), '[5.372281, -0.372281]');
  assert.equal(show('eig([[0,-1],[1,0]])'), '[i, -i]');
  assert.equal(show('eig([[2,1,0],[1,2,1],[0,1,2]])'), '[3.414214, 2, 0.585786]');
  assert.equal(show('eig([[5]])'), '[5]');
  assert.equal(show('eig([[1,1],[0,1]])'), '[1, 1]');
  assert.equal(show('eig([[4,1],[2,3]])'), '[5, 2]');
  fails('eig([1,2])', /квадратной/);
  fails('eig(eye(11))', /10×10/);
  // сумма собственных чисел = след, произведение = определитель
  for (const m of ['[[1,2],[3,4]]', '[[2,-1,0],[-1,2,-1],[0,-1,2]]', '[[4,1,2],[0,3,1],[1,0,5]]', '[[1,2,3,4],[2,3,4,1],[3,4,1,2],[4,1,2,3]]']) {
    const ev = num(`eig(${m})`).rows[0];
    close(ev.reduce((s, z) => s + (typeof z === 'number' ? z : z.re), 0), num(`trace(${m})`), 1e-9);
    close(num(`sigma(0,k,1,1)+${ev.map(z => (typeof z === 'number' ? `(${z})` : `(${z.re}+${z.im}i)`)).join('*')}`), num(`det(${m})`), 1e-8);
  }
});

test('фаззинг расширенных функций: только CalcError, без падений', () => {
  let seed = 4242;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pieces = ['1', '2', '3', '0', '-1', '0.5', '10', 'x', 'k', 'i', 'pi', 'e', ',', '(', ')', '[', ']', '+', '-', '*', '/', '^', '=', '!',
    ...E.FUNCTION_NAMES.filter(n => n !== 'random').map(n => n + '('), '[[1,2],[3,4]]', '[1,2,3]', '0xF', 'Ans'];
  let ok = 0, bad = 0;
  for (let n = 0; n < 20000; n++) {
    let s = '';
    const len = 2 + Math.floor(rnd() * 10);
    for (let j = 0; j < len; j++) s += pieces[Math.floor(rnd() * pieces.length)];
    try {
      const v = E.evaluate(s, { deg: rnd() < 0.5, ans: 3 });
      E.formatValue(v, 6);
      ok++;
    } catch (e) {
      if (!(e instanceof E.CalcError)) assert.fail(`«${s}» бросило ${e && e.constructor.name}: ${e && e.message}`);
      assert.ok(e.message && !/undefined|NaN|\[object|Infinity/.test(e.message), `${s}: ${e.message}`);
      bad++;
    }
  }
  assert.ok(ok >= 20 && bad > 100, `ok=${ok} bad=${bad}`);
});
