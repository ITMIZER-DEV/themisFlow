/**
 * lib/csv.ts — Exports CSV em formato Excel Brasil
 * ; separador, BOM UTF-8, decimal vírgula.
 *
 * Critério de aceite 6: CSV abre correto no Excel BR sem ajuste.
 */
import type { OFXTransaction, MatchResult } from '@themisflow/core';

const BOM = '\uFEFF';
const SEP = ';';

function fmtBR(v: number): string {
  return v.toFixed(2).replace('.', ',');
}

function fmtDate(d: string): string {
  // YYYY-MM-DD → DD/MM/AAAA
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function row(cells: (string | number)[]): string {
  return cells.map(c => {
    const s = String(c);
    // Escapar ponto e vírgula e aspas
    if (s.includes(SEP) || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }).join(SEP);
}

/**
 * Export de lançamentos OFX com status de conciliação.
 */
export function exportLancamentosCSV(
  trns: (OFXTransaction & { id?: string })[],
  conciliados: Set<string>,
  _acctKey: string,
): string {
  const header = row(['Data', 'Tipo', 'FITID', 'Descrição', 'Débito', 'Crédito', 'Saldo Após', 'Conciliado']);
  const linhas = trns.map(t => {
    const id = t.id ?? t.fitid;
    const conc = conciliados.has(id) ? 'SIM' : 'NÃO';
    const deb = t.amount < 0 ? fmtBR(Math.abs(t.amount)) : '';
    const cred = t.amount >= 0 ? fmtBR(t.amount) : '';
    const saldoApos = t.run != null ? fmtBR(t.run) : '';
    const desc = [t.memo, t.name].filter(Boolean).join(' — ');
    return row([fmtDate(t.date), t.type, t.fitid, desc, deb, cred, saldoApos, conc]);
  });
  return BOM + [header, ...linhas].join('\n') + '\n';
}

/**
 * Export do comparativo: pares, só-banco, só-sistema.
 */
export function exportComparativoCSV(result: MatchResult): string {
  const header = row([
    'Status',
    'Data Sistema', 'Descrição Sistema', 'Débito Sist', 'Crédito Sist',
    'Data Banco', 'Memo Banco', 'Valor Banco',
    'Distância Dias',
  ]);

  const linhas: string[] = [];

  for (const p of result.pairs) {
    const { sys, ofx, dd } = p;
    const deb = sys.value < 0 ? fmtBR(Math.abs(sys.value)) : '';
    const cred = sys.value >= 0 ? fmtBR(sys.value) : '';
    linhas.push(row([
      'CASADO',
      fmtDate(sys.date), sys.desc, deb, cred,
      fmtDate(ofx.date), [ofx.memo, ofx.name].filter(Boolean).join(' — '), fmtBR(ofx.amount),
      String(dd),
    ]));
  }

  for (const s of result.onlySys) {
    const deb = s.value < 0 ? fmtBR(Math.abs(s.value)) : '';
    const cred = s.value >= 0 ? fmtBR(s.value) : '';
    linhas.push(row([
      'SO_SISTEMA',
      fmtDate(s.date), s.desc, deb, cred,
      '', '', '', '',
    ]));
  }

  for (const b of result.onlyBank) {
    const amt = fmtBR(b.amount);
    linhas.push(row([
      'SO_BANCO',
      '', '', '', '',
      fmtDate(b.date), [b.memo, b.name].filter(Boolean).join(' — '), amt, '',
    ]));
  }

  for (const g of result.groups) {
    const bankDesc = [g.ofx.memo, g.ofx.name].filter(Boolean).join(' — ');
    g.sys.forEach((s, i) => {
      const deb = s.value < 0 ? fmtBR(Math.abs(s.value)) : '';
      const cred = s.value >= 0 ? fmtBR(s.value) : '';
      // Banco só na primeira linha do grupo
      const bankDate = i === 0 ? fmtDate(g.ofx.date) : '';
      const bankMemo = i === 0 ? bankDesc : '';
      const bankAmt  = i === 0 ? fmtBR(g.ofx.amount) : '';
      linhas.push(row([
        'COMPOSICAO_N1',
        fmtDate(s.date), s.desc, deb, cred,
        bankDate, bankMemo, bankAmt, '',
      ]));
    });
  }

  return BOM + [header, ...linhas].join('\n') + '\n';
}

/**
 * Export do relatório de taxas por bandeira/modalidade para a contabilidade.
 */
export function exportTaxasCSV(
  resumo: {
    totais: { qtd: number; totalBruto: number; totalTaxa: number; totalLiquido: number };
    porBandeira: Array<{
      bandeira: string; modalidade: string; qtd: number;
      totalBruto: number; totalTaxa: number; totalLiquido: number; taxaEfetivaPct: number;
    }>;
  },
  periodo?: { dataInicio?: string; dataFim?: string },
): string {
  const linhas: string[] = [];

  if (periodo?.dataInicio && periodo?.dataFim) {
    linhas.push(row([`Período: ${fmtDate(periodo.dataInicio)} a ${fmtDate(periodo.dataFim)}`]));
  }
  linhas.push(row([`Emitido em: ${new Date().toLocaleDateString('pt-BR')}`]));
  linhas.push('');

  linhas.push(row(['Bandeira', 'Modalidade', 'Qtd Transações', 'Total Bruto (R$)', 'Total Taxas (R$)', 'Taxa Efetiva %', 'Total Líquido (R$)']));

  for (const l of resumo.porBandeira) {
    linhas.push(row([
      l.bandeira, l.modalidade, l.qtd,
      fmtBR(l.totalBruto), fmtBR(l.totalTaxa),
      fmtBR(l.taxaEfetivaPct),
      fmtBR(l.totalLiquido),
    ]));
  }

  linhas.push('');
  const { totais } = resumo;
  const taxaMedia = totais.totalBruto > 0 ? (totais.totalTaxa / totais.totalBruto) * 100 : 0;
  linhas.push(row(['TOTAL', '', totais.qtd, fmtBR(totais.totalBruto), fmtBR(totais.totalTaxa), fmtBR(taxaMedia), fmtBR(totais.totalLiquido)]));

  return BOM + linhas.join('\n') + '\n';
}

/** Dispara download de um CSV no browser. */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
