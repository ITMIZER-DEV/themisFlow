-- CreateTable
CREATE TABLE "OfxPadrao" (
    "id" SERIAL NOT NULL,
    "texto" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "bandeira" TEXT,
    "banco" TEXT,
    "prioridade" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfxPadrao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfxPadrao_tipo_idx" ON "OfxPadrao"("tipo");

-- CreateIndex
CREATE INDEX "OfxPadrao_ativo_prioridade_idx" ON "OfxPadrao"("ativo", "prioridade");

-- CreateIndex
CREATE UNIQUE INDEX "OfxPadrao_texto_banco_key" ON "OfxPadrao"("texto", "banco");
