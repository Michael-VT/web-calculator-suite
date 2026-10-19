# Architecture: what each file does, how it works, how it is tested

**English** · [Português](ARCHITECTURE-PT.md) · [Українська](ARCHITECTURE-UK.md) · [Русский](ARCHITECTURE-RU.md) · [Français](ARCHITECTURE-FR.md) · [Deutsch](ARCHITECTURE-DE.md)

## 1. Overview

The program is a static page with no build step and no runtime dependencies. The logic is split in two parts that have **no DOM access** and run both in the browser and in Node (this is what makes them easy to test), plus a thin UI layer:

| File | Responsibility |
|---|---|
| `index.html` | page markup: display, the two keypads (scientific / simple), the Units and Currency panels, help windows |
| `css/style.css` | styling; light/dark theme through CSS variables, responsive layout |
| `js/calc-engine.js` | `CalcEngine`: parses and evaluates expressions, formats results (no DOM) |
| `js/numeric.js` | `CalcNumeric`: pure numerical algorithms — gamma, erf, polynomial roots, root finding, derivative, integral, primality, factoring (no DOM) |
| `js/converters.js` | `Converters`: units, currencies, rate loading, chart data (no DOM) |
| `js/app.js` | UI: state, button handling, keyboard, modes, chart drawing, help windows |
| `docs/MANUAL.md` | user manual (Russian); its examples are executed by the tests |
| `test/` | automated tests (section 5) |
| `variants/` | earlier versions of the page, kept for history, not developed or tested |

Both logic files use the same wrapper (UMD): `module.exports` in Node, a global (`CalcEngine`, `Converters`) in the browser.

## 2. `js/calc-engine.js` — the expression engine

Public API: `evaluate(expr, { deg, ans })`, `parse`, `tokenize`, `formatNumber`, `formatValue`, `Matrix`, `CalcError`, `FUNCTIONS`, `FUNCTION_NAMES`, `CONSTANTS`.

### Pipeline

`evaluate` = `parse` → `evalNode` → clean up `-0`. Any user error is thrown as `CalcError` with a readable message; the UI shows it and keeps the expression.

1. **`normalize`** replaces display symbols by ASCII: `× · ⋅` → `*`, `÷` → `/`, `− – —` → `-`, `π` → `pi`, `√` → `sqrt`.
2. **`tokenize`** splits the text into numbers (`12`, `.5`, `1.5e3`), identifiers, and the operators `+ - * / ^ ( ) [ ] , ! %`. Any other character raises «invalid character».
3. **`parse`** is a recursive-descent parser producing an AST. Precedence, lowest to highest:
   `additive (+ -)` → `term (* /` and implicit multiplication`)` → `unary (-, +)` → `power (^)` → `postfix (! %)` → `primary`.
   - Implicit multiplication: `2pi`, `2(3+4)`, `3sin(30)`.
   - `^` is right-associative (`2^3^2 = 512`) and `-2^2 = -4` (unary minus is applied after the power), while `2^-3` works because the exponent is parsed as a unary expression.
   - Missing closing brackets at the end of the input are closed automatically (`expect` returns `null` at the end).
   - Limits: 1000 characters, 100 nesting levels — protection against hostile input.
   - A matrix is written `[[1,2],[3,4]]`: a bracketed list; a list of one-row matrices of equal length becomes a multi-row matrix.
4. **`evalNode`** walks the AST. Notable rules:
   - **Percent**: `50%` = 0.5; but in `200 + 10%` the percentage is taken *of the left operand* (= 220); same for `-`.
   - **Factorial** is defined for integers 0…170.
   - **Constants** `pi`, `e` and `Ans` (the last result, passed in `ctx.ans`).
   - **Function calls** check the argument count against the registry, then call the implementation.
5. **`check`** is applied to every result: `NaN` → «result is not defined», `Infinity` → «overflow».

### Function registry

`FUNCTIONS` maps a name to `{ n: [min, max], f(args, ctx, name) }`. 95 names (without synonyms `trans`, `identity`, `fact`) plus the 6 special forms of `SPECIAL`; the original 46 are listed here, the rest in «Extended math» below and in the manual:

- trigonometry and inverses: `sin cos tan asin acos atan atan2` (Deg/Rad through `ctx.deg`); hyperbolic: `sinh cosh tanh asinh acosh atanh`
- exponent, logarithms, roots: `exp ln log10 log2 log sqrt cbrt hypot`
- rounding and sign: `abs sign floor ceil trunc round`
- integers: `factorial ncr npr gcd lcm mod`
- statistics (take a list or a matrix): `sum mean median min max std stdp`
- matrices: `det inv transpose trace eye size`

Helpers: `ew(f)` applies a one-number function element-wise (to a number or to every matrix element); `num`, `ints`, `flat` validate argument types and raise readable errors.

### Extended math

Values are `number`, `Matrix`, `Complex` (`re`, `im`; collapsed back to a plain number when the imaginary part is negligible, see `cx`) and `Text` (results of `bin`, `hex`, `frac`…; `Text.n` keeps the number for `Ans`). `sqrt`, `ln`, `log*` and fractional powers of negative numbers return `Complex`. Functions flagged `cx: true` accept complex arguments, all others reject them; `plain()` stops `Text` and complex matrices from being used in further arithmetic.

Unknown identifiers parse to `var` nodes that are resolved from `ctx.vars`. The special forms `solve diff integral limit sigma product` (`SPECIAL`) receive their first argument as an AST and the second as a variable name, and evaluate the AST many times with that variable bound (`withVar`, `realFn`). `solve` first tests whether the expression is a polynomial of degree ≤ 8 (finite differences plus a check at far-away points, so `sin` in degrees is not mistaken for a polynomial) and then uses Aberth's method; other equations are scanned for sign changes in [-10, 10], then [-100, 100], then [-1000, 1000], or solved by Newton's method from a given starting point.

`js/numeric.js` holds the pure algorithms: Lanczos gamma, `erf`, Aberth polynomial roots, root scanning and Newton, Richardson derivative, adaptive Gauss–Kronrod integral, Miller–Rabin primality, factoring, continued-fraction `toFraction`. They are tested in `test/advanced.test.js` against known values, a sieve and random identities.

### Numerical accuracy

- `clean15` rounds results to 15 significant digits to remove floating-point noise (`0.1+0.2` shows `0.3`).
- `cleanTrig` and the special cases in `sin/cos/tan` return exact values for exact angles in degrees (`sin(180) = 0`, `cos(90) = 0`, `tan(90)` → error).
- Matrices: `matDet` — Gaussian elimination with partial pivoting; `matInv` — Gauss–Jordan; `pow` supports integer powers of a square matrix (negative powers via the inverse).

### Formatting

`formatNumber(v, places)` — fixed notation with 0–14 decimals and trailing zeros removed; exponent notation for `|v| ≥ 1e15` and for values that would round to 0 at the chosen precision. `formatValue` also prints matrices as `[[a, b], [c, d]]`.

## 3. `js/converters.js` — units and currencies

### Units

`UNITS` is a table `category → { label, units: { code: [name, factor] } }`, where *factor* is the number of base units in one given unit. Conversion: `value × factor(from) / factor(to)`. 12 categories: length, mass, temperature, volume, area, speed, time, data (decimal and binary prefixes), astronomical, and three groups of old Russian measures (length, area, weight).

- **Temperature** is a special category: the value is converted to Kelvin and back (`toKelvin`, `fromKelvin`); values below absolute zero raise an error.
- `convertUnit` validates category, units and that the value is finite. `formatUnitValue` prints 10 significant digits, exponent form for very large/small values.

### Currencies

- `CURRENCIES` — 12 currencies; `FALLBACK_RATES` — approximate rates to USD used offline.
- `fetchRatesFile` downloads `usd.min.json` of the open `currency-api` dataset, trying two addresses (jsDelivr CDN and `pages.dev`) in turn; the `fetch` function is passed in as a parameter, so tests can replace it.
- `convertCurrency(amount, from, to, rates)` = `amount × rates[to] / rates[from]` (all rates are relative to USD, so any pair works).
- Chart: `chartDates(days, today, maxPoints)` chooses up to 24 dates in ascending order ending today; `fetchHistory` downloads them **in parallel**, keeps results in a cache object and silently skips unavailable dates.
- `formatMoney` — grouping and 2…8 decimals depending on magnitude.

## 4. `js/app.js` — the interface

- **State** — one object: expression, last expression, `Ans`, Deg/Rad, Inv, Fn page, history (up to 50 entries; the last 3 are shown), error text.
- **`PAGES`** — the sixteen Fn sets (Trig, Hyp, Mat, Stat, Comb, Rnd, Alg, Cplx, Calc, Var, Num, Base, Misc, Stat2, Reg, Mat2); each has 6 slots, and a slot may define an `inv` replacement used when Inv is on.
- **`insert(val)`** — the input guard. It prevents invalid sequences while typing: double operators (the last one replaces the previous), a second decimal point in a number, a leading `0` followed by a digit, a closing bracket without an opening one, `%`/`!` without an operand, a comma outside brackets. After `=`, a digit starts a new expression, while an operator continues from `Ans`.
- **`backspace`** deletes a whole function name (`sin(`), `Ans` or `pi` at once; **`calculate`** calls `CalcEngine.evaluate`, stores the history, shows `CalcError` messages without losing the input.
- **Modes** — Scientific, Simple, Units, Currency; the expression is shared by the first two.
- **Keyboard** — digits and operators, `Enter`/`=`, `Esc`/`Delete` (clear), `Backspace`, `x` as multiplication, `,` as a decimal point (or an argument separator inside brackets). It is ignored in input fields, while a help window is open and in other modes.
- **Units / Currency** — populate the lists from `Converters`, recalculate on every change; the amount and the result fields work in both directions.
- **Rate chart** — drawn on `<canvas>`; each request gets a `token`, so a slow outdated response never overwrites a newer one; tooltip on hover/touch.
- **Network** — `fetchJson` adds an 8-second timeout; on failure the app switches to offline rates and says so.
- **Help windows** — modal dialogs closed by a button, by a click outside, or by `Esc`.

## 5. How it is verified and tested

```
npm install     # installs jsdom (the only dev dependency)
npm test        # node --test "test/*.test.js" — 88 tests
```

The built-in Node test runner is used; no test framework is needed.

| File | Approach |
|---|---|
| `test/engine.test.js` | table-driven checks of arithmetic, precedence, percent, factorial, constants, trigonometry in degrees and radians, logarithms, GCD/LCM/nCr/nPr, statistics, matrices, formatting; every error message; a registry check (each function has an argument range and an implementation); **fuzzing** — 60,000 random strings must give a number/matrix or a `CalcError`, never another exception |
| `test/advanced.test.js` | the extended math: numeric algorithms against known values and a sieve of Eratosthenes, complex identities on random numbers, `solve`/`diff`/`integral`/`limit`/`sigma`, number theory and bases, statistics, vectors and eigenvalues, a fuzz test of all new functions |
| `test/converters.test.js` | typical conversions, temperature edge cases, an exhaustive loop over all unit pairs of every category (finite numbers, A→B→A returns the start), rate loading with a fallback address and errors, chart dates, parallel history with cache and gaps, money formatting — with a fake `fetch` |
| `test/ui.test.js` | loads the real `index.html` with all scripts in **jsdom** (`test/helpers/dom.js` provides a fake `fetch` and a fake canvas) and drives it like a user: every button and Fn/Inv set, input guard cases, history, precision, Deg/Rad, keyboard, modes, help windows, units, currencies online/offline; plus a **monkey test** (6000 random presses and keys without a single page error) and a «no dead buttons» check |
| `test/manual.test.js` | parses `docs/MANUAL.md`: examples `` `expr` → **result** `` are evaluated by the engine, «press …» examples are performed on the real page, `rad:` and `units:` examples use their own mode; also checks that every engine function and every UI button is mentioned and that the manual refers only to existing files and commands |

Consequence: if a function changes behaviour, either a unit test or the manual test fails, so code, manual and tests cannot drift apart. CI (`.github/workflows/test.yml`) runs `npm install && npm test` on Node 22 for every push and pull request.

### Adding a function

1. Add an entry to `FUNCTIONS` in `js/calc-engine.js` (and, if it should have a button, a slot in `PAGES` in `js/app.js`).
2. Add unit tests in `test/engine.test.js`.
3. Describe it in `docs/MANUAL.md` with an executable example `` `f(2)` → **4** ``; `test/manual.test.js` will fail until every function is documented.

## 6. `variants/`

Earlier standalone pages (`calculatorEF.html` is the basis of the current version, `calculator-manual.html` the old manual). They are not part of the tests.
