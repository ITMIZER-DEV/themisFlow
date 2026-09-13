-- CreateTable
CREATE TABLE "SitefLote" (
    "id"           TEXT        NOT NULL,
    "arquivo"      TEXT        NOT NULL,
    "importadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importadoPor" TEXT,
    "adicionadas"  INTEGER     NOT NULL DEFAULT 0,
    "ignoradas"    INTEGER     NOT NULL DEFAULT 0,

    CONSTRAINT "SitefLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitefTransacao" (
    "idempotencyKey"     TEXT           NOT NULL,
    "loteId"             TEXT           NOT NULL,
    "dataTrans"          TEXT           NOT NULL,
    "dataDia"            TEXT           NOT NULL,
    "dataFiscal"         TEXT           NOT NULL,
    "codigoLoja"         TEXT           NOT NULL,
    "cartao"             TEXT           NOT NULL,
    "pdv"                TEXT           NOT NULL,
    "nsu"                TEXT           NOT NULL,
    "nsuHost"            TEXT           NOT NULL,
    "valor"              DECIMAL(15,2)  NOT NULL,
    "valorSaque"         DECIMAL(15,2)  NOT NULL,
    "rede"               TEXT           NOT NULL,
    "tipoProduto"        TEXT           NOT NULL,
    "tipoProdutoRaw"     TEXT           NOT NULL,
    "autorizacao"        TEXT           NOT NULL,
    "estabelecimento"    TEXT           NOT NULL,
    "modoEntrada"        TEXT           NOT NULL,
    "produto"            TEXT           NOT NULL,
    "descricaoTransacao" TEXT           NOT NULL,
    "nrParcelas"         INTEGER        NOT NULL DEFAULT 1,
    "estadoTransacao"    TEXT           NOT NULL,
    "estadoTransacaoRaw" TEXT           NOT NULL,
    "operador"           TEXT           NOT NULL,
    "terminalLogico"     TEXT           NOT NULL,
    "codSitef"           TEXT           NOT NULL,
    "cupomFiscal"        TEXT           NOT NULL,

    CONSTRAINT "SitefTransacao_pkey" PRIMARY KEY ("idempotencyKey")
);

-- CreateIndex
CREATE INDEX "SitefTransacao_dataDia_idx"         ON "SitefTransacao"("dataDia");
CREATE INDEX "SitefTransacao_estadoTransacao_idx"  ON "SitefTransacao"("estadoTransacao");
CREATE INDEX "SitefTransacao_codigoLoja_idx"       ON "SitefTransacao"("codigoLoja");
CREATE INDEX "SitefTransacao_loteId_idx"           ON "SitefTransacao"("loteId");

-- AddForeignKey
ALTER TABLE "SitefLote" ADD CONSTRAINT "SitefLote_importadoPor_fkey"
    FOREIGN KEY ("importadoPor") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitefTransacao" ADD CONSTRAINT "SitefTransacao_loteId_fkey"
    FOREIGN KEY ("loteId") REFERENCES "SitefLote"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
