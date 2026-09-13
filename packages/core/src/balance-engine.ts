/**
 * Motor de saldos diários ancorado no LEDGERBAL.
 *
 * R7 — Âncora LEDGERBAL: se DTASOF >= última transação, abertura = ledger − Σtodas.
 *       Se DTASOF intermediário, âncora intermediária: abertura = ledger − Σ(trns <= DTASOF).
 * R8 — Sem LEDGERBAL: abertura 0, anchored=false; UI DEVE avisar saldos relativos.
 * R9 — Saldo intra-dia (it.run) calculado lançamento a lançamento.
 *       Filtros de UI nunca alteram colunas de saldo — saldo é calculado sobre o universo completo.
 */
import { r2, type OFXTransaction } from './ofx-parser.js';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface DayItem extends OFXTransaction {
  run: number; // saldo corrente após este lançamento (R9)
}

export interface DayRow {
  date: string;          // ISO YYYY-MM-DD
  cred: number;          // soma créditos do dia
  deb: number;           // soma débitos do dia (negativo)
  net: number;           // cred + deb
  open: number;          // saldo de abertura do dia
  close: number;         // saldo de fechamento do dia
  items: DayItem[];
}

export interface DayComputed {
  days: DayRow[];
  opening: number;       // saldo inicial (absoluto se anchored, relativo 0 se não)
  anchored: boolean;     // true se LEDGERBAL presente e válido
  trns: OFXTransaction[];
  total: number;         // soma de todas as transações do período
}

export type AccInput = {
  trns: Map<string, OFXTransaction> | OFXTransaction[];
  ledger: number | null | undefined;
  ledgerDt: string;
};

// ---------------------------------------------------------------------------
// computeDays
// ---------------------------------------------------------------------------

export function computeDays(acc: AccInput): DayComputed {
  const src = acc.trns instanceof Map ? [...acc.trns.values()] : acc.trns;

  const trns = src
    .filter(t => t.date && t.amount !== null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (!trns.length) {
    return { days: [], opening: 0, anchored: false, trns, total: 0 };
  }

  const total = r2(trns.reduce((s, t) => s + t.amount, 0));

  let opening: number | null = null;
  let anchored = false;

  if (acc.ledger !== null && acc.ledger !== undefined) {
    const lastDate = trns[trns.length - 1]!.date;
    if (!acc.ledgerDt || acc.ledgerDt >= lastDate) {
      // LEDGERBAL no fim ou depois — âncora global (R7 caso principal)
      opening = r2(acc.ledger - total);
      anchored = true;
    } else {
      // LEDGERBAL intermediário — âncora parcial (R7 caso intermediário)
      const upTo = trns
        .filter(t => t.date <= acc.ledgerDt)
        .reduce((s, t) => s + t.amount, 0);
      opening = r2(acc.ledger - upTo);
      anchored = true;
    }
  }

  // R8 — sem LEDGERBAL: parte de 0, saldos relativos
  if (opening === null) opening = 0;

  // Agrupar por dia
  const byDay = new Map<string, { date: string; cred: number; deb: number; items: OFXTransaction[] }>();
  for (const t of trns) {
    if (!byDay.has(t.date)) {
      byDay.set(t.date, { date: t.date, cred: 0, deb: 0, items: [] });
    }
    const d = byDay.get(t.date)!;
    if (t.amount >= 0) d.cred += t.amount;
    else d.deb += t.amount;
    d.items.push(t);
  }

  // Calcular saldos progressivos e saldo intra-dia (R9)
  let run = opening;
  const days: DayRow[] = [...byDay.values()].map(d => {
    const cred = r2(d.cred);
    const deb = r2(d.deb);
    const net = r2(cred + deb);
    const open = r2(run);
    run = r2(run + net);
    const close = run;

    // Saldo intra-dia: cada item carrega run corrente após ele
    let r = open;
    const items: DayItem[] = d.items.map(it => {
      r = r2(r + it.amount);
      return { ...it, run: r };
    });

    return { date: d.date, cred, deb, net, open, close, items };
  });

  return { days, opening, anchored, trns, total };
}

// ---------------------------------------------------------------------------
// Helpers de saldo por data
// ---------------------------------------------------------------------------

/** Saldo de fechamento na data (inclusive). Só faz sentido absoluto se anchored. */
export const balanceAt = (C: DayComputed, dateISO: string): number =>
  r2(C.opening + C.trns.filter(t => t.date <= dateISO).reduce((s, t) => s + t.amount, 0));

/** Saldo de abertura na data (exclusive — i.e., fechamento do dia anterior). */
export const balanceBefore = (C: DayComputed, dateISO: string): number =>
  r2(C.opening + C.trns.filter(t => t.date < dateISO).reduce((s, t) => s + t.amount, 0));
