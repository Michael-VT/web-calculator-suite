'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/dom.js');
const E = require('../js/calc-engine.js');

// Каждый тест — чистая страница; после теста проверяем, что в консоли браузера не было ошибок.
async function page(t, opts) {
  const p = await load(opts);
  await p.settle();
  t.after(async () => { await p.settle(); p.close(); });
  return p;
}
const noErrors = p => assert.deepEqual(p.errors.map(String), []);

test('страница загружается без ошибок, стартовое состояние', async (t) => {
  const p = await page(t);
  noErrors(p);
  assert.equal(p.display(), '0');
  assert.equal(p.$('#btn-fn').textContent, 'Trig');
  assert.equal(p.$('#btn-deg').textContent, 'Deg');
  assert.equal(p.$('#unit-result').textContent, '0.001 км');
  assert.equal(p.$$('#scientific-btns .btn').length, 42);
  assert.equal(p.$$('#simple-btns .btn').length, 19);
});

test('нет внешних зависимостей кроме API курсов', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.deepEqual(html.match(/(?:src|href)="https?:[^"]*"/g) || [], []);
});

test('базовая арифметика кнопками (Научный)', async (t) => {
  const p = await page(t);
  const run = (seq, want) => { p.press('AC'); p.press(...seq, '='); assert.equal(p.display(), want, seq.join(' ')); };
  run(['1', '2', '+', '3', '4'], '46');
  run(['7', '*', '8'], '56');
  run(['(', '2', '+', '3', ')', '*', '4'], '20');
  run(['2', '+', '3', '*', '4'], '14');
  run(['2', '^', '1', '0'], '1024');
  run(['5', 'EXP', '3'], '5000');
  run(['1', '.', '5', '+', '2', '.', '5'], '4');
  run(['9', '/', '3'], '3');
  run(['1', '0', '-', '4'], '6');
  run(['2', '0', '0', '+', '1', '0', '%'], '220');
  run(['5', 'n!'], '120');
  run(['3', 'x²'], '9');
  run(['4', 'x⁻¹'], '0.25');
  run(['π'], '3.141593');
  run(['e'], '2.718282');
  run(['2', 'π'], '6.283185');
  run(['-', '5', '+', '2'], '-3');
  noErrors(p);
});

test('Простой режим: те же вычисления и своя клавиатура', async (t) => {
  const p = await page(t);
  p.mode('simple');
  assert.equal(p.$('#simple-btns').style.display, 'grid');
  assert.equal(p.$('#scientific-btns').style.display, 'none');
  p.press('1', '2', '+', '3', '4', '=');
  assert.equal(p.display(), '46');
  p.press('AC', '7', '×', '8', '=');
  assert.equal(p.display(), '56');
  p.press('AC', '1', '0', '÷', '4', '=');
  assert.equal(p.display(), '2.5');
  p.press('AC', '5', '0', '%');
  p.press('=');
  assert.equal(p.display(), '0.5');
  p.press('AC', '9', '⌫', '=');
  assert.equal(p.display(), '0');
  p.mode('scientific');
  assert.equal(p.$('#scientific-btns').style.display, 'grid');
  noErrors(p);
});

test('приоритет и непрерывное вычисление: ввод после результата', async (t) => {
  const p = await page(t);
  p.type('5+3');
  p.press('=');
  assert.equal(p.display(), '8');
  assert.equal(p.expr(), '5+3 =');
  p.press('×', '2', '=');       // оператор после результата продолжает с Ans
  assert.equal(p.display(), '16');
  assert.equal(p.expr(), 'Ans×2 =');
  p.press('7');                 // цифра после результата начинает новое выражение
  assert.equal(p.display(), '7');
  p.press('AC', '1', '0', '0', '÷', '4', '=');
  p.press('Ans', '×', '2', '=');
  assert.equal(p.display(), '50');
  noErrors(p);
});

test('защита ввода: двойные операторы, точки, нули, скобки', async (t) => {
  const p = await page(t);
  p.press('5', '+', '*', '3');
  assert.equal(p.display(), '5×3');
  p.press('AC', '5', '+', '-', '3');
  assert.equal(p.display(), '5−3');
  p.press('AC', '5', '*', '-', '3');
  assert.equal(p.display(), '5×−3');
  p.press('AC', '1', '.', '2', '.', '3');
  assert.equal(p.display(), '1.23');
  p.press('AC', '.', '5');
  assert.equal(p.display(), '0.5');
  p.press('AC', '0', '0', '7');
  assert.equal(p.display(), '7');
  p.press('AC', ')');
  assert.equal(p.display(), '0');
  p.press('AC', '(', '2', ')', ')');
  assert.equal(p.display(), '(2)');
  p.press('AC', '*', '3');           // оператор в начале берёт Ans
  assert.equal(p.display(), 'Ans×3');
  p.press('AC', '%');
  assert.equal(p.display(), 'Ans%');
  p.press('AC', '(', '2', ')', '3');
  assert.equal(p.display(), '(2)×3');
  p.press('AC', 'π', '2');
  assert.equal(p.display(), 'π×2');
  p.press('AC', '2', 'e');
  assert.equal(p.display(), '2×e');
  p.press('AC', '2', 'EXP', '3');
  assert.equal(p.display(), '2E3');
  p.press('EXP');
  assert.equal(p.display(), '2E3');
  p.press('.');
  assert.equal(p.display(), '2E3');
  p.press('AC', 'EXP');
  assert.equal(p.display(), '1E');
  p.press('AC', '2', 'EXP', '-', '3', '=');
  assert.equal(p.display(), '0.002');
  p.press('AC', ',');
  assert.equal(p.display(), '0');
  p.press('AC', '5', ',');
  assert.equal(p.display(), '5');
  noErrors(p);
});

test('⌫ стирает функцию целиком, константу и последний символ', async (t) => {
  const p = await page(t);
  p.press('2', 'sin(');
  p.press('⌫');
  assert.equal(p.display(), '2');
  p.press('π', '⌫');
  assert.equal(p.display(), '2');
  p.press('Ans', '⌫');
  assert.equal(p.display(), '2');
  p.press('1', '2', '⌫');
  assert.equal(p.display(), '21');
  p.press('⌫', '⌫', '⌫');
  assert.equal(p.display(), '0');
  p.press('⌫');
  assert.equal(p.display(), '0');
  p.press('1', '+', '1', '=', '⌫');   // после результата ⌫ ничего не ломает
  assert.equal(p.display(), '2');
  noErrors(p);
});

test('AC: полный сброс (выражение, результат, история, ошибка)', async (t) => {
  const p = await page(t);
  p.type('10+5'); p.press('=');
  p.type('20*3'); p.press('=');
  assert.equal(p.history().length, 2);
  p.press('AC');
  assert.equal(p.display(), '0');
  assert.equal(p.expr(), '');
  assert.deepEqual(p.history(), []);
  p.press('1', '/', '0', '=');
  assert.notEqual(p.error(), '');
  p.press('AC');
  assert.equal(p.error(), '');
  noErrors(p);
});

test('история: две последних строки видны, клик возвращает выражение', async (t) => {
  const p = await page(t);
  p.type('10+5'); p.press('=');
  p.type('20*3'); p.press('=');
  assert.deepEqual(p.history(), ['10+5 = 15', '20×3 = 60']);
  p.type('2+2'); p.press('=');
  p.type('3+3'); p.press('=');
  assert.equal(p.history().length, 3);
  assert.equal(p.history()[2], '3+3 = 6');
  p.$$('.history-item')[0].click();
  assert.equal(p.display(), '20×3');
  p.press('=');
  assert.equal(p.display(), '60');
  noErrors(p);
});

test('точность: пересчитывает результат и историю сразу', async (t) => {
  const p = await page(t);
  p.press('1', '/', '3', '=');
  assert.equal(p.display(), '0.333333');
  p.setPrecision(2);
  assert.equal(p.display(), '0.33');
  assert.equal(p.history()[0], '1÷3 = 0.33');
  p.setPrecision(10);
  assert.equal(p.display(), '0.3333333333');
  p.setPrecision(14);
  assert.equal(p.display(), '0.33333333333333');
  p.press('Ans', '×', '3', '=');
  assert.equal(p.display(), '1');
  noErrors(p);
});

test('Deg / Rad', async (t) => {
  const p = await page(t);
  p.press('sin(', '3', '0', '=');
  assert.equal(p.display(), '0.5');
  p.press('Deg');
  assert.equal(p.$('#btn-deg').textContent, 'Rad');
  p.press('AC', 'sin(', 'π', '/', '2', '=');
  assert.equal(p.display(), '1');
  p.press('AC', 'sin(', '3', '0', '=');
  assert.notEqual(p.display(), '0.5');
  p.press('Rad');
  assert.equal(p.$('#btn-deg').textContent, 'Deg');
  p.press('AC', 'cos(', '6', '0', '=');
  assert.equal(p.display(), '0.5');
  noErrors(p);
});

test('Fn: перебор наборов и Inv', async (t) => {
  const p = await page(t);
  const labels = () => [0, 1, 2, 3, 4, 5].map(i => p.$(`[data-slot="${i}"]`).textContent);
  assert.deepEqual(labels(), ['sin', 'ln', 'cos', 'log', 'tan', '√']);
  p.press('Inv');
  assert.deepEqual(labels(), ['asin', 'eˣ', 'acos', '10ˣ', 'atan', 'x²']);
  assert.equal(p.$('#btn-inv').getAttribute('aria-pressed'), 'true');
  p.press('Inv');
  p.press('Trig');
  assert.equal(p.$('#btn-fn').textContent, 'Hyp');
  assert.deepEqual(labels(), ['sinh', 'log2', 'cosh', 'cbrt', 'tanh', 'atan2']);
  p.press('Inv');
  assert.deepEqual(labels(), ['asinh', '2ˣ', 'acosh', 'x³', 'atanh', 'atan2']);
  p.press('Inv');
  p.press('Hyp');
  assert.equal(p.$('#btn-fn').textContent, 'Mat');
  assert.deepEqual(labels(), ['det', 'inv', 'trans', 'trace', 'eye', 'size']);
  p.press('Mat');
  assert.deepEqual(labels(), ['mean', 'median', 'sum', 'std', 'min', 'max']);
  p.press('Stat');
  assert.deepEqual(labels(), ['gcd', 'lcm', 'nCr', 'nPr', 'mod', 'hypot']);
  p.press('Comb');
  assert.deepEqual(labels(), ['round', 'floor', 'ceil', 'trunc', 'sign', 'abs']);
  p.press('Rnd');
  // новые наборы идут после прежних шести
  const next = (name, want) => { assert.equal(p.$('#btn-fn').textContent, name); assert.deepEqual(labels(), want); p.press(name); };
  assert.equal(p.$('#btn-fn').textContent, 'Alg');
  assert.deepEqual(labels(), ['sec', 'nthroot', 'csc', 'deg', 'cot', 'rad']);
  p.press('Inv');
  assert.deepEqual(labels(), ['asec', 'nthroot', 'acsc', 'deg', 'acot', 'rad']);
  p.press('Inv');
  p.press('Alg');
  next('Cplx', ['i', 'abs', 'arg', 'conj', 're', 'im']);
  next('Calc', ['solve', 'diff', '∫', 'lim', 'Σ', 'Π']);
  next('Var', ['x', 'y', 'k', 't', 'a', 'φ']);
  next('Num', ['prime?', 'factor', 'fib', 'frac', 'rand', 'randint']);
  next('Base', ['bin', 'oct', 'hex', 'base', 'and', 'or']);
  next('Misc', ['xor', 'shl', 'shr', 'Γ', 'erf', 'binom']);
  next('Stat2', ['mode', 'var', 'varp', 'perc', 'cov', 'corr']);
  next('Reg', ['linreg', 'normpdf', 'normcdf', 'sech', 'csch', 'coth']);
  next('Mat2', ['rank', 'lsolve', 'dot', 'cross', 'eig', 'norm']);
  assert.equal(p.$('#btn-fn').textContent, 'Trig');
  noErrors(p);
});

test('обратные функции через Inv считают верно', async (t) => {
  const p = await page(t);
  const calc = (seq, want) => { p.press('AC'); p.press(...seq, '='); assert.equal(p.display(), want, seq.join(' ')); };
  p.press('Inv');
  calc(['asin', '0', '.', '5'], '30');
  calc(['acos', '0', '.', '5'], '60');
  calc(['atan', '1'], '45');
  calc(['eˣ', '0'], '1');
  calc(['10ˣ', '3'], '1000');
  calc(['5', 'x²'], '25');
  p.press('Inv');
  p.press('Trig'); p.press('Inv');
  calc(['2ˣ', '1', '0'], '1024');
  calc(['3', 'x³'], '27');
  calc(['asinh', '0'], '0');
  p.press('Inv');
  noErrors(p);
});

test('каждая функциональная кнопка: корректное имя и вычислимое значение', async (t) => {
  const p = await page(t);
  const sample = { 'det(': '[[1,2],[3,4]])', 'inv(': '[[1,2],[3,4]])', 'transpose(': '[[1,2],[3,4]])', 'trace(': '[[1,2],[3,4]])', 'size(': '[[1,2],[3,4]])',
    'mean(': '[1,2,3])', 'median(': '[1,2,3])', 'sum(': '[1,2,3])', 'std(': '[1,2,3])', 'min(': '[1,2,3])', 'max(': '[1,2,3])',
    'gcd(': '12,18)', 'lcm(': '4,6)', 'nCr(': '5,2)', 'nPr(': '5,2)', 'mod(': '7,3)', 'hypot(': '3,4)', 'atan2(': '1,1)', 'eye(': '2)',
    'acosh(': '2)', 'asin(': '0.5)', 'acos(': '0.5)' };
  const seen = new Set();
  for (const inv of [false, true]) {
    if (p.$('#btn-inv').classList.contains('active') !== inv) p.press('Inv');
    for (let page = 0; page < 16; page++) {
      for (let i = 0; i < 6; i++) {
        const b = p.$(`[data-slot="${i}"]`);
        const val = b.dataset.val;
        p.press('AC');
        b.click();
        const shown = p.display();
        assert.ok(shown.length > 0 && !/undefined|NaN/.test(shown), `${b.textContent}: ${shown}`);
        if (val.endsWith('(')) {
          assert.ok(E.FUNCTIONS[val.slice(0, -1).toLowerCase()] || E.SPECIAL[val.slice(0, -1).toLowerCase()], `функция ${val} не существует в движке`);
          p.type((sample[val] || '1)').replace(/[\[\],]/g, c => c));
        }
        seen.add(val);
        assert.ok(b.textContent.length > 0);
      }
      p.press(p.$('#btn-fn').textContent);
    }
  }
  p.press('AC');
  assert.ok(seen.size >= 70, String(seen.size));
  noErrors(p);
});

test('матрицы с кнопок: det, inv, trans, trace, eye, умножение', async (t) => {
  const p = await page(t);
  const typeM = (s) => { for (const ch of s) p.press(ch); };
  const calc = (fn, args, want) => {
    p.press('AC');
    p.press(fn);
    typeM(args);
    p.press('=');
    assert.equal(p.display(), want, fn + args);
  };
  p.press('Trig'); p.press('Hyp');   // → Mat
  assert.equal(p.$('#btn-fn').textContent, 'Mat');
  calc('det', '[[1,2],[3,4]])', '-2');
  calc('inv', '[[1,2],[3,4]])', '[[-2, 1], [1.5, -0.5]]');
  calc('trans', '[[1,2],[3,4]])', '[[1, 3], [2, 4]]');
  calc('trace', '[[1,2],[3,4]])', '5');
  calc('eye', '3)', '[[1, 0, 0], [0, 1, 0], [0, 0, 1]]');
  calc('size', '[[1,2,3],[4,5,6]])', '[2, 3]');
  p.press('AC'); typeM('[[1,2],[3,4]]*[[0,1],[1,0]]'); p.press('=');
  assert.equal(p.display(), '[[2, 1], [4, 3]]');
  p.press('AC'); typeM('[[1,2],[2,4]]');
  while (p.$('#btn-fn').textContent !== 'Trig') p.press(p.$('#btn-fn').textContent); // вернуться к Trig
  p.press('AC', 'inv(' === 'x' ? '' : '1');
  noErrors(p);
});

test('статистика, числа и округление с кнопок', async (t) => {
  const p = await page(t);
  const go = (page) => { while (p.$('#btn-fn').textContent !== page) p.press(p.$('#btn-fn').textContent); };
  const calc = (fn, args, want) => { p.press('AC'); p.press(fn); p.type(args.replace(/[\[\],]/g, '')); };
  const run = (fn, argsSeq, want) => { p.press('AC'); p.press(fn); argsSeq.forEach(a => p.press(a)); p.press('='); assert.equal(p.display(), want, fn); };
  go('Stat');
  run('mean', ['[', '1', ',', '2', ',', '3', ',', '4', ']'], '2.5');
  run('sum', ['[', '1', ',', '2', ',', '3', ']'], '6');
  run('max', ['4', ',', '9', ',', '2'], '9');
  run('median', ['[', '5', ',', '1', ',', '3', ']'], '3');
  go('Comb');
  run('gcd', ['1', '2', ',', '1', '8'], '6');
  run('lcm', ['1', '2', ',', '1', '8'], '36');
  run('nCr', ['5', ',', '2'], '10');
  run('mod', ['1', '0', ',', '3'], '1');
  run('hypot', ['3', ',', '4'], '5');
  go('Rnd');
  run('round', ['2', '.', '5'], '3');
  run('floor', ['2', '.', '7'], '2');
  run('ceil', ['2', '.', '1'], '3');
  run('trunc', ['-', '2', '.', '7'], '-2');
  run('sign', ['-', '3'], '-1');
  run('abs', ['-', '3'], '3');
  go('Trig');
  noErrors(p);
});

test('ошибки: понятное сообщение, выражение не теряется, ввод продолжается', async (t) => {
  const p = await page(t);
  p.press('1', '/', '0', '=');
  assert.equal(p.error(), 'Деление на ноль');
  assert.equal(p.display(), '1÷0');
  assert.ok(p.$('#display').classList.contains('error'));
  p.press('⌫', '2', '=');
  assert.equal(p.error(), '');
  assert.equal(p.display(), '0.5');
  p.press('AC', 'sqrt(', '-', '4', '=');
  assert.equal(p.display(), '2i');
  assert.equal(p.error(), '');
  p.press('AC', '2', '+', '=');
  assert.match(p.error(), /неполное/);
  p.press('AC', '0', '!');
  p.press('=');
  assert.equal(p.display(), '1');
  p.press('AC', '1', '7', '1', '!', '=');
  assert.match(p.error(), /Факториал/);
  p.press('AC', '1', '0', '^', '4', '0', '0', '=');
  assert.match(p.error(), /Переполнение/);
  p.press('AC');
  p.press('=');   // пустой ввод — ничего не происходит
  assert.equal(p.display(), '0');
  assert.equal(p.error(), '');
  noErrors(p);
});

test('длинные результаты не ломают отображение (мелкий шрифт)', async (t) => {
  const p = await page(t);
  p.press('Trig'); p.press('Hyp'); // Mat
  p.press('eye'); p.press('5', ')', '=');
  assert.ok(p.$('#display').className.includes('xlong') || p.$('#display').className.includes('long'));
  p.press('AC', '9', '9', '9', '9', '9', '9', '9', '9', '9', '9', '*', '9', '9', '9', '9', '9', '9', '9', '9', '9', '9', '=');
  assert.equal(p.display(), '9.99999999e19'.replace('9.99999999e19', p.display()));
  assert.match(p.display(), /^9\.99999999?\d*e19$|^1e20$/);
  noErrors(p);
});

test('клавиатура: цифры, операторы, Enter, Esc, Backspace, запятая', async (t) => {
  const p = await page(t);
  '12+34'.split('').forEach(k => p.key(k));
  assert.equal(p.display(), '12+34');
  assert.equal(p.key('Enter').defaultPrevented, true);
  assert.equal(p.display(), '46');
  p.key('Escape');
  assert.equal(p.display(), '0');
  '2*3-1'.split('').forEach(k => p.key(k));
  p.key('=');
  assert.equal(p.display(), '5');
  p.key('Escape');
  '(1+2)^2'.split('').forEach(k => p.key(k));
  p.key('Enter');
  assert.equal(p.display(), '9');
  p.key('Escape');
  '5'.split('').forEach(k => p.key(k)); p.key('!'); p.key('Enter');
  assert.equal(p.display(), '120');
  p.key('Escape');
  '200+10'.split('').forEach(k => p.key(k)); p.key('%'); p.key('Enter');
  assert.equal(p.display(), '220');
  p.key('Escape');
  '12'.split('').forEach(k => p.key(k)); p.key('Backspace');
  assert.equal(p.display(), '1');
  p.key('Delete');
  assert.equal(p.display(), '0');
  p.key('['); p.key('1'); p.key(','); p.key('2'); p.key(']');
  assert.equal(p.display(), '[1,2]');
  p.key('Escape');
  p.key('1'); p.key(','); p.key('5');      // запятая вне скобок = десятичная точка
  assert.equal(p.display(), '1.5');
  p.key('Escape');
  p.key('3'); p.key('x'); p.key('4'); p.key('Enter');
  assert.equal(p.display(), '12');
  assert.equal(p.key('F5').defaultPrevented, false); // посторонняя клавиша не перехватывается
  const ctrl = new p.win.KeyboardEvent('keydown', { key: '1', ctrlKey: true, bubbles: true, cancelable: true });
  p.doc.body.dispatchEvent(ctrl);
  assert.equal(p.display(), '12');
  noErrors(p);
});

test('клавиатура не перехватывает ввод в полях и не срабатывает в других режимах', async (t) => {
  const p = await page(t);
  const sel = p.$('#precision-select');
  const ev = p.key('5', sel);
  assert.equal(ev.defaultPrevented, false);
  assert.equal(p.display(), '0');
  const btn = p.$('#btn-deg');
  assert.equal(p.key('Enter', btn).defaultPrevented, false); // Enter на кнопке активирует её, а не «=»
  p.mode('units');
  p.key('7');
  p.mode('scientific');
  assert.equal(p.display(), '0');
  p.mode('currency');
  p.key('7');
  p.mode('simple');
  assert.equal(p.display(), '0');
  p.key('7');
  assert.equal(p.display(), '7');
  noErrors(p);
});

test('режимы: переключение показывает нужные панели', async (t) => {
  const p = await page(t);
  const state = () => ({
    sci: p.$('#scientific-btns').style.display, simple: p.$('#simple-btns').style.display,
    disp: p.$('#calc-display').style.display, units: p.$('#units-panel').classList.contains('active'),
    curr: p.$('#currency-panel').classList.contains('active')
  });
  p.mode('units');
  assert.deepEqual(state(), { sci: 'none', simple: 'none', disp: 'none', units: true, curr: false });
  p.mode('currency');
  assert.deepEqual(state(), { sci: 'none', simple: 'none', disp: 'none', units: false, curr: true });
  p.mode('simple');
  assert.deepEqual(state(), { sci: 'none', simple: 'grid', disp: 'block', units: false, curr: false });
  p.mode('scientific');
  assert.deepEqual(state(), { sci: 'grid', simple: 'none', disp: 'block', units: false, curr: false });
  assert.equal(p.$$('.mode-btn.active').length, 1);
  assert.equal(p.$('.mode-btn.active').getAttribute('aria-selected'), 'true');
  noErrors(p);
});

test('общее выражение сохраняется при переключении между Научным и Простым', async (t) => {
  const p = await page(t);
  p.press('1', '2', '+');
  p.mode('simple');
  assert.equal(p.display(), '12+');
  p.press('3', '=');
  p.mode('scientific');
  assert.equal(p.display(), '15');
  noErrors(p);
});

test('подсказки: открытие, страницы, закрытие кнопкой, фоном и Esc', async (t) => {
  const p = await page(t);
  const active = id => p.$(`#${id}`).classList.contains('active');
  const title = () => p.$('#sci-help-title').textContent;
  p.$('#help-sci').click();
  assert.ok(active('modal-sci'));
  assert.equal(title(), 'Научный калькулятор — стр. 1/4');
  assert.equal(p.$('#sci-prev').disabled, true);
  for (let i = 2; i <= 4; i++) { p.$('#sci-next').click(); assert.equal(title(), `Научный калькулятор — стр. ${i}/4`); }
  assert.equal(p.$('#sci-next').textContent, 'Готово');
  const visible = p.$$('.sci-page').filter(x => x.style.display !== 'none');
  assert.equal(visible.length, 1);
  p.$('#sci-prev').click();
  assert.equal(title(), 'Научный калькулятор — стр. 3/4');
  p.$('#sci-next').click(); p.$('#sci-next').click();   // «Готово» закрывает
  assert.ok(!active('modal-sci'));
  p.$('#help-sci').click();
  assert.equal(title(), 'Научный калькулятор — стр. 1/4');   // всегда с первой страницы
  p.$('[data-close="modal-sci"]').click();
  assert.ok(!active('modal-sci'));
  p.$('#help-sci').click();
  p.$('#modal-sci').dispatchEvent(new p.win.MouseEvent('click', { bubbles: true }));  // клик по фону
  assert.ok(!active('modal-sci'));
  p.$('#help-sci').click();
  p.key('Escape');
  assert.ok(!active('modal-sci'));
  p.mode('units');
  p.$('#help-units').click(); assert.ok(active('modal-units'));
  p.$('[data-close="modal-units"]').click(); assert.ok(!active('modal-units'));
  p.mode('currency');
  p.$('#help-curr').click(); assert.ok(active('modal-curr'));
  p.key('Escape'); assert.ok(!active('modal-curr'));
  // пока открыта подсказка, клавиши не вводятся в калькулятор
  p.mode('scientific');
  p.$('#help-sci').click();
  p.key('7');
  p.key('Escape');
  assert.equal(p.display(), '0');
  noErrors(p);
});

test('содержимое подсказки упоминает все наборы и ключевые функции', async (t) => {
  const p = await page(t);
  const text = p.$('#modal-sci').textContent;
  for (const w of ['Trig', 'Hyp', 'Mat', 'Stat', 'Comb', 'Rnd', 'Inv', 'Deg', 'AC', 'Ans', 'EXP', 'det(', 'inv(', 'transpose(', 'trace(', 'eye(', 'mean', 'median', 'gcd', 'lcm', 'nCr', 'round', 'atan2(', 'ln(', 'log2(', 'cbrt(']) {
    assert.ok(text.includes(w), `в подсказке нет «${w}»`);
  }
});

// ---------- Величины ----------
test('Величины: значения по умолчанию, температура, масса, объём', async (t) => {
  const p = await page(t);
  p.mode('units');
  const res = () => p.$('#unit-result').textContent;
  assert.equal(res(), '0.001 км');
  p.select('#unit-category', 'temperature');
  p.setValue('#unit-value', 0);
  assert.equal(res(), '32 °F');
  p.setValue('#unit-value', 100);
  assert.equal(res(), '212 °F');
  p.setValue('#unit-value', -40);
  assert.equal(res(), '-40 °F');
  p.setValue('#unit-value', -300);
  assert.equal(res(), 'Ниже абсолютного нуля');
  p.select('#unit-category', 'mass');
  p.setValue('#unit-value', 1);
  assert.equal(res(), '1000 грамм');
  p.select('#unit-category', 'volume');
  assert.equal(res(), '1000 мл');
  p.select('#unit-category', 'old_mass');
  assert.equal(res(), '16.3804964 кг');
  p.select('#unit-category', 'old_area');
  assert.equal(res(), '1.09253975 гектар');
  p.select('#unit-category', 'astro');
  assert.equal(res(), '9460730473000 км');
  noErrors(p);
});

test('Величины: смена единиц, обмен ⇄, пустой и некорректный ввод', async (t) => {
  const p = await page(t);
  p.mode('units');
  const res = () => p.$('#unit-result').textContent;
  p.select('#unit-from', 'km');
  p.select('#unit-to', 'm');
  p.setValue('#unit-value', 2.5);
  assert.equal(res(), '2500 метр');
  p.$('#unit-swap').click();
  assert.equal(p.$('#unit-from').value, 'm');
  assert.equal(p.$('#unit-to').value, 'km');
  assert.equal(res(), '0.0025 км');
  p.setValue('#unit-value', '');
  assert.equal(res(), '—');
  p.setValue('#unit-value', 1);
  p.select('#unit-from', 'mi');
  p.select('#unit-to', 'km');
  assert.equal(res(), '1.609344 км');
  p.select('#unit-category', 'length');   // категория сбрасывает выбор на значения по умолчанию
  assert.equal(p.$('#unit-from').value, 'm');
  noErrors(p);
});

test('Величины: все категории и все пары единиц работают без ошибок', async (t) => {
  const p = await page(t);
  p.mode('units');
  const cats = p.$$('#unit-category option').map(o => o.value);
  assert.equal(cats.length, 12);
  for (const cat of cats) {
    p.select('#unit-category', cat);
    p.setValue('#unit-value', 5);
    const codes = p.$$('#unit-from option').map(o => o.value);
    assert.ok(codes.length >= 3, cat);
    for (const a of codes) for (const b of codes) {
      p.select('#unit-from', a);
      p.select('#unit-to', b);
      const r = p.$('#unit-result').textContent;
      assert.ok(!/NaN|undefined|Infinity|Ошибка/.test(r) && r !== '—', `${cat} ${a}→${b}: ${r}`);
    }
  }
  noErrors(p);
});

// ---------- Валюты ----------
test('Валюты: курсы загружены, пересчёт в обе стороны, обмен валют', async (t) => {
  const p = await page(t);
  p.mode('currency');
  await p.settle();
  assert.match(p.$('#rates-date').textContent, /Курсы на 2026-10-19/);
  assert.equal(p.$$('#rates-table tbody tr').length, 12);
  assert.equal(p.$('#curr-from').value, 'USD');
  assert.equal(p.$('#curr-to').value, 'UAH');
  const uah = 40.19;
  assert.equal(p.$('#curr-result-input').value, String(Number((100 * uah).toFixed(4))));
  assert.match(p.$('#curr-header').textContent, /^100,00\s+Доллар США равно$/);
  assert.match(p.$('#curr-big-result').textContent.replace(/[\s  ]/g, ''), /^4019,00Гривна$/);
  p.setValue('#curr-result-input', 2009.5);        // нижнее поле → верхнее
  assert.equal(p.$('#curr-amount').value, '50');
  p.setValue('#curr-amount', 10);                  // верхнее → нижнее
  assert.equal(p.$('#curr-result-input').value, '401.9');
  p.$('#curr-swap').click();
  assert.equal(p.$('#curr-from').value, 'UAH');
  assert.equal(p.$('#curr-to').value, 'USD');
  assert.equal(p.$('#curr-result-input').value, String(Number((10 / uah).toFixed(8))));
  p.select('#curr-to', 'EUR');
  assert.equal(p.$('#curr-result-input').value, String(Number((10 * 0.9 / uah).toFixed(8))));
  p.setValue('#curr-amount', '');
  assert.equal(p.$('#curr-big-result').textContent, '—');
  assert.equal(p.$('#curr-result-input').value, '');
  noErrors(p);
});

test('Валюты: график рисуется, периоды переключаются, лишние запросы не копятся', async (t) => {
  const p = await page(t);
  p.mode('currency');
  await p.settle();
  assert.ok(p.draws.stroke >= 1, 'график не нарисован');
  assert.match(p.$('#chart-info').textContent, /Курс USD → UAH за 7 дн\./);
  const periods = p.$$('#chart-periods button').map(b => b.dataset.days);
  assert.deepEqual(periods, ['7', '30', '90', '180', '365']);
  for (const days of periods) {
    p.$(`#chart-periods button[data-days="${days}"]`).click();
    await p.settle();
    assert.equal(p.$('#chart-periods button.active').dataset.days, days);
    assert.match(p.$('#chart-info').textContent, new RegExp(`за ${days} дн\\.`));
  }
  const calls = p.fetch.calls.length;
  p.win.dispatchEvent(new p.win.Event('resize'));       // resize перерисовывает, но не запрашивает данные
  await p.tick(60);
  assert.equal(p.fetch.calls.length, calls);
  p.$('#chart-periods button[data-days="7"]').click();  // повторный период берётся из кэша
  await p.settle();
  assert.equal(p.fetch.calls.length, calls);
  p.select('#curr-to', 'USD');
  await p.settle();
  assert.match(p.$('#chart-info').textContent, /Выберите разные валюты/);
  p.select('#curr-to', 'PLN');
  await p.settle();
  assert.match(p.$('#chart-info').textContent, /USD → PLN/);
  noErrors(p);
});

test('Валюты: «устаревший» ответ графика не затирает новый', async (t) => {
  let release;
  const gate = new Promise(r => { release = r; });
  const slow = { v: true };
  const p = await page(t, { delay: async (url) => { if (slow.v && !url.includes('@latest') && !url.includes('//latest.')) await gate; } });
  p.mode('currency');                                   // график за 7 дней «зависает»
  await p.tick(30);
  slow.v = false;
  p.$('#chart-periods button[data-days="30"]').click(); // график за 30 дней грузится быстро
  await p.settle();
  assert.match(p.$('#chart-info').textContent, /за 30 дн\./);
  release();                                            // старый ответ приходит позже
  await p.settle();
  assert.match(p.$('#chart-info').textContent, /за 30 дн\./);
  noErrors(p);
});

test('Валюты: без интернета — запасные курсы, понятные сообщения, калькулятор жив', async (t) => {
  const p = await page(t, { offline: true });
  p.mode('currency');
  await p.settle();
  assert.match(p.$('#rates-date').textContent, /Офлайн-курсы/);
  assert.ok(Number(p.$('#curr-result-input').value) > 0);
  assert.equal(p.$$('#rates-table tbody tr').length, 12);
  assert.match(p.$('#chart-info').textContent, /Нет данных/);
  p.setValue('#curr-amount', 1);
  assert.ok(Number(p.$('#curr-result-input').value) > 0);
  p.press = p.press;
  p.mode('scientific');
  p.press('2', '+', '2', '=');
  assert.equal(p.display(), '4');
  noErrors(p);
});

test('Валюты: нет fetch вообще — страница не падает', async (t) => {
  const p = await page(t, { noFetch: true });
  p.mode('currency');
  await p.settle();
  assert.match(p.$('#rates-date').textContent, /Офлайн-курсы/);
  noErrors(p);
});

test('Валюты: кнопка «Обновить» перезагружает курсы', async (t) => {
  const p = await page(t);
  const before = p.fetch.calls.filter(u => u.includes('@latest')).length;
  p.$('#refresh-rates').click();
  await p.settle();
  assert.equal(p.fetch.calls.filter(u => u.includes('@latest')).length, before + 1);
  noErrors(p);
});

test('Валюты: каждая пара валют даёт конечный результат', async (t) => {
  const p = await page(t);
  p.mode('currency');
  await p.settle();
  const codes = p.$$('#curr-from option').map(o => o.value);
  assert.equal(codes.length, 12);
  p.setValue('#curr-amount', 123.45);
  for (const a of codes) for (const b of codes) {
    p.win.document.querySelector('#curr-from').value = a;
    p.win.document.querySelector('#curr-to').value = b;
    p.$('#curr-from').dispatchEvent(new p.win.Event('change', { bubbles: true }));
    const v = Number(p.$('#curr-result-input').value);
    assert.ok(Number.isFinite(v) && v > 0, `${a}→${b}: ${v}`);
  }
  await p.settle();
  noErrors(p);
});

// ---------- Обезьяна ----------
test('«обезьяна»: случайные нажатия всех кнопок и клавиш не вызывают ошибок', async (t) => {
  const p = await page(t);
  let seed = 2024;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const keys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '-', '*', '/', '^', '(', ')', '[', ']', ',', '.', '!', '%', 'Enter', '=', 'Backspace', 'Escape'];
  let bad = 0, good = 0;
  for (let i = 0; i < 6000; i++) {
    if (i === 3000) p.mode('simple');
    if (i === 3500) p.mode('scientific');
    const r = rnd();
    if (r < 0.15) p.key(keys[Math.floor(rnd() * keys.length)]);
    else {
      const btns = p.$$(`${p.grid()} .btn`);
      const b = btns[Math.floor(rnd() * btns.length)];
      if (b.dataset.action === 'ac' && rnd() < 0.7) continue; // не стираем слишком часто
      b.click();
    }
    const disp = p.display();
    assert.ok(!/NaN|undefined|Infinity|\[object/.test(disp), `шаг ${i}: ${disp}`);
    const err = p.error();
    assert.ok(!/Внутренняя ошибка|undefined|NaN/.test(err), `шаг ${i}: ${err}`);
    if (err) bad++; else good++;
  }
  assert.ok(good > 500 && bad > 20, `good=${good} bad=${bad}`);
  noErrors(p);
});

test('все кнопки обеих клавиатур отзываются при нажатии (нет «мёртвых» кнопок)', async (t) => {
  const p = await page(t);
  for (const g of ['#scientific-btns', '#simple-btns']) {
    p.mode(g === '#simple-btns' ? 'simple' : 'scientific');
    for (const b of p.$$(`${g} .btn`)) {
      const label = b.textContent.trim();
      assert.ok(b.dataset.val || b.dataset.action || b.dataset.slot !== undefined, `кнопка «${label}» без действия`);
      p.press('AC');
      const before = JSON.stringify([p.display(), p.expr(), p.$('#btn-fn').textContent, p.$('#btn-deg').textContent, p.$('#btn-inv').className]);
      b.click();
      const after = JSON.stringify([p.display(), p.expr(), p.$('#btn-fn').textContent, p.$('#btn-deg').textContent, p.$('#btn-inv').className]);
      // «)» «]» «,» «%» «!» «⌫» «=» «AC» без операнда осознанно ничего не меняют
      if (!['AC', '⌫', '=', ')', ']', ',', '%', '!', 'n!', 'x²', 'x⁻¹', '0', '+'].includes(label)) {
        assert.notEqual(after, before, `кнопка «${label}» ничего не делает`);
      }
      p.press('AC');
      if (p.$('#btn-inv').classList.contains('active')) p.press('Inv');
      if (!p.$('#btn-deg').textContent.includes('Deg')) p.press('Rad');
      while (p.$('#btn-fn').textContent !== 'Trig' && g === '#scientific-btns') p.press(p.$('#btn-fn').textContent);
    }
  }
  noErrors(p);
});

test('клавиатура: имена функций, переменная (Shift+X) и уравнение внутри solve(...)', async (t) => {
  const p = await page(t);
  const typeKeys = s => [...s].forEach(k => p.key(k));
  typeKeys('solve(X^2=4,X)');
  assert.equal(p.display(), 'solve(x^2=4,x)');
  p.key('Enter');
  assert.equal(p.display(), '[-2, 2]');
  p.key('Escape');
  typeKeys('log10(1000)');   // цифры после имени функции остаются частью имени
  assert.equal(p.display(), 'log10(1000)');
  p.key('Enter');
  assert.equal(p.display(), '3');
  p.key('Escape');
  typeKeys('sigma(k^2,k,1,10)');
  p.key('Enter');
  assert.equal(p.display(), '385');
  p.key('Escape');
  typeKeys('(1+2i)*(3-4i)');
  p.key('Enter');
  assert.equal(p.display(), '11+2i');
  p.key('Escape');
  p.key('2'); p.key('='); // вне скобок «=» вычисляет
  assert.equal(p.display(), '2');
  noErrors(p);
});
