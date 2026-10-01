-- Migration: add PIX QR Code SITEF config fields to EmpresaConfig
-- PIX liquidado diretamente no banco, fora do fluxo do adquirente

ALTER TABLE "EmpresaConfig"
  ADD COLUMN IF NOT EXISTS "pixQrCodeSitefDireto" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "pixQrCodeBancoDesc"   TEXT;
