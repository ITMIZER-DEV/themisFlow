import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dateInicio = new Date('2026-09-01T00:00:00');
  const dateFim = new Date('2026-09-30T23:59:59.999');

  const baseWhere: any = {
    dataVencimento: { gte: dateInicio, lte: dateFim },
  };

  const count = await prisma.adquirenteRecebivel.count({ where: baseWhere });
  console.log('Total count in baseWhere:', count);

  const rows = await prisma.adquirenteRecebivel.findMany({
    where: baseWhere,
    take: 10,
  });

  console.log('Sample rows:', rows.map(r => ({
    id: r.idempotencyKey,
    vencimento: r.dataVencimento,
    tipoLancamento: r.tipoLancamento,
    valorLiquidado: r.valorLiquidado,
    valorLiquido: r.valorLiquido,
  })));
}

main().finally(async () => {
  await prisma.$disconnect();
});
