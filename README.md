# JSON Tools

Ferramentas para manipulação de JSON no dia a dia — um app web que roda **100% no navegador**. Nenhum dado sai da sua máquina: entradas, preferências e histórico ficam no `localStorage` e sobrevivem a reloads.

## Ferramentas

| Ferramenta | O que faz |
| --- | --- |
| **Formatar & Validar** | Formata (2/4 espaços ou tab), minifica, ordena chaves, valida com linha/coluna do erro, estatísticas (tamanho, nós, profundidade), abrir/baixar arquivo |
| **Árvore** | Navegação em árvore com expandir/recolher, busca com destaque, cópia de caminho (JSONPath) e de valores |
| **Escape / Unescape** | Escapa/desescapa strings JSON, converte JSON ↔ string escapada (para embutir JSON dentro de JSON) |
| **JSONPath** | Testa expressões JSONPath (via [jsonpath-plus](https://github.com/JSONPath-Plus/JSONPath)) com resultados, caminhos, exemplos e histórico de consultas |
| **Jolt** | Aplica specs [Jolt](https://github.com/bazaarvoice/jolt) com **histórico de execuções persistente** (restaurar/copiar/remover), ajuda embutida e `Ctrl+Enter` para executar |
| **Comparar** | Diff estrutural entre dois JSONs (adicionado/removido/alterado, por caminho) |

Editores com syntax highlighting, dobra de código (folding) e realce de erros via CodeMirror 6. Tema escuro/claro persistente. Cada ferramenta tem URL própria (`#/format`, `#/tree`, `#/escape`, `#/jsonpath`, `#/jolt`, `#/diff`).

## Motor Jolt

Como não existe implementação JavaScript mantida do Jolt, este projeto inclui um motor próprio em TypeScript (`src/lib/jolt/`), compatível com as operações e sintaxes mais usadas:

- **shift** — chaves literais, `a|b`, `*`, padrões `foo*`, `&`/`&(n)`/`&(n,k)` (LHS e RHS), `$`/`$(n,k)`, `#literal`, `@`/`@(n,caminho)`; no destino `[]`, `[&n]`, `[#n]`, índices fixos e múltiplos destinos
- **default**, **remove**, **sort**, **cardinality**
- **modify-overwrite-beta** / **modify-default-beta** — `=toString`, `=toInteger`, `=toDouble`, `=toBoolean`, `=toUpperCase`, `=toLowerCase`, `=trim`, `=concat`, `=join`, `=split`, `=substring`, `=size`, `=firstElement`, `=lastElement`, `=elementAt`, `=min`, `=max`, `=abs`, `=avg`, `=sum`, `=intSum`, `=doubleSum`, `=divide`, `=sort`, `=squashNulls`, além de referências `@(n,caminho)` e listas de fallback

Casos de canto muito avançados do Jolt original (Java) podem divergir; o motor cobre os usos comuns de transformação e é validado por testes (`npm test`).

## Desenvolvimento

```bash
npm install
npm run dev       # servidor de desenvolvimento
npm test          # testes do motor Jolt (vitest)
npm run build     # build de produção em dist/
npm run preview   # serve o build
```

Stack: Vite + React + TypeScript, CodeMirror 6, jsonpath-plus. O build gera arquivos estáticos — pode ser hospedado em qualquer hosting estático (GitHub Pages, Netlify etc.), sem backend.
