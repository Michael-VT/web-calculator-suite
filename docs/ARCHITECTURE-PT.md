# Arquitetura: o que faz cada ficheiro, como funcionam as funções, como tudo é testado

[English](ARCHITECTURE.md) · **Português** · [Українська](ARCHITECTURE-UK.md) · [Русский](ARCHITECTURE-RU.md) · [Français](ARCHITECTURE-FR.md) · [Deutsch](ARCHITECTURE-DE.md)

## 1. Visão geral

O programa é uma página estática, sem passo de compilação e sem dependências em tempo de execução. A lógica divide-se em duas partes que **não acedem ao DOM** e funcionam tanto no navegador como no Node (o que facilita os testes), mais uma camada fina de interface:

| Ficheiro | Responsabilidade |
|---|---|
| `index.html` | estrutura da página: visor, os dois teclados (científico / simples), painéis «Unidades» e «Moedas», janelas de ajuda |
| `css/style.css` | estilo; tema claro/escuro através de variáveis CSS, disposição adaptável |
| `js/calc-engine.js` | `CalcEngine`: análise e cálculo de expressões, formatação do resultado (sem DOM) |
| `js/converters.js` | `Converters`: unidades, moedas, carregamento de taxas, dados do gráfico (sem DOM) |
| `js/app.js` | interface: estado, tratamento dos botões, teclado, modos, desenho do gráfico, ajuda |
| `docs/MANUAL.md` | manual do utilizador (em russo); os seus exemplos são executados pelos testes |
| `test/` | testes automáticos (secção 5) |
| `variants/` | versões anteriores da página, para histórico; não são desenvolvidas nem testadas |

Os dois ficheiros de lógica usam o mesmo invólucro (UMD): `module.exports` no Node, uma variável global (`CalcEngine`, `Converters`) no navegador.

## 2. `js/calc-engine.js` — o motor de expressões

API pública: `evaluate(expr, { deg, ans })`, `parse`, `tokenize`, `formatNumber`, `formatValue`, `Matrix`, `CalcError`, `FUNCTIONS`, `FUNCTION_NAMES`, `CONSTANTS`.

### Fluxo

`evaluate` = `parse` → `evalNode` → eliminação de `-0`. Qualquer erro do utilizador é lançado como `CalcError` com texto legível; a interface mostra-o e mantém a expressão.

1. **`normalize`** substitui os símbolos de apresentação por ASCII: `× · ⋅` → `*`, `÷` → `/`, `− – —` → `-`, `π` → `pi`, `√` → `sqrt`.
2. **`tokenize`** divide o texto em números (`12`, `.5`, `1.5e3`), identificadores e os operadores `+ - * / ^ ( ) [ ] , ! %`. Qualquer outro carácter provoca o erro «Carácter inválido».
3. **`parse`** é um analisador descendente recursivo que produz uma AST. Precedência, da mais baixa à mais alta:
   `additive (+ -)` → `term (* /` e multiplicação implícita`)` → `unary (-, +)` → `power (^)` → `postfix (! %)` → `primary`.
   - Multiplicação implícita: `2pi`, `2(3+4)`, `3sin(30)`.
   - `^` é associativo à direita (`2^3^2 = 512`) e `-2^2 = -4` (o menos unário aplica-se depois da potência); `2^-3` funciona porque o expoente é analisado como expressão unária.
   - Os parênteses de fecho em falta no fim da entrada são fechados automaticamente (`expect` devolve `null` no fim).
   - Limites: 1000 caracteres, 100 níveis de aninhamento — proteção contra entradas hostis.
   - Uma matriz escreve-se `[[1,2],[3,4]]`: uma lista entre parênteses retos; uma lista de matrizes de uma linha com o mesmo comprimento torna-se uma matriz de várias linhas.
4. **`evalNode`** percorre a AST. Regras principais:
   - **Percentagem**: `50%` = 0.5; mas em `200 + 10%` a percentagem é calculada *sobre o operando da esquerda* (= 220); o mesmo para `-`.
   - **Fatorial** definido para inteiros 0…170.
   - **Constantes** `pi`, `e` e `Ans` (o último resultado, passado em `ctx.ans`).
   - **Chamada de função** confere o número de argumentos com o registo e chama a implementação.
5. **`check`** aplica-se a cada resultado: `NaN` → «Resultado não definido», `Infinity` → «Excesso».

### Registo de funções

`FUNCTIONS` associa um nome a `{ n: [min, max], f(args, ctx, name) }`. 46 nomes (sem os sinónimos `trans`, `identity`, `fact`):

- trigonometria e inversas: `sin cos tan asin acos atan atan2` (Deg/Rad através de `ctx.deg`); hiperbólicas: `sinh cosh tanh asinh acosh atanh`
- exponencial, logaritmos, raízes: `exp ln log10 log2 log sqrt cbrt hypot`
- arredondamento e sinal: `abs sign floor ceil trunc round`
- inteiros: `factorial ncr npr gcd lcm mod`
- estatística (aceita lista ou matriz): `sum mean median min max std stdp`
- matrizes: `det inv transpose trace eye size`

Auxiliares: `ew(f)` aplica uma função de um número elemento a elemento (a um número ou a cada elemento de uma matriz); `num`, `ints`, `flat` validam os tipos dos argumentos e lançam erros legíveis.

### Precisão numérica

- `clean15` arredonda o resultado a 15 algarismos significativos, removendo o ruído da vírgula flutuante (`0.1+0.2` dá `0.3`).
- `cleanTrig` e os casos especiais em `sin/cos/tan` devolvem valores exatos para ângulos exatos em graus (`sin(180) = 0`, `cos(90) = 0`, `tan(90)` → erro).
- Matrizes: `matDet` — eliminação de Gauss com pivô parcial; `matInv` — Gauss–Jordan; `pow` suporta potências inteiras de matrizes quadradas (as negativas através da inversa).

### Formatação

`formatNumber(v, places)` — notação fixa com 0–14 casas decimais e zeros finais removidos; notação exponencial para `|v| ≥ 1e15` e para valores que arredondariam para 0 com a precisão escolhida. `formatValue` também escreve matrizes como `[[a, b], [c, d]]`.

## 3. `js/converters.js` — unidades e moedas

### Unidades

`UNITS` é uma tabela `categoria → { label, units: { código: [nome, fator] } }`, em que *fator* é o número de unidades base numa unidade dada. Conversão: `valor × fator(de) / fator(para)`. 12 categorias: comprimento, massa, temperatura, volume, área, velocidade, tempo, dados (prefixos decimais e binários), astronómicas e três grupos de antigas medidas russas (comprimento, área, peso).

- A **temperatura** é uma categoria especial: o valor é convertido para kelvin e de volta (`toKelvin`, `fromKelvin`); valores abaixo do zero absoluto provocam erro.
- `convertUnit` valida a categoria, as unidades e que o valor é finito. `formatUnitValue` escreve 10 algarismos significativos e usa notação exponencial para valores muito grandes/pequenos.

### Moedas

- `CURRENCIES` — 12 moedas; `FALLBACK_RATES` — taxas aproximadas face ao USD, usadas sem rede.
- `fetchRatesFile` descarrega `usd.min.json` do conjunto aberto `currency-api`, tentando por ordem dois endereços (CDN jsDelivr e `pages.dev`); a função `fetch` é passada como parâmetro, por isso os testes podem substituí-la.
- `convertCurrency(amount, from, to, rates)` = `amount × rates[to] / rates[from]` (todas as taxas são face ao USD, por isso qualquer par funciona).
- Gráfico: `chartDates(days, today, maxPoints)` escolhe até 24 datas por ordem crescente, a última é hoje; `fetchHistory` descarrega-as **em paralelo**, guarda-as num objeto de cache e ignora em silêncio as datas indisponíveis.
- `formatMoney` — separadores de milhares e 2…8 casas conforme a magnitude.

## 4. `js/app.js` — a interface

- **Estado** — um único objeto: expressão, expressão anterior, `Ans`, Deg/Rad, Inv, página Fn, histórico (até 50 entradas; as 3 últimas são visíveis), texto do erro.
- **`PAGES`** — os seis conjuntos Fn (Trig, Hyp, Mat, Stat, Comb, Rnd); cada um tem 6 posições, e uma posição pode definir uma substituição `inv` usada quando Inv está ativo.
- **`insert(val)`** — a proteção de entrada. Impede sequências inválidas ao escrever: operadores duplos (o último substitui o anterior), segundo ponto decimal num número, `0` inicial seguido de dígito, parêntese de fecho sem abertura, `%`/`!` sem operando, vírgula fora de parênteses. Depois de `=`, um dígito inicia nova expressão e um operador continua a partir de `Ans`.
- **`backspace`** apaga de uma vez o nome de uma função (`sin(`), `Ans` ou `pi`; **`calculate`** chama `CalcEngine.evaluate`, guarda o histórico e mostra as mensagens de `CalcError` sem perder a entrada.
- **Modos** — Científico, Simples, Unidades, Moedas; a expressão é partilhada pelos dois primeiros.
- **Teclado** — dígitos e operadores, `Enter`/`=`, `Esc`/`Delete` (limpar), `Backspace`, `x` como multiplicação, `,` como ponto decimal (ou separador de argumentos dentro de parênteses). É ignorado em campos de entrada, com a ajuda aberta e nos outros modos.
- **Unidades / Moedas** — preenchem as listas a partir de `Converters` e recalculam a cada alteração; os campos de quantia e resultado funcionam nos dois sentidos.
- **Gráfico da taxa** — desenhado num `<canvas>`; cada pedido recebe um `token`, para que uma resposta lenta e obsoleta não substitua uma mais recente; dica ao passar o rato/tocar.
- **Rede** — `fetchJson` acrescenta um limite de 8 segundos; em caso de falha a aplicação passa às taxas offline e avisa.
- **Janelas de ajuda** — diálogos modais fechados por botão, por clique fora ou por `Esc`.

## 5. Como é verificado e testado

```
npm install     # instala o jsdom (a única dependência de desenvolvimento)
npm test        # node --test "test/*.test.js" — 72 testes
```

Usa-se o executor de testes integrado no Node; não é preciso nenhuma framework de testes.

| Ficheiro | Abordagem |
|---|---|
| `test/engine.test.js` | verificações em tabela de aritmética, precedência, percentagem, fatorial, constantes, trigonometria em graus e radianos, logaritmos, MDC/MMC/nCr/nPr, estatística, matrizes, formatação; todas as mensagens de erro; verificação do registo (cada função tem intervalo de argumentos e implementação); **fuzzing** — 60 000 cadeias aleatórias têm de dar um número/matriz ou um `CalcError`, nunca outra exceção |
| `test/converters.test.js` | conversões típicas, casos-limite da temperatura, ciclo exaustivo sobre todos os pares de unidades de cada categoria (números finitos, A→B→A volta ao início), carregamento de taxas com endereço alternativo e erros, datas do gráfico, histórico paralelo com cache e falhas, formato de dinheiro — com um `fetch` falso |
| `test/ui.test.js` | carrega o `index.html` real com todos os scripts no **jsdom** (`test/helpers/dom.js` fornece um `fetch` e um canvas falsos) e usa-o como um utilizador: cada botão e conjunto Fn/Inv, casos de proteção de entrada, histórico, precisão, Deg/Rad, teclado, modos, ajuda, unidades, moedas online/offline; mais um teste **«macaco»** (6000 toques e teclas aleatórios sem um único erro na página) e a verificação «sem botões mortos» |
| `test/manual.test.js` | analisa `docs/MANUAL.md`: os exemplos `` `expr` → **resultado** `` são calculados pelo motor, os exemplos «prima …» são executados na página real, os exemplos `rad:` e `units:` usam o seu modo; verifica também que todas as funções do motor e todos os botões da interface são mencionados e que o manual só refere ficheiros e comandos existentes |

Consequência: se o comportamento de uma função mudar, falha um teste unitário ou o teste do manual — código, manual e testes não podem divergir. A CI (`.github/workflows/test.yml`) executa `npm install && npm test` no Node 22 em cada push e pull request.

### Como adicionar uma função

1. Acrescente uma entrada a `FUNCTIONS` em `js/calc-engine.js` (e, se precisar de botão, uma posição em `PAGES` em `js/app.js`).
2. Acrescente testes unitários em `test/engine.test.js`.
3. Descreva-a em `docs/MANUAL.md` com um exemplo executável `` `f(2)` → **4** ``; enquanto nem todas as funções estiverem documentadas, `test/manual.test.js` falhará.

## 6. `variants/`

Páginas autónomas anteriores (`calculatorEF.html` é a base da versão atual, `calculator-manual.html` o antigo manual). Não fazem parte dos testes.
