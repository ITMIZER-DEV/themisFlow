/**
 * TransactionTable — tabela de lançamentos OFX
 * Colunas: data, tipo, descrição, débito, crédito, saldo após, conciliado
 * Débito e crédito SEMPRE em colunas separadas (design system).
 * R9 — Saldo intra-dia (run) fixo; filtros não alteram.
 */
import { useBankStore, acctKey } from '../../stores/bankStore';
import { useConcilStore } from '../../stores/concilStore';
import { exportLancamentosCSV, downloadCSV } from '../../lib/csv';
import type { OFXTransaction } from '@themisflow/core';

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(v));

const fmtDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

type Props = {
  items: (OFXTransaction & { id?: string; run?: number })[];
  selectedDate?: string | null;
  dateRangeLabel?: string;
};

export function TransactionTable({ items, selectedDate, dateRangeLabel }: Props) {
  const acct = useBankStore(s => s.activeAccount());
  const { isConc, toggle, ensureLoaded } = useConcilStore();

  if (!items.length) return (
    <div className="empty-state">
      <span className="empty-state-title">Nenhum lançamento</span>
      <span className="empty-state-sub">Nenhum lançamento no período selecionado.</span>
    </div>
  );

  const key = acct ? acctKey(acct) : '';

  const handleToggle = async (fitid: string) => {
    if (!key) return;
    await ensureLoaded(key);
    await toggle(key, fitid);
  };

  const handleExportCSV = () => {
    if (!acct || !key) return;
    void (async () => {
      await ensureLoaded(key);
      const marks = useConcilStore.getState().marks.get(key) ?? new Set<string>();
      const csv = exportLancamentosCSV(acct.trnsWithId, marks, key);
      downloadCSV(csv, `lancamentos-${acct.bankId}-${acct.acctId}.csv`);
    })();
  };

  const concCount = key ? useConcilStore.getState().countConc(key) : 0;

  return (
    <div className="transactions-section fade-in-up">
      <div className="transactions-header">
        <span className="transactions-title">
          {dateRangeLabel
            ? dateRangeLabel
            : selectedDate
              ? `Lançamentos — ${selectedDate.split('-').reverse().join('/')}`
              : 'Todos os lançamentos'}
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {concCount > 0 && (
            <span className="tab-badge tab-badge-teal">
              ✓ {concCount} conc.
            </span>
          )}
          <button
            id="btn-export-lancamentos"
            className="btn btn-ghost"
            onClick={handleExportCSV}
            title="Exportar CSV para Excel"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7,10 12,15 17,10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            CSV
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="trn-table" aria-label="Tabela de lançamentos bancários">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Descrição</th>
              <th className="right">Débito</th>
              <th className="right">Crédito</th>
              <th className="right">Saldo Após</th>
              <th style={{ textAlign: 'center' }}>Conc.</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t, i) => {
              const id = t.id ?? t.fitid;
              const conc = key ? isConc(key, id) : false;
              const desc = [t.memo, t.name].filter(Boolean).join(' — ') || t.fitid;
              return (
                <tr key={id || i} style={conc ? { opacity: 0.55 } : undefined}>
                  <td className="date-cell mono-cell">{fmtDate(t.date)}</td>
                  <td className="mono-cell" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
                    {t.type || '—'}
                  </td>
                  <td className="memo-cell" title={desc}>{desc}</td>
                  <td className="deb-cell">
                    {t.amount < 0 ? fmtBRL(t.amount) : ''}
                  </td>
                  <td className="cred-cell">
                    {t.amount >= 0 ? fmtBRL(t.amount) : ''}
                  </td>
                  <td className="saldo-cell">
                    {t.run != null
                      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.run)
                      : '—'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className={`conc-badge${conc ? ' conc-ok' : ''}`}
                      onClick={() => void handleToggle(id)}
                      title={conc ? 'Remover conciliação' : 'Marcar como conciliado'}
                      aria-label={`Conciliação de ${desc}: ${conc ? 'conciliado' : 'pendente'}`}
                      id={`conc-btn-${id}`}
                    >
                      {conc && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
