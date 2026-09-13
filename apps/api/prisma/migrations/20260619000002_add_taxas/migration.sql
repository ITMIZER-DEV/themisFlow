-- CreateTable: contratos de adquirente (Cielo, Rede, GetNet, Stone, etc.)
CREATE TABLE "TaxaContrato" (
    "id"           TEXT        NOT NULL,
    "nome"         TEXT        NOT NULL,
    "rede"         TEXT        NOT NULL,
    "dataInicio"   DATE        NOT NULL,
    "dataFim"      DATE,
    "ativo"        BOOLEAN     NOT NULL DEFAULT true,
    "observacoes"  TEXT,
    "criadoPor"    TEXT,
    "criadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxaContrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable: tabela MDR por tipo/bandeira/modalidade/parcelas
CREATE TABLE "TaxaItem" (
    "id"               TEXT           NOT NULL,
    "contratoId"       TEXT           NOT NULL,
    "tipoPagamento"    TEXT           NOT NULL,
    "bandeira"         TEXT           NOT NULL,
    "modalidade"       TEXT           NOT NULL,
    "parcelaMin"       INTEGER        NOT NULL DEFAULT 1,
    "parcelaMax"       INTEGER        NOT NULL DEFAULT 1,
    "taxaMdr"          DECIMAL(8,4)   NOT NULL,
    "taxaAntecipacao"  DECIMAL(8,4)   NOT NULL DEFAULT 0,
    "prazoRecebimento" INTEGER        NOT NULL DEFAULT 30,
    "taxaFixa"         DECIMAL(10,2)  NOT NULL DEFAULT 0,

    CONSTRAINT "TaxaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: aluguel de terminais POS / Pinpad
CREATE TABLE "TaxaAluguel" (
    "id"            TEXT          NOT NULL,
    "contratoId"    TEXT          NOT NULL,
    "descricao"     TEXT          NOT NULL,
    "qtdTerminais"  INTEGER       NOT NULL DEFAULT 1,
    "valorUnitario" DECIMAL(10,2) NOT NULL,
    "ativo"         BOOLEAN       NOT NULL DEFAULT true,

    CONSTRAINT "TaxaAluguel_pkey" PRIMARY KEY ("id")
);

-- CreateTable: outros encargos (PCI, chargeback, gateway, etc.)
CREATE TABLE "TaxaEncargo" (
    "id"          TEXT          NOT NULL,
    "contratoId"  TEXT          NOT NULL,
    "descricao"   TEXT          NOT NULL,
    "tipo"        TEXT          NOT NULL,
    "valor"       DECIMAL(10,4) NOT NULL,
    "ativo"       BOOLEAN       NOT NULL DEFAULT true,

    CONSTRAINT "TaxaEncargo_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "TaxaContrato_rede_idx"   ON "TaxaContrato"("rede");
CREATE INDEX "TaxaContrato_ativo_idx"  ON "TaxaContrato"("ativo");
CREATE INDEX "TaxaItem_contratoId_idx" ON "TaxaItem"("contratoId");
CREATE INDEX "TaxaItem_tipo_bandeira_idx" ON "TaxaItem"("tipoPagamento", "bandeira");
CREATE INDEX "TaxaAluguel_contratoId_idx" ON "TaxaAluguel"("contratoId");
CREATE INDEX "TaxaEncargo_contratoId_idx" ON "TaxaEncargo"("contratoId");

-- Unique: um único MDR por combinação exata de tipo+bandeira+modalidade+parcelas
CREATE UNIQUE INDEX "TaxaItem_unique_combinacao"
    ON "TaxaItem"("contratoId", "tipoPagamento", "bandeira", "modalidade", "parcelaMin", "parcelaMax");

-- Foreign keys
ALTER TABLE "TaxaContrato" ADD CONSTRAINT "TaxaContrato_criadoPor_fkey"
    FOREIGN KEY ("criadoPor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaxaItem" ADD CONSTRAINT "TaxaItem_contratoId_fkey"
    FOREIGN KEY ("contratoId") REFERENCES "TaxaContrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaxaAluguel" ADD CONSTRAINT "TaxaAluguel_contratoId_fkey"
    FOREIGN KEY ("contratoId") REFERENCES "TaxaContrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaxaEncargo" ADD CONSTRAINT "TaxaEncargo_contratoId_fkey"
    FOREIGN KEY ("contratoId") REFERENCES "TaxaContrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
