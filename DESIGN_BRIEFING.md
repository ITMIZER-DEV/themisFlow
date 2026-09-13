# Briefing — ThemisFlow: Layout & System Design

**Destino:** Claude Design  
**Data:** 2026-07-05  
**Solicitante:** ITMIZER (leonardo.alves@itmizer.com.br)

---

## 1. O que é o ThemisFlow

ThemisFlow é uma **ferramenta de conciliação bancária on-premise** desenvolvida pela ITMIZER para supermercados e PMEs. O sistema cruza dados de três fontes distintas — adquirente Getnet, frente de caixa SITEF e extratos bancários — para detectar divergências financeiras campo a campo antes do fechamento.

**Dado crítico de negócio:** os dados NUNCA saem da máquina do cliente. O sistema roda 100% local (sem cloud, sem SaaS).

---

## 2. Stack técnica (não alterar)

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Vite 8 + React 19 + TypeScript + Zustand 5 |
| Build | `vite-plugin-singlefile` — entregável é um **HTML único offline** |
| Backend | Fastify + Prisma + PostgreSQL |
| Estilos | **CSS próprio** — sem Tailwind, sem component libs externas |

---

## 3. Design System obrigatório (inegociável)

O design system já foi validado com clientes reais. O layout pode evoluir, mas **não deve descaracterizar a identidade visual**.

### Paleta

| Token | Hex | Uso |
|-------|-----|-----|
| `bg-base` | `#0b1220` | Fundo da aplicação |
| `bg-panel` | `#152238` | Cards, painéis, tabelas |
| `bg-line` | `#233a5c` | Separadores, bordas, linhas de tabela |
| `accent-teal` | `#00c9b1` | Crédito, OK, conciliado |
| `accent-gold` | `#f0a500` | Atenção, saldo, pendente |
| `accent-red` | `#ff5d6c` | Débito, divergência, erro |
| `text-primary` | `#e8eef7` | Texto principal |
| `text-muted` | `#8da2bf` | Labels, placeholders, info secundária |

### Tipografia

| Fonte | Peso | Uso |
|-------|------|-----|
| **Manrope** | 800 | Títulos de seção, KPIs grandes |
| **DM Sans** | 400/500 | UI geral, labels, botões |
| **DM Mono** | 400 | Números, datas, valores monetários, NSU |

### Formatação de valores

- Moeda: `pt-BR` — `R$ 1.234,56`
- Datas: `DD/MM/YYYY`
- Códigos (NSU, autorização): fonte mono, sem formatação extra

---

## 4. Módulos e fluxos existentes

### 4.1 Módulo Adquirente (Getnet)

**Função:** Importa e exibe vendas e recebíveis da adquirente Getnet via upload de planilhas `.xlsx`.

**Tabs internas:**
- **Vendas** — listagem com filtros (data, terminal, valor, status conciliação)
- **Recebíveis** — previsão de recebimento parcelado por data de vencimento
- **Rastreio** — painel analítico triplo (ver 4.3)
- **KPIs** — totalizadores de valor bruto, líquido e taxas

**Ações disponíveis:**
- Upload de arquivo `.xlsx` (drag & drop)
- Conciliar lote
- Excluir lote importado

### 4.2 Módulo SITEF

**Função:** Importa transações do frente de caixa SITEF e permite busca filtrada.

**Filtros:**
- Período (data início / data fim)
- NSU Host, Autorização
- Estado da transação, Código de loja, Lote

**UX atual:** Draft state local → botão "Buscar" aplica todos os filtros simultaneamente. Enter nos inputs de texto também dispara a busca.

### 4.3 Rastreio Analítico Triplo ⭐ (feature principal)

**Função:** Cruza Venda × SITEF × Recebível e detecta divergências campo a campo.

**Status possíveis por transação:**

| Status | Badge | Significado |
|--------|-------|-------------|
| `TRIPLO_OK` | teal | Tudo conciliado nos 3 sistemas |
| `SEM_RECEBIVEL` | gold | Tem SITEF mas recebível ainda não chegou |
| `SEM_SITEF` | muted | Operação POS offline — não é erro |
| `PENDENTE` | gold | Sem SITEF e sem recebível |
| `DIVERGENTE` | red | Algum campo diverge entre sistemas |

**Divergências por campo detectadas:**
- `VALOR_VENDA_SITEF` — bruto Getnet ≠ valor SITEF (tolerância R$0,05)
- `AUTORIZACAO_MISMATCH` — autorização difere
- `TERMINAL_MISMATCH` — terminal diverge
- `NSU_MISMATCH` — NSU não bate
- `REC_SOMA_MISMATCH` — soma dos recebíveis ≠ valor líquido da venda
- `REC_PARCELAS_MISMATCH` — quantidade de parcelas diverge

**UX de rastreio:** Linha expansível — ao clicar em uma transação, expande um painel detalhado com os três registros lado a lado e os campos divergentes destacados.

### 4.4 Taxas / Contratos

**Função:** Cadastro de contratos de taxa por adquirente/produto (MDR, antecipação, etc.) para cálculo de taxas esperadas vs praticadas.

---

## 5. Navegação e estrutura global

**Sidebar lateral** com menu hierárquico (admin pode configurar itens via painel de administração).

**Seções atuais:**
1. Dashboard (a definir — fase futura)
2. Adquirente (Getnet)
3. SITEF
4. Taxas / Contratos
5. Admin (Usuários, Papéis, Menu)

**Auth:** Login/logout com refresh token. Rotas protegidas por papel.

---

## 6. Personas e contexto de uso

- **Analista de conciliação** — usa diariamente, precisa de densidade informacional alta, não de simplicidade. Prefere tabelas densas a cards espaçosos.
- **Gerente financeiro** — visualiza KPIs e relatórios, menos familiarizado com os dados brutos.
- **Ambiente:** desktop/laptop em supermercado, resolução mínima 1366×768, sem uso mobile.

---

## 7. O que precisa ser entregue pelo Design

### 7.1 System Design (arquitetura visual)
- Mapa de telas e fluxos de navegação
- Hierarquia de componentes reutilizáveis (tabela, badge, filtro, painel expansível, KPI card, dropzone)
- Tokens de design formalizados (vars CSS) consistentes com a paleta acima
- Estados dos componentes: default, hover, active, disabled, loading, error

### 7.2 Layouts de tela (prioridade)

1. **Layout base** — shell com sidebar + topbar + área de conteúdo
2. **Tabela com filtros** — padrão reutilizável (SITEF e Adquirente usam o mesmo padrão)
3. **Rastreio Analítico** — a tela mais complexa: lista de transações + painel expandido lateral/inferior com comparação tripla campo a campo
4. **Upload / Gestão de Lotes** — dropzone + lista de lotes importados com status
5. **KPI Cards** — totalizadores numéricos com tendência e status colorido
6. **Login** — tela de autenticação

### 7.3 Componentes críticos

- **Badge de status** — 5 variantes (teal/gold/red/muted/neutral), tamanho compacto para uso em tabela
- **Painel de divergência expandido** — três colunas (Getnet | SITEF | Recebível), campos divergentes em destaque vermelho, campos OK em muted
- **Dropzone de importação** — com estados: idle, drag-over, uploading, success, error
- **Filtro draft** — inputs que só aplicam ao clicar "Buscar", com indicador visual de "filtro aplicado vs rascunho"

---

## 8. Referência visual existente

Existe um arquivo de referência em `reference/itmizer-conciliacao-comparativo.html` com a identidade visual base. O design pode **melhorar e evoluir**, mas não deve descaracterizar a linguagem visual dark/teal da ITMIZER.

---

## 9. Restrições e não-negociáveis

- Dark theme exclusivo (não há light mode)
- CSS custom properties (sem Tailwind, sem CSS-in-JS)
- Densidade informacional alta — analistas financeiros preferem ver mais dados por tela
- Responsividade não é prioridade (uso desktop apenas)
- Sem animações complexas — performance é prioridade (tabelas com centenas de linhas)
- Acessibilidade: contraste mínimo WCAG AA para texto primário

---

## 10. Fases futuras (para contexto, não escopo agora)

- **Fluxo 3 Adquirente:** Recebíveis × Extrato OFX banco
- **Fase 3:** Conector VR (PostgreSQL VRMaster, read-only)
- **Dashboard** global com resumo de todos os módulos
