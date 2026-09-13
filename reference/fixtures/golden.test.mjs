/**
 * Golden tests do núcleo — DEVEM passar sempre: `node --test reference/fixtures/`
 * Codificam o comportamento validado em produção. Qualquer refatoração que
 * quebre estes testes está errada até prova em contrário.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOFX, decodeBuffer, parseAmt, trnId } from '../core/ofx-parser.mjs';
import { computeDays, balanceAt, balanceBefore } from '../core/balance-engine.mjs';
import { parseSystemRows, dayIntegrity } from '../core/system-xls-parser.mjs';
import { matchEngine } from '../core/match-engine.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ofxRaw = decodeBuffer(readFileSync(join(here, 'banco-teste.ofx')));

test('parseAmt: formatos BR e US', () => {
  assert.equal(parseAmt('1500,00'), 1500);
  assert.equal(parseAmt('-1.234,56'), -1234.56);
  assert.equal(parseAmt('1,234.56'), 1234.56);
  assert.equal(parseAmt('89.90'), 89.9);
});

test('parseOFX: SGML sem fechamento, conta e LEDGERBAL', () => {
  const st = parseOFX(ofxRaw, 'banco-teste.ofx')[0];
  assert.equal(st.trns.length, 4);
  assert.equal(st.bankId, '0341');
  assert.equal(st.ledger, 2069.35);
  assert.equal(st.ledgerDt, '2026-06-05');
  assert.equal(st.trns[2].amount, -1200);            // "1.200,00" com vírgula decimal
  assert.equal(st.trns[0].date, '2026-06-01');       // DTPOSTED com timezone [-3:BRT]
});

test('computeDays: âncora no LEDGERBAL fecha centavo a centavo', () => {
  const st = parseOFX(ofxRaw)[0];
  const acc = { trns: st.trns.map(t => ({ ...t, id: trnId(t) })), ledger: st.ledger, ledgerDt: st.ledgerDt };
  const C = computeDays(acc);
  assert.equal(C.anchored, true);
  assert.equal(C.opening, 2000);
  assert.equal(C.days.at(-1).close, 2069.35);        // == LEDGERBAL
  assert.deepEqual(C.days[0].items.map(i => i.run), [3500, 3179.45]); // saldo intra-dia
  assert.equal(balanceBefore(C, '2026-06-03'), 3179.45);
  assert.equal(balanceAt(C, '2026-06-03'), 1979.45);
});

test('computeDays: sem LEDGERBAL → relativo a partir de 0', () => {
  const st = parseOFX(ofxRaw)[0];
  const C = computeDays({ trns: st.trns, ledger: null, ledgerDt: '' });
  assert.equal(C.anchored, false);
  assert.equal(C.opening, 0);
});

test('parseSystemRows: layout do export real (dia + itens + totais)', async () => {
  const XLSX = (await import('xlsx')).default ?? (await import('xlsx'));
  const wb = XLSX.read(readFileSync(join(here, 'extrato-sistema-sintetico.xls')), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const sys = parseSystemRows(rows, 'sint.xls');
  assert.equal(sys.days.size, 2);
  assert.equal(sys.items.length, 4);
  const d1 = sys.days.get('2026-06-01');
  assert.equal(d1.saldoAnt, 2000);
  assert.equal(d1.saldoDia, 3179.45);
  assert.equal(dayIntegrity(d1).ok, true);
  assert.equal(sys.items[1].value, -320.55);          // sinal: crédito − débito
});

test('matchEngine: pares, só-banco, só-sistema e dupla contagem', async () => {
  const XLSX = (await import('xlsx')).default ?? (await import('xlsx'));
  const wb = XLSX.read(readFileSync(join(here, 'extrato-sistema-sintetico.xls')), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const sys = parseSystemRows(rows);
  const st = parseOFX(ofxRaw)[0];
  const trns = st.trns.map(t => ({ ...t, id: trnId(t) }));
  const M = matchEngine(sys.items, trns, new Set(sys.days.keys()), 0);
  assert.equal(M.pairs.length, 3);                    // 1500, -320.55, -1200
  assert.equal(M.onlySys.length, 1);                  // -50 lançado errado
  assert.equal(M.onlyBank.length, 0);                 // 89.90 é dia 05/06, fora dos dias do sistema
  // dupla contagem: 2 itens iguais no sistema × 1 no banco → 1 par + 1 só-sistema
  const dup = [
    { date: '2026-06-01', value: -100, sid: 'a' },
    { date: '2026-06-01', value: -100, sid: 'b' }
  ];
  const D = matchEngine(dup, [{ id: 'x', date: '2026-06-01', amount: -100 }], new Set(['2026-06-01']), 0);
  assert.equal(D.pairs.length, 1);
  assert.equal(D.onlySys.length, 1);
  // tolerância de data
  const T = matchEngine([{ date: '2026-06-02', value: -1200, sid: 'c' }], trns, new Set(['2026-06-02']), 1);
  assert.equal(T.pairs.length, 1);
  assert.equal(T.pairs[0].dd, 1);
});
