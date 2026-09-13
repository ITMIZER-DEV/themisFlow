-- CreateTable
CREATE TABLE "EmpresaConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "razaoSocial" TEXT NOT NULL DEFAULT 'Cliente Piloto LTDA',
    "nomeFantasia" TEXT NOT NULL DEFAULT 'Cliente Piloto',
    "cnpj" TEXT NOT NULL DEFAULT '',
    "inscricaoEstadual" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "logomarca" TEXT,
    "erpTipo" TEXT NOT NULL DEFAULT 'POSTGRESQL',
    "erpHost" TEXT,
    "erpPorta" INTEGER NOT NULL DEFAULT 5432,
    "erpDatabase" TEXT,
    "erpUsuario" TEXT,
    "erpSenha" TEXT,
    "erpSsl" BOOLEAN NOT NULL DEFAULT false,
    "erpAtivo" BOOLEAN NOT NULL DEFAULT false,
    "erpUltimoTeste" TIMESTAMP(3),
    "erpStatus" TEXT,
    "erpMensagem" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmpresaConfig_pkey" PRIMARY KEY ("id")
);
