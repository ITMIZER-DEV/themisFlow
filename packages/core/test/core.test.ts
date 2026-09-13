/**
 * Port dos golden tests para Vitest.
 * Estes testes codificam o comportamento validado em produção.
 * Qualquer refatoração que quebre estes testes está errada até prova em contrário.
 *
 * Execute: npm test (em packages/core)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

import {
  parseAmt,
  parseOFX,
  decodeBuffer,
  trnId,
} from '../src/ofx-parser.js';
import { computeDays, balanceAt, balanceBefore } from '../src/balance-engine.js';
import { parseSystemRows, dayIntegrity } from '../src/system-xls-parser.js';
import { matchEngine, groupEngine } from '../src/match-engine.js';

// ---------------------------------------------------------------------------
// Setup — caminhos relativos à pasta fixtures de referência
// ---------------------------------------------------------------------------
const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '../../../reference/fixtures');
const ofxRaw = decodeBuffer(readFileSync(join(fixturesDir, 'banco-teste.ofx')));

// ---------------------------------------------------------------------------
// OFX Parser
// ---------------------------------------------------------------------------

describe('parseAmt: formatos BR e US', () => {
  it('1500,00 → 1500', () => expect(parseAmt('1500,00')).toBe(1500));
  it('-1.234,56 → -1234.56', () => expect(parseAmt('-1.234,56')).toBe(-1234.56));
  it('1,234.56 → 1234.56', () => expect(parseAmt('1,234.56')).toBe(1234.56));
  it('89.90 → 89.9', () => expect(parseAmt('89.90')).toBe(89.9));
});

describe('parseOFX: SGML sem fechamento, conta e LEDGERBAL', () => {
  const st = parseOFX(ofxRaw, 'banco-teste.ofx')[0]!;

  it('4 transações', () => expect(st.trns.length).toBe(4));
  it('bankId = 0341', () => expect(st.bankId).toBe('0341'));
  it('ledger = 2069.35', () => expect(st.ledger).toBe(2069.35));
  it('ledgerDt = 2026-06-05', () => expect(st.ledgerDt).toBe('2026-06-05'));
  it('trns[2].amount = -1200 (vírgula decimal)', () => expect(st.trns[2]!.amount).toBe(-1200));
  it('trns[0].date = 2026-06-01 (DTPOSTED com timezone)', () => expect(st.trns[0]!.date).toBe('2026-06-01'));
});

// ---------------------------------------------------------------------------
// Balance Engine
// ---------------------------------------------------------------------------

describe('computeDays: âncora no LEDGERBAL fecha centavo a centavo', () => {
  const st = parseOFX(ofxRaw)[0]!;
  const acc = {
    trns: st.trns.map(t => ({ ...t, id: trnId(t) })),
    ledger: st.ledger,
    ledgerDt: st.ledgerDt,
  };
  const C = computeDays(acc);

  it('anchored = true', () => expect(C.anchored).toBe(true));
  it('opening = 2000', () => expect(C.opening).toBe(2000));
  it('fechamento == LEDGERBAL (2069.35)', () => expect(C.days.at(-1)!.close).toBe(2069.35));
  it('saldo intra-dia dia[0]', () =>
    expect(C.days[0]!.items.map(i => i.run)).toEqual([3500, 3179.45]));
  it('balanceBefore 2026-06-03 = 3179.45', () =>
    expect(balanceBefore(C, '2026-06-03')).toBe(3179.45));
  it('balanceAt 2026-06-03 = 1979.45', () =>
    expect(balanceAt(C, '2026-06-03')).toBe(1979.45));
});

describe('computeDays: sem LEDGERBAL → relativo a partir de 0', () => {
  const st = parseOFX(ofxRaw)[0]!;
  const C = computeDays({ trns: st.trns, ledger: null, ledgerDt: '' });

  it('anchored = false', () => expect(C.anchored).toBe(false));
  it('opening = 0', () => expect(C.opening).toBe(0));
});

// ---------------------------------------------------------------------------
// System XLS Parser
// ---------------------------------------------------------------------------

describe('parseSystemRows: layout do export real', () => {
  const wb = XLSX.read(readFileSync(join(fixturesDir, 'extrato-sistema-sintetico.xls')), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]]!, { header: 1, defval: '' });
  const sys = parseSystemRows(rows as any[][], 'sint.xls');

  it('2 dias', () => expect(sys.days.size).toBe(2));
  it('4 itens', () => expect(sys.items.length).toBe(4));

  const d1 = sys.days.get('2026-06-01')!;
  it('d1.saldoAnt = 2000', () => expect(d1.saldoAnt).toBe(2000));
  it('d1.saldoDia = 3179.45', () => expect(d1.saldoDia).toBe(3179.45));
  it('d1 integrity ok', () => expect(dayIntegrity(d1).ok).toBe(true));
  it('items[1].value = -320.55 (sinal: crédito − débito)', () =>
    expect(sys.items[1]!.value).toBe(-320.55));
});

// ---------------------------------------------------------------------------
// Match Engine
// ---------------------------------------------------------------------------

describe('matchEngine: pares, só-banco, só-sistema e dupla contagem', () => {
  const wb = XLSX.read(readFileSync(join(fixturesDir, 'extrato-sistema-sintetico.xls')), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]]!, { header: 1, defval: '' });
  const sys = parseSystemRows(rows as any[][]);
  const st = parseOFX(ofxRaw)[0]!;
  const trns = st.trns.map(t => ({ ...t, id: trnId(t) }));
  const M = matchEngine(sys.items, trns, new Set(sys.days.keys()), 0);

  it('3 pares (1500, -320.55, -1200)', () => expect(M.pairs.length).toBe(3));
  it('1 só-sistema (-50 lançado errado)', () => expect(M.onlySys.length).toBe(1));
  it('0 só-banco (89.90 é dia 05/06, fora dos dias do sistema)', () =>
    expect(M.onlyBank.length).toBe(0));

  it('dupla contagem: 2 iguais no sistema × 1 no banco → 1 par + 1 só-sistema', () => {
    const dup = [
      { date: '2026-06-01', value: -100, sid: 'a', desc: '', deb: 100, cred: 0, obs: '', doc: '', sysConc: false },
      { date: '2026-06-01', value: -100, sid: 'b', desc: '', deb: 100, cred: 0, obs: '', doc: '', sysConc: false },
    ];
    const D = matchEngine(dup, [{ id: 'x', fitid: 'x', type: '', date: '2026-06-01', amount: -100, memo: '', name: '', check: '' }], new Set(['2026-06-01']), 0);
    expect(D.pairs.length).toBe(1);
    expect(D.onlySys.length).toBe(1);
  });

  it('tolerância de data: distância 1 dia, tolerance=1', () => {
    const T = matchEngine(
      [{ date: '2026-06-02', value: -1200, sid: 'c', desc: '', deb: 1200, cred: 0, obs: '', doc: '', sysConc: false }],
      trns,
      new Set(['2026-06-02']),
      1,
    );
    expect(T.pairs.length).toBe(1);
    expect(T.pairs[0]!.dd).toBe(1);
  });

  it('groupMaxN=0 mantém groups:[] (backward compatible)', () => {
    expect(M.groups).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// groupEngine — composição N:1
// ---------------------------------------------------------------------------

const mkSys = (date: string, value: number, sid: string) =>
  ({ date, value, sid, desc: '', deb: value > 0 ? value : 0, cred: value < 0 ? -value : 0, obs: '', doc: '', sysConc: false } as const);

const mkOfx = (id: string, date: string, amount: number) =>
  ({ id, fitid: id, type: '', date, amount, memo: '', name: '', check: '' } as const);

describe('groupEngine: composição N:1', () => {
  it('2 itens sistema → 1 banco (soma exata)', () => {
    const result = groupEngine(
      {
        pairs: [],
        groups: [],
        onlySys: [mkSys('2026-06-01', 300, 's1'), mkSys('2026-06-01', 200, 's2')],
        onlyBank: [mkOfx('b1', '2026-06-01', 500)],
      },
      2,
      7,
    );
    expect(result.groups.length).toBe(1);
    expect(result.groups[0]!.sys.length).toBe(2);
    expect(result.groups[0]!.sumSys).toBe(500);
    expect(result.onlySys.length).toBe(0);
    expect(result.onlyBank.length).toBe(0);
  });

  it('3 itens → 1 banco dentro da janela', () => {
    const result = groupEngine(
      {
        pairs: [],
        groups: [],
        onlySys: [
          mkSys('2026-06-01', 300, 's1'),
          mkSys('2026-06-02', 200, 's2'),
          mkSys('2026-06-05', 100, 's3'),
        ],
        onlyBank: [mkOfx('b1', '2026-06-03', 600)],
      },
      3,
      7,
    );
    expect(result.groups.length).toBe(1);
    expect(result.groups[0]!.sys.length).toBe(3);
    expect(result.groups[0]!.sumSys).toBe(600);
    expect(result.groups[0]!.maxWindow).toBe(2); // s3 está a 2d de 06-03
    expect(result.onlySys.length).toBe(0);
  });

  it('item além da janela NÃO entra no grupo', () => {
    const result = groupEngine(
      {
        pairs: [],
        groups: [],
        onlySys: [mkSys('2026-06-01', 300, 's1'), mkSys('2026-06-10', 200, 's2')],
        onlyBank: [mkOfx('b1', '2026-06-02', 500)],
      },
      3,
      3, // janela 3 dias — 2026-06-10 está a 8 dias
    );
    expect(result.groups.length).toBe(0);
    expect(result.onlySys.length).toBe(2);
    expect(result.onlyBank.length).toBe(1);
  });

  it('1:1 tem prioridade — grupo não se forma com itens já casados', () => {
    // 1:1 casa {value:500} com b1 e {value:300} com b2; só {value:200} sobra
    const G = matchEngine(
      [mkSys('2026-06-01', 500, 'c'), mkSys('2026-06-01', 300, 'a'), mkSys('2026-06-01', 200, 'b')],
      [mkOfx('b1', '2026-06-01', 500), mkOfx('b2', '2026-06-01', 300)],
      new Set(['2026-06-01']),
      0,
      2,
      7,
    );
    expect(G.pairs.length).toBe(2);
    expect(G.groups.length).toBe(0);   // onlyBank vazio → groupEngine não tem o que casar
    expect(G.onlySys.length).toBe(1);  // {value:200} sem par
  });

  it('dois grupos independentes no mesmo resultado', () => {
    const result = groupEngine(
      {
        pairs: [],
        groups: [],
        onlySys: [
          mkSys('2026-06-01', 100, 's1'),
          mkSys('2026-06-01', 200, 's2'),
          mkSys('2026-06-01', 150, 's3'),
          mkSys('2026-06-01', 250, 's4'),
        ],
        onlyBank: [
          mkOfx('b1', '2026-06-01', 300),
          mkOfx('b2', '2026-06-01', 400),
        ],
      },
      2,
      7,
    );
    expect(result.groups.length).toBe(2);
    expect(result.onlySys.length).toBe(0);
    expect(result.onlyBank.length).toBe(0);
    const sums = result.groups.map(g => g.sumSys).sort((a, b) => a - b);
    expect(sums).toEqual([300, 400]);
  });
});
