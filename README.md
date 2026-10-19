# Calck — a one-page calculator

**English** · [Português](README-PT.md) · [Українська](README-UK.md) · [Русский](README-RU.md) · [Français](README-FR.md) · [Deutsch](README-DE.md)

A scientific calculator, unit converter and currency converter in a single `index.html`. **No external libraries or fonts** (the internet is needed only for exchange rates), light and dark theme, comfortable on a phone.

- **Scientific**: trigonometry (Deg/Rad), hyperbolic functions, logarithms, powers, percentages, factorial, matrices (`det`, `inv`, `transpose`, …), statistics, GCD/LCM, combinatorics, rounding; history, `Ans`, keyboard input.
- **Simple**: large buttons.
- **Units**: 12 categories, including astronomical and old Russian measures.
- **Currencies**: 12 currencies, two-way conversion, rate chart, offline mode.

## Run

Open `index.html` in a browser, or run `npm start` and go to http://localhost:8080.

**Try it online** (no install): [open the calculatorEF variant](https://htmlpreview.github.io/?https://github.com/Michael-VT/web-calculator-suite/blob/main/variants/calculatorEF.html) — the earlier variant the current version grew from; it loads math.js from a CDN, so it needs internet.

## Documentation

| Document | Content |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | what each file is responsible for, how the functions work, how everything is verified and tested |
| [docs/MANUAL.md](docs/MANUAL.md) | user manual: every button and function with examples you can repeat by hand (Russian only) |

The architecture document is available in all languages of this README: `docs/ARCHITECTURE-PT.md`, `-UK.md`, `-RU.md`, `-FR.md`, `-DE.md`.
The examples in `docs/MANUAL.md` are executed by the tests, so the manual always matches the program.

## Tests

```
npm install
npm test
```

| File | What it checks |
|---|---|
| `test/engine.test.js` | the expression engine: arithmetic, functions, matrices, errors, formatting, fuzzing (60,000 random expressions: only a result or a clear `CalcError`) |
| `test/converters.test.js` | all unit pairs (reversibility), temperature, rates, dates and chart cache, network failures |
| `test/ui.test.js` | the real page in jsdom: every button and Fn/Inv set, keyboard, help, units, currencies (online/offline), "monkey" test — 6,000 random presses without errors |
| `test/manual.test.js` | runs every example from `docs/MANUAL.md` and checks that every function and button is described |

Tests run on every push via GitHub Actions (`.github/workflows/test.yml`, Node 22).

## Structure

```
index.html            page
css/style.css         styling (light/dark theme)
js/calc-engine.js     expression parsing and evaluation (no DOM)
js/converters.js      units and currencies (no DOM)
js/app.js             user interface
docs/                 manual and architecture documents
test/                 tests
variants/             earlier versions of the page (kept for history)
```

## License

MIT (see `package.json`).
