import { PrismaClient } from '@prisma/client';
import { reprocessarArquivosLocais } from '../services/sftp-service.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando reprocessamento dos extratos Getnet EDI...');
  const res = await reprocessarArquivosLocais(undefined, prisma);
  console.log('Arquivos reprocessados com sucesso:', JSON.stringify(res, null, 2));

  // Limpa lotes sem nenhuma transação vinculada
  const emptyLotes = await prisma.adquirenteLote.findMany({
    where: {
      vendas: { none: {} },
      recebiveis: { none: {} },
    },
    select: { id: true, arquivo: true, tipo: true },
  });
  // Atualiza adicionadas com contagem real se for 0
  await prisma.$executeRawUnsafe(`
    UPDATE "AdquirenteLote" l
    SET adicionadas = (
      SELECT count(*) FROM "AdquirenteVenda" v WHERE v."loteId" = l.id
    )
    WHERE l.tipo = 'VENDAS' AND adicionadas = 0;
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE "AdquirenteLote" l
    SET adicionadas = (
      SELECT count(*) FROM "AdquirenteRecebivel" r WHERE r."loteId" = l.id
    )
    WHERE l.tipo = 'RECEBIVEIS' AND adicionadas = 0;
  `);

  // Verifica lotes atualizados
  const lotes = await prisma.adquirenteLote.findMany({
    where: { gateway: 'GETNET' },
    orderBy: { dataInicio: 'desc' },
    select: {
      id: true,
      arquivo: true,
      tipo: true,
      dataInicio: true,
      adicionadas: true,
      _count: { select: { vendas: true, recebiveis: true } },
    },
  });

  console.log('Lotes Getnet limpos e consolidados no banco:', JSON.stringify(lotes, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
