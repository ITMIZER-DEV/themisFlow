-- Add lojasAutorizadas and ultimoAcesso columns to User table
-- These were added to the Prisma schema without a corresponding migration

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "lojasAutorizadas" TEXT[] NOT NULL DEFAULT ARRAY['GLOBAL']::TEXT[];

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "ultimoAcesso" TIMESTAMPTZ;
