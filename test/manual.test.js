'use strict';
// Выполняет примеры из docs/MANUAL.md и проверяет, что в руководстве описаны все кнопки и функции.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./helpers/dom.js');
const E = require('../js/calc-engine.js');

const manual = fs.readFileSync(path.join(__dirname, '..', 'docs', 'MANUAL.md'), 'utf8');

function parseExamples(text) {
  const out = [];
  let section = '';
  text.split('\n').forEach((line, i) => {
    const h = /^#{2,3}\s+(.*)/.exec(line);
    if (h) section = h[1];
    const re = /`([^`]+)`\s*→\s*\*\*([^*]+)\*\*/g;
    let m;
    while ((m = re.exec(line))) {
      const before = line.slice(Math.max(0, m.index - 14), m.index);
      let kind = 'expr', src = m[1];
      if (/(?:ажмите|затем)\s*$/i.test(before)) kind = 'btn';
      else if (/^rad:\s*/.test(src)) { kind = 'rad'; src = src.replace(/^rad:\s*/, ''); }
      else if (/^units:\s*/.test(src)) { kind = 'units'; src = src.replace(/^units:\s*/, ''); }
      out.push({ kind, src, want: m[2].trim(), line: i + 1, section });
    }
  });
  return out;
}

const examples = parseExamples(manual);

test('в руководстве достаточно примеров каждого вида', () => {
  const count = k => examples.filter(e => e.kind === k).length;
  assert.ok(count('expr') >= 120, `expr: ${count('expr')}`);
  assert.ok(count('btn') >= 25, `btn: ${count('btn')}`);
  assert.ok(count('rad') >= 3, `rad: ${count('rad')}`);
  assert.ok(count('units') >= 15, `units: ${count('units')}`);
  assert.ok(examples.filter(e => e.want.startsWith('ошибка:')).length >= 15);
});

test('примеры-выражения из руководства дают указанный результат', () => {
  const bad = [];
  for (const ex of examples.filter(e => e.kind === 'expr' || e.kind === 'rad')) {
    const deg = ex.kind !== 'rad';
    try {
      const got = E.formatValue(E.evaluate(ex.src, { deg }), 6);
      if (ex.want.startsWith('ошибка:')) bad.push(`стр. ${ex.line}: «${ex.src}» должно быть ошибкой, а дало ${got}`);
      else if (got !== ex.want) bad.push(`стр. ${ex.line}: «${ex.src}» → ${got}, в руководстве ${ex.want}`);
    } catch (e) {
      const want = ex.want.replace(/^ошибка:\s*/, '');
      if (!(e instanceof E.CalcError) || !ex.want.startsWith('ошибка:') || e.message !== want) {
        bad.push(`стр. ${ex.line}: «${ex.src}» → ${e.message}, в руководстве ${ex.want}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('каждая функция движка встречается в выполняемом примере руководства', () => {
  const exprs = examples.filter(e => e.kind === 'expr' || e.kind === 'rad').map(e => e.src.toLowerCase());
  const missing = E.FUNCTION_NAMES.filter(n => !exprs.some(s => s.includes(n + '(')));
  assert.deepEqual(missing, []);
});

test('примеры нажатий кнопок и вкладки «Величины» из руководства работают в настоящей странице', async (t) => {
  const p = await load();
  await p.settle();
  t.after(async () => { await p.settle(); p.close(); });
  const bad = [];

  const reset = (simple) => {
    p.mode(simple ? 'simple' : 'scientific');
    p.btn('AC').click();
    if (!simple) {
      if (p.$('#btn-inv').classList.contains('active')) p.$('#btn-inv').click();
      if (p.$('#btn-deg').textContent !== 'Deg') p.$('#btn-deg').click();
      while (p.$('#btn-fn').textContent !== 'Trig') p.$('#btn-fn').click();
    }
  };
  const pressToken = (tok) => {
    if (tok === 'Fn') p.$('#btn-fn').click();
    else p.btn(tok).click();
  };

  for (const ex of examples.filter(e => e.kind === 'btn')) {
    try {
      reset(/Простой режим/.test(ex.section));
      ex.src.split(/\s+/).forEach(pressToken);
      if (ex.want.startsWith('ошибка:')) assert.equal(p.error(), ex.want.replace(/^ошибка:\s*/, ''));
      else assert.equal(p.display(), ex.want);
    } catch (e) {
      bad.push(`стр. ${ex.line}: нажмите «${ex.src}» → ${e.message.split('\n')[0]}`);
    }
  }

  p.mode('units');
  const optionByText = (sel, text) => {
    const o = p.$$(`${sel} option`).find(x => x.textContent === text);
    if (!o) throw new Error(`нет пункта «${text}» в ${sel}`);
    return o.value;
  };
  for (const ex of examples.filter(e => e.kind === 'units')) {
    try {
      const [cat, value, from, to] = ex.src.split('|').map(s => s.trim());
      p.select('#unit-category', optionByText('#unit-category', cat));
      p.setValue('#unit-value', value);
      p.select('#unit-from', optionByText('#unit-from', from));
      p.select('#unit-to', optionByText('#unit-to', to));
      assert.equal(p.$('#unit-result').textContent, ex.want);
    } catch (e) {
      bad.push(`стр. ${ex.line}: units «${ex.src}» → ${e.message.split('\n')[0]}`);
    }
  }
  assert.deepEqual(bad, []);
  assert.deepEqual(p.errors.map(String), []);
});

test('в руководстве описана каждая кнопка интерфейса', async (t) => {
  const p = await load();
  await p.settle();
  t.after(async () => { await p.settle(); p.close(); });
  const labels = new Set();
  const collect = () => p.$$('#scientific-btns .btn, #simple-btns .btn').forEach(b => labels.add(b.textContent.trim()));
  for (const inv of [false, true]) {
    if (p.$('#btn-inv').classList.contains('active') !== inv) p.$('#btn-inv').click();
    for (let i = 0; i < 6; i++) { collect(); labels.add(p.$('#btn-fn').textContent); p.$('#btn-fn').click(); }
  }
  p.$$('.mode-btn').forEach(b => labels.add(b.textContent.trim()));
  ['#unit-swap', '#curr-swap', '#refresh-rates', '#help-sci'].forEach(s => labels.add(p.$(s).textContent.trim()));
  p.$$('#chart-periods button').forEach(b => labels.add(b.textContent.trim()));
  labels.add('Rad');
  labels.add('Fn');
  const missing = [...labels].filter(l => l && !manual.includes(l));
  assert.deepEqual(missing, []);
  assert.ok(labels.size > 70, `кнопок найдено мало: ${labels.size}`);
});

test('руководство ссылается только на существующие файлы и команды', () => {
  for (const f of ['index.html', 'js/calc-engine.js', 'js/converters.js', 'js/app.js', 'test/manual.test.js']) {
    assert.ok(manual.includes(f), `в руководстве нет упоминания ${f}`);
    assert.ok(fs.existsSync(path.join(__dirname, '..', f)), f);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  for (const script of ['test', 'start']) assert.ok(pkg.scripts[script], script);
});
