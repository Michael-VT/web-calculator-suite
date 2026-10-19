# Calck — une calculatrice sur une seule page

[English](README.md) · [Português](README-PT.md) · [Українська](README-UK.md) · [Русский](README-RU.md) · **Français** · [Deutsch](README-DE.md)

Calculatrice scientifique, convertisseur d'unités et de devises dans un seul `index.html`. **Aucune bibliothèque ni police externe** (Internet n'est nécessaire que pour les taux de change), thème clair et sombre, agréable sur téléphone.

- **Scientifique** : trigonométrie (Deg/Rad), fonctions hyperboliques, logarithmes, puissances, pourcentages, factorielle, matrices (`det`, `inv`, `transpose`, …), statistiques, PGCD/PPCM, combinatoire, arrondis ; historique, `Ans`, clavier.
- **Simple** : grandes touches.
- **Unités** : 12 catégories, dont les unités astronomiques et les anciennes mesures russes.
- **Devises** : 12 devises, conversion dans les deux sens, graphique du taux, mode hors ligne.

## Lancement

Ouvrez `index.html` dans un navigateur, ou lancez `npm start` puis allez sur http://localhost:8080.

**Essayer en ligne** (sans installation) : [ouvrir la calculatrice](https://michael-vt.github.io/web-calculator-suite/) · [variante précédente calculatorEF](https://michael-vt.github.io/web-calculator-suite/variants/calculatorEF.html) (charge math.js depuis un CDN, Internet nécessaire).

## Documentation

| Document | Contenu |
|---|---|
| [docs/ARCHITECTURE-FR.md](docs/ARCHITECTURE-FR.md) | rôle de chaque fichier, fonctionnement des fonctions, vérification et tests |
| [docs/MANUAL.md](docs/MANUAL.md) | manuel d'utilisation : chaque touche et fonction avec des exemples reproductibles à la main (en russe uniquement) |

Le document d'architecture existe dans toutes les langues de ce README : `docs/ARCHITECTURE.md` (anglais), `-PT.md`, `-UK.md`, `-RU.md`, `-DE.md`.
Les exemples de `docs/MANUAL.md` sont exécutés par les tests : le manuel correspond donc toujours au programme.

## Tests

```
npm install
npm test
```

| Fichier | Ce qu'il vérifie |
|---|---|
| `test/engine.test.js` | le moteur d'expressions : arithmétique, fonctions, matrices, erreurs, formatage, fuzzing (60 000 expressions aléatoires : uniquement un résultat ou une `CalcError` claire) |
| `test/converters.test.js` | toutes les paires d'unités (réversibilité), température, taux, dates et cache du graphique, pannes réseau |
| `test/ui.test.js` | la vraie page dans jsdom : chaque touche et jeu Fn/Inv, clavier, aide, unités, devises (en ligne/hors ligne), test « singe » — 6000 appuis aléatoires sans erreur |
| `test/manual.test.js` | exécute tous les exemples de `docs/MANUAL.md` et vérifie que chaque fonction et touche est décrite |

Les tests s'exécutent à chaque push via GitHub Actions (`.github/workflows/test.yml`, Node 22).

## Structure

```
index.html            page
css/style.css         mise en forme (thème clair/sombre)
js/calc-engine.js     analyse et évaluation des expressions (sans DOM)
js/converters.js      unités et devises (sans DOM)
js/app.js             interface
docs/                 manuel et documents d'architecture
test/                 tests
variants/             versions antérieures de la page (conservées pour l'historique)
```

## Licence

MIT (voir `package.json`).
