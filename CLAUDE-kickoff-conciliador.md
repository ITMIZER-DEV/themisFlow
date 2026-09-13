# CLAUDE-kickoff-conciliador.md
## ITMIZER Conciliador Bancário — Banco (OFX) × Sistema (ERP)

> Kickoff para Claude Code. Leia este documento inteiro antes de escrever qualquer código.
> O núcleo de negócio JÁ EXISTE, está em `reference/core/` e é coberto por golden tests.
> A missão da Fase 1 é construir o produto EM VOLTA desse núcleo, não reescrevê-lo.

---

## 1. Visão

Ferramenta de apoio à conciliação bancária para supermercados e SMBs atendidos pela ITMIZER (MSP, Trindade/GO). O operador importa o extrato bancário (.ofx) e o relatório "Extrato de Conciliação Bancária" exportado do ERP (.xls), e a ferramenta:

1. Reconstrói a composição de saldos diários do banco (ancorada no LEDGERBAL);
2. Mostra o extrato do sistema dia a dia, no layout que o operador já conhece;
3. Confronta os dois lados: casa lançamentos por valor+data, expõe **só-no-banco** (falta lançar) e **só-no-sistema** (erro de digitação, duplicidade ou não compensado), e compara os 4 saldos do dia (anterior, débitos, créditos, saldo) com Δ exato;
4. Permite marcação manual de conciliado lançamento a lançamento, com persistência.

O objetivo do operador: dado "o saldo do sistema diverge do banco em R$ X", chegar em minutos à lista exata de lançamentos que explicam X.

### Estado atual (v0 — validado em uso)
`reference/itmizer-conciliacao-comparativo.html` é um HTML único (~680 KB, SheetJS embutido), 100% client-side, com três abas (Banco | Sistema | Comparativo), funcionando. Ele é a **referência funcional e visual** da Fase 1. Tudo que ele faz, a Fase 1 precisa fazer no mínimo igual.

---

## 2. Regras de negócio inegociáveis (aprendidas com arquivos reais)

Estas regras estão implementadas em `reference/core/*.mjs` e travadas por `reference/fixtures/golden.test.mjs`. **`npm run test:golden` deve passar sempre.** Refatorar é permitido; mudar comportamento, não — exceto com novo golden test justificando.

### OFX (`ofx-parser.mjs`)
- **R1. Encoding:** bancos BR exportam cp1252/latin1 declarando `ENCODING:USASCII`/`CHARSET:1252`. Decodificar UTF-8 primeiro; se houver U+FFFD ou declaração 1252, redecodificar como windows-1252.
- **R2. SGML sem fechamento:** OFX 1.x não fecha tags (`<TRNAMT>123,45` e fim). O parser é tokenizador tolerante, nunca um parser XML estrito.
- **R3. Valores:** aceitar `1500.25`, `1500,25`, `1.234,56` e `1,234.56`. Sempre arredondar a 2 casas (`r2`) em TODA aritmética monetária — nunca acumular float cru.
- **R4. Datas:** `DTPOSTED` pode vir `20260601120000[-3:BRT]`; usar só os 8 primeiros dígitos numéricos → ISO `YYYY-MM-DD`.
- **R5. Dedup:** identidade do lançamento = `FITID`; fallback composto `date|amount|memo|name|check`. Importar arquivos sobrepostos não pode duplicar.
- **R6. Sinal:** crédito positivo, débito negativo, em todo o domínio.

### Saldos (`balance-engine.mjs`)
- **R7. Âncora LEDGERBAL:** se `DTASOF >= última transação`, abertura = ledger − Σtodas. Se `DTASOF` intermediário (banco manda saldo do dia da geração, não do fim do período), âncora intermediária: abertura = ledger − Σ(trns ≤ DTASOF).
- **R8. Sem LEDGERBAL:** abertura 0, `anchored=false`, e a UI DEVE deixar claro que os saldos são relativos (variação), não absolutos.
- **R9. Saldo intra-dia:** cada lançamento carrega `run` (saldo corrente após ele). Filtros de UI nunca alteram colunas de saldo — saldo é sempre calculado sobre o universo completo.

### Sistema/XLS (`system-xls-parser.mjs`)
- **R10. Mapeamento por nome de coluna**, nunca por posição (localizar linha com "Descrição"; mapear Conciliado, Saldo Anterior, Débito, Crédito, Saldo Dia, Observação, CPF/CNPJ; ignorar "C/C Débito"/"C/C Crédito").
- **R11. Linha de dia** = Descrição casando `DD/MM/AAAA - <banco...>`, com totais e saldos no próprio registro. Itens pertencem ao último dia aberto.
- **R12. Sinal do sistema:** `value = crédito − débito` (alinha com R6).
- **R13. Integridade:** se Σitens ≠ totais do cabeçalho do dia (>0,01), sinalizar "export parcial" — não silenciar.
- **R14. .xls legado** (CDFV2/BIFF8): ler via SheetJS `XLSX.read(ArrayBuffer)`; aceitar também .xlsx.

### Matching (`match-engine.mjs`)
- **R15.** Casa por valor assinado idêntico; preferir data exata, depois menor distância dentro da tolerância (0–3 dias, default 0).
- **R16. 1:1 estrito** — sem dupla contagem (2 itens iguais no sistema × 1 no banco ⇒ 1 par + 1 só-sistema).
- **R17. Universo restrito:** "só no banco" considera APENAS lançamentos OFX dos dias cobertos pelo arquivo do sistema.
- **R18. Pagamento+estorno** de mesmo valor sem par no banco ⇒ ambos em só-no-sistema (correto, não é bug).

### Conciliação manual
- **R19.** Marcação amarrada ao id do lançamento (FITID), por conta (`bankId·acctId`), persistente; recarregar o mesmo OFX reaplica as marcações. Exportável/importável como JSON.
- **R20.** "Marcar casados como conciliados" aplica os pares do matching sobre a marcação manual.

### Privacidade
- **R21.** Dados bancários e CNPJs de fornecedores NUNCA saem da máquina na Fase 1 (sem telemetria, sem rede). Fixtures de teste são sempre sintéticas — jamais commitar arquivo real de cliente.

---

## 3. Arquitetura e stack

### Fase 1 — SPA local (este repositório)
```
itmizer-conciliador/
├── CLAUDE-kickoff-conciliador.md
├── package.json                  (workspace raiz)
├── packages/core/                ← migrar reference/core p/ TypeScript puro, zero deps de DOM
│   ├── src/{ofx-parser,balance-engine,system-xls-parser,match-engine}.ts
│   └── test/                     (Vitest; portar golden.test.mjs + ampliar)
├── apps/web/                     ← Vite + React 18 + TypeScript
│   ├── src/
│   │   ├── stores/               (Zustand: contas, sistema, matching, conciliação)
│   │   ├── features/
│   │   │   ├── bank/             (aba Banco: dropzone OFX, cards, gráfico, tabela diária)
│   │   │   ├── system/           (aba Sistema: dropzone XLS, visual dia a dia)
│   │   │   └── compare/          (aba Comparativo: confronto de saldos, listas, aplicar)
│   │   ├── lib/persistence.ts    (IndexedDB via idb — substitui localStorage)
│   │   └── lib/csv.ts            (exports ; + BOM, decimal vírgula)
│   └── index.html
└── reference/                    ← NÃO EDITAR; é o contrato
    ├── itmizer-conciliacao-comparativo.html
    ├── core/*.mjs
    └── fixtures/  (banco-teste.ofx, extrato-sistema-sintetico.xls, golden.test.mjs)
```
- **Stack:** Vite + React 18 + TypeScript estrito, Zustand, SheetJS (xlsx 0.18.5), idb, Vitest. Sem Tailwind — CSS próprio seguindo o design system abaixo. Gráfico de saldo em SVG próprio (portar da referência; sem lib de chart).
- **Build de distribuição:** além do `dist/` normal, gerar **single-file** via `vite-plugin-singlefile` — o entregável para cliente continua sendo um HTML único que abre offline (padrão ITMIZER).
- **Persistência F1:** IndexedDB. Stores: `conciliacao` (key `acctKey`, Set de ids), `sessoes` (snapshot opcional de OFX+XLS importados p/ retomar trabalho). Migrar automaticamente marcações do v0 (`localStorage` chave `itmizer-ofx-conc::*`) se existirem.

### Fase 2 — Backend multi-cliente (repo à parte, só desenhar agora)
Fastify 5 + Prisma + PostgreSQL (RLS por tenant, padrão Sentinel). API: importação OFX/XLS, histórico de conciliações por conta/mês, trilha de auditoria de marcações (hash-chained, padrão Olimpo). O `packages/core` é compartilhado sem alteração — por isso ele deve permanecer puro (sem DOM, sem IndexedDB).

### Fase 3 — Conector VR (elimina o XLS)
Leitura read-only direto do PostgreSQL do VRMaster para montar o lado "sistema" sem export manual. Mesma filosofia do Confronto Agent: zero escrita no banco do ERP. Requisito desde já: o tipo `SystemStatement` (dias+itens) é a interface — o conector VR só precisa produzi-lo.

---

## 4. Design system (obrigatório)

- Fundo `#0b1220` / painéis `#152238` / linhas `#233a5c`; acentos: teal `#00c9b1` (crédito/ok), gold `#f0a500` (atenção/saldo), red `#ff5d6c` (débito/divergência); texto `#e8eef7` / muted `#8da2bf`.
- Tipografia: DM Sans (UI), DM Mono (números, datas, valores — SEMPRE), Manrope 800 (títulos).
- Valores monetários em `pt-BR` (`R$ 1.234,56`); débito e crédito SEMPRE em colunas separadas nas tabelas de lançamentos; CSV com `;`, BOM e decimal vírgula (abre no Excel BR sem ajuste).
- Três abas: Banco (OFX) | Sistema (XLS) [badge: nº lançamentos] | Comparativo [badge: ✓ verde se 0 divergências, nº em gold se houver].
- A referência visual é o HTML v0 — pode melhorar, não pode descaracterizar.

---

## 5. Critérios de aceite — Fase 1

1. `npm run test:golden` (referência) e a suíte Vitest do `packages/core` passam; o port TS reproduz byte a byte os resultados dos goldens.
2. Importar `reference/fixtures/banco-teste.ofx` + `extrato-sistema-sintetico.xls` reproduz: abertura 2.000,00; fechamento 2.069,35 (== LEDGERBAL); matching com 3 pares, 1 só-sistema (−50,00), 0 só-banco.
3. OFX duplicado/sobreposto não duplica lançamentos (R5).
4. OFX sem LEDGERBAL exibe aviso de saldo relativo (R8).
5. Marcações de conciliação sobrevivem a fechar/reabrir o app e a reimportar o mesmo OFX (R19); migra marcações do v0 se houver.
6. Exports CSV (lançamentos com conciliado SIM/NÃO; comparativo com CASADO/SO_BANCO/SO_SISTEMA) abrem corretos no Excel BR.
7. Build single-file < 2 MB, funciona offline com duplo clique.
8. XLS com layout inesperado falha com mensagem clara (qual coluna faltou), nunca silenciosamente.

## 6. Backlog pós-F1 (não fazer agora)
- Matching N:1 (agrupamento: vários recebimentos de cartão do sistema ↔ um crédito líquido no banco) — maior causa de "só no sistema" legítimo em supermercado.
- Sugestões por similaridade de histórico/CNPJ quando valor diverge por centavos (juros/multa em boleto).
- Multi-conta no comparativo (hoje: conta selecionada).
- Relatório PDF de fechamento mensal da conciliação.

## 7. Primeiros comandos sugeridos
```bash
npm run test:golden                 # confirmar baseline antes de tudo
# scaffolding: workspaces (packages/core, apps/web) com Vite + Vitest
# 1º PR: port de reference/core p/ packages/core em TS + testes verdes
# 2º PR: apps/web aba Banco (paridade com referência)
# 3º PR: abas Sistema e Comparativo + IndexedDB + single-file build
```

---

## 8. Diretrizes de Segurança, Performance e Validação (Backlog/Melhorias)

### Validação de Formulários
*   **MANDATÓRIO:** Todos os formulários (front-end e back-end) devem possuir validação obrigatória usando esquemas do **Zod**. Isso garante consistência de dados, prevenção de erros e segurança contra entradas inválidas antes de enviar dados para a API/banco.

### Performance e Escalabilidade
*   **Code Splitting (Front-end):** Implementar carregamento dinâmico (`React.lazy` / dynamic imports) nas abas e modais pesados para reduzir o tamanho dos chunks iniciais de JS e otimizar o tempo de carregamento da aplicação.
*   **Otimização de Consultas / Paginação (Back-end):** Ao lidar com transações volumosas, garantir paginação obrigatória na API de transações e a presença de índices Postgres correspondentes no `schema.prisma`.
*   **Caching local:** Otimizar o carregamento usando a persistência local (IndexedDB) para evitar leituras repetidas do banco quando não houver alterações.
