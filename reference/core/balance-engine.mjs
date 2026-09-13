import { r2 } from './ofx-parser.mjs';

/**
 * Motor de saldos diários ancorado no LEDGERBAL.
 * Regras validadas (NÃO alterar sem novo golden test):
 *  - LEDGERBAL com DTASOF >= última transação → saldo final do período; abertura = ledger − Σtodas.
 *  - LEDGERBAL com DTASOF intermediário (banco manda saldo do dia da geração) → âncora intermediária:
 *    abertura = ledger − Σ(trns com date <= DTASOF).
 *  - Sem LEDGERBAL → abertura 0, saldos RELATIVOS (anchored=false; a UI deve avisar).
 *  - Saldo corrente intra-dia (it.run) calculado lançamento a lançamento.
 * @param acc {trns: Map<id,trn>|trn[], ledger: number|null, ledgerDt: 'YYYY-MM-DD'|''}
 */
export function computeDays(acc) {
  const src = acc.trns instanceof Map ? [...acc.trns.values()] : acc.trns;
  const trns = src.filter(t => t.date && t.amount !== null)
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  if (!trns.length) return { days: [], opening: null, anchored: false, trns, total: 0 };
  const total = r2(trns.reduce((s, t) => s + t.amount, 0));
  let opening = null, anchored = false;
  if (acc.ledger !== null && acc.ledger !== undefined) {
    const lastDate = trns[trns.length - 1].date;
    if (!acc.ledgerDt || acc.ledgerDt >= lastDate) { opening = r2(acc.ledger - total); anchored = true; }
    else {
      const upTo = trns.filter(t => t.date <= acc.ledgerDt).reduce((s, t) => s + t.amount, 0);
      opening = r2(acc.ledger - upTo); anchored = true;
    }
  }
  if (opening === null) opening = 0;
  const byDay = new Map();
  for (const t of trns) {
    if (!byDay.has(t.date)) byDay.set(t.date, { date: t.date, cred: 0, deb: 0, items: [] });
    const d = byDay.get(t.date);
    if (t.amount >= 0) d.cred += t.amount; else d.deb += t.amount;
    d.items.push(t);
  }
  let run = opening;
  const days = [...byDay.values()].map(d => {
    d.cred = r2(d.cred); d.deb = r2(d.deb); d.net = r2(d.cred + d.deb);
    d.open = r2(run); run = r2(run + d.net); d.close = run;
    let r = d.open;
    for (const it of d.items) { r = r2(r + it.amount); it.run = r; }
    return d;
  });
  return { days, opening, anchored, trns, total };
}

/** Saldo de fechamento na data (inclusive). Só faz sentido absoluto se anchored. */
export const balanceAt = (C, dateISO) =>
  r2(C.opening + C.trns.filter(t => t.date <= dateISO).reduce((s, t) => s + t.amount, 0));
/** Saldo de abertura na data (exclusive). */
export const balanceBefore = (C, dateISO) =>
  r2(C.opening + C.trns.filter(t => t.date < dateISO).reduce((s, t) => s + t.amount, 0));
