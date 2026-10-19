# Architektur: wofür jede Datei zuständig ist, wie die Funktionen arbeiten, wie alles geprüft wird

[English](ARCHITECTURE.md) · [Português](ARCHITECTURE-PT.md) · [Українська](ARCHITECTURE-UK.md) · [Русский](ARCHITECTURE-RU.md) · [Français](ARCHITECTURE-FR.md) · **Deutsch**

## 1. Überblick

Das Programm ist eine statische Seite ohne Build-Schritt und ohne Laufzeit-Abhängigkeiten. Die Logik besteht aus zwei Teilen, die **nicht auf das DOM zugreifen** und sowohl im Browser als auch in Node laufen (das macht sie leicht testbar), sowie einer dünnen Oberflächenschicht:

| Datei | Zuständigkeit |
|---|---|
| `index.html` | Seitenaufbau: Anzeige, die beiden Tastenfelder (wissenschaftlich / einfach), Panels „Einheiten“ und „Währungen“, Hilfefenster |
| `css/style.css` | Gestaltung; helles/dunkles Design über CSS-Variablen, responsives Layout |
| `js/calc-engine.js` | `CalcEngine`: Parsen und Auswerten von Ausdrücken, Formatierung des Ergebnisses (ohne DOM) |
| `js/numeric.js` | `CalcNumeric`: reine numerische Algorithmen — Gamma, erf, Polynomnullstellen, Nullstellensuche, Ableitung, Integral, Primzahltest, Faktorisierung (ohne DOM) |
| `js/converters.js` | `Converters`: Einheiten, Währungen, Laden der Kurse, Diagrammdaten (ohne DOM) |
| `js/app.js` | Oberfläche: Zustand, Tastenbehandlung, Tastatur, Modi, Zeichnen des Diagramms, Hilfe |
| `docs/MANUAL.md` | Benutzerhandbuch (auf Russisch); seine Beispiele werden von den Tests ausgeführt |
| `test/` | automatische Tests (Abschnitt 5) |
| `variants/` | frühere Versionen der Seite, nur zur Dokumentation; nicht weiterentwickelt und nicht getestet |

Beide Logikdateien verwenden denselben Wrapper (UMD): `module.exports` in Node, eine globale Variable (`CalcEngine`, `Converters`) im Browser.

## 2. `js/calc-engine.js` — die Ausdrucks-Engine

Öffentliche API: `evaluate(expr, { deg, ans })`, `parse`, `tokenize`, `formatNumber`, `formatValue`, `Matrix`, `CalcError`, `FUNCTIONS`, `FUNCTION_NAMES`, `CONSTANTS`.

### Ablauf

`evaluate` = `parse` → `evalNode` → Entfernen von `-0`. Jeder Benutzerfehler wird als `CalcError` mit lesbarem Text ausgelöst; die Oberfläche zeigt ihn an und behält den Ausdruck.

1. **`normalize`** ersetzt Anzeigesymbole durch ASCII: `× · ⋅` → `*`, `÷` → `/`, `− – —` → `-`, `π` → `pi`, `√` → `sqrt`.
2. **`tokenize`** zerlegt den Text in Zahlen (`12`, `.5`, `1.5e3`), Bezeichner und die Operatoren `+ - * / ^ ( ) [ ] , ! %`. Jedes andere Zeichen löst „Ungültiges Zeichen“ aus.
3. **`parse`** ist ein rekursiver Abstiegsparser, der einen AST erzeugt. Vorrang, von niedrig nach hoch:
   `additive (+ -)` → `term (* /` und implizite Multiplikation`)` → `unary (-, +)` → `power (^)` → `postfix (! %)` → `primary`.
   - Implizite Multiplikation: `2pi`, `2(3+4)`, `3sin(30)`.
   - `^` ist rechtsassoziativ (`2^3^2 = 512`) und `-2^2 = -4` (das unäre Minus wirkt nach der Potenz); `2^-3` funktioniert, weil der Exponent als unärer Ausdruck geparst wird.
   - Fehlende schließende Klammern am Ende der Eingabe werden automatisch ergänzt (`expect` liefert am Ende `null`).
   - Grenzen: 1000 Zeichen, 100 Verschachtelungsebenen — Schutz vor böswilligen Eingaben.
   - Eine Matrix wird als `[[1,2],[3,4]]` geschrieben: eine Liste in eckigen Klammern; eine Liste einzeiliger Matrizen gleicher Länge wird zu einer mehrzeiligen Matrix.
4. **`evalNode`** durchläuft den AST. Wichtige Regeln:
   - **Prozent**: `50%` = 0.5; in `200 + 10%` wird das Prozent jedoch *vom linken Operanden* genommen (= 220); ebenso bei `-`.
   - **Fakultät** ist für ganze Zahlen 0…170 definiert.
   - **Konstanten** `pi`, `e` und `Ans` (das letzte Ergebnis, übergeben in `ctx.ans`).
   - **Funktionsaufruf** prüft die Argumentanzahl gegen das Register und ruft dann die Implementierung auf.
5. **`check`** wird auf jedes Ergebnis angewendet: `NaN` → „Ergebnis nicht definiert“, `Infinity` → „Überlauf“.

### Funktionsregister

`FUNCTIONS` ordnet einem Namen `{ n: [min, max], f(args, ctx, name) }` zu. 95 Namen (ohne die Synonyme `trans`, `identity`, `fact`) und die 6 Sonderformen aus `SPECIAL`; hier stehen die ursprünglichen 46, die übrigen im Abschnitt „Höhere Mathematik“ unten und im Handbuch:

- Trigonometrie und Umkehrfunktionen: `sin cos tan asin acos atan atan2` (Deg/Rad über `ctx.deg`); Hyperbelfunktionen: `sinh cosh tanh asinh acosh atanh`
- Exponentialfunktion, Logarithmen, Wurzeln: `exp ln log10 log2 log sqrt cbrt hypot`
- Runden und Vorzeichen: `abs sign floor ceil trunc round`
- ganze Zahlen: `factorial ncr npr gcd lcm mod`
- Statistik (Liste oder Matrix): `sum mean median min max std stdp`
- Matrizen: `det inv transpose trace eye size`

Hilfsfunktionen: `ew(f)` wendet eine Ein-Zahl-Funktion elementweise an (auf eine Zahl oder auf jedes Matrixelement); `num`, `ints`, `flat` prüfen Argumenttypen und lösen lesbare Fehler aus.

### Höhere Mathematik

Werte sind `number`, `Matrix`, `Complex` (`re`, `im`; wird bei vernachlässigbarem Imaginärteil wieder zu einer gewöhnlichen Zahl, siehe `cx`) und `Text` (Ergebnisse von `bin`, `hex`, `frac`…; `Text.n` behält die Zahl für `Ans`). `sqrt`, `ln`, `log*` und gebrochene Potenzen negativer Zahlen liefern `Complex`. Funktionen mit dem Merkmal `cx: true` akzeptieren komplexe Argumente, alle anderen lehnen sie ab; `plain()` verhindert, dass `Text` und komplexe Matrizen weiterverrechnet werden.

Unbekannte Bezeichner werden zu `var`-Knoten und aus `ctx.vars` aufgelöst. Die Sonderformen `solve diff integral limit sigma product` (`SPECIAL`) erhalten das erste Argument als AST und das zweite als Variablennamen und werten den AST viele Male mit gebundener Variable aus (`withVar`, `realFn`). `solve` prüft zuerst, ob der Ausdruck ein Polynom vom Grad ≤ 8 ist (endliche Differenzen plus Kontrolle an weit entfernten Punkten, damit `sin` in Grad nicht für ein Polynom gehalten wird), und verwendet dann das Aberth-Verfahren; andere Gleichungen werden auf Vorzeichenwechsel in [-10, 10], dann [-100, 100], dann [-1000, 1000] abgesucht oder per Newton-Verfahren von einem vorgegebenen Punkt aus gelöst.

`js/numeric.js` enthält die reinen Algorithmen: Lanczos-Gamma, `erf`, Aberth-Polynomnullstellen, Nullstellen-Scan und Newton, Richardson-Ableitung, adaptives Gauß-Kronrod-Integral, Miller-Rabin-Primzahltest, Faktorisierung, `toFraction` per Kettenbruch. Sie werden in `test/advanced.test.js` gegen bekannte Werte, ein Sieb und zufällige Identitäten getestet.

### Numerische Genauigkeit

- `clean15` rundet Ergebnisse auf 15 signifikante Stellen und entfernt Gleitkomma-Rauschen (`0.1+0.2` ergibt `0.3`).
- `cleanTrig` und die Sonderfälle in `sin/cos/tan` liefern exakte Werte für exakte Winkel in Grad (`sin(180) = 0`, `cos(90) = 0`, `tan(90)` → Fehler).
- Matrizen: `matDet` — Gauß-Elimination mit Teilpivotisierung; `matInv` — Gauß–Jordan; `pow` unterstützt ganzzahlige Potenzen quadratischer Matrizen (negative über die Inverse).

### Formatierung

`formatNumber(v, places)` — Festkomma mit 0–14 Nachkommastellen ohne nachgestellte Nullen; Exponentialschreibweise für `|v| ≥ 1e15` und für Werte, die bei der gewählten Genauigkeit zu 0 gerundet würden. `formatValue` gibt Matrizen als `[[a, b], [c, d]]` aus.

## 3. `js/converters.js` — Einheiten und Währungen

### Einheiten

`UNITS` ist eine Tabelle `Kategorie → { label, units: { Code: [Name, Faktor] } }`, wobei der *Faktor* angibt, wie viele Basiseinheiten in einer gegebenen Einheit stecken. Umrechnung: `Wert × Faktor(von) / Faktor(nach)`. 12 Kategorien: Länge, Masse, Temperatur, Volumen, Fläche, Geschwindigkeit, Zeit, Daten (dezimale und binäre Präfixe), astronomische sowie drei Gruppen alter russischer Maße (Länge, Fläche, Gewicht).

- **Temperatur** ist eine Sonderkategorie: Der Wert wird in Kelvin und zurück umgerechnet (`toKelvin`, `fromKelvin`); Werte unter dem absoluten Nullpunkt lösen einen Fehler aus.
- `convertUnit` prüft Kategorie, Einheiten und dass der Wert endlich ist. `formatUnitValue` gibt 10 signifikante Stellen aus, bei sehr großen/kleinen Werten Exponentialschreibweise.

### Währungen

- `CURRENCIES` — 12 Währungen; `FALLBACK_RATES` — ungefähre Kurse zum USD für den Betrieb ohne Netz.
- `fetchRatesFile` lädt `usd.min.json` des offenen Datensatzes `currency-api` und probiert nacheinander zwei Adressen (jsDelivr-CDN und `pages.dev`); die Funktion `fetch` wird als Parameter übergeben, Tests können sie daher ersetzen.
- `convertCurrency(amount, from, to, rates)` = `amount × rates[to] / rates[from]` (alle Kurse beziehen sich auf USD, daher funktioniert jedes Paar).
- Diagramm: `chartDates(days, today, maxPoints)` wählt bis zu 24 aufsteigende Daten, das letzte ist heute; `fetchHistory` lädt sie **parallel**, legt sie in einem Cache-Objekt ab und überspringt nicht verfügbare Daten stillschweigend.
- `formatMoney` — Tausendertrennung und 2…8 Nachkommastellen je nach Größenordnung.

## 4. `js/app.js` — die Oberfläche

- **Zustand** — ein einziges Objekt: Ausdruck, letzter Ausdruck, `Ans`, Deg/Rad, Inv, Fn-Seite, Verlauf (bis zu 50 Einträge; die letzten 3 sind sichtbar), Fehlertext.
- **`PAGES`** — die sechzehn Fn-Sätze (Trig, Hyp, Mat, Stat, Comb, Rnd, Alg, Cplx, Calc, Var, Num, Base, Misc, Stat2, Reg, Mat2); jeder hat 6 Plätze, und ein Platz kann einen `inv`-Ersatz für eingeschaltetes Inv festlegen.
- **`insert(val)`** — der Eingabeschutz. Er verhindert ungültige Folgen beim Tippen: doppelte Operatoren (der letzte ersetzt den vorigen), einen zweiten Dezimalpunkt in einer Zahl, führende `0` vor einer Ziffer, schließende Klammer ohne öffnende, `%`/`!` ohne Operanden, Komma außerhalb von Klammern. Nach `=` beginnt eine Ziffer einen neuen Ausdruck, ein Operator setzt bei `Ans` fort.
- **`backspace`** löscht einen Funktionsnamen (`sin(`), `Ans` oder `pi` auf einmal; **`calculate`** ruft `CalcEngine.evaluate` auf, führt den Verlauf und zeigt `CalcError`-Meldungen an, ohne die Eingabe zu verlieren.
- **Modi** — Wissenschaftlich, Einfach, Einheiten, Währungen; der Ausdruck wird von den ersten beiden gemeinsam genutzt.
- **Tastatur** — Ziffern und Operatoren, `Enter`/`=`, `Esc`/`Delete` (löschen), `Backspace`, `x` als Multiplikation, `,` als Dezimalpunkt (oder Argumenttrenner in Klammern). Wird in Eingabefeldern, bei geöffneter Hilfe und in anderen Modi ignoriert.
- **Einheiten / Währungen** — füllen die Listen aus `Converters` und rechnen bei jeder Änderung neu; Betrags- und Ergebnisfeld funktionieren in beide Richtungen.
- **Kursdiagramm** — wird auf einem `<canvas>` gezeichnet; jede Anfrage erhält einen `token`, damit eine langsame veraltete Antwort keine neuere überschreibt; Tooltip bei Hover/Berührung.
- **Netzwerk** — `fetchJson` fügt ein Zeitlimit von 8 Sekunden hinzu; bei einem Fehler wechselt die App zu Offline-Kursen und weist darauf hin.
- **Hilfefenster** — modale Dialoge, geschlossen per Schaltfläche, Klick außerhalb oder `Esc`.

## 5. Wie geprüft und getestet wird

```
npm install     # installiert jsdom (die einzige Entwicklungsabhängigkeit)
npm test        # node --test "test/*.test.js" — 88 Tests
```

Es wird der in Node eingebaute Test-Runner verwendet; ein Test-Framework ist nicht nötig.

| Datei | Vorgehen |
|---|---|
| `test/engine.test.js` | tabellengetriebene Prüfungen von Arithmetik, Vorrang, Prozent, Fakultät, Konstanten, Trigonometrie in Grad und Bogenmaß, Logarithmen, ggT/kgV/nCr/nPr, Statistik, Matrizen, Formatierung; jede Fehlermeldung; Registerprüfung (jede Funktion hat Argumentbereich und Implementierung); **Fuzzing** — 60 000 zufällige Zeichenketten müssen eine Zahl/Matrix oder einen `CalcError` ergeben, nie eine andere Ausnahme |
| `test/advanced.test.js` | die höhere Mathematik: numerische Algorithmen gegen bekannte Werte und das Sieb des Eratosthenes, komplexe Identitäten auf Zufallszahlen, `solve`/`diff`/`integral`/`limit`/`sigma`, Zahlentheorie und Zahlensysteme, Statistik, Vektoren und Eigenwerte, Fuzz-Test aller neuen Funktionen |
| `test/converters.test.js` | typische Umrechnungen, Randfälle der Temperatur, erschöpfende Schleife über alle Einheitenpaare jeder Kategorie (endliche Zahlen, A→B→A ergibt den Ausgangswert), Laden der Kurse mit Ersatzadresse und Fehlern, Diagrammdaten, parallele Historie mit Cache und Lücken, Geldformat — mit einem Schein-`fetch` |
| `test/ui.test.js` | lädt die echte `index.html` mit allen Skripten in **jsdom** (`test/helpers/dom.js` stellt ein Schein-`fetch` und ein Schein-Canvas bereit) und bedient sie wie ein Benutzer: jede Taste und jeder Fn/Inv-Satz, Fälle des Eingabeschutzes, Verlauf, Genauigkeit, Deg/Rad, Tastatur, Modi, Hilfe, Einheiten, Währungen online/offline; dazu ein **„Affen“-Test** (6000 zufällige Eingaben und Tasten ohne einen einzigen Seitenfehler) und die Prüfung „keine toten Tasten“ |
| `test/manual.test.js` | analysiert `docs/MANUAL.md`: Beispiele `` `Ausdruck` → **Ergebnis** `` werden von der Engine berechnet, „drücken …“-Beispiele auf der echten Seite ausgeführt, `rad:`- und `units:`-Beispiele nutzen ihren eigenen Modus; geprüft wird auch, dass jede Engine-Funktion und jede Oberflächentaste erwähnt ist und das Handbuch nur auf vorhandene Dateien und Befehle verweist |

Folge: Ändert sich das Verhalten einer Funktion, schlägt entweder ein Unit-Test oder der Handbuchtest fehl — Code, Handbuch und Tests können nicht auseinanderlaufen. Die CI (`.github/workflows/test.yml`) führt bei jedem Push und Pull Request `npm install && npm test` unter Node 22 aus.

### Eine Funktion hinzufügen

1. Eintrag in `FUNCTIONS` in `js/calc-engine.js` ergänzen (und, falls sie eine Taste bekommen soll, einen Platz in `PAGES` in `js/app.js`).
2. Unit-Tests in `test/engine.test.js` ergänzen.
3. Sie in `docs/MANUAL.md` mit einem ausführbaren Beispiel `` `f(2)` → **4** `` beschreiben; solange nicht alle Funktionen dokumentiert sind, schlägt `test/manual.test.js` fehl.

## 6. `variants/`

Frühere eigenständige Seiten (`calculatorEF.html` ist die Grundlage der aktuellen Version, `calculator-manual.html` das alte Handbuch). Sie nehmen an den Tests nicht teil.
