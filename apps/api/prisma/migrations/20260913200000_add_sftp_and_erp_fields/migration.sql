-- AlterTable EmpresaConfig
ALTER TABLE "EmpresaConfig" ADD COLUMN IF NOT EXISTS "erpSoftware" TEXT NOT NULL DEFAULT 'VRSOFTWARE';
ALTER TABLE "EmpresaConfig" ADD COLUMN IF NOT EXISTS "erpTipoIntegracao" TEXT NOT NULL DEFAULT 'BANCO';

-- CreateTable SftpConfig
CREATE TABLE IF NOT EXISTS "SftpConfig" (
    "id" TEXT NOT NULL DEFAULT 'getnet',
    "provedor" TEXT NOT NULL DEFAULT 'GETNET',
    "host" TEXT,
    "porta" INTEGER NOT NULL DEFAULT 22,
    "usuario" TEXT,
    "senha" TEXT,
    "pastaRemota" TEXT NOT NULL DEFAULT '/',
    "pastaLocal" TEXT NOT NULL DEFAULT 'storage/sftp/getnet',
    "horarioExecucao" TEXT NOT NULL DEFAULT '05:00',
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "autoProcessar" BOOLEAN NOT NULL DEFAULT true,
    "ultimoStatus" TEXT,
    "ultimoDownload" TIMESTAMP(3),
    "ultimaMensagem" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SftpConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable SftpJobLog
CREATE TABLE IF NOT EXISTS "SftpJobLog" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEm" TIMESTAMP(3),
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "arquivosEncontrados" INTEGER NOT NULL DEFAULT 0,
    "arquivosBaixados" INTEGER NOT NULL DEFAULT 0,
    "arquivosProcessados" INTEGER NOT NULL DEFAULT 0,
    "mensagem" TEXT,
    "detalhes" JSONB,

    CONSTRAINT "SftpJobLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SftpJobLog_configId_iniciadoEm_idx" ON "SftpJobLog"("configId", "iniciadoEm");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SftpJobLog_configId_fkey'
    ) THEN
        ALTER TABLE "SftpJobLog" ADD CONSTRAINT "SftpJobLog_configId_fkey" FOREIGN KEY ("configId") REFERENCES "SftpConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
