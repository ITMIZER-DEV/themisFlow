/**
 * CompareTab — Aba Comparativo
 * Confronto banco × sistema: saldos por dia + matching + divergências.
 * R20 — "Marcar casados" aplica pares do matching sobre a marcação manual.
 */
import { useState, useEffect } from 'react';
import { useBankStore, acctKey, type AccountEntry } from '../../stores/bankStore';
import { useSystemStore } from '../../stores/systemStore';
import { useMatchStore } from '../../stores/matchStore';
import { useConcilStore } from '../../stores/concilStore';
import { SaldoComparison } from './SaldoComparison';
import { PairsList, GroupsList, OnlyBankList, OnlySysList } from './MatchLists';
import { exportComparativoCSV, downloadCSV } from '../../lib/csv';

export function CompareTab() {
  const accounts       = useBankStore(s => s.accounts);
  const globalKey      = useBankStore(s => s.selectedKey);

  // Seletor de banco local — independente do BankTab
  const [compareKey, setCompareKey] = useState<string | null>(null);

  // Sincroniza com o selectedKey quando muda (mas deixa o usuário sobrescrever)
  useEffect(() => {
    setCompareKey(prev => prev && accounts.has(prev) ? prev : (globalKey ?? null));
  }, [globalKey, accounts]);

  const activeAccount: AccountEntry | null = compareKey ? (accounts.get(compareKey) ?? null) : null;
  const statement      = useSystemStore(s => s.statement);
  const result         = useMatchStore(s => s.result);
  const tolerance      = useMatchStore(s => s.tolerance);
  const setTolerance   = useMatchStore(s => s.setTolerance);
  const groupMaxN      = useMatchStore(s => s.groupMaxN);
  const groupWindow    = useMatchStore(s => s.groupWindow);
  const setGroupMaxN   = useMatchStore(s => s.setGroupMaxN);
  const setGroupWindow = useMatchStore(s => s.setGroupWindow);
  const runMatch       = useMatchStore(s => s.runMatch);
  const applyPairs     = useConcilStore(s => s.applyPairs);
  const ensureLoaded   = useConcilStore(s => s.ensureLoaded);

  // ── Condições de exibição ────────────────────────────────────
  const hasBank   = !!activeAccount;
  const hasSystem = !!statement;
  const hasResult = !!result;

  const divergencias = result
    ? result.onlySys.length + result.onlyBank.length
    : null;

  const totalResolvidos = result
    ? result.pairs.length + result.groups.length
    : 0;

  // ── Aplicar pares e grupos como conciliados (R20) ────────────
  const handleApplyPairs = async () => {
    if (!result || !activeAccount) return;
    const key = acctKey(activeAccount);
    await ensureLoaded(key);
    await applyPairs(key, result.pairs, result.groups);
  };

  // ── Exportar CSV comparativo ──────────────────────────────────
  const handleExportCSV = () => {
    if (!result) return;
    const csv = exportComparativoCSV(result);
    downloadCSV(csv, 'comparativo-themisflow.csv');
  };

  // ── Estado vazio: faltam dados ────────────────────────────────
  if (!hasBank || !hasSystem) {
    return (
      <div className="empty-state">
        <svg className="empty-state-icon" width="56" height="56" viewBox="0 0 36 36" fill="none">
          <rect x="4.5" y="13.5" width="27" height="1.5" rx="0.75" fill="var(--text-soft)" opacity="0.35" />
          <ellipse cx="11" cy="21" rx="6" ry="2" fill="var(--teal)" opacity={hasBank ? 0.7 : 0.2} />
          <ellipse cx="25" cy="21" rx="6" ry="2" fill="var(--gold)" opacity={hasSystem ? 0.7 : 0.2} />
          <rect x="17.2" y="10" width="1.6" height="17" rx="0.8" fill="var(--text-soft)" opacity="0.45" />
        </svg>
        <span className="empty-state-title">Comparativo</span>
        <span className="empty-state-sub">
          {!hasBank && !hasSystem
            ? 'Importe um extrato OFX (aba Banco) e o extrato do sistema (aba Sistema) para confrontar.'
            : !hasBank
              ? 'Importe um extrato OFX na aba Banco.'
              : 'Importe o extrato do sistema (.xls) na aba Sistema.'}
        </span>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: hasBank ? 'var(--teal)' : 'var(--muted)' }}>
            {hasBank
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
            }
            OFX {hasBank ? 'importado' : 'pendente'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: hasSystem ? 'var(--gold)' : 'var(--muted)' }}>
            {hasSystem
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
            }
            XLS {hasSystem ? 'importado' : 'pendente'}
          </div>
        </div>
      </div>
    );
  }

  const selectStyle = {
    background: 'var(--panel-alt)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
    padding: '3px 6px',
    cursor: 'pointer',
  } as const;

  return (
    <div className="fade-in-up">
      {/* Cabeçalho + ações */}
      <div className="section-header" style={{ marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: '1rem', fontFamily: 'var(--font-title)', fontWeight: 800 }}>
            Comparativo Banco × Sistema
          </h2>
          <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--muted)' }}>
            Banco: {activeAccount.bankId} · Cc {activeAccount.acctId}
            &nbsp;·&nbsp;
            Sistema: {statement.file}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Badge de divergências */}
          {divergencias !== null && (
            <span className={`tab-badge ${divergencias === 0 ? 'tab-badge-ok' : 'tab-badge-warn'}`}
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
              {divergencias === 0 ? '✓ Conciliado' : `${divergencias} divergência${divergencias !== 1 ? 's' : ''}`}
            </span>
          )}

          {/* Tolerância de data */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label htmlFor="tol-slider" style={{ fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              Tolerância:
            </label>
            <select
              id="tol-slider"
              value={tolerance}
              onChange={e => setTolerance(Number(e.target.value))}
              style={selectStyle}
              aria-label="Tolerância de data para o matching"
            >
              <option value={0}>0 dias (exato)</option>
              <option value={1}>1 dia</option>
              <option value={2}>2 dias</option>
              <option value={3}>3 dias</option>
            </select>
          </div>

          {/* Composição N:1 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label htmlFor="group-maxn" style={{ fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              Composição N:1:
            </label>
            <select
              id="group-maxn"
              value={groupMaxN}
              onChange={e => setGroupMaxN(Number(e.target.value))}
              style={selectStyle}
              aria-label="Tamanho máximo de composição N:1"
            >
              <option value={0}>OFF</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
            </select>
          </div>

          {/* Janela de datas (só quando N:1 ativo) */}
          {groupMaxN >= 2 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label htmlFor="group-window" style={{ fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                Janela:
              </label>
              <select
                id="group-window"
                value={groupWindow}
                onChange={e => setGroupWindow(Number(e.target.value))}
                style={selectStyle}
                aria-label="Janela de datas para composição"
              >
                <option value={1}>1 dia</option>
                <option value={3}>3 dias</option>
                <option value={7}>7 dias</option>
                <option value={14}>14 dias</option>
                <option value={31}>31 dias</option>
              </select>
            </div>
          )}

          <button className="btn btn-ghost" onClick={runMatch} id="btn-run-match">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-3.51" />
            </svg>
            Rerodar
          </button>

          {result && totalResolvidos > 0 && (
            <button
              className="btn btn-teal"
              onClick={() => void handleApplyPairs()}
              id="btn-apply-pairs"
              title="R20 — Marca todos os pares e grupos como conciliados"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Marcar casados ({totalResolvidos})
            </button>
          )}

          {result && (
            <button className="btn btn-ghost" onClick={handleExportCSV} id="btn-export-comparativo">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7,10 12,15 17,10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              CSV
            </button>
          )}
        </div>
      </div>

      {/* Seletor de banco (quando há mais de uma conta importada) */}
      {accounts.size > 1 && (
        <div style={{ marginBottom: 16 }}>
          <div className="section-header" style={{ marginBottom: 8 }}>
            <span className="section-title">Banco para comparar</span>
          </div>
          <div className="acct-selector">
            {[...accounts.entries()].map(([key, acct]) => (
              <button
                key={key}
                className={`acct-chip${compareKey === key ? ' selected' : ''}`}
                onClick={() => setCompareKey(key)}
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

      {/* Confronto de saldos */}
      <div className="section-header">
        <span className="section-title">Saldos por dia</span>
      </div>
      <SaldoComparison
        bank={activeAccount.dayComputed}
        system={statement}
      />

      {/* Listas do matching */}
      {hasResult && (
        <>
          <div className="section-header" style={{ marginTop: 12 }}>
            <span className="section-title">Matching de lançamentos</span>
          </div>

          {/* Só no banco */}
          <div className="section-header" style={{ marginTop: 8, marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--teal)' }}>
              Só no banco
            </span>
            <span className="tab-badge tab-badge-teal">{result!.onlyBank.length}</span>
          </div>
          <OnlyBankList items={result!.onlyBank} />

          {/* Só no sistema */}
          <div className="section-header" style={{ marginTop: 16, marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--gold)' }}>
              Só no sistema
            </span>
            <span className="tab-badge tab-badge-gold">{result!.onlySys.length}</span>
          </div>
          <OnlySysList items={result!.onlySys} />

          {/* Composições N:1 */}
          {result!.groups.length > 0 && (
            <>
              <div className="section-header" style={{ marginTop: 16, marginBottom: 8 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--teal)' }}>
                  Composições N:1
                </span>
                <span className="tab-badge tab-badge-teal">{result!.groups.length}</span>
              </div>
              <GroupsList groups={result!.groups} />
            </>
          )}

          {/* Pares casados */}
          <div className="section-header" style={{ marginTop: 16, marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--teal)' }}>
              Pares casados
            </span>
            <span className="tab-badge tab-badge-teal">{result!.pairs.length}</span>
          </div>
          <PairsList pairs={result!.pairs} />
        </>
      )}
    </div>
  );
}
