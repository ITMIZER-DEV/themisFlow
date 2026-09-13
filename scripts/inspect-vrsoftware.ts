/**
 * inspect-vrsoftware.ts — Utilitário para consultar a estrutura de tabelas
 * do banco de dados do cliente (VRSoftware) em modo estritamente READ-ONLY.
 *
 * Como usar:
 *   npx tsx scripts/inspect-vrsoftware.ts "postgresql://usuario:senha@host:5432/banco"
 * Ou configurando no .env: ERP_DATABASE_URL=postgresql://...
 */
import pg from 'pg';

const { Client } = pg;

const connectionString = process.argv[2] || process.env.ERP_DATABASE_URL;

if (!connectionString) {
  console.log('Uso: npx tsx scripts/inspect-vrsoftware.ts <connectionString>');
  console.log('Exemplo: npx tsx scripts/inspect-vrsoftware.ts "postgresql://postgres:senha@192.168.1.100:5432/vrmaster"');
  process.exit(1);
}

async function inspect() {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
    options: '-c default_transaction_read_only=on',
  });

  try {
    console.log('▶ Conectando ao banco do cliente (READ-ONLY)...');
    await client.connect();
    console.log('✓ Conectado com sucesso!\n');

    // 1. Versão do PostgreSQL
    const vRes = await client.query<{ version: string }>('SELECT version();');
    console.log('📌 Versão do Banco:', vRes.rows[0]?.version);

    // 2. Estrutura da tabela pdv.vendatef
    console.log('\n📋 Estrutura da tabela pdv.vendatef:');
    const colsRes = await client.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'pdv' AND table_name = 'vendatef'
      ORDER BY ordinal_position;
    `);

    if (colsRes.rows.length === 0) {
      console.log('  ⚠️ Tabela pdv.vendatef não encontrada. Listando tabelas do schema pdv:');
      const tablesRes = await client.query<{ table_name: string }>(`
        SELECT table_name FROM information_schema.tables WHERE table_schema = 'pdv' ORDER BY table_name;
      `);
      console.table(tablesRes.rows);
    } else {
      console.table(colsRes.rows);

      // 3. Amostra de 3 registros recentes (read-only)
      console.log('\n🔍 Amostra dos últimos 3 registros de pdv.vendatef:');
      const sampleRes = await client.query('SELECT * FROM pdv.vendatef ORDER BY 1 DESC LIMIT 3;');
      console.log(JSON.stringify(sampleRes.rows, null, 2));
    }
  } catch (err: unknown) {
    console.error('✖ Erro ao inspecionar:', err instanceof Error ? err.message : err);
  } finally {
    await client.end();
  }
}

inspect();
