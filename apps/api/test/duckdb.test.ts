import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import duckdbPlugin, { type DuckVenda, type DuckSitef } from '../src/plugins/duckdb.js';
import { conciliaAdquirenteComSitef } from '@themisflow/core';

describe('DuckDB Conciliação Engine (@duckdb/node-api)', () => {
  let app: FastifyInstance;

  before(async () => {
    app = Fastify({ logger: false });
    await app.register(duckdbPlugin);
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  describe('1. Cascata de Match (L1 → L2 → L3 → L4)', () => {
    it('deve casar via L1: NSU_TERMINAL quando NSU e Terminal coincidem', async () => {
      const vendas: DuckVenda[] = [
        {
          idempotencyKey: 'v-l1',
          nsu: '123456',
          autorizacao: 'AUT_DIF',
          terminal: 'TERM01',
          valorBruto: 100.00,
          parcelas: 1,
        },
      ];
      const sitef: DuckSitef[] = [
        {
          idempotencyKey: 's-l1',
          nsuHost: '123456',
          nsu: 'OUTRO_NSU',
          autorizacao: 'AUT_SITEF',
          terminalLogico: 'TERM01',
          valor: 100.00,
        },
      ];

      const res = await app.duck.conciliar(vendas, sitef);
      assert.equal(res.length, 1);
      assert.equal(res[0].vendaKey, 'v-l1');
      assert.equal(res[0].sitefKey, 's-l1');
      assert.equal(res[0].matchVia, 'NSU_TERMINAL');
      assert.equal(res[0].statusConc, 'CONCILIADO');
      assert.equal(res[0].difValor, 0);
    });

    it('deve casar via L2: NSU_AUTORIZACAO quando Terminal diverge mas NSU e Autorização coincidem', async () => {
      const vendas: DuckVenda[] = [
        {
          idempotencyKey: 'v-l2',
          nsu: '222222',
          autorizacao: 'AUT_L2',
          terminal: 'TERM_VENDA',
          valorBruto: 50.00,
          parcelas: 1,
        },
      ];
      const sitef: DuckSitef[] = [
        {
          idempotencyKey: 's-l2',
          nsuHost: '222222',
          nsu: 'SIT_NSU',
          autorizacao: 'AUT_L2',
          terminalLogico: 'TERM_SITEF_DIFERENTE',
          valor: 50.00,
        },
      ];

      const res = await app.duck.conciliar(vendas, sitef);
      assert.equal(res.length, 1);
      assert.equal(res[0].vendaKey, 'v-l2');
      assert.equal(res[0].sitefKey, 's-l2');
      assert.equal(res[0].matchVia, 'NSU_AUTORIZACAO');
      assert.equal(res[0].statusConc, 'CONCILIADO');
    });

    it('deve casar via L3: AUTORIZACAO_TERMINAL quando NSU diverge mas Autorização e Terminal coincidem', async () => {
      const vendas: DuckVenda[] = [
        {
          idempotencyKey: 'v-l3',
          nsu: 'NSU_DIF_VENDA',
          autorizacao: 'AUT_L3',
          terminal: 'TERM03',
          valorBruto: 75.25,
          parcelas: 1,
        },
      ];
      const sitef: DuckSitef[] = [
        {
          idempotencyKey: 's-l3',
          nsuHost: 'NSU_DIF_SITEF',
          nsu: 'SIT_NSU',
          autorizacao: 'AUT_L3',
          terminalLogico: 'TERM03',
          valor: 75.25,
        },
      ];

      const res = await app.duck.conciliar(vendas, sitef);
      assert.equal(res.length, 1);
      assert.equal(res[0].vendaKey, 'v-l3');
      assert.equal(res[0].sitefKey, 's-l3');
      assert.equal(res[0].matchVia, 'AUTORIZACAO_TERMINAL');
      assert.equal(res[0].statusConc, 'CONCILIADO');
    });

    it('deve casar via L4: AUTORIZACAO quando apenas Autorização coincide', async () => {
      const vendas: DuckVenda[] = [
        {
          idempotencyKey: 'v-l4',
          nsu: 'NSU_V',
          autorizacao: 'AUT_L4',
          terminal: 'TERM_V',
          valorBruto: 120.00,
          parcelas: 1,
        },
      ];
      const sitef: DuckSitef[] = [
        {
          idempotencyKey: 's-l4',
          nsuHost: 'NSU_S',
          nsu: 'SIT_NSU',
          autorizacao: 'AUT_L4',
          terminalLogico: 'TERM_S',
          valor: 120.00,
        },
      ];

      const res = await app.duck.conciliar(vendas, sitef);
      assert.equal(res.length, 1);
      assert.equal(res[0].vendaKey, 'v-l4');
      assert.equal(res[0].sitefKey, 's-l4');
      assert.equal(res[0].matchVia, 'AUTORIZACAO');
      assert.equal(res[0].statusConc, 'CONCILIADO');
    });

    it('deve respeitar prioridade estrita: L1 sobrepõe L4', async () => {
      const vendas: DuckVenda[] = [
        {
          idempotencyKey: 'v-prio',
          nsu: 'NSU_L1',
          autorizacao: 'AUT_L4_SHARE',
          terminal: 'TERM_L1',
          valorBruto: 200.00,
          parcelas: 1,
        },
      ];
      const sitef: DuckSitef[] = [
        {
          idempotencyKey: 's-candidate-l4',
          nsuHost: 'OTHER',
          nsu: 'OTHER',
          autorizacao: 'AUT_L4_SHARE',
          terminalLogico: 'TERM_OTHER',
          valor: 200.00,
        },
        {
          idempotencyKey: 's-candidate-l1',
          nsuHost: 'NSU_L1',
          nsu: 'OTHER',
          autorizacao: 'AUT_OTHER',
          terminalLogico: 'TERM_L1',
          valor: 200.00,
        },
      ];

      const res = await app.duck.conciliar(vendas, sitef);
      assert.equal(res.length, 1);
      assert.equal(res[0].sitefKey, 's-candidate-l1');
      assert.equal(res[0].matchVia, 'NSU_TERMINAL');
    });
  });

  describe('2. Tolerância de Valor e Status', () => {
    it('deve classificar como CONCILIADO quando a diferença for exatamente 0.05 ou menor', async () => {
      const vendas: DuckVenda[] = [
        { idempotencyKey: 'v-tol-exact', nsu: '111', autorizacao: 'A1', terminal: 'T1', valorBruto: 100.05, parcelas: 1 },
        { idempotencyKey: 'v-tol-less',  nsu: '222', autorizacao: 'A2', terminal: 'T2', valorBruto: 100.03, parcelas: 1 },
      ];
      const sitef: DuckSitef[] = [
        { idempotencyKey: 's-tol-exact', nsuHost: '111', nsu: '111', autorizacao: 'A1', terminalLogico: 'T1', valor: 100.00 },
        { idempotencyKey: 's-tol-less',  nsuHost: '222', nsu: '222', autorizacao: 'A2', terminalLogico: 'T2', valor: 100.00 },
      ];

      const res = await app.duck.conciliar(vendas, sitef);
      const exact = res.find(r => r.vendaKey === 'v-tol-exact')!;
      const less  = res.find(r => r.vendaKey === 'v-tol-less')!;

      assert.equal(exact.statusConc, 'CONCILIADO');
      assert.equal(less.statusConc, 'CONCILIADO');
    });

    it('deve classificar como DIVERGENTE quando a diferença for maior que 0.05', async () => {
      const vendas: DuckVenda[] = [
        { idempotencyKey: 'v-div', nsu: '333', autorizacao: 'A3', terminal: 'T3', valorBruto: 100.06, parcelas: 1 },
      ];
      const sitef: DuckSitef[] = [
        { idempotencyKey: 's-div', nsuHost: '333', nsu: '333', autorizacao: 'A3', terminalLogico: 'T3', valor: 100.00 },
      ];

      const res = await app.duck.conciliar(vendas, sitef);
      assert.equal(res[0].statusConc, 'DIVERGENTE');
      assert.ok(Math.abs(res[0].difValor - 0.06) < 0.0001);
    });

    it('deve classificar como SEM_SITEF quando nenhum registro coincidir', async () => {
      const vendas: DuckVenda[] = [
        { idempotencyKey: 'v-sem', nsu: '999', autorizacao: 'A9', terminal: 'T9', valorBruto: 50.00, parcelas: 1 },
      ];
      const sitef: DuckSitef[] = [
        { idempotencyKey: 's-unrelated', nsuHost: '888', nsu: '888', autorizacao: 'A8', terminalLogico: 'T8', valor: 50.00 },
      ];

      const res = await app.duck.conciliar(vendas, sitef);
      assert.equal(res[0].statusConc, 'SEM_SITEF');
      assert.equal(res[0].sitefKey, null);
      assert.equal(res[0].matchVia, null);
    });
  });

  describe('3. Rastreio e matchSitef', () => {
    it('deve preservar sitefKey já fixado se presente no pool (via SITEF_KEY)', async () => {
      const vendas: DuckVenda[] = [
        {
          idempotencyKey: 'v-pinned',
          nsu: 'DIFFERENT_NSU',
          autorizacao: 'DIFFERENT_AUT',
          terminal: 'DIFFERENT_TERM',
          valorBruto: 80.00,
          parcelas: 1,
          sitefKey: 's-pinned-target',
        },
      ];
      const sitef: DuckSitef[] = [
        {
          idempotencyKey: 's-pinned-target',
          nsuHost: '111',
          nsu: '111',
          autorizacao: 'A1',
          terminalLogico: 'T1',
          valor: 80.00,
        },
      ];

      const res = await app.duck.matchSitef(vendas, sitef);
      assert.equal(res.length, 1);
      assert.equal(res[0].vendaKey, 'v-pinned');
      assert.equal(res[0].sitefKey, 's-pinned-target');
      assert.equal(res[0].matchVia, 'SITEF_KEY');
    });

    it('deve recorrer à cascata quando sitefKey for nulo ou não existir no pool', async () => {
      const vendas: DuckVenda[] = [
        {
          idempotencyKey: 'v-fallback',
          nsu: '555',
          autorizacao: 'A5',
          terminal: 'T5',
          valorBruto: 30.00,
          parcelas: 1,
          sitefKey: 's-inexistente',
        },
      ];
      const sitef: DuckSitef[] = [
        {
          idempotencyKey: 's-fallback-match',
          nsuHost: '555',
          nsu: '555',
          autorizacao: 'A5',
          terminalLogico: 'T5',
          valor: 30.00,
        },
      ];

      const res = await app.duck.matchSitef(vendas, sitef);
      assert.equal(res.length, 1);
      assert.equal(res[0].vendaKey, 'v-fallback');
      assert.equal(res[0].sitefKey, 's-fallback-match');
      assert.equal(res[0].matchVia, 'NSU_TERMINAL');
    });
  });

  describe('4. Casos de Borda e Sanitização SQL', () => {
    it('deve retornar array vazio para vendas vazias sem erros', async () => {
      const res1 = await app.duck.conciliar([], []);
      assert.deepEqual(res1, []);

      const res2 = await app.duck.matchSitef([], []);
      assert.deepEqual(res2, []);
    });

    it('deve lidar com sitef vazio marcando todas as vendas como SEM_SITEF', async () => {
      const vendas: DuckVenda[] = [
        { idempotencyKey: 'v-only', nsu: '123', autorizacao: 'AUT', terminal: 'T1', valorBruto: 10, parcelas: 1 },
      ];
      const res = await app.duck.conciliar(vendas, []);
      assert.equal(res.length, 1);
      assert.equal(res[0].statusConc, 'SEM_SITEF');
      assert.equal(res[0].sitefKey, null);
    });

    it('deve escapar aspas simples e caracteres especiais com segurança', async () => {
      const vendas: DuckVenda[] = [
        {
          idempotencyKey: "v-quotes-'--SELECT 1;",
          nsu: "NSU'O'REILLY",
          autorizacao: "AUT'TEST",
          terminal: "TERM'01",
          valorBruto: 99.90,
          parcelas: 1,
        },
      ];
      const sitef: DuckSitef[] = [
        {
          idempotencyKey: "s-quotes-'--DROP TABLE;",
          nsuHost: "NSU'O'REILLY",
          nsu: "X",
          autorizacao: "AUT'TEST",
          terminalLogico: "TERM'01",
          valor: 99.90,
        },
      ];

      const res = await app.duck.conciliar(vendas, sitef);
      assert.equal(res.length, 1);
      assert.equal(res[0].vendaKey, "v-quotes-'--SELECT 1;");
      assert.equal(res[0].sitefKey, "s-quotes-'--DROP TABLE;");
      assert.equal(res[0].statusConc, 'CONCILIADO');
      assert.equal(res[0].matchVia, 'NSU_TERMINAL');
    });
  });

  describe('5. Paridade com a Engine Core (@themisflow/core)', () => {
    it('DuckDB e @themisflow/core devem concordar em 100% dos resultados para lote misto', async () => {
      const vendas: DuckVenda[] = [];
      const sitef: DuckSitef[] = [];

      for (let i = 1; i <= 100; i++) {
        const vKey = `v-par-${i}`;
        const sKey = `s-par-${i}`;

        if (i <= 25) {
          // L1: NSU + Terminal
          vendas.push({ idempotencyKey: vKey, nsu: `NSU_${i}`, autorizacao: `AUT_V_${i}`, terminal: `T_${i % 5}`, valorBruto: 100 + i, parcelas: 1 });
          sitef.push({ idempotencyKey: sKey, nsuHost: `NSU_${i}`, nsu: `N_${i}`, autorizacao: `AUT_S_${i}`, terminalLogico: `T_${i % 5}`, valor: 100 + i });
        } else if (i <= 50) {
          // L2: NSU + Autorização
          vendas.push({ idempotencyKey: vKey, nsu: `NSU_${i}`, autorizacao: `AUT_${i}`, terminal: `T_V_${i}`, valorBruto: 50 + i, parcelas: 1 });
          sitef.push({ idempotencyKey: sKey, nsuHost: `NSU_${i}`, nsu: `N_${i}`, autorizacao: `AUT_${i}`, terminalLogico: `T_S_${i}`, valor: 50 + i });
        } else if (i <= 75) {
          // L4: Autorização única (divergente de valor)
          vendas.push({ idempotencyKey: vKey, nsu: `NSU_V_${i}`, autorizacao: `AUT_${i}`, terminal: `T_V_${i}`, valorBruto: 200 + i, parcelas: 1 });
          sitef.push({ idempotencyKey: sKey, nsuHost: `NSU_S_${i}`, nsu: `N_${i}`, autorizacao: `AUT_${i}`, terminalLogico: `T_S_${i}`, valor: 200 + i + 1.00 }); // dif de R$1.00
        } else {
          // Sem par
          vendas.push({ idempotencyKey: vKey, nsu: `NSU_UNPAIRED_${i}`, autorizacao: `AUT_UNP_${i}`, terminal: `T_${i}`, valorBruto: 10, parcelas: 1 });
        }
      }

      // 1. DuckDB
      const tDuck0 = performance.now();
      const duckRes = await app.duck.conciliar(vendas, sitef);
      const tDuckMs = performance.now() - tDuck0;

      // 2. Core
      const tCore0 = performance.now();
      const coreRes = conciliaAdquirenteComSitef(
        vendas.map(v => ({
          idempotencyKey: v.idempotencyKey,
          nsu: v.nsu,
          autorizacao: v.autorizacao ?? '',
          terminal: v.terminal ?? '',
          valorBruto: v.valorBruto,
          dataHoraVenda: new Date().toISOString(),
        })),
        sitef.map(s => ({
          idempotencyKey: s.idempotencyKey,
          nsu: s.nsu,
          nsuHost: s.nsuHost,
          autorizacao: s.autorizacao ?? '',
          terminalLogico: s.terminalLogico ?? '',
          valor: s.valor,
          dataDia: '2026-09-11',
        })),
      );
      const tCoreMs = performance.now() - tCore0;

      console.log(`\n  [Benchmark Paridade 100 txs] DuckDB: ${tDuckMs.toFixed(2)}ms | Core JS: ${tCoreMs.toFixed(2)}ms`);

      const duckMap = new Map(duckRes.map(r => [r.vendaKey, r]));

      for (const coreVenda of coreRes.vendas) {
        const duckVenda = duckMap.get(coreVenda.vendaKey);
        assert.ok(duckVenda, `Venda ${coreVenda.vendaKey} encontrada no DuckDB`);
        assert.equal(duckVenda.sitefKey, coreVenda.sitefKey, `Paridade sitefKey para ${coreVenda.vendaKey}`);
        assert.equal(duckVenda.statusConc, coreVenda.status, `Paridade statusConc para ${coreVenda.vendaKey}`);
        assert.equal(duckVenda.matchVia, coreVenda.matchVia, `Paridade matchVia para ${coreVenda.vendaKey}`);
      }
    });
  });

  describe('6. Benchmark de Performance (1.000 transações)', () => {
    it('deve conciliar 1.000 transações com alta performance (< 500ms)', async () => {
      const N = 1000;
      const vendas: DuckVenda[] = [];
      const sitef: DuckSitef[] = [];

      for (let i = 0; i < N; i++) {
        vendas.push({
          idempotencyKey: `v-bench-${i}`,
          nsu: `NSU_${i % 800}`,
          autorizacao: `AUT_${i % 500}`,
          terminal: `TERM_${i % 10}`,
          valorBruto: 15.50 + (i % 100),
          parcelas: 1,
        });
        sitef.push({
          idempotencyKey: `s-bench-${i}`,
          nsuHost: `NSU_${i % 800}`,
          nsu: `N_${i}`,
          autorizacao: `AUT_${i % 500}`,
          terminalLogico: `TERM_${i % 10}`,
          valor: 15.50 + (i % 100),
        });
      }

      const t0 = performance.now();
      const res = await app.duck.conciliar(vendas, sitef);
      const elapsed = performance.now() - t0;

      console.log(`\n  [Benchmark 1.000 transações] Tempo total DuckDB: ${elapsed.toFixed(2)}ms`);

      assert.equal(res.length, N);
      assert.ok(elapsed < 1500, `Tempo deve ser menor que 1.5s, foi ${elapsed}ms`);

      const conciliados = res.filter(r => r.statusConc === 'CONCILIADO').length;
      assert.ok(conciliados > 800, `Esperado > 800 conciliados, obtido: ${conciliados}`);
    });

    it('deve conciliar 5.000 transações sem estourar limites SQL ou memória', async () => {
      const N = 5000;
      const vendas: DuckVenda[] = [];
      const sitef: DuckSitef[] = [];

      for (let i = 0; i < N; i++) {
        vendas.push({
          idempotencyKey: `v-stress-${i}`,
          nsu: `NSU_${i % 2000}`,
          autorizacao: `AUT_${i % 1500}`,
          terminal: `TERM_${i % 20}`,
          valorBruto: 25.00 + (i % 50),
          parcelas: 1,
        });
        sitef.push({
          idempotencyKey: `s-stress-${i}`,
          nsuHost: `NSU_${i % 2000}`,
          nsu: `N_${i}`,
          autorizacao: `AUT_${i % 1500}`,
          terminalLogico: `TERM_${i % 20}`,
          valor: 25.00 + (i % 50),
        });
      }

      const t0 = performance.now();
      const res = await app.duck.conciliar(vendas, sitef);
      const elapsed = performance.now() - t0;

      console.log(`\n  [Benchmark 5.000 transações] Tempo total DuckDB: ${elapsed.toFixed(2)}ms`);

      assert.equal(res.length, N);
      assert.ok(elapsed < 3000, `Tempo deve ser menor que 3s, foi ${elapsed}ms`);
    });
  });
});
