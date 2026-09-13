/**
 * BankTab — aba Banco (OFX)
 * Exibe: seletor de conta, aviso R8, gráfico de saldo, cards de dia, tabela de lançamentos.
 */
import { useState, useEffect, useMemo } from 'react';
import { useBankStore, acctKey } from '../../stores/bankStore';
import { useConcilStore } from '../../stores/concilStore';
import { useThemeStore } from '../../stores/themeStore';
import { OFXDropzone } from './OFXDropzone';
import { DayCards } from './DayCards';
import { BalanceChart } from './BalanceChart';
import { TransactionTable } from './TransactionTable';

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtDateLong = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// dateInputStyle é montado dentro do componente para pegar o tema dinâmico

export function BankTab() {
  const { theme } = useThemeStore();

  const dateInputStyle: React.CSSProperties = {
    background: 'var(--panel-alt)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
    padding: '3px 8px',
    cursor: 'pointer',
    colorScheme: theme,
  };

  const accounts = useBankStore(s => s.accounts);
  const selectedKey = useBankStore(s => s.selectedKey);
  const selectAccount = useBankStore(s => s.selectAccount);
  const activeAccount = useBankStore(s => s.activeAccount());
  const ensureLoaded = useConcilStore(s => s.ensureLoaded);

  // Intervalo de datas (between)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Calcular min/max de datas da conta ativa
  const { minDate, maxDate } = useMemo(() => {
    if (!activeAccount || !activeAccount.trnsWithId.length) return { minDate: '', maxDate: '' };
    let min = '9999-12-31', max = '0000-01-01';
    for (const t of activeAccount.trnsWithId) {
      if (t.date < min) min = t.date;
      if (t.date > max) max = t.date;
    }
    return { minDate: min, maxDate: max };
  }, [activeAccount]);

  // Sincronizar range quando a conta muda
  useEffect(() => {
    setDateFrom(minDate);
    setDateTo(maxDate);
  }, [minDate, maxDate]);

  // Carregar marcações de conciliação para a conta ativa
  useEffect(() => {
    if (activeAccount) {
      const key = acctKey(activeAccount);
      void ensureLoaded(key);
    }
  }, [selectedKey, activeAccount, ensureLoaded]);

  const hasAccounts = accounts.size > 0;

  const isFullRange = dateFrom === minDate && dateTo === maxDate;

  // Filtrar lançamentos pelo intervalo de datas
  const visibleItems = useMemo(() => {
    if (!activeAccount) return [];
    const from = dateFrom || minDate;
    const to = dateTo || maxDate;
    if (!from && !to) return activeAccount.trnsWithId as any[];
    return activeAccount.trnsWithId.filter(t =>
      (!from || t.date >= from) && (!to || t.date <= to)
    ) as any[];
  }, [activeAccount, dateFrom, dateTo, minDate, maxDate]);

  const dateRangeLabel = (dateFrom || dateTo)
    ? `${dateFrom ? fmtDateLong(dateFrom) : '…'} → ${dateTo ? fmtDateLong(dateTo) : '…'} (${visibleItems.length} lançamentos)`
    : undefined;

  return (
    <div>
      {/* Dropzone sempre visível no topo */}
      <OFXDropzone />

      {hasAccounts && (
        <div style={{ marginTop: 24 }} className="fade-in-up">
          {/* Seletor de conta (multi-conta) */}
          {accounts.size > 1 && (
            <div>
              <div className="section-header">
                <span className="section-title">Conta bancária</span>
              </div>
              <div className="acct-selector">
                {[...accounts.entries()].map(([key, acct]) => (
                  <button
                    key={key}
                    id={`acct-chip-${key}`}
                    className={`acct-chip${selectedKey === key ? ' selected' : ''}`}
                    onClick={() => selectAccount(key)}
                    aria-pressed={selectedKey === key}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="5" width="20" height="14" rx="2" />
                      <line x1="2" y1="10" x2="22" y2="10" />
                    </svg>
                    Banco {acct.bankId} · Ag {acct.branch || '—'} · Cc {acct.acctId}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeAccount && (
            <>
              {/* Alerta R8 — saldo relativo */}
              {!activeAccount.dayComputed.anchored && (
                <div className="alert alert-warn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>
                    <strong>Saldos relativos:</strong> este extrato não contém LEDGERBAL. Os saldos mostrados são variações relativas a partir de zero, não valores absolutos.
                  </span>
                </div>
              )}

              {/* Saldo info bar */}
              <div className="section-header" style={{ marginBottom: 12 }}>
                <div>
                  <span className="section-title">
                    Banco {activeAccount.bankId}
                    {activeAccount.branch ? ` · Ag ${activeAccount.branch}` : ''}
                    {' · '}Cc {activeAccount.acctId}
                  </span>
                  <div style={{ marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {activeAccount.dayComputed.opening !== null && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                        Abertura: <span style={{ color: 'var(--text)' }}>{fmtBRL(activeAccount.dayComputed.opening)}</span>
                      </span>
                    )}
                    {activeAccount.ledger !== null && (
                      <span className="saldo-pill">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                        LEDGERBAL {fmtBRL(activeAccount.ledger)}
                        {activeAccount.ledgerDt && ` · ${fmtDateLong(activeAccount.ledgerDt)}`}
                      </span>
                    )}
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                      {activeAccount.trnsWithId.length} lançamentos no total
                    </span>
                  </div>
                </div>
              </div>

              {/* Gráfico SVG */}
              <BalanceChart
                days={activeAccount.dayComputed.days}
                anchored={activeAccount.dayComputed.anchored}
              />

              {/* Cards de dia — display apenas, sem filtro por clique */}
              <div className="section-header">
                <span className="section-title">Dias do extrato</span>
              </div>
              <DayCards
                days={activeAccount.dayComputed.days}
                selectedDate={null}
                onSelect={() => {}}
              />

              {/* Filtro por período (between) */}
              <div className="section-header" style={{ marginTop: 12 }}>
                <span className="section-title">Lançamentos</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>De</label>
                  <input
                    type="date"
                    value={dateFrom}
                    min={minDate}
                    max={dateTo || maxDate}
                    onChange={e => setDateFrom(e.target.value)}
                    style={dateInputStyle}
                  />
                  <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>até</label>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || minDate}
                    max={maxDate}
                    onChange={e => setDateTo(e.target.value)}
                    style={dateInputStyle}
                  />
                  {!isFullRange && (
                    <button
                      className="btn btn-ghost"
                      onClick={() => { setDateFrom(minDate); setDateTo(maxDate); }}
                      style={{ fontSize: '0.7rem', padding: '3px 10px' }}
                    >
                      Limpar filtro
                    </button>
                  )}
                </div>
              </div>

              {/* Tabela de lançamentos */}
              <TransactionTable
                items={visibleItems}
                dateRangeLabel={dateRangeLabel}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
