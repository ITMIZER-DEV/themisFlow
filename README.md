# ⚖️ ThemisFlow — Suíte de Conciliação Bancária e de Cartões

<div align="center">

![ThemisFlow Banner](https://img.shields.io/badge/ThemisFlow-ITMIZER-00c9b1?style=for-the-badge&logo=shield)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb?style=for-the-badge&logo=react)](https://reactjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.2-black?style=for-the-badge&logo=fastify)](https://fastify.dev/)
[![DuckDB](https://img.shields.io/badge/DuckDB-In--Memory_Engine-fff000?style=for-the-badge&logo=duckdb)](https://duckdb.org/)
[![Prisma](https://img.shields.io/badge/Prisma-PostgreSQL_16-2D3748?style=for-the-badge&logo=prisma)](https://www.prisma.io/)
[![Docker](https://img.shields.io/badge/Docker-Portainer_Ready-2496ED?style=for-the-badge&logo=docker)](https://www.docker.com/)

**Sistema corporativo de conciliação financeira de alta performance da família ITMIZER.**  
*Auditoria matemática, conciliação bancária (OFX × ERP), adquirentes de cartão (Getnet EDI, Vouchers), TEF (SiTEF) e previsão de fluxo de recebíveis.*

</div>

---

## 📑 Sumário

- [Visão Geral](#-visão-geral)
- [Funcionalidades Principais](#-funcionalidades-principais)
  - [1. Conciliação Bancária (OFX × ERP)](#1-conciliação-bancária-ofx--erp)
  - [2. Conciliação de Cartões e Adquirentes](#2-conciliação-de-cartões-e-adquirentes)
  - [3. Motor de Matching Ultrarrápido com DuckDB](#3-motor-de-matching-ultrarrápido-com-duckdb)
  - [4. Auditoria de Taxas e Contratos (MDR)](#4-auditoria-de-taxas-e-contratos-mdr)
  - [5. Previsão e Calendário de Recebíveis](#5-previsão-e-calendário-de-recebíveis)
  - [6. Integração Automática SFTP](#6-integração-automática-sftp)
  - [7. Módulo TEF (SiTEF)](#7-módulo-tef-sitef)
  - [8. Dashboard Executivo & Analytics](#8-dashboard-executivo--analytics)
  - [9. Administração, Multi-Empresa e RBAC](#9-administração-multi-empresa-e-rbac)
- [Arquitetura do Monorepo](#-arquitetura-do-monorepo)
- [Padrões Brasil (pt-BR)](#-padrões-brasil-pt-br)
- [Como Rodar Localmente](#-como-rodar-localmente)
- [Deploy no Portainer (GitOps)](#-deploy-no-portainer-gitops)
- [Scripts Úteis](#-scripts-úteis)
- [Licença](#-licença)

---

## 🎯 Visão Geral

O **ThemisFlow** foi projetado para resolver a complexidade da auditoria financeira em empresas com alto volume de vendas (varejo, supermercados, franquias e e-commerces). Ele elimina o trabalho manual e divergências financeiras através do cruzamento automatizado entre:
1. **Extratos Bancários:** Contas correntes via arquivos OFX com saldo âncora centavo a centavo.
2. **Sistemas de Gestão (ERPs):** Exportações sintéticas e analíticas de fechamento diário (VRSoftware e similares).
3. **Adquirentes e Gateways:** Arquivos EDI oficiais (Getnet V10.3) e planilhas de vouchers (Alelo, Sodexo/Pluxee, Ticket, VR).
4. **Captura no Ponto de Venda:** Relatórios de TEF (SiTEF / Software Express).

---

## ⚡ Funcionalidades Principais

### 1. Conciliação Bancária (OFX × ERP)
- **Leitura Robusta de OFX:** Parser nativo compatível com SGML e XML de qualquer banco brasileiro (mesmo sem tags de fechamento).
- **Âncora de Saldo (`LEDGERBAL`):** Reconstrói os saldos diários de forma estrita, garantindo que o saldo final bata com a conta bancária centavo a centavo.
- **Motor de Match em 3 Estados:**
  - `CONCILIADO`: Casamento perfeito de data, valor e natureza (débito/crédito).
  - `SÓ BANCO`: Lançamentos que caíram na conta corrente, mas não constam no ERP.
  - `SÓ SISTEMA`: Vendas ou pagamentos registrados no sistema sem reflexo bancário.
- **Regras de De-Para e Padrões de OFX:** Motor com expressões regulares e tags para categorizar automaticamente tarifas, PIX e repasses.

### 2. Conciliação de Cartões e Adquirentes
- **Suporte Oficial Getnet EDI V10.3:**
  - Leitura posicional de arquivos de 400 bytes (`Registro 0: Header`, `Registro 1: RV - Resumo de Vendas`, `Registro 2: CV - Comprovante de Venda`, `Registro 3: UR - Unidades de Recebíveis`, `Registro 9: Trailer`).
  - Auditoria matemática interna: verificação se $\sum \text{CV} == \text{RV}$ e se os descontos de taxa batem com o líquido.
- **Vouchers e Alimentação/Refeição:**
  - Parsers dedicados para **Alelo**, **Sodexo / Pluxee**, **Ticket** e **VR Benefícios**.
- **Tripla Conciliação (Venda × TEF × Recebível):**
  - Identifica transações passadas no PDV que não foram pagas pela credenciadora.
  - Alerta cancelamentos, chargebacks e divergências de parcelamento.

### 3. Motor de Matching Ultrarrápido com DuckDB
- Integração profunda com `@duckdb/node-api` rodando em memória no backend.
- Processa lotes de **5.000+ transações em menos de 500 ms**.
- **Cascata Inteligente de Match:**
  - `L1 (Prioridade Máxima)`: Match exato por **NSU + Número de Terminal**.
  - `L2`: Match por **NSU + Código de Autorização**.
  - `L3`: Match por **Autorização + Terminal**.
  - `L4`: Match por **Código de Autorização**.
- Tolerância configurável de centavos para arredondamentos fiscais.

### 4. Auditoria de Taxas e Contratos (MDR)
- Cadastro de contratos com taxas acordadas por operadora, bandeira (Visa, Mastercard, Elo, etc.) e modalidade (Débito, Crédito à Vista, Parcelado de 2 a 12x).
- Comparação automática entre a taxa contratada vs a taxa efetivamente descontada pela credenciadora.
- Apontamento de cobranças indevidas de MDR ou taxas de antecipação não acordadas.

### 5. Previsão e Calendário de Recebíveis
- Calendário financeiro de liquidações futuras agrupado por dia, adquirente e bandeira.
- Projeção de fluxo de caixa baseada na data de liquidação prevista nos recebíveis.
- Filtros rápidos por mês, adquirente e modalidade.

### 6. Integração Automática SFTP
- Sincronizador agendado via Croner integrado ao Fastify.
- Compatibilidade com caixas postais IBM Sterling / Mailbox Getnet.
- Download automático, salvamento seguro e processamento em lote em horários programáveis.
- Logs completos de auditoria de cada execução com registro de latência e arquivos baixados.

### 7. Módulo TEF (SiTEF)
- Importação analítica de arquivos de transações SiTEF (`.xlsx`, `.csv`).
- Rastreio de NSU Host, NSU Local, Terminal Lógico e Bandeira TEF.
- Cruzamento direto com as vendas reportadas pela adquirente.

### 8. Dashboard Executivo & Analytics
- Visão unificada com cards de KPIs: Total Bruto, Total Taxas, Total Líquido, Acurácia e Divergências.
- Gráficos de evolução temporal e distribuição por adquirente/bandeira.
- **Modais de Análise com Drilldown:** Consulta linha a linha das transações do lote com pesquisa instantânea.
- **Exportação CSV Excel:** Arquivos gerados com BOM UTF-8 e separador `;` para abertura direta no Excel sem erros de acentuação.

### 9. Administração, Multi-Empresa e RBAC
- Suporte a múltiplas filiais/empresas com CNPJ, endereço e configurações independentes.
- Controle de acesso baseado em papéis (`ADMIN`, `GESTOR`, `OPERADOR`).
- Menus dinâmicos parametrizáveis por função de usuário.
- Sessões protegidas com tokens JWT e cookies seguros.

---

## 🏗️ Arquitetura do Monorepo

O projeto adota a arquitetura de **Monorepo com npm workspaces**:

```
ThemisFlow/
├── packages/
│   └── core/                 # @themisflow/core (TypeScript puro, sem dependências de infra)
│       ├── src/              # Parsers (OFX, XLS, EDI, SiTEF) e Motores de Match
│       └── test/             # Testes unitários com Vitest e Golden Tests
├── apps/
│   ├── api/                  # @themisflow/api (Backend Fastify 5)
│   │   ├── prisma/           # Schema do banco PostgreSQL e migrations
│   │   ├── src/plugins/      # Plugins (Prisma, DuckDB, JWT Auth)
│   │   ├── src/routes/       # Rotas REST da API
│   │   ├── src/services/     # Sincronizador SFTP e serviços de background
│   │   └── Dockerfile        # Container multi-stage Node 20 Alpine
│   └── web/                  # @themisflow/web (Frontend React 18 + Vite)
│       ├── src/features/     # Telas e módulos (Bank, Adquirente, Taxas, etc.)
│       ├── src/stores/       # Gerenciamento de estado global com Zustand
│       ├── src/design/       # Tokens CSS e identidade visual Themis
│       └── Dockerfile        # Container Nginx 1.27 servindo o SPA compilado
├── docker/                   # Configurações Traefik e redes
├── docker-compose.yml        # Stack de produção completa com Traefik e SSL
├── docker-compose.portainer-mvp.yml # Stack simplificada para deploy direto por porta
└── scripts/                  # Scripts de build, empacotamento e inspeção de banco
```

---

## 🇧🇷 Padrões Brasil (pt-BR)

O ThemisFlow segue convenções brasileiras rígidas:
- **Moeda:** Formatação em Real brasileiro (`R$ 1.234,56`), com vírgula para decimais e ponto para milhar.
- **Datas:** Exibição no padrão `DD/MM/AAAA` ou `DD/MM/AAAA HH:mm:ss`.
- **Fuso Horário:** Baseado estritamente em `America/Sao_Paulo` (GMT-3), evitando desvios de UTC na virada do dia.

---

## 💻 Como Rodar Localmente

### Pré-requisitos
- Node.js 20+ LTS
- Docker & Docker Compose
- Git

### 1. Clonar e Instalar Dependências
```bash
git clone https://github.com/ITMIZER-DEV/themisFlow.git
cd themisFlow
npm install
```

### 2. Configurar o Ambiente
Copie o arquivo de exemplo da raiz:
```bash
cp .env.example .env
```

### 3. Subir o Banco PostgreSQL
```bash
docker compose -f docker-compose.db.yml up -d
```

### 4. Executar Migrações e Seed Inicial
```bash
cd apps/api
npx prisma migrate deploy
npx tsx prisma/seed.ts
cd ../..
```

### 5. Iniciar os Serviços em Modo Dev
Em dois terminais separados (ou usando scripts da raiz):
```bash
# Terminal 1: Backend API (Fastify na porta 3001)
npm run dev:api

# Terminal 2: Frontend Web (Vite na porta 5173)
npm run dev:web
```

Acesse no navegador: **http://localhost:5173**  
- **Usuário:** `admin@itmizer.com.br`  
- **Senha:** `Mudar@123`

---

## 🧪 Testes Automatizados

O sistema conta com testes automatizados para garantir que nenhuma regra financeira seja quebrada:

```bash
# Testes unitários do núcleo de conciliação (@themisflow/core)
npm run test

# Golden tests de regressão (validação centavo a centavo do algoritmo)
npm run test:golden

# Testes de integração e benchmarks do DuckDB (@themisflow/api)
npm run test:api

# Build de validação de tipagem do frontend
npm run build
```

---

## 🚢 Deploy no Portainer (GitOps)

O ThemisFlow pode ser implantado no Portainer diretamente a partir deste repositório Git:

1. No Portainer, vá em **Stacks** → **Add stack**.
2. Selecione a opção **Repository** *(ícone do Git)*.
3. Preencha os campos:
   - **Repository URL:** `https://github.com/ITMIZER-DEV/themisFlow.git`
   - **Repository reference:** `refs/heads/main`
   - **Compose path:**
     - Para MVP direto por porta: `docker-compose.portainer-mvp.yml`
     - Para produção com Traefik / HTTPS: `docker-compose.yml`
4. *(Opcional)* Ative **Automatic updates** (Polling ou Webhook) para que novos commits no GitHub atualizem o servidor automaticamente.
5. Clique em **Deploy the stack**.

---

## 📜 Scripts de Suporte

Na pasta [`scripts/`](file:///d:/projects/itmizer-apps/ThemisFlow/scripts):
- `build-mvp.ps1` / `build-mvp.sh`: Compila localmente as imagens Docker do Monorepo.
- `package-deploy-zip.ps1` / `package-deploy-zip.sh`: Gera pacote ZIP limpo pronto para envio a servidores offline.
- `setup-vrsoftware-pdv.sql`: Script de preparação e mapeamento de tabelas para o ERP VRSoftware.

---

<div align="center">
  <sub>Desenvolvido com excelência técnica pela equipe <strong>ITMIZER</strong>.</sub>
</div>
