# Architecture : rôle de chaque fichier, fonctionnement des fonctions, vérification et tests

[English](ARCHITECTURE.md) · [Português](ARCHITECTURE-PT.md) · [Українська](ARCHITECTURE-UK.md) · [Русский](ARCHITECTURE-RU.md) · **Français** · [Deutsch](ARCHITECTURE-DE.md)

## 1. Vue d'ensemble

Le programme est une page statique, sans étape de compilation ni dépendance d'exécution. La logique est répartie en deux parties qui **n'accèdent pas au DOM** et fonctionnent aussi bien dans le navigateur que dans Node (ce qui facilite les tests), plus une fine couche d'interface :

| Fichier | Responsabilité |
|---|---|
| `index.html` | structure de la page : écran, les deux claviers (scientifique / simple), panneaux « Unités » et « Devises », fenêtres d'aide |
| `css/style.css` | mise en forme ; thème clair/sombre via des variables CSS, mise en page adaptative |
| `js/calc-engine.js` | `CalcEngine` : analyse et évaluation des expressions, formatage du résultat (sans DOM) |
| `js/numeric.js` | `CalcNumeric` : algorithmes numériques purs — gamma, erf, racines de polynômes, recherche de racines, dérivée, intégrale, primalité, factorisation (sans DOM) |
| `js/converters.js` | `Converters` : unités, devises, chargement des taux, données du graphique (sans DOM) |
| `js/app.js` | interface : état, gestion des touches, clavier, modes, dessin du graphique, aide |
| `docs/MANUAL.md` | manuel d'utilisation (en russe) ; ses exemples sont exécutés par les tests |
| `test/` | tests automatiques (section 5) |
| `variants/` | versions antérieures de la page, conservées pour l'historique ; ni développées ni testées |

Les deux fichiers de logique utilisent la même enveloppe (UMD) : `module.exports` dans Node, une variable globale (`CalcEngine`, `Converters`) dans le navigateur.

## 2. `js/calc-engine.js` — le moteur d'expressions

API publique : `evaluate(expr, { deg, ans })`, `parse`, `tokenize`, `formatNumber`, `formatValue`, `Matrix`, `CalcError`, `FUNCTIONS`, `FUNCTION_NAMES`, `CONSTANTS`.

### Chaîne de traitement

`evaluate` = `parse` → `evalNode` → suppression de `-0`. Toute erreur de l'utilisateur est levée sous forme de `CalcError` avec un message lisible ; l'interface l'affiche et conserve l'expression.

1. **`normalize`** remplace les symboles d'affichage par de l'ASCII : `× · ⋅` → `*`, `÷` → `/`, `− – —` → `-`, `π` → `pi`, `√` → `sqrt`.
2. **`tokenize`** découpe le texte en nombres (`12`, `.5`, `1.5e3`), identifiants et opérateurs `+ - * / ^ ( ) [ ] , ! %`. Tout autre caractère provoque l'erreur « Caractère invalide ».
3. **`parse`** est un analyseur descendant récursif qui produit un AST. Priorités, de la plus basse à la plus haute :
   `additive (+ -)` → `term (* /` et multiplication implicite`)` → `unary (-, +)` → `power (^)` → `postfix (! %)` → `primary`.
   - Multiplication implicite : `2pi`, `2(3+4)`, `3sin(30)`.
   - `^` est associatif à droite (`2^3^2 = 512`) et `-2^2 = -4` (le moins unaire s'applique après la puissance) ; `2^-3` fonctionne car l'exposant est analysé comme une expression unaire.
   - Les parenthèses fermantes manquantes en fin de saisie sont fermées automatiquement (`expect` renvoie `null` à la fin).
   - Limites : 1000 caractères, 100 niveaux d'imbrication — protection contre les saisies hostiles.
   - Une matrice s'écrit `[[1,2],[3,4]]` : une liste entre crochets ; une liste de matrices d'une ligne de même longueur devient une matrice à plusieurs lignes.
4. **`evalNode`** parcourt l'AST. Règles principales :
   - **Pourcentage** : `50%` = 0.5 ; mais dans `200 + 10%` le pourcentage est pris *sur l'opérande de gauche* (= 220) ; de même pour `-`.
   - **Factorielle** définie pour les entiers 0…170.
   - **Constantes** `pi`, `e` et `Ans` (le dernier résultat, transmis dans `ctx.ans`).
   - **Appel de fonction** : vérifie le nombre d'arguments dans le registre, puis appelle l'implémentation.
5. **`check`** s'applique à chaque résultat : `NaN` → « Résultat non défini », `Infinity` → « Dépassement ».

### Registre des fonctions

`FUNCTIONS` associe un nom à `{ n: [min, max], f(args, ctx, name) }`. 95 noms (sans les synonymes `trans`, `identity`, `fact`) et les 6 formes spéciales de `SPECIAL` ; les 46 d'origine sont listés ici, les autres dans « Mathématiques avancées » ci-dessous et dans le manuel :

- trigonométrie et réciproques : `sin cos tan asin acos atan atan2` (Deg/Rad via `ctx.deg`) ; hyperboliques : `sinh cosh tanh asinh acosh atanh`
- exponentielle, logarithmes, racines : `exp ln log10 log2 log sqrt cbrt hypot`
- arrondis et signe : `abs sign floor ceil trunc round`
- entiers : `factorial ncr npr gcd lcm mod`
- statistiques (acceptent une liste ou une matrice) : `sum mean median min max std stdp`
- matrices : `det inv transpose trace eye size`

Aides : `ew(f)` applique une fonction d'un nombre élément par élément (à un nombre ou à chaque élément d'une matrice) ; `num`, `ints`, `flat` vérifient les types des arguments et lèvent des erreurs lisibles.

### Mathématiques avancées

Les valeurs sont `number`, `Matrix`, `Complex` (`re`, `im` ; redevient un nombre simple quand la partie imaginaire est négligeable, voir `cx`) et `Text` (résultats de `bin`, `hex`, `frac`… ; `Text.n` conserve le nombre pour `Ans`). `sqrt`, `ln`, `log*` et les puissances fractionnaires de nombres négatifs renvoient `Complex`. Les fonctions marquées `cx: true` acceptent des arguments complexes, les autres les refusent ; `plain()` empêche d'utiliser `Text` et les matrices complexes dans un calcul ultérieur.

Les identifiants inconnus sont analysés en nœuds `var` résolus depuis `ctx.vars`. Les formes spéciales `solve diff integral limit sigma product` (`SPECIAL`) reçoivent leur premier argument sous forme d'AST et le second comme nom de variable, et évaluent l'AST de nombreuses fois avec cette variable liée (`withVar`, `realFn`). `solve` teste d'abord si l'expression est un polynôme de degré ≤ 8 (différences finies et vérification en des points éloignés, pour qu'un `sin` en degrés ne soit pas pris pour un polynôme) puis applique la méthode d'Aberth ; les autres équations sont balayées à la recherche de changements de signe dans [-10, 10], puis [-100, 100], puis [-1000, 1000], ou résolues par la méthode de Newton depuis un point donné.

`js/numeric.js` contient les algorithmes purs : gamma de Lanczos, `erf`, racines de polynômes par Aberth, balayage de racines et Newton, dérivée de Richardson, intégrale adaptative de Gauss–Kronrod, primalité de Miller–Rabin, factorisation, `toFraction` par fraction continue. Ils sont testés dans `test/advanced.test.js` avec des valeurs connues, un crible et des identités aléatoires.

### Précision numérique

- `clean15` arrondit le résultat à 15 chiffres significatifs et supprime le bruit de la virgule flottante (`0.1+0.2` donne `0.3`).
- `cleanTrig` et les cas particuliers de `sin/cos/tan` renvoient des valeurs exactes pour des angles exacts en degrés (`sin(180) = 0`, `cos(90) = 0`, `tan(90)` → erreur).
- Matrices : `matDet` — élimination de Gauss avec pivot partiel ; `matInv` — Gauss–Jordan ; `pow` accepte les puissances entières d'une matrice carrée (les négatives via l'inverse).

### Formatage

`formatNumber(v, places)` — notation fixe avec 0 à 14 décimales et zéros finaux supprimés ; notation exponentielle pour `|v| ≥ 1e15` et pour les valeurs qui seraient arrondies à 0 avec la précision choisie. `formatValue` affiche aussi les matrices sous la forme `[[a, b], [c, d]]`.

## 3. `js/converters.js` — unités et devises

### Unités

`UNITS` est une table `catégorie → { label, units: { code: [nom, facteur] } }`, où le *facteur* est le nombre d'unités de base dans une unité donnée. Conversion : `valeur × facteur(de) / facteur(vers)`. 12 catégories : longueur, masse, température, volume, surface, vitesse, temps, données (préfixes décimaux et binaires), astronomiques et trois groupes d'anciennes mesures russes (longueur, surface, poids).

- La **température** est une catégorie particulière : la valeur est convertie en kelvins puis reconvertie (`toKelvin`, `fromKelvin`) ; une valeur inférieure au zéro absolu provoque une erreur.
- `convertUnit` vérifie la catégorie, les unités et que la valeur est finie. `formatUnitValue` affiche 10 chiffres significatifs, en notation exponentielle pour les valeurs très grandes/petites.

### Devises

- `CURRENCIES` — 12 devises ; `FALLBACK_RATES` — taux approximatifs par rapport à l'USD, utilisés hors ligne.
- `fetchRatesFile` télécharge `usd.min.json` du jeu de données ouvert `currency-api`, en essayant tour à tour deux adresses (CDN jsDelivr et `pages.dev`) ; la fonction `fetch` est passée en paramètre, les tests peuvent donc la remplacer.
- `convertCurrency(amount, from, to, rates)` = `amount × rates[to] / rates[from]` (tous les taux sont exprimés par rapport à l'USD, donc toute paire convient).
- Graphique : `chartDates(days, today, maxPoints)` choisit jusqu'à 24 dates par ordre croissant, la dernière étant aujourd'hui ; `fetchHistory` les télécharge **en parallèle**, les range dans un objet de cache et ignore silencieusement les dates indisponibles.
- `formatMoney` — séparateurs de milliers et 2…8 décimales selon l'ordre de grandeur.

## 4. `js/app.js` — l'interface

- **État** — un seul objet : expression, expression précédente, `Ans`, Deg/Rad, Inv, page Fn, historique (jusqu'à 50 entrées ; les 3 dernières sont affichées), texte d'erreur.
- **`PAGES`** — les seize jeux Fn (Trig, Hyp, Mat, Stat, Comb, Rnd, Alg, Cplx, Calc, Var, Num, Base, Misc, Stat2, Reg, Mat2) ; chacun a 6 emplacements, et un emplacement peut définir un remplacement `inv` utilisé quand Inv est actif.
- **`insert(val)`** — la protection de saisie. Elle empêche les séquences invalides : opérateurs doublés (le dernier remplace le précédent), second point décimal dans un nombre, `0` initial suivi d'un chiffre, parenthèse fermante sans ouvrante, `%`/`!` sans opérande, virgule hors parenthèses. Après `=`, un chiffre commence une nouvelle expression et un opérateur continue à partir de `Ans`.
- **`backspace`** supprime d'un coup un nom de fonction (`sin(`), `Ans` ou `pi` ; **`calculate`** appelle `CalcEngine.evaluate`, enregistre l'historique et affiche les messages de `CalcError` sans perdre la saisie.
- **Modes** — Scientifique, Simple, Unités, Devises ; l'expression est partagée par les deux premiers.
- **Clavier** — chiffres et opérateurs, `Enter`/`=`, `Esc`/`Delete` (effacer), `Backspace`, `x` comme multiplication, `,` comme séparateur décimal (ou séparateur d'arguments entre parenthèses). Ignoré dans les champs de saisie, quand une aide est ouverte et dans les autres modes.
- **Unités / Devises** — remplissent les listes depuis `Converters` et recalculent à chaque modification ; les champs montant et résultat fonctionnent dans les deux sens.
- **Graphique du taux** — dessiné sur un `<canvas>` ; chaque requête reçoit un `token`, de sorte qu'une réponse lente et périmée n'écrase jamais une plus récente ; info-bulle au survol/toucher.
- **Réseau** — `fetchJson` ajoute un délai maximal de 8 secondes ; en cas d'échec, l'application passe aux taux hors ligne et le signale.
- **Fenêtres d'aide** — boîtes de dialogue modales fermées par un bouton, par un clic à l'extérieur ou par `Esc`.

## 5. Vérification et tests

```
npm install     # installe jsdom (la seule dépendance de développement)
npm test        # node --test "test/*.test.js" — 88 tests
```

On utilise l'exécuteur de tests intégré à Node ; aucun framework de test n'est nécessaire.

| Fichier | Approche |
|---|---|
| `test/engine.test.js` | vérifications par tableaux de l'arithmétique, des priorités, des pourcentages, de la factorielle, des constantes, de la trigonométrie en degrés et en radians, des logarithmes, PGCD/PPCM/nCr/nPr, statistiques, matrices, formatage ; chaque message d'erreur ; contrôle du registre (chaque fonction a une plage d'arguments et une implémentation) ; **fuzzing** — 60 000 chaînes aléatoires doivent donner un nombre/une matrice ou une `CalcError`, jamais une autre exception |
| `test/advanced.test.js` | les mathématiques avancées : algorithmes numériques contre des valeurs connues et le crible d'Ératosthène, identités complexes sur des nombres aléatoires, `solve`/`diff`/`integral`/`limit`/`sigma`, théorie des nombres et bases, statistiques, vecteurs et valeurs propres, test de fuzzing de toutes les nouvelles fonctions |
| `test/converters.test.js` | conversions typiques, cas limites de la température, parcours exhaustif de toutes les paires d'unités de chaque catégorie (nombres finis, A→B→A revient au départ), chargement des taux avec adresse de secours et erreurs, dates du graphique, historique parallèle avec cache et trous, format monétaire — avec un faux `fetch` |
| `test/ui.test.js` | charge le vrai `index.html` avec tous ses scripts dans **jsdom** (`test/helpers/dom.js` fournit un faux `fetch` et un faux canvas) et le pilote comme un utilisateur : chaque touche et jeu Fn/Inv, cas de protection de saisie, historique, précision, Deg/Rad, clavier, modes, aide, unités, devises en ligne/hors ligne ; plus un test **« singe »** (6000 appuis et touches aléatoires sans la moindre erreur de page) et le contrôle « aucune touche morte » |
| `test/manual.test.js` | analyse `docs/MANUAL.md` : les exemples `` `expr` → **résultat** `` sont calculés par le moteur, les exemples « appuyez … » sont exécutés sur la vraie page, les exemples `rad:` et `units:` utilisent leur propre mode ; vérifie aussi que chaque fonction du moteur et chaque touche de l'interface sont mentionnées et que le manuel ne renvoie qu'à des fichiers et commandes existants |

Conséquence : si le comportement d'une fonction change, soit un test unitaire, soit le test du manuel échoue — code, manuel et tests ne peuvent pas diverger. La CI (`.github/workflows/test.yml`) exécute `npm install && npm test` sous Node 22 à chaque push et pull request.

### Ajouter une fonction

1. Ajoutez une entrée à `FUNCTIONS` dans `js/calc-engine.js` (et, si elle doit avoir une touche, un emplacement dans `PAGES` dans `js/app.js`).
2. Ajoutez des tests unitaires dans `test/engine.test.js`.
3. Décrivez-la dans `docs/MANUAL.md` avec un exemple exécutable `` `f(2)` → **4** `` ; tant que toutes les fonctions ne sont pas documentées, `test/manual.test.js` échoue.

## 6. `variants/`

Pages autonomes antérieures (`calculatorEF.html` est la base de la version actuelle, `calculator-manual.html` l'ancien manuel). Elles ne font pas partie des tests.
