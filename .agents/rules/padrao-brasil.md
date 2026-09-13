# Regra Permanente: Padrão Brasil (pt-BR) e Fuso Horário GMT-3

1. **Datas e Horas:**
   - Todas as datas exibidas ao usuário DEVEM estar no padrão brasileiro: `DD/MM/AAAA`.
   - Todas as horas DEVEM estar no padrão de 24h: `HH:mm:ss` ou `HH:mm`.
   - NUNCA exiba datas ISO no frontend (ex: `2026-09-11` ou `2026-09-11T00:00:00Z`). Sempre use `fmtDate(...)` ou `fmtDateTime(...)` de `lib/date.ts`.
   - O fuso horário de referência é estritamente **GMT-3 (America/Sao_Paulo)**.
   - Para evitar o bug do "desvio de 1 dia" por causa de UTC midnight, nunca faça `new Date("YYYY-MM-DD")` sem considerar o offset local. Use `fmtDate` que extrai os componentes de dia/mês/ano de forma imune a fusos.

2. **Moeda e Números:**
   - Moeda: sempre `R$ X.XXX,XX` (`pt-BR`).
   - Porcentagens: sempre `X,XX%` com vírgula como separador decimal.
   - Milhar: sempre ponto (`1.000`).

3. **Arquivos CSV:**
   - Separador: ponto e vírgula (`;`).
   - Encoding: UTF-8 com BOM (`\uFEFF`).
   - Decimais: vírgula.
   - Datas: `DD/MM/AAAA`.
