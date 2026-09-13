/**
 * Parser do relatório "Extrato de Conciliação Bancária" do sistema (export .xls/.xlsx).
 * Entrada: rows = matriz de células (ex.: XLSX.utils.sheet_to_json(ws, {header:1, defval:''})).
 *
 * R10 — Mapeamento por NOME de coluna, nunca por posição.
 * R11 — Linha de dia: Descrição = "DD/MM/AAAA - <banco...>", com totais e saldos.
 * R12 — Sinal do sistema: value = crédito − débito (alinha com R6 do OFX).
 * R13 — Integridade: se Σitens ≠ totais do cabeçalho do dia (>0,01), sinalizar "export parcial".
 * R14 — .xls legado (BIFF8) e .xlsx: ler via SheetJS XLSX.read(ArrayBuffer).
 */
import { r2, parseAmt } from './ofx-parser.js';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface SystemItem {
  sid: string;       // identificador local "sys0", "sys1", …
  date: string;      // ISO YYYY-MM-DD
  desc: string;
  deb: number;       // valor do débito (positivo)
  cred: number;      // valor do crédito (positivo)
  value: number;     // crédito − débito (sinal OFX: crédito +, débito −)
  obs: string;
  doc: string;       // CPF/CNPJ
  sysConc: boolean;  // marcado como conciliado no próprio export do sistema
}

export interface SystemDay {
  date: string;
  bank: string;      // identificação do banco/agência
  saldoAnt: number;
  totDeb: number;
  totCred: number;
  saldoDia: number;
  items: SystemItem[];
}

export interface SystemStatement {
  file: string;
  days: Map<string, SystemDay>;
  items: SystemItem[];
}

export interface IntegrityResult {
  ok: boolean;
  sumCred: number;
  sumDeb: number;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

type ColMap = {
  desc?: number;
  conc?: number;
  saldoAnt?: number;
  deb?: number;
  cred?: number;
  saldoDia?: number;
  obs?: number;
  doc?: number;
};

type RawCell = string | number | boolean | null | undefined;

// ---------------------------------------------------------------------------
// parseSystemRows
// ---------------------------------------------------------------------------

export function parseSystemRows(rows: RawCell[][], fname = ''): SystemStatement {
  // R10 — Localizar linha de cabeçalho pela presença de "Descrição"
  let hi = -1;
  const col: ColMap = {};

  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i]!;
    const low = row.map(c => String(c ?? '').toLowerCase());
    if (low.findIndex(c => c.includes('descri')) >= 0) {
      hi = i;
      row.forEach((c, j) => {
        const s = String(c ?? '').toLowerCase();
        if      (s.includes('concil'))                                        col.conc = j;
        else if (s.includes('descri'))                                        col.desc = j;
        else if (s.includes('anterior'))                                      col.saldoAnt = j;
        else if ((s.includes('débito') || s.includes('debito')) && !s.includes('c/c')) col.deb = j;
        else if ((s.includes('crédito') || s.includes('credito')) && !s.includes('c/c')) col.cred = j;
        else if (s.includes('saldo dia') || s.includes('saldo do dia'))       col.saldoDia = j;
        else if (s.includes('observa'))                                       col.obs = j;
        else if (s.includes('cpf') || s.includes('cnpj'))                    col.doc = j;
      });
      break;
    }
  }

  if (hi < 0 || col.desc == null) {
    throw new Error('layout não reconhecido: cabeçalho com coluna "Descrição" não encontrado');
  }

  const numv = (v: RawCell): number => {
    if (v === '' || v == null) return 0;
    if (typeof v === 'number') return r2(v);
    const n = parseAmt(String(v));
    return n == null ? 0 : n;
  };

  const reDay = /^\s*(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(.*)\s*$/;
  const days = new Map<string, SystemDay>();
  let cur: SystemDay | null = null;
  const items: SystemItem[] = [];

  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i]!;
    const desc = String(row[col.desc!] ?? '');
    const m = desc.match(reDay);

    if (m) {
      // R11 — Linha de dia
      const date = `${m[3]}-${m[2]}-${m[1]}`;
      cur = {
        date,
        bank: (m[4] ?? '').trim(),
        saldoAnt:  numv(col.saldoAnt != null ? row[col.saldoAnt] : null),
        totDeb:    numv(col.deb      != null ? row[col.deb]      : null),
        totCred:   numv(col.cred     != null ? row[col.cred]     : null),
        saldoDia:  numv(col.saldoDia != null ? row[col.saldoDia] : null),
        items: [],
      };
      days.set(date, cur);
      continue;
    }

    if (!cur) continue;

    const deb  = numv(col.deb  != null ? row[col.deb]  : null);
    const cred = numv(col.cred != null ? row[col.cred] : null);
    if (!deb && !cred) continue;

    // R12 — sinal: value = crédito − débito
    const it: SystemItem = {
      date:    cur.date,
      desc:    desc.trim() || '(sem descrição)',
      deb:     r2(deb),
      cred:    r2(cred),
      value:   r2(cred - deb),
      obs:     String(col.obs != null ? (row[col.obs] ?? '') : '').trim(),
      doc:     String(col.doc != null ? (row[col.doc] ?? '') : '').trim(),
      sysConc: col.conc != null && String(row[col.conc] ?? '').trim() !== '',
      sid:     'sys' + items.length,
    };

    cur.items.push(it);
    items.push(it);
  }

  if (!items.length) {
    throw new Error('nenhum lançamento encontrado no arquivo do sistema');
  }

  return { file: fname, days, items };
}

// ---------------------------------------------------------------------------
// dayIntegrity — R13
// ---------------------------------------------------------------------------

/** R13 — Integridade: soma dos itens do dia deve bater com os totais do cabeçalho (tolerância 0,01). */
export function dayIntegrity(day: SystemDay): IntegrityResult {
  const sumCred = r2(day.items.reduce((s, i) => s + i.cred, 0));
  const sumDeb  = r2(day.items.reduce((s, i) => s + i.deb,  0));
  return {
    sumCred,
    sumDeb,
    ok: Math.abs(sumCred - day.totCred) <= 0.01 && Math.abs(sumDeb - day.totDeb) <= 0.01,
  };
}
