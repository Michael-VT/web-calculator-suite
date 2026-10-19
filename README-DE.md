# Calck — ein Taschenrechner auf einer Seite

[English](README.md) · [Português](README-PT.md) · [Українська](README-UK.md) · [Русский](README-RU.md) · [Français](README-FR.md) · **Deutsch**

Wissenschaftlicher Taschenrechner, Einheiten- und Währungsumrechner in einer einzigen `index.html`. **Keine externen Bibliotheken oder Schriften** (Internet wird nur für Wechselkurse benötigt), helles und dunkles Design, bequem auf dem Smartphone.

- **Wissenschaftlich**: Trigonometrie (Deg/Rad), Hyperbelfunktionen, Logarithmen, Potenzen, Prozente, Fakultät, Matrizen (`det`, `inv`, `transpose`, …), Statistik, ggT/kgV, Kombinatorik, Runden; Verlauf, `Ans`, Tastatureingabe.
- **Höhere Mathematik**: komplexe Zahlen (`i`), Gleichungen (`solve`), Ableitungen, Integrale, Grenzwerte, Summen und Produkte, Regression und Normalverteilung, Primzahlen und Faktorisierung, Zahlensysteme und Bit-Operationen, Vektoren, `lsolve`, `eig`.
- **Einfach**: große Tasten.
- **Einheiten**: 12 Kategorien, darunter astronomische und alte russische Maße.
- **Währungen**: 12 Währungen, Umrechnung in beide Richtungen, Kursdiagramm, Offline-Modus.

## Starten

`index.html` im Browser öffnen oder `npm start` ausführen und http://localhost:8080 aufrufen.

**Online ausprobieren** (ohne Installation): [Rechner öffnen](https://michael-vt.github.io/web-calculator-suite/) · [frühere Variante calculatorEF](https://michael-vt.github.io/web-calculator-suite/variants/calculatorEF.html) (lädt math.js von einem CDN, Internet nötig).

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [docs/ARCHITECTURE-DE.md](docs/ARCHITECTURE-DE.md) | wofür jede Datei zuständig ist, wie die Funktionen arbeiten, wie alles geprüft und getestet wird |
| [docs/MANUAL.md](docs/MANUAL.md) | Benutzerhandbuch: jede Taste und Funktion mit Beispielen zum Nachrechnen von Hand (nur auf Russisch) |

Das Architekturdokument gibt es in allen Sprachen dieser README: `docs/ARCHITECTURE.md` (Englisch), `-PT.md`, `-UK.md`, `-RU.md`, `-FR.md`.
Die Beispiele in `docs/MANUAL.md` werden von den Tests ausgeführt, daher stimmt das Handbuch immer mit dem Programm überein.

## Tests

```
npm install
npm test
```

| Datei | Was geprüft wird |
|---|---|
| `test/engine.test.js` | die Ausdrucks-Engine: Arithmetik, Funktionen, Matrizen, Fehler, Formatierung, Fuzzing (60 000 Zufallsausdrücke: nur ein Ergebnis oder ein verständlicher `CalcError`) |
| `test/converters.test.js` | alle Einheitenpaare (Umkehrbarkeit), Temperatur, Kurse, Daten und Diagramm-Cache, Netzwerkausfälle |
| `test/ui.test.js` | die echte Seite in jsdom: jede Taste und jeder Fn/Inv-Satz, Tastatur, Hilfe, Einheiten, Währungen (online/offline), „Affen“-Test — 6000 zufällige Eingaben ohne Fehler |
| `test/manual.test.js` | führt alle Beispiele aus `docs/MANUAL.md` aus und prüft, dass jede Funktion und Taste beschrieben ist |

Die Tests laufen bei jedem Push über GitHub Actions (`.github/workflows/test.yml`, Node 22).

## Struktur

```
index.html            Seite
css/style.css         Gestaltung (helles/dunkles Design)
js/calc-engine.js     Parsen und Auswerten von Ausdrücken (ohne DOM)
js/numeric.js        numerische Algorithmen: Nullstellen, Integrale, Primzahlen, Spezialfunktionen (ohne DOM)
js/converters.js      Einheiten und Währungen (ohne DOM)
js/app.js             Benutzeroberfläche
docs/                 Handbuch und Architekturdokumente
test/                 Tests
variants/             frühere Versionen der Seite (zur Dokumentation der Geschichte)
```

## Lizenz

MIT (siehe `package.json`).
