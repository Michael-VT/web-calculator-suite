'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/calc-engine.js');

const val = (expr, opts) => E.evaluate(expr, opts);
const show = (expr, opts, places) => E.formatValue(E.evaluate(expr, opts), places);
const close = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const fails = (expr, re, opts) => assert.throws(() => val(expr, opts), e => e instanceof E.CalcError && (!re || re.test(e.message)), expr);

test('арифметика и приоритеты', () => {
  const cases = {
    '12+34': '46', '7*8': '56', '(2+3)*4': '20', '2+3*4': '14', '10-4-3': '3', '8/2/2': '2',
    '2^10': '1024', '2^3^2': '512', '-2^2': '-4', '(-2)^2': '4', '2^-1': '0.5', '2*-3': '-6', '--3': '3',
    '5E3': '5000', '1.5E-3': '0.0015', '.5+.5': '1', '5.+1': '6', '1/3': '0.333333',
    '0.1+0.2': '0.3', '0.1+0.2-0.3': '0', '3-3': '0', '100*1.1': '110', '0.1*3': '0.3'
  };
  for (const [expr, want] of Object.entries(cases)) assert.equal(show(expr), want, expr);
});

test('неявное умножение, юникод-операторы, незакрытые скобки', () => {
  close(val('2pi'), 2 * Math.PI);
  assert.equal(show('2(3+4)'), '14');
  assert.equal(show('(1+2)(3+4)'), '21');
  assert.equal(show('2sqrt(16)'), '8');
  assert.equal(show('6×7'), '42');
  assert.equal(show('9÷3'), '3');
  assert.equal(show('5−2'), '3');
  assert.equal(show('√(16)'), '4');
  assert.equal(show('sqrt(16'), '4');
  assert.equal(show('2*(3+(4'), '14');
  assert.equal(show('[1,2'), '[1, 2]');
  assert.equal(show(' 2 + 2 '), '4');
  assert.equal(show('3π'), '9.424778');
});

test('проценты', () => {
  assert.equal(show('50%'), '0.5');
  assert.equal(show('200+10%'), '220');
  assert.equal(show('200-10%'), '180');
  assert.equal(show('200*10%'), '20');
  assert.equal(show('10%*200'), '20');
  assert.equal(show('50%%'), '0.005');
  assert.equal(show('100+50%+50%'), '225');
  fails('[1,2]%', /Проценты/);
});

test('факториал', () => {
  assert.equal(show('5!'), '120');
  assert.equal(show('0!'), '1');
  assert.equal(show('(2+3)!'), '120');
  assert.equal(show('3!^2'), '36');
  assert.equal(show('factorial(5)'), '120');
  assert.equal(val('170!'), 7.257415615307994e306);
  fails('171!', /Факториал/);
  fails('(-1)!', /Факториал/);
  fails('2.5!', /Факториал/);
});

test('константы и Ans', () => {
  close(val('pi'), Math.PI);
  close(val('e'), Math.E);
  assert.equal(show('ans*2', { ans: 21 }), '42');
  assert.equal(show('Ans+1', { ans: 41 }), '42');
  assert.equal(show('ans'), '0');
  const m = val('Ans', { ans: new E.Matrix([[1, 2]]) });
  assert.ok(m instanceof E.Matrix);
});

test('тригонометрия: градусы', () => {
  const d = { deg: true };
  const cases = {
    'sin(30)': '0.5', 'cos(60)': '0.5', 'tan(45)': '1', 'sin(0)': '0', 'sin(90)': '1', 'cos(90)': '0', 'cos(0)': '1',
    'sin(180)': '0', 'cos(180)': '-1', 'sin(270)': '-1', 'cos(270)': '0', 'sin(360)': '0', 'tan(0)': '0', 'tan(180)': '0',
    'tan(135)': '-1', 'sin(-30)': '-0.5', 'asin(0.5)': '30', 'acos(0.5)': '60', 'atan(1)': '45', 'asin(1)': '90',
    'acos(-1)': '180', 'atan2(1,1)': '45', 'atan2(1,-1)': '135', 'sin(atan(1)*2)': '1', 'sin(45)^2+cos(45)^2': '1'
  };
  for (const [expr, want] of Object.entries(cases)) assert.equal(show(expr, d), want, expr);
  fails('tan(90)', /tan/, d);
  fails('tan(270)', /tan/, d);
  fails('asin(2)', /asin/, d);
  fails('acos(-1.5)', /acos/, d);
  fails('atan2(0,0)', /atan2/, d);
});

test('тригонометрия: радианы', () => {
  const r = { deg: false };
  assert.equal(show('sin(pi/2)', r), '1');
  assert.equal(show('sin(pi)', r), '0');
  assert.equal(show('cos(pi)', r), '-1');
  assert.equal(show('cos(pi/2)', r), '0');
  assert.equal(show('tan(pi/4)', r), '1');
  close(val('asin(1)', r), Math.PI / 2);
  close(val('atan(1)', r), Math.PI / 4);
  close(val('acos(0)', r), Math.PI / 2);
  close(val('atan2(1,1)', r), Math.PI / 4);
});

test('гиперболические функции', () => {
  assert.equal(show('sinh(0)'), '0');
  assert.equal(show('cosh(0)'), '1');
  assert.equal(show('tanh(0)'), '0');
  close(val('sinh(1)'), Math.sinh(1));
  close(val('asinh(sinh(2))'), 2, 1e-12);
  close(val('acosh(cosh(2))'), 2, 1e-12);
  close(val('atanh(tanh(0.5))'), 0.5, 1e-12);
  assert.equal(show('acosh(1)'), '0');
  fails('acosh(0.5)', /acosh/);
  fails('atanh(1)', /atanh/);
  fails('cosh(1000)', /Переполнение/);
});

test('логарифмы, корни, степени', () => {
  assert.equal(show('ln(e)'), '1');
  assert.equal(show('ln(1)'), '0');
  assert.equal(show('log(1000)'), '3');
  assert.equal(show('log10(1000)'), '3');
  assert.equal(show('log(100)'), '2');
  assert.equal(show('log2(8)'), '3');
  assert.equal(show('log(8,2)'), '3');
  assert.equal(show('log(81,3)'), '4');
  assert.equal(show('exp(0)'), '1');
  assert.equal(show('exp(ln(5))'), '5');
  assert.equal(show('sqrt(16)'), '4');
  assert.equal(show('sqrt(2)^2'), '2');
  assert.equal(show('cbrt(27)'), '3');
  assert.equal(show('cbrt(-8)'), '-2');
  assert.equal(show('hypot(3,4)'), '5');
  assert.equal(show('sqrt(2^2+3^2)', {}, 4), '3.6056');
  assert.equal(show('27^(1/3)'), '3');
  assert.equal(show('10^-2'), '0.01');
  fails('ln(0)', /Логарифм/);
  fails('log(-1)', /Логарифм/);
  fails('log2(0)', /Логарифм/);
  fails('log(5,1)', /Основание/);
  fails('log(5,-2)', /Основание/);
  fails('sqrt(-4)', /отрицательного/);
  fails('(-8)^(1/3)', /вещественным/);
  fails('0^-1', /Деление на ноль/);
});

test('деление на ноль и переполнение', () => {
  fails('1/0', /Деление на ноль/);
  fails('0/0', /Деление на ноль/);
  fails('5/(3-3)', /Деление на ноль/);
  fails('10^400', /Переполнение/);
  fails('1E308*10', /Переполнение/);
  fails('1E999', /Переполнение/);
  fails('exp(1000)', /Переполнение/);
  fails('mod(5,0)', /Деление на ноль/);
});

test('округление и знак', () => {
  assert.equal(show('abs(-5)'), '5');
  assert.equal(show('sign(-3)'), '-1');
  assert.equal(show('sign(0)'), '0');
  assert.equal(show('sign(7)'), '1');
  assert.equal(show('floor(2.7)'), '2');
  assert.equal(show('floor(-2.1)'), '-3');
  assert.equal(show('ceil(2.1)'), '3');
  assert.equal(show('ceil(-2.7)'), '-2');
  assert.equal(show('trunc(-2.7)'), '-2');
  assert.equal(show('round(2.5)'), '3');
  assert.equal(show('round(-2.5)'), '-3');
  assert.equal(show('round(2.4)'), '2');
  assert.equal(show('round(3.14159,2)'), '3.14');
  assert.equal(show('round(1.005,2)'), '1.01');
  assert.equal(show('round(-3.14159,3)'), '-3.142');
  fails('round(1,20)', /round/);
  fails('round(1,1.5)', /round/);
});

test('целые числа: НОД, НОК, mod, nCr, nPr', () => {
  assert.equal(show('gcd(12,18)'), '6');
  assert.equal(show('gcd(12,18,30)'), '6');
  assert.equal(show('gcd(0,5)'), '5');
  assert.equal(show('lcm(12,18)'), '36');
  assert.equal(show('lcm(4,6,10)'), '60');
  assert.equal(show('lcm(0,5)'), '0');
  assert.equal(show('mod(10,3)'), '1');
  assert.equal(show('mod(-1,3)'), '2');
  assert.equal(show('mod(1,-3)'), '-2');
  assert.equal(show('mod(5.5,2)'), '1.5');
  assert.equal(show('nCr(5,2)'), '10');
  assert.equal(show('nCr(10,0)'), '1');
  assert.equal(show('nCr(10,10)'), '1');
  assert.equal(show('nCr(52,5)'), '2598960');
  assert.equal(show('nPr(5,2)'), '20');
  assert.equal(show('nPr(5,0)'), '1');
  fails('gcd(1.5,2)', /целые/);
  fails('nCr(3,5)', /nCr/);
  fails('nPr(3,-1)', /nPr/);
});

test('статистика', () => {
  assert.equal(show('mean([1,2,3,4,5])'), '3');
  assert.equal(show('mean([1,2,3,4])'), '2.5');
  assert.equal(show('mean(1,2,3)'), '2');
  assert.equal(show('sum([1,2,3,4])'), '10');
  assert.equal(show('sum(1,2,3)'), '6');
  assert.equal(show('sum([[1,2],[3,4]])'), '10');
  assert.equal(show('median([5,1,3])'), '3');
  assert.equal(show('median([1,2,3,4])'), '2.5');
  assert.equal(show('min([4,2,8])'), '2');
  assert.equal(show('max(4,2,8)'), '8');
  assert.equal(show('std([2,4,4,4,5,5,7,9])', {}, 4), '2.1381');
  assert.equal(show('stdp([2,4,4,4,5,5,7,9])'), '2');
  assert.equal(show('std([1,3])', {}, 4), '1.4142');
  assert.equal(show('mean([1,2,3])+factorial(3)'), '8');
  fails('std([5])', /минимум 2/);
  fails('mean([])', /Пустая матрица/);
});

test('матрицы: литералы и арифметика', () => {
  assert.equal(show('[1,2,3]'), '[1, 2, 3]');
  assert.equal(show('[[1,2],[3,4]]'), '[[1, 2], [3, 4]]');
  assert.equal(show('[[1],[2]]'), '[[1], [2]]');
  assert.equal(show('[1+1,2*3]'), '[2, 6]');
  assert.equal(show('[[1,2],[3,4]]+[[1,1],[1,1]]'), '[[2, 3], [4, 5]]');
  assert.equal(show('[[1,2],[3,4]]-[[1,1],[1,1]]'), '[[0, 1], [2, 3]]');
  assert.equal(show('[[1,2],[3,4]]*[[0,1],[1,0]]'), '[[2, 1], [4, 3]]');
  assert.equal(show('2*[[1,2],[3,4]]'), '[[2, 4], [6, 8]]');
  assert.equal(show('[[1,2],[3,4]]*2'), '[[2, 4], [6, 8]]');
  assert.equal(show('[[2,4],[6,8]]/2'), '[[1, 2], [3, 4]]');
  assert.equal(show('-[[1,-2]]'), '[-1, 2]');
  assert.equal(show('[[1,1],[0,1]]^3'), '[[1, 3], [0, 1]]');
  assert.equal(show('[[1,1],[0,1]]^0'), '[[1, 0], [0, 1]]');
  assert.equal(show('[[2,0],[0,2]]^-1'), '[[0.5, 0], [0, 0.5]]');
  assert.equal(show('[[1,2]]*[[3],[4]]'), '[11]');
  assert.equal(show('[[1,2],[3,4]]*[[1],[1]]'), '[[3], [7]]');
  assert.equal(show('sqrt([4,9])'), '[2, 3]');
  assert.equal(show('abs([-1,2])'), '[1, 2]');
  fails('[[1,2],[3]]', /Некорректная матрица/);
  fails('[1,[2]]', /Некорректная матрица/);
  fails('[[1,2]]+1', /матрицу и число/);
  fails('[[1,2]]+[[1],[2]]', /Размеры/);
  fails('[[1,2]]*[[1,2]]', /умножить/);
  fails('1/[[1,2]]', /Делить/);
  fails('[[1,2]]/[[1,2]]', /Делить/);
  fails('2^[[1]]', /степень матрицы/);
  fails('[[1,2],[3,4]]^0.5', /целую/);
  fails('[[1,2]]^2', /квадратную/);
});

test('матрицы: функции', () => {
  assert.equal(show('det([[1,2],[3,4]])'), '-2');
  assert.equal(show('det([[1,0],[0,1]])*10'), '10');
  assert.equal(show('det([[2]])'), '2');
  assert.equal(show('det([[1,2],[2,4]])'), '0');
  assert.equal(show('det([[2,0,0],[0,3,0],[0,0,4]])'), '24');
  assert.equal(show('det([[1,2,3],[4,5,6],[7,8,10]])'), '-3');
  assert.equal(show('det([[0,1],[1,0]])'), '-1');
  assert.equal(show('inv([[1,2],[3,4]])'), '[[-2, 1], [1.5, -0.5]]');
  assert.equal(show('inv([[2]])'), '[0.5]');
  assert.equal(show('inv([[0,1],[1,0]])'), '[[0, 1], [1, 0]]');
  assert.equal(show('[[1,2],[3,4]]*inv([[1,2],[3,4]])'), '[[1, 0], [0, 1]]');
  assert.equal(show('transpose([[1,2],[3,4]])'), '[[1, 3], [2, 4]]');
  assert.equal(show('trans([[1,2,3]])'), '[[1], [2], [3]]');
  assert.equal(show('trace([[1,2],[3,4]])'), '5');
  assert.equal(show('eye(3)'), '[[1, 0, 0], [0, 1, 0], [0, 0, 1]]');
  assert.equal(show('identity(2)'), '[[1, 0], [0, 1]]');
  assert.equal(show('size([[1,2,3],[4,5,6]])'), '[2, 3]');
  assert.equal(show('size([1,2,3])'), '[1, 3]');
  fails('inv([[1,2],[2,4]])', /вырождена/);
  fails('inv([[0,0],[0,0]])', /вырождена/);
  fails('det([[1,2,3],[4,5,6]])', /квадратной/);
  fails('det(5)', /ожидается матрица/);
  fails('inv(5)', /ожидается матрица/);
  fails('trace([[1,2]])', /квадратной/);
  fails('eye(0)', /eye/);
  fails('eye(2.5)', /eye/);
  fails('eye(100)', /eye/);
});

test('форматирование', () => {
  const f = E.formatNumber;
  assert.equal(f(0), '0');
  assert.equal(f(-0), '0');
  assert.equal(f(1 / 3, 2), '0.33');
  assert.equal(f(1 / 3, 10), '0.3333333333');
  assert.equal(f(1 / 3, 14), '0.33333333333333');
  assert.equal(f(2 / 3, 2), '0.67');
  assert.equal(f(100), '100');
  assert.equal(f(1000000), '1000000');
  assert.equal(f(120), '120');
  assert.equal(f(0.1 + 0.2, 14), '0.3');
  assert.equal(f(-1.5), '-1.5');
  assert.equal(f(123456789.123456789, 6), '123456789.123457');
  assert.equal(f(1e15), '1e15');
  assert.equal(f(1.5e20), '1.5e20');
  assert.equal(f(-2.5e30), '-2.5e30');
  assert.equal(f(1e-7), '1e-7');
  assert.equal(f(0.004, 2), '4e-3');
  assert.equal(f(-0.00001, 2), '-1e-5');
  assert.equal(f(0.5, 0), '1');
  assert.equal(f(1e14, 2), '100000000000000');
  assert.equal(E.formatValue(new E.Matrix([[1.23456789, 2], [3, 4]]), 3), '[[1.235, 2], [3, 4]]');
});

test('ошибки разбора — всегда CalcError с понятным текстом', () => {
  fails('', /Пустое/);
  fails('   ', /Пустое/);
  fails('2+', /неполное/);
  fails('*3', /Неожиданный/);
  fails('2 3', /Неожиданный/);
  fails('2..3', /Неожиданный/);
  fails('1.2.3', /Неожиданный/);
  fails('()', /Неожиданный/);
  fails('2+)', /Неожиданный/);
  fails('(2))', /Неожиданный/);
  fails('2$3', /Недопустимый символ/);
  fails('foo', /Неизвестное имя/);
  fails('foo(1)', /Неизвестная функция/);
  fails('sin', /ожидается «\(»/);
  fails('sin()', /аргументов/);
  fails('sin(1,2)', /аргументов/);
  fails('atan2(1)', /аргументов/);
  fails('log(1,2,3)', /аргументов/);
  fails('gcd(4)', /аргументов/);
  fails('[]', /Пустая/);
  fails('1E', /Неизвестное имя/);
  fails('E', /Неизвестное имя/);
  fails('PI', /Неизвестное имя/);
  fails('x'.repeat(2000), /длинное/);
  fails('('.repeat(300) + '1', /вложенность/);
});

test('функции матриц/чисел принимают только допустимые типы', () => {
  fails('atan2([1],2)', /ожидается число/);
  fails('mod([1],2)', /ожидается число/);
  fails('round([1.5])', /ожидается число/);
  fails('log([1],10)', /ожидается число/);
  fails('gcd([1],2)', /ожидается число/);
});

test('реестр функций: у каждой есть аргументы и реализация', () => {
  assert.ok(E.FUNCTION_NAMES.length >= 40);
  for (const name of E.FUNCTION_NAMES) {
    const f = E.FUNCTIONS[name];
    assert.equal(typeof f.f, 'function', name);
    assert.ok(f.n[0] >= 1 && f.n[1] >= f.n[0], name);
  }
});

test('фаззинг: любые входы дают число/матрицу или CalcError, но не падение', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pieces = ['0', '1', '2', '3', '7', '9', '.', '+', '-', '*', '/', '^', '(', ')', '[', ']', ',', '!', '%', 'E', 'e', 'pi',
    'Ans', ' ', ...E.FUNCTION_NAMES.map(n => n + '('), '1E5', '10', '0.5', '[[1,2],[3,4]]', '$', 'x'];
  let ok = 0, bad = 0;
  for (let i = 0; i < 30000; i++) {
    let s = '';
    const len = 1 + Math.floor(rnd() * 12);
    for (let j = 0; j < len; j++) s += pieces[Math.floor(rnd() * pieces.length)];
    for (const deg of [true, false]) {
      try {
        const v = E.evaluate(s, { deg, ans: 5 });
        const nums = v instanceof E.Matrix ? v.rows.flat() : [v];
        for (const n of nums) assert.ok(Number.isFinite(n) && !Object.is(n, -0), `${s} → ${n}`);
        E.formatValue(v, 6);
        ok++;
      } catch (e) {
        if (!(e instanceof E.CalcError)) assert.fail(`«${s}» бросило ${e && e.constructor.name}: ${e && e.message}`);
        assert.ok(e.message && !/undefined|NaN|\[object/.test(e.message), s);
        bad++;
      }
    }
  }
  assert.ok(ok > 500 && bad > 500, `ok=${ok} bad=${bad}`);
});
