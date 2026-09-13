import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const lotes = await prisma.adquirenteLote.count({ where: { gateway: 'SODEXO' } });
  const vendas = await prisma.adquirenteVenda.count({ where: { gateway: 'SODEXO' } });
  const rec = await prisma.adquirenteRecebivel.count({ where: { gateway: 'SODEXO' } });
  const contratos = await prisma.taxaContrato.count({ where: { rede: 'SODEXO' } });

  console.log('Registros encontrados:', { lotes, vendas, rec, contratos });

  if (vendas > 0) {
    const dv = await prisma.adquirenteVenda.deleteMany({ where: { gateway: 'SODEXO' } });
    console.log(`Deletadas ${dv.count} vendas da SODEXO`);
  }
  if (rec > 0) {
    const dr = await prisma.adquirenteRecebivel.deleteMany({ where: { gateway: 'SODEXO' } });
    console.log(`Deletados ${dr.count} recebíveis da SODEXO`);
  }
  if (lotes > 0) {
    const dl = await prisma.adquirenteLote.deleteMany({ where: { gateway: 'SODEXO' } });
    console.log(`Deletados ${dl.count} lotes da SODEXO`);
  }
  if (contratos > 0) {
    const dc = await prisma.taxaContrato.deleteMany({ where: { rede: 'SODEXO' } });
    console.log(`Deletados ${dc.count} contratos de taxa da SODEXO`);
  }

  // Também verificar se há SODEXO em minúsculas ou pluxee
  const lotesPluxee = await prisma.adquirenteLote.count({ where: { gateway: 'PLUXEE' } });
  if (lotesPluxee > 0) {
    await prisma.adquirenteVenda.deleteMany({ where: { gateway: 'PLUXEE' } });
    await prisma.adquirenteRecebivel.deleteMany({ where: { gateway: 'PLUXEE' } });
    await prisma.adquirenteLote.deleteMany({ where: { gateway: 'PLUXEE' } });
    console.log('Registros PLUXEE também limpos.');
  }

  console.log('Concluída remoção completa de dados de SODEXO/PLUXEE.');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
