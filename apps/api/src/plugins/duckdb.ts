import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { DuckDBInstance } from '@duckdb/node-api';

// ── Tipos de entrada ─────────────────────────────────────────────────

export interface DuckVenda {
  idempotencyKey: string;
  nsu:            string | null;
  autorizacao:    string | null;
  terminal:       string | null;
  valorBruto:     number;
  parcelas:       number;
  sitefKey?:      string | null; // para matchSitef (rastreio)
}

export interface DuckSitef {
  idempotencyKey: string;
  nsuHost:        string | null;
  nsu:            string | null;
  autorizacao:    string | null;
  terminalLogico: string | null;
  valor:          number;
}

// ── Tipos de saída ────────────────────────────────────────────────────

export interface DuckConciliarRow {
  vendaKey:   string;
  sitefKey:   string | null;
  matchVia:   string | null;
  statusConc: string;   // CONCILIADO | DIVERGENTE | SEM_SITEF
  difValor:   number;
}

export interface DuckSitefMatchRow {
  vendaKey: string;
  sitefKey: string | null;
  matchVia: string | null;
}

// ── Decoração Fastify ─────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    duck: {
      /** Cascade completa + statusConc — para o endpoint /conciliar-duck */
      conciliar(vendas: DuckVenda[], sitef: DuckSitef[]): Promise<DuckConciliarRow[]>;
      /** Resolve qual SITEF casa com cada venda — para o endpoint /rastreio-duck */
      matchSitef(vendas: DuckVenda[], sitef: DuckSitef[]): Promise<DuckSitefMatchRow[]>;
    };
  }
}

// ── Utilitários SQL ────────────────────────────────────────────────────

/** Escapa uma string para uso literal em SQL (single quotes). */
function s(v: string | null | undefined): string {
  if (v == null || v === '') return 'NULL';
  return `'${v.replace(/'/g, "''")}'`;
}

/** Converte number para literal SQL numérico. */
function n(v: number): string {
  return isFinite(v) ? String(v) : '0';
}

// ── SQL da cascade (L1 → L2 → L3 → L4) ──────────────────────────────
//
// Cada nível exclui vendas já casadas nos anteriores via NOT IN.
// DuckDB materializa CTEs automaticamente → NOT IN é eficiente.
// Tolerância de valor: R$0,05 (regra de negócio original mantida).

function buildCascadeCte(vt: string, st: string): string {
  return `
  l1 AS (
    SELECT v.ik AS vk, MIN(s.ik) AS sk, 'NSU_TERMINAL' AS via
    FROM "${vt}" v JOIN "${st}" s ON s.nsh = v.nsu AND s.term = v.term
    WHERE v.nsu IS NOT NULL AND v.term IS NOT NULL
    GROUP BY v.ik
  ),
  l2 AS (
    SELECT v.ik AS vk, MIN(s.ik) AS sk, 'NSU_AUTORIZACAO' AS via
    FROM "${vt}" v JOIN "${st}" s ON s.nsh = v.nsu AND s.aut = v.aut
    WHERE v.nsu IS NOT NULL AND v.aut IS NOT NULL
      AND v.ik NOT IN (SELECT vk FROM l1)
    GROUP BY v.ik
  ),
  l3 AS (
    SELECT v.ik AS vk, MIN(s.ik) AS sk, 'AUTORIZACAO_TERMINAL' AS via
    FROM "${vt}" v JOIN "${st}" s ON s.aut = v.aut AND s.term = v.term
    WHERE v.aut IS NOT NULL AND v.term IS NOT NULL
      AND v.ik NOT IN (SELECT vk FROM l1 UNION ALL SELECT vk FROM l2)
    GROUP BY v.ik
  ),
  l4 AS (
    SELECT v.ik AS vk, MIN(s.ik) AS sk, 'AUTORIZACAO' AS via
    FROM "${vt}" v JOIN "${st}" s ON s.aut = v.aut
    WHERE v.aut IS NOT NULL
      AND v.ik NOT IN (SELECT vk FROM l1 UNION ALL SELECT vk FROM l2 UNION ALL SELECT vk FROM l3)
    GROUP BY v.ik
  ),
  matched AS (
    SELECT vk, sk, via FROM l1
    UNION ALL SELECT vk, sk, via FROM l2
    UNION ALL SELECT vk, sk, via FROM l3
    UNION ALL SELECT vk, sk, via FROM l4
  )`;
}

// ── Plugin ────────────────────────────────────────────────────────────

const duckdbPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const db = await DuckDBInstance.create(':memory:');
  let seq = 0; // Contador atômico para nomes de tabela únicos por operação

  // Cada request cria uma conexão própria + tabelas com nome único.
  // Conexões DuckDB em-memória compartilham o mesmo catálogo, então
  // nomes únicos evitam colisão sob concorrência.
  async function withSession<T>(
    fn: (conn: Awaited<ReturnType<typeof db.connect>>, vt: string, st: string) => Promise<T>,
  ): Promise<T> {
    const id = ++seq;
    const vt = `vv${id}`;
    const st = `ss${id}`;
    const conn = await db.connect();
    try {
      return await fn(conn, vt, st);
    } finally {
      try { await conn.run(`DROP TABLE IF EXISTS "${vt}"`); } catch { /* ignorar */ }
      try { await conn.run(`DROP TABLE IF EXISTS "${st}"`); } catch { /* ignorar */ }
      conn.closeSync();
    }
  }

  // ── conciliar ──────────────────────────────────────────────────────
  // Cascade match completo + cálculo de statusConc em SQL.
  // Substitui conciliaAdquirenteComSitef() para lotes grandes.

  async function conciliar(
    vendas: DuckVenda[],
    sitef:  DuckSitef[],
  ): Promise<DuckConciliarRow[]> {
    if (vendas.length === 0) return [];

    return withSession(async (conn, vt, st) => {
      await conn.run(`
        CREATE TABLE "${vt}" (
          ik   VARCHAR, nsu  VARCHAR, aut  VARCHAR,
          term VARCHAR, vbruto DOUBLE, parc INT
        )
      `);
      await conn.run(`
        CREATE TABLE "${st}" (
          ik   VARCHAR, nsh  VARCHAR, nsu  VARCHAR,
          aut  VARCHAR, term VARCHAR, val  DOUBLE
        )
      `);

      if (vendas.length > 0) {
        const rows = vendas
          .map(v => `(${s(v.idempotencyKey)},${s(v.nsu)},${s(v.autorizacao)},${s(v.terminal)},${n(v.valorBruto)},${v.parcelas})`)
          .join(',');
        await conn.run(`INSERT INTO "${vt}" VALUES ${rows}`);
      }

      if (sitef.length > 0) {
        const rows = sitef
          .map(x => `(${s(x.idempotencyKey)},${s(x.nsuHost)},${s(x.nsu)},${s(x.autorizacao)},${s(x.terminalLogico)},${n(x.valor)})`)
          .join(',');
        await conn.run(`INSERT INTO "${st}" VALUES ${rows}`);
      }

      const result = await conn.runAndReadAll(`
        WITH
        ${buildCascadeCte(vt, st)}
        SELECT
          v.ik                                  AS "vendaKey",
          m.sk                                  AS "sitefKey",
          m.via                                 AS "matchVia",
          CASE
            WHEN m.sk IS NULL                      THEN 'SEM_SITEF'
            WHEN ABS(v.vbruto - s.val) <= 0.05     THEN 'CONCILIADO'
            ELSE 'DIVERGENTE'
          END                                   AS "statusConc",
          COALESCE(ABS(v.vbruto - s.val), 0.0)  AS "difValor"
        FROM "${vt}" v
        LEFT JOIN matched m ON m.vk = v.ik
        LEFT JOIN "${st}" s ON s.ik = m.sk
      `);

      return (result.getRowObjects() as unknown) as DuckConciliarRow[];
    });
  }

  // ── matchSitef ─────────────────────────────────────────────────────
  // Resolve qual SITEF casa com cada venda — sitefKey guardado tem prioridade,
  // depois cascade L1→L4. Usado pelo rastreio-duck.

  async function matchSitef(
    vendas: DuckVenda[],
    sitef:  DuckSitef[],
  ): Promise<DuckSitefMatchRow[]> {
    if (vendas.length === 0) return [];

    return withSession(async (conn, vt, st) => {
      await conn.run(`
        CREATE TABLE "${vt}" (
          ik   VARCHAR, nsu  VARCHAR, aut  VARCHAR,
          term VARCHAR, vbruto DOUBLE, parc INT, skey VARCHAR
        )
      `);
      await conn.run(`
        CREATE TABLE "${st}" (
          ik   VARCHAR, nsh  VARCHAR, nsu  VARCHAR,
          aut  VARCHAR, term VARCHAR, val  DOUBLE
        )
      `);

      if (vendas.length > 0) {
        const rows = vendas
          .map(v => `(${s(v.idempotencyKey)},${s(v.nsu)},${s(v.autorizacao)},${s(v.terminal)},${n(v.valorBruto)},${v.parcelas},${s(v.sitefKey ?? null)})`)
          .join(',');
        await conn.run(`INSERT INTO "${vt}" VALUES ${rows}`);
      }

      if (sitef.length > 0) {
        const rows = sitef
          .map(x => `(${s(x.idempotencyKey)},${s(x.nsuHost)},${s(x.nsu)},${s(x.autorizacao)},${s(x.terminalLogico)},${n(x.valor)})`)
          .join(',');
        await conn.run(`INSERT INTO "${st}" VALUES ${rows}`);
      }

      const result = await conn.runAndReadAll(`
        WITH
        -- Prioridade máxima: sitefKey já salvo que existe no pool
        by_key AS (
          SELECT v.ik AS vk, v.skey AS sk, 'SITEF_KEY' AS via
          FROM "${vt}" v
          WHERE v.skey IS NOT NULL
            AND EXISTS (SELECT 1 FROM "${st}" WHERE ik = v.skey)
        ),
        -- Restante: vendas sem sitefKey salvo → cascade
        remaining AS (
          SELECT * FROM "${vt}"
          WHERE ik NOT IN (SELECT vk FROM by_key)
        ),
        r_l1 AS (
          SELECT v.ik AS vk, MIN(s.ik) AS sk, 'NSU_TERMINAL' AS via
          FROM remaining v JOIN "${st}" s ON s.nsh = v.nsu AND s.term = v.term
          WHERE v.nsu IS NOT NULL AND v.term IS NOT NULL
          GROUP BY v.ik
        ),
        r_l2 AS (
          SELECT v.ik AS vk, MIN(s.ik) AS sk, 'NSU_AUTORIZACAO' AS via
          FROM remaining v JOIN "${st}" s ON s.nsh = v.nsu AND s.aut = v.aut
          WHERE v.nsu IS NOT NULL AND v.aut IS NOT NULL
            AND v.ik NOT IN (SELECT vk FROM r_l1)
          GROUP BY v.ik
        ),
        r_l3 AS (
          SELECT v.ik AS vk, MIN(s.ik) AS sk, 'AUTORIZACAO_TERMINAL' AS via
          FROM remaining v JOIN "${st}" s ON s.aut = v.aut AND s.term = v.term
          WHERE v.aut IS NOT NULL AND v.term IS NOT NULL
            AND v.ik NOT IN (SELECT vk FROM r_l1 UNION ALL SELECT vk FROM r_l2)
          GROUP BY v.ik
        ),
        r_l4 AS (
          SELECT v.ik AS vk, MIN(s.ik) AS sk, 'AUTORIZACAO' AS via
          FROM remaining v JOIN "${st}" s ON s.aut = v.aut
          WHERE v.aut IS NOT NULL
            AND v.ik NOT IN (
              SELECT vk FROM r_l1 UNION ALL SELECT vk FROM r_l2 UNION ALL SELECT vk FROM r_l3
            )
          GROUP BY v.ik
        ),
        all_matched AS (
          SELECT vk, sk, via FROM by_key
          UNION ALL SELECT vk, sk, via FROM r_l1
          UNION ALL SELECT vk, sk, via FROM r_l2
          UNION ALL SELECT vk, sk, via FROM r_l3
          UNION ALL SELECT vk, sk, via FROM r_l4
        )
        SELECT
          v.ik   AS "vendaKey",
          m.sk   AS "sitefKey",
          m.via  AS "matchVia"
        FROM "${vt}" v
        LEFT JOIN all_matched m ON m.vk = v.ik
      `);

      return (result.getRowObjects() as unknown) as DuckSitefMatchRow[];
    });
  }

  fastify.decorate('duck', { conciliar, matchSitef });

  fastify.addHook('onClose', async () => {
    db.closeSync();
  });
});

export default duckdbPlugin;
