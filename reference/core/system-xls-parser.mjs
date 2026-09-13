import { r2, parseAmt } from './ofx-parser.mjs';

/**
 * Parser do relatório "Extrato de Conciliação Bancária" do sistema (export .xls).
 * Entrada: rows = matriz de células (ex.: XLSX.utils.sheet_to_json(ws, {header:1, defval:''})).
 * Layout reconhecido:
 *  - Linha de cabeçalho com coluna "Descrição" (mapeamento de colunas é POR NOME, não por posição).
 *  - Linha de dia: Descrição = "DD/MM/AAAA - <banco/agência/conta>", com Saldo Anterior,
 *    Débito (total), Crédito (total) e Saldo Dia.
 *  - Linhas de lançamento: Descrição indentada "000003 - PAGAMENTO FORNECEDOR", Débito/Crédito,
 *    Observação e CPF/CNPJ. Convenção de sinal alinhada ao OFX: value = crédito − débito.
 */
export function parseSystemRows(rows, fname = '') {
  let hi = -1; const col = {};
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const low = rows[i].map(c => String(c).toLowerCase());
    if (low.findIndex(c => c.includes('descri')) >= 0) {
      hi = i;
      rows[i].forEach((c, j) => {
        const s = String(c).toLowerCase();
        if (s.includes('concil')) col.conc = j;
        else if (s.includes('descri')) col.desc = j;
        else if (s.includes('anterior')) col.saldoAnt = j;
        else if ((s.includes('débito') || s.includes('debito')) && !s.includes('c/c')) col.deb = j;
        else if ((s.includes('crédito') || s.includes('credito')) && !s.includes('c/c')) col.cred = j;
        else if (s.includes('saldo dia') || s.includes('saldo do dia')) col.saldoDia = j;
        else if (s.includes('observa')) col.obs = j;
        else if (s.includes('cpf') || s.includes('cnpj')) col.doc = j;
      });
      break;
    }
  }
  if (hi < 0 || col.desc == null) throw new Error('layout não reconhecido: cabeçalho com coluna "Descrição" não encontrado');
  const numv = v => { if (v === '' || v == null) return 0; if (typeof v === 'number') return r2(v); const n = parseAmt(String(v)); return n == null ? 0 : n; };
  const reDay = /^\s*(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(.*)$/;
  const days = new Map(); let cur = null; const items = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i]; const desc = String(row[col.desc] ?? '');
    const m = desc.match(reDay);
    if (m) {
      const date = `${m[3]}-${m[2]}-${m[1]}`;
      cur = { date, bank: m[4].trim(), saldoAnt: numv(row[col.saldoAnt]), totDeb: numv(row[col.deb]), totCred: numv(row[col.cred]), saldoDia: numv(row[col.saldoDia]), items: [] };
      days.set(date, cur); continue;
    }
    if (!cur) continue;
    const deb = numv(col.deb != null ? row[col.deb] : 0), cred = numv(col.cred != null ? row[col.cred] : 0);
    if (!deb && !cred) continue;
    const it = {
      date: cur.date, desc: desc.trim() || '(sem descrição)', deb: r2(deb), cred: r2(cred), value: r2(cred - deb),
      obs: String(col.obs != null ? (row[col.obs] ?? '') : '').trim(),
      doc: String(col.doc != null ? (row[col.doc] ?? '') : '').trim(),
      sysConc: col.conc != null && String(row[col.conc] ?? '').trim() !== '',
      sid: 'sys' + items.length
    };
    cur.items.push(it); items.push(it);
  }
  if (!items.length) throw new Error('nenhum lançamento encontrado no arquivo do sistema');
  return { file: fname, days, items };
}

/** Integridade do export: soma dos itens do dia deve bater com os totais do cabeçalho. */
export function dayIntegrity(day) {
  const sc = r2(day.items.reduce((s, i) => s + i.cred, 0));
  const sd = r2(day.items.reduce((s, i) => s + i.deb, 0));
  return { sumCred: sc, sumDeb: sd, ok: Math.abs(sc - day.totCred) <= 0.01 && Math.abs(sd - day.totDeb) <= 0.01 };
}
