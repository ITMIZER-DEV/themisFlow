-- CreateTable
CREATE TABLE "AdquirenteLote" (
    "id" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "dataInicio" DATE NOT NULL,
    "dataFim" DATE NOT NULL,
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importadoPor" TEXT,
    "adicionadas" INTEGER NOT NULL DEFAULT 0,
    "ignoradas" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdquirenteLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdquirenteVenda" (
    "idempotencyKey" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "ec" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "bandeira" TEXT NOT NULL,
    "bandeiraBruta" TEXT NOT NULL,
    "modalidade" TEXT NOT NULL,
    "formaPagamento" TEXT NOT NULL,
    "dataHoraVenda" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    "dataPrimeiroPgto" DATE,
    "cartaoMascarado" TEXT NOT NULL,
    "autorizacao" TEXT NOT NULL,
    "nsu" TEXT NOT NULL,
    "terminal" TEXT NOT NULL,
    "meioCaptura" TEXT NOT NULL,
    "valorBruto" DECIMAL(15,2) NOT NULL,
    "valorTaxa" DECIMAL(15,2) NOT NULL,
    "valorLiquido" DECIMAL(15,2) NOT NULL,
    "sitefKey" TEXT,
    "statusConc" TEXT NOT NULL DEFAULT 'PENDENTE',

    CONSTRAINT "AdquirenteVenda_pkey" PRIMARY KEY ("idempotencyKey")
);

-- CreateTable
CREATE TABLE "AdquirenteRecebivel" (
    "idempotencyKey" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "ec" TEXT NOT NULL,
    "ecCentralizador" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "dataVencimento" DATE NOT NULL,
    "bandeira" TEXT NOT NULL,
    "modalidade" TEXT NOT NULL,
    "tipoLancamento" TEXT NOT NULL,
    "lancamento" TEXT NOT NULL,
    "valorLiquido" DECIMAL(15,2) NOT NULL,
    "valorLiquidado" DECIMAL(15,2) NOT NULL,
    "cartaoMascarado" TEXT,
    "autorizacao" TEXT,
    "nsu" TEXT,
    "terminal" TEXT,
    "dataVenda" DATE,
    "horaVenda" TEXT,
    "statusConc" TEXT NOT NULL DEFAULT 'PENDENTE',

    CONSTRAINT "AdquirenteRecebivel_pkey" PRIMARY KEY ("idempotencyKey")
);

-- CreateIndex
CREATE INDEX "AdquirenteLote_gateway_tipo_idx" ON "AdquirenteLote"("gateway", "tipo");

-- CreateIndex
CREATE INDEX "AdquirenteLote_dataInicio_dataFim_idx" ON "AdquirenteLote"("dataInicio", "dataFim");

-- CreateIndex
CREATE INDEX "AdquirenteVenda_loteId_idx" ON "AdquirenteVenda"("loteId");

-- CreateIndex
CREATE INDEX "AdquirenteVenda_dataHoraVenda_idx" ON "AdquirenteVenda"("dataHoraVenda");

-- CreateIndex
CREATE INDEX "AdquirenteVenda_gateway_bandeira_modalidade_idx" ON "AdquirenteVenda"("gateway", "bandeira", "modalidade");

-- CreateIndex
CREATE INDEX "AdquirenteVenda_nsu_idx" ON "AdquirenteVenda"("nsu");

-- CreateIndex
CREATE INDEX "AdquirenteVenda_statusConc_idx" ON "AdquirenteVenda"("statusConc");

-- CreateIndex
CREATE UNIQUE INDEX "AdquirenteVenda_gateway_ec_nsu_key" ON "AdquirenteVenda"("gateway", "ec", "nsu");

-- CreateIndex
CREATE INDEX "AdquirenteRecebivel_loteId_idx" ON "AdquirenteRecebivel"("loteId");

-- CreateIndex
CREATE INDEX "AdquirenteRecebivel_dataVencimento_idx" ON "AdquirenteRecebivel"("dataVencimento");

-- CreateIndex
CREATE INDEX "AdquirenteRecebivel_nsu_idx" ON "AdquirenteRecebivel"("nsu");

-- CreateIndex
CREATE INDEX "AdquirenteRecebivel_gateway_bandeira_modalidade_idx" ON "AdquirenteRecebivel"("gateway", "bandeira", "modalidade");

-- CreateIndex
CREATE INDEX "AdquirenteRecebivel_tipoLancamento_idx" ON "AdquirenteRecebivel"("tipoLancamento");

-- AddForeignKey
ALTER TABLE "AdquirenteLote" ADD CONSTRAINT "AdquirenteLote_importadoPor_fkey" FOREIGN KEY ("importadoPor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdquirenteVenda" ADD CONSTRAINT "AdquirenteVenda_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "AdquirenteLote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdquirenteRecebivel" ADD CONSTRAINT "AdquirenteRecebivel_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "AdquirenteLote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "TaxaItem_tipo_bandeira_idx" RENAME TO "TaxaItem_tipoPagamento_bandeira_idx";

-- RenameIndex
ALTER INDEX "TaxaItem_unique_combinacao" RENAME TO "TaxaItem_contratoId_tipoPagamento_bandeira_modalidade_parce_key";
