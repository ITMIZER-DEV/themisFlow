---
name: padrao-brasil
description: >-
  Diretrizes inegociáveis e padrões de formatação brasileiros (pt-BR) para ThemisFlow.
  Abrange formatação de datas (DD/MM/AAAA), horas (HH:mm:ss), timezone GMT-3 (America/Sao_Paulo),
  moeda brasileira (R$ 1.234,56), porcentagens (1,25%) e prevenção contra desvio de fuso horário.
---

# Padrão Brasil (pt-BR) — ThemisFlow

Este documento define os padrões oficiais e inegociáveis de localização brasileira (pt-BR) para todo o ecossistema ThemisFlow (Frontend React, Backend Fastify/Node, PostgreSQL/Prisma e exportações CSV/PDF).

---

## 1. Regras de Ouro de Data e Hora

### 1.1 Formatos Oficiais
| Tipo | Formato Visual | Exemplo |
| :--- | :--- | :--- |
| **Data Simples** | `DD/MM/AAAA` | `11/09/2026` |
| **Data e Hora** | `DD/MM/AAAA HH:mm:ss` ou `DD/MM/AAAA HH:mm` | `11/09/2026 14:35:10` |
| **Data Curta** | `DD/MM` | `11/09` |
| **Competência / Mês** | `Mês / AAAA` ou `MM/AAAA` | `Setembro / 2026` ou `09/2026` |
| **Hora** | `HH:mm:ss` ou `HH:mm` (24h) | `14:35` (nunca 2:35 PM) |

> 🚫 **PROIBIDO:** Exibir datas cruas em formato ISO (`2026-09-11` ou `2026-09-11T00:00:00.000Z`) em telas de usuário, tabelas, cabeçalhos, relatórios ou exports.

---

## 2. Ajuste e Blindagem de Fuso Horário (GMT-3 / America/Sao_Paulo)

### 2.1 A Armadilha do UTC Midnight ("Desvio de 1 Dia")
No ecossistema JavaScript, uma string como `"2026-09-11"` tratada com `new Date("2026-09-11")` é interpretada como UTC meia-noite (`2026-09-11T00:00:00Z`).
No fuso horário de Brasília (**GMT-3**), essa mesma data vira `2026-09-10 21:00:00`, exibindo erroneamente **10/09/2026** (-1 dia)!

### 2.2 Como Prevenir no Frontend
Sempre utilize as funções utilitárias de `@/lib/date`:
```typescript
import { fmtDate, fmtDateTime, fmtCompetencia } from '@/lib/date';

// Correto:
<span>{fmtDate(item.dataVencimento)}</span>       // "11/09/2026"
<span>{fmtDateTime(item.dataHoraVenda)}</span>     // "11/09/2026 14:35:10"
<span>{fmtCompetencia(item.mes)}</span>            // "Setembro / 2026"

// Incorreto (causa erro de fuso horário):
<span>{new Date(item.dataVencimento).toLocaleDateString()}</span>
<span>{item.dataVencimento}</span>
```

### 2.3 Como Prevenir no Backend (Node.js / Fastify)
1. Definir explicitamente o fuso horário da aplicação no boot:
```typescript
process.env.TZ = 'America/Sao_Paulo';
```
2. No banco de dados PostgreSQL e Prisma, campos de data sem hora devem ser mapeados como `@db.Date` e consultados com intervalo local de início e fim do dia:
```typescript
const dataInicio = new Date(`${isoData}T00:00:00`);
const dataFim    = new Date(`${isoData}T23:59:59.999`);
```

---

## 3. Formatação Monetária e Numérica

| Tipo | Padrão | Exemplo |
| :--- | :--- | :--- |
| **Moeda (BRL)** | Prefixo `R$ `, ponto para milhar, vírgula para centavos | `R$ 8.581,31` |
| **Taxas / Percentuais** | Vírgula decimal, sufixo `%`, 2 a 4 casas | `1,25%` ou `0,7705%` |
| **Contadores Inteiros** | Ponto para milhar | `1.450 transações` |

```typescript
// Moeda:
valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Percentual:
pct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + '%';
```

---

## 4. Exportação de Arquivos CSV
Ao gerar arquivos CSV para usuários brasileiros (compatibilidade com Microsoft Excel em português):
1. **BOM UTF-8:** Adicionar prefixo `\uFEFF` para acentuação perfeita.
2. **Separador de Colunas:** Ponto e vírgula (`;`) porque a vírgula é o separador decimal nacional.
3. **Valores Numéricos:** Formatar com vírgula (`8581,31`).
4. **Datas:** `DD/MM/AAAA`.
