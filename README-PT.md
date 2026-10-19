# Calck — uma calculadora numa única página

[English](README.md) · **Português** · [Українська](README-UK.md) · [Русский](README-RU.md) · [Français](README-FR.md) · [Deutsch](README-DE.md)

Calculadora científica, conversor de unidades e de moedas num único `index.html`. **Sem bibliotecas nem fontes externas** (a internet só é necessária para as taxas de câmbio), tema claro e escuro, confortável no telemóvel.

- **Científica**: trigonometria (Deg/Rad), funções hiperbólicas, logaritmos, potências, percentagens, fatorial, matrizes (`det`, `inv`, `transpose`, …), estatística, MDC/MMC, combinatória, arredondamento; histórico, `Ans`, teclado.
- **Simples**: botões grandes.
- **Unidades**: 12 categorias, incluindo astronómicas e antigas medidas russas.
- **Moedas**: 12 moedas, conversão nos dois sentidos, gráfico da taxa, modo offline.

## Execução

Abra `index.html` no navegador, ou execute `npm start` e aceda a http://localhost:8080.

**Experimente online** (sem instalar): [abrir a variante calculatorEF](https://htmlpreview.github.io/?https://github.com/Michael-VT/web-calculator-suite/blob/main/variants/calculatorEF.html) — a variante anterior da qual a versão atual evoluiu; carrega o math.js de uma CDN, por isso precisa de internet.

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/ARCHITECTURE-PT.md](docs/ARCHITECTURE-PT.md) | responsabilidade de cada ficheiro, como funcionam as funções, como tudo é verificado e testado |
| [docs/MANUAL.md](docs/MANUAL.md) | manual do utilizador: cada botão e função com exemplos reproduzíveis à mão (apenas em russo) |

O documento de arquitetura existe em todos os idiomas deste README: `docs/ARCHITECTURE.md` (inglês), `-UK.md`, `-RU.md`, `-FR.md`, `-DE.md`.
Os exemplos de `docs/MANUAL.md` são executados pelos testes, por isso o manual corresponde sempre ao programa.

## Testes

```
npm install
npm test
```

| Ficheiro | O que verifica |
|---|---|
| `test/engine.test.js` | o motor de expressões: aritmética, funções, matrizes, erros, formatação, fuzzing (60 000 expressões aleatórias: apenas um resultado ou um `CalcError` claro) |
| `test/converters.test.js` | todos os pares de unidades (reversibilidade), temperatura, taxas, datas e cache do gráfico, falhas de rede |
| `test/ui.test.js` | a página real no jsdom: cada botão e conjunto Fn/Inv, teclado, ajuda, unidades, moedas (online/offline), teste «macaco» — 6000 toques aleatórios sem erros |
| `test/manual.test.js` | executa todos os exemplos de `docs/MANUAL.md` e verifica que cada função e botão está descrito |

Os testes correm a cada push através do GitHub Actions (`.github/workflows/test.yml`, Node 22).

## Estrutura

```
index.html            página
css/style.css         estilo (tema claro/escuro)
js/calc-engine.js     análise e cálculo de expressões (sem DOM)
js/converters.js      unidades e moedas (sem DOM)
js/app.js             interface
docs/                 manual e documentos de arquitetura
test/                 testes
variants/             versões anteriores da página (para histórico)
```

## Licença

MIT (ver `package.json`).
