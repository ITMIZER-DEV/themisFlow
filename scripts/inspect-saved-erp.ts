import { PrismaClient } from '@prisma/client';
import pg from 'pg';

const { Client } = pg;

async function run() {
  const prisma = new PrismaClient();
  const config = await prisma.empresaConfig.findUnique({ where: { id: 'default' } });
  if (!config) {
    console.log('Nenhuma configuração encontrada');
    return;
  }

  console.log(`Conectando ao ERP: ${config.erpHost}:${config.erpPorta}/${config.erpDatabase} (user: ${config.erpUsuario})...`);

  const client = new Client({
    host: config.erpHost || undefined,
    port: config.erpPorta,
    database: config.erpDatabase || undefined,
    user: config.erpUsuario || undefined,
    password: config.erpSenha || undefined,
    ssl: config.erpSsl ? { rejectUnauthorized: false } : false,
    options: '-c default_transaction_read_only=on',
  });

  try {
    await client.connect();
    console.log('✓ Conectado em modo READ-ONLY ao ERP do cliente!\n');

    const cols = await client.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'pdv' AND table_name = 'vendatef'
    `);
    const colSet = new Set(cols.rows.map(c => c.column_name.toLowerCase()));

    const pdvExpr = colSet.has('ecf') ? 'ecf as pdv' : colSet.has('pdv') ? 'pdv' : '1 as pdv';
    const nsuExpr = colSet.has('nsusitef') ? 'nsusitef::text as nsu' : colSet.has('nsu') ? 'nsu::text as nsu' : "'' as nsu";
    const nsuHostExpr = colSet.has('nsuhost') ? 'nsuhost::text as nsu_host' : colSet.has('nsu_host') ? 'nsu_host::text as nsu_host' : "'' as nsu_host";
    const authExpr = colSet.has('codigoautorizacao') ? 'codigoautorizacao as autorizacao' : colSet.has('autorizacao') ? 'autorizacao' : "'' as autorizacao";
    const cardExpr = colSet.has('nomecartao') ? 'nomecartao' : colSet.has('bandeira') ? 'bandeira' : "'CARTAO' as nomecartao";
    const parcExpr = colSet.has('numeroparcela') ? 'numeroparcela as parcelas' : colSet.has('parcelas') ? 'parcelas' : '1 as parcelas';
    const statusFilter = colSet.has('id_situacaotef') ? '(id_situacaotef = 1)' : '(cancelado IS NULL OR cancelado = FALSE)';

    const smartQuery = `
      SELECT 
        id,
        ${colSet.has('id_loja') ? 'id_loja' : '1 as id_loja'},
        ${pdvExpr},
        ${colSet.has('cupom') ? 'cupom' : '0 as cupom'},
        data::text as data,
        hora::text as hora,
        ${nsuExpr},
        ${nsuHostExpr},
        ${authExpr},
        valor::float as valor,
        ${cardExpr} as nomecartao,
        ${parcExpr}
      FROM pdv.vendatef
      WHERE ${statusFilter}
        AND data >= '2026-06-01' AND data <= '2026-06-05'
      ORDER BY data ASC, hora ASC
      LIMIT 10;
    `;

    console.log('Testando Smart Query para 2026-06-01 a 2026-06-05:');
    const testRes = await client.query(smartQuery);
    console.table(testRes.rows);
    const dateRange = await client.query(`
      SELECT 
        min(data)::text as menor_data, 
        max(data)::text as maior_data, 
        count(*)::text as total_vendas
      FROM pdv.vendatef;
    `);
    console.log('\nPeríodo total de vendas na base:', dateRange.rows[0]);

    const situacoes = await client.query(`
      SELECT id_situacaotef, count(*)::text as qtd 
      FROM pdv.vendatef 
      GROUP BY id_situacaotef 
      ORDER BY id_situacaotef;
    `);
    console.log('\nSituações TEF:', situacoes.rows);

  } catch (err) {
    console.error('Erro na inspeção:', err);
  } finally {
    await client.end().catch(() => {});
    await prisma.$disconnect();
  }
}

run();
