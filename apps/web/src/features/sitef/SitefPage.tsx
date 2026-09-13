import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
import { useSitefStore, type SitefImportResult } from '../../stores/sitefStore';
import { fmtDate } from '../../lib/date';
import { api } from '../../services/api';

// ── Helpers ────────────────────────────────────────────────────────

function fmtMoeda(v: string | number) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtCartao(c: string) {
  // Mostra apenas os 4 últimos dígitos mascarados
  if (c.length >= 4) return `••••${c.slice(-4)}`;
  return c;
}

function estadoBadge(estado: string) {
  const map: Record<string, { cls: string; label: string }> = {
    EFETIVADA:  { cls: 'tab-badge tab-badge-teal', label: 'EFETIVADA'  },
    PENDENTE:   { cls: 'tab-badge tab-badge-warn', label: 'PENDENTE'   },
    CANCELADA:  { cls: 'tab-badge', label: 'CANCELADA' },
  };
  const entry = map[estado] ?? { cls: 'tab-badge', label: estado };
  return <span className={entry.cls} style={{ fontSize: '0.65rem' }}>{entry.label}</span>;
}

// ── Sincronização Direta do ERP (pdv.vendatef) ─────────────────────

function ErpSitefSyncPanel() {
  const [empresaConfig, setEmpresaConfig] = useState<{
    erpSoftware?: string;
    erpTipoIntegracao?: 'BANCO' | 'PLANILHA';
    erpAtivo?: boolean;
  } | null>(null);

  const [dataInicio, setDataInicio] = useState('2026-06-01');
  const [dataFim, setDataFim] = useState('2026-06-05');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

  const loadLotes = useSitefStore(s => s.loadLotes);
  const loadTransacoes = useSitefStore(s => s.loadTransacoes);

  useEffect(() => {
    api.get<{ success: boolean; empresa: any }>('/empresa/public')
      .then(res => {
        if (res.data.empresa) setEmpresaConfig(res.data.empresa);
      })
      .catch(() => {});
  }, []);

  const isBancoMode = empresaConfig?.erpTipoIntegracao === 'BANCO' && empresaConfig?.erpAtivo !== false;
  if (!isBancoMode) return null;

  const handleSyncFromErp = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncSuccess(null);
    try {
      const res = await api.post<{
        success: boolean;
        total: number;
        adicionadas: number;
        ignoradas: number;
        loteId?: string;
        error?: string;
        message?: string;
      }>('/empresa/erp/sync-sitef', {
        dataInicio: dataInicio || undefined,
        dataFim: dataFim || undefined,
      });

      if (res.data.success) {
        if (res.data.total === 0) {
          setSyncSuccess(res.data.message || 'Nenhuma venda encontrada no período.');
        } else {
          setSyncSuccess(`✓ ${res.data.total} vendas TEF importadas do ERP (${res.data.adicionadas} adicionadas, ${res.data.ignoradas} já existentes).`);
          await loadLotes();
          await loadTransacoes();
        }
      } else {
        setSyncError(res.data.error || 'Falha ao sincronizar vendas TEF do ERP.');
      }
    } catch (err: unknown) {
      const serverMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const msg = serverMsg || (err instanceof Error ? err.message : 'Erro ao comunicar com o servidor.');
      setSyncError(msg);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--panel) 0%, rgba(21, 34, 56, 0.95) 100%)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: '16px 20px',
      marginBottom: 20,
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(0, 201, 177, 0.15)', border: '1px solid rgba(0, 201, 177, 0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', color: 'var(--teal)'
          }}>
            ⚡
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text)' }}>
                Sincronização Direta do ERP
              </span>
              <span style={{
                fontSize: '0.65rem', fontFamily: 'var(--font-mono)', padding: '2px 6px', borderRadius: 4,
                background: 'rgba(240, 165, 0, 0.15)', color: 'var(--gold)', border: '1px solid rgba(240, 165, 0, 0.3)', fontWeight: 700
              }}>
                VRSoftware (pdv.vendatef)
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>
              Importa vendas TEF diretamente do banco de dados do ERP ({empresaConfig?.erpSoftware || 'VRSoftware'}) para o lote de SITEF.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>De:</label>
            <input
              type="date"
              value={dataInicio}
              onChange={e => setDataInicio(e.target.value)}
              style={{
                background: 'var(--panel-alt)', border: '1px solid var(--border)', borderRadius: 4,
                color: 'var(--text)', padding: '5px 8px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)'
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Até:</label>
            <input
              type="date"
              value={dataFim}
              onChange={e => setDataFim(e.target.value)}
              style={{
                background: 'var(--panel-alt)', border: '1px solid var(--border)', borderRadius: 4,
                color: 'var(--text)', padding: '5px 8px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)'
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => void handleSyncFromErp()}
            disabled={syncing}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 'var(--radius-sm)',
              background: 'var(--teal)', border: 'none',
              color: '#0b1220', fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: '0.78rem',
              cursor: syncing ? 'not-allowed' : 'pointer',
              opacity: syncing ? 0.7 : 1,
              transition: 'all .15s',
            }}
          >
            {syncing ? 'Sincronizando...' : '⚡ Sincronizar Vendas TEF do ERP'}
          </button>
        </div>
      </div>

      {syncError && (
        <div style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 4,
          background: 'rgba(255, 93, 108, 0.12)', border: '1px solid var(--red)',
          fontSize: '0.75rem', color: 'var(--red)'
        }}>
          {syncError}
        </div>
      )}

      {syncSuccess && (
        <div style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 4,
          background: 'rgba(0, 201, 177, 0.12)', border: '1px solid var(--teal)',
          fontSize: '0.75rem', color: 'var(--teal)', fontWeight: 600
        }}>
          {syncSuccess}
        </div>
      )}
    </div>
  );
}

// ── Dropzone SITEF ─────────────────────────────────────────────────

function SitefDropzone() {
  const importXLS  = useSitefStore(s => s.importXLS);
  const importing  = useSitefStore(s => s.importing);
  const importError = useSitefStore(s => s.importError);

  const [over,   setOver]   = useState(false);
  const [result, setResult] = useState<SitefImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setResult(null);
    try {
      const r = await importXLS(file);
      setResult(r);
    } catch { /* importError é setado no store */ }
  }, [importXLS]);

  return (
    <div style={{ marginBottom: 'var(--sp-6)' }}>
      <div
        className={`dropzone dropzone-system${over ? ' over' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Área para importar planilha SITEF — clique ou arraste"
        onClick={() => !importing && inputRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => {
          e.preventDefault(); setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) void handleFile(f);
        }}
        style={{ cursor: importing ? 'wait' : 'pointer' }}
      >
        {importing ? (
          <>
            <svg className="dropzone-icon loading-pulse" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span className="dropzone-title">Enviando para o servidor...</span>
          </>
        ) : (
          <>
            <svg className="dropzone-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
              <polyline points="7 8 12 13 17 8"/>
            </svg>
            <span className="dropzone-title">Importar planilha SITEF (.xls ou .xlsx)</span>
            <span className="dropzone-sub">
              Relatório exportado do SITEF / Software Express<br/>
              Arraste o arquivo aqui ou clique para selecionar
            </span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx,.XLS,.XLSX"
          style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {importError && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <div><strong>Erro ao importar:</strong> {importError}</div>
        </div>
      )}

      {result && !importError && (
        <div className="alert alert-info" style={{ marginTop: 12 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>
          </svg>
          <div>
            <strong>{result.arquivo}</strong> — importado com sucesso.{' '}
            <span className="text-teal">{result.added} novas transações</span>
            {result.skipped > 0 && <span className="text-muted">, {result.skipped} ignoradas (duplicadas)</span>}.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tabela de lotes ────────────────────────────────────────────────

function LotesTable() {
  const lotes       = useSitefStore(s => s.lotes);
  const loading     = useSitefStore(s => s.loadingLotes);
  const setFilter   = useSitefStore(s => s.setFilter);

  if (loading && lotes.length === 0) {
    return <div className="text-muted" style={{ fontSize: '0.8rem', padding: '12px 0' }}>Carregando importações...</div>;
  }

  if (lotes.length === 0) return null;

  return (
    <div style={{ marginBottom: 'var(--sp-6)' }}>
      <div className="section-header">
        <span className="section-title">Importações</span>
        <span className="text-muted" style={{ fontSize: '0.7rem' }}>{lotes.length} lote{lotes.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="transactions-section">
        <table className="trn-table">
          <thead>
            <tr>
              <th>Arquivo</th>
              <th>Importado em</th>
              <th>Por</th>
              <th className="right">Novas</th>
              <th className="right">Ignoradas</th>
              <th className="right">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lotes.map(l => (
              <tr key={l.id}>
                <td className="mono-cell" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.arquivo}</td>
                <td className="date-cell">{fmtDate(l.importadoEm)}</td>
                <td style={{ color: 'var(--text-soft)', fontSize: '0.75rem' }}>{l.importador?.nome ?? '—'}</td>
                <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--teal)' }}>{l.adicionadas}</td>
                <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--muted)' }}>{l.ignoradas}</td>
                <td className="mono-cell" style={{ textAlign: 'right' }}>{l._count.transacoes}</td>
                <td>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                    onClick={() => void setFilter({ loteId: l.id })}
                  >
                    Ver transações
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Filtros de transações ──────────────────────────────────────────

const INPUT_STYLE: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  padding: '5px 10px',
  outline: 'none',
};

function TransacoesFilter() {
  const filter       = useSitefStore(s => s.filter);
  const setFilter    = useSitefStore(s => s.setFilter);
  const loadTrans    = useSitefStore(s => s.loadTransacoes);
  const total        = useSitefStore(s => s.totalTransacoes);
  const loadingTrans = useSitefStore(s => s.loadingTrans);

  const [draft, setDraft] = useState({
    dataInicio:      filter.dataInicio      ?? '',
    dataFim:         filter.dataFim         ?? '',
    nsuHost:         filter.nsuHost         ?? '',
    autorizacao:     filter.autorizacao     ?? '',
    estadoTransacao: filter.estadoTransacao ?? 'EFETIVADA',
  });

  useEffect(() => {
    setDraft({
      dataInicio:      filter.dataInicio      ?? '',
      dataFim:         filter.dataFim         ?? '',
      nsuHost:         filter.nsuHost         ?? '',
      autorizacao:     filter.autorizacao     ?? '',
      estadoTransacao: filter.estadoTransacao ?? 'EFETIVADA',
    });
  }, [filter.dataInicio, filter.dataFim, filter.nsuHost, filter.autorizacao, filter.estadoTransacao]);

  const patch = (k: keyof typeof draft, v: string) => setDraft(d => ({ ...d, [k]: v }));

  const handleBuscar = () => {
    void setFilter({
      dataInicio:      draft.dataInicio      || undefined,
      dataFim:         draft.dataFim         || undefined,
      nsuHost:         draft.nsuHost         || undefined,
      autorizacao:     draft.autorizacao     || undefined,
      estadoTransacao: draft.estadoTransacao || undefined,
    });
  };

  const handleLimpar = () => {
    const reset = { dataInicio: '', dataFim: '', nsuHost: '', autorizacao: '', estadoTransacao: 'EFETIVADA' };
    setDraft(reset);
    void setFilter({
      dataInicio: undefined, dataFim: undefined,
      nsuHost: undefined, autorizacao: undefined,
      estadoTransacao: 'EFETIVADA',
      loteId: undefined,
    });
  };

  const estados = ['', 'EFETIVADA', 'PENDENTE', 'CANCELADA'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
      <div className="actions-row" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: '0.7rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>De</label>
        <input
          type="date"
          value={draft.dataInicio}
          onChange={e => patch('dataInicio', e.target.value)}
          style={{ ...INPUT_STYLE, width: 140 }}
        />
        <label style={{ fontSize: '0.7rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Até</label>
        <input
          type="date"
          value={draft.dataFim}
          onChange={e => patch('dataFim', e.target.value)}
          style={{ ...INPUT_STYLE, width: 140 }}
        />

        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

        <input
          type="text"
          placeholder="NSU Host"
          value={draft.nsuHost}
          onChange={e => patch('nsuHost', e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleBuscar()}
          style={{ ...INPUT_STYLE, width: 120 }}
        />
        <input
          type="text"
          placeholder="Autorização"
          value={draft.autorizacao}
          onChange={e => patch('autorizacao', e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleBuscar()}
          style={{ ...INPUT_STYLE, width: 120 }}
        />

        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

        <select
          value={draft.estadoTransacao}
          onChange={e => patch('estadoTransacao', e.target.value)}
          style={{ ...INPUT_STYLE, fontFamily: 'var(--font-ui)', cursor: 'pointer' }}
        >
          {estados.map(e => (
            <option key={e} value={e}>{e || 'Todos os estados'}</option>
          ))}
        </select>

        <button className="btn btn-primary" style={{ fontSize: '0.75rem' }} onClick={handleBuscar} disabled={loadingTrans}>
          Buscar
        </button>
        <button className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={handleLimpar}>
          Limpar
        </button>

        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
          {loadingTrans ? 'Carregando...' : `${total.toLocaleString('pt-BR')} transações`}
        </span>
      </div>

      {filter.loteId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Filtrando por lote:</span>
          <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-soft)' }}>{filter.loteId}</span>
          <button
            className="btn btn-ghost"
            style={{ fontSize: '0.7rem', padding: '2px 8px' }}
            onClick={() => void loadTrans({ loteId: undefined, page: 1 })}
          >
            ✕ Remover
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tabela de transações ───────────────────────────────────────────

function TransacoesTable() {
  const transacoes  = useSitefStore(s => s.transacoes);
  const total       = useSitefStore(s => s.totalTransacoes);
  const filter      = useSitefStore(s => s.filter);
  const loadTrans   = useSitefStore(s => s.loadTransacoes);
  const loading     = useSitefStore(s => s.loadingTrans);

  const totalPages = Math.ceil(total / filter.limit);

  if (loading && transacoes.length === 0) {
    return (
      <div className="transactions-section">
        <div className="empty-state" style={{ padding: 'var(--sp-8)' }}>
          <span className="text-muted loading-pulse">Carregando transações...</span>
        </div>
      </div>
    );
  }

  if (transacoes.length === 0) {
    return (
      <div className="transactions-section">
        <div className="empty-state">
          <svg className="empty-state-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          <div className="empty-state-title">Nenhuma transação encontrada</div>
          <div className="empty-state-sub">Importe uma planilha SITEF ou ajuste os filtros.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="transactions-section">
      <div className="transactions-header">
        <span className="transactions-title">Transações SITEF</span>
        <span className="transactions-count">{transacoes.length} de {total.toLocaleString('pt-BR')}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="trn-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>NSU</th>
              <th>Cartão</th>
              <th>Rede</th>
              <th>Produto</th>
              <th>Parcelas</th>
              <th className="right">Valor</th>
              <th>Estado</th>
              <th>Autorização</th>
            </tr>
          </thead>
          <tbody>
            {transacoes.map(t => (
              <tr key={t.idempotencyKey}>
                <td className="date-cell">{fmtDate(t.dataDia)}</td>
                <td className="mono-cell" style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>{t.nsu}</td>
                <td className="mono-cell" style={{ fontSize: '0.72rem' }}>{fmtCartao(t.cartao)}</td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-soft)' }}>{t.rede}</td>
                <td style={{ fontSize: '0.75rem' }}>{t.tipoProduto}</td>
                <td className="mono-cell" style={{ textAlign: 'center', color: 'var(--muted)' }}>{t.nrParcelas}x</td>
                <td className="cred-cell">{fmtMoeda(t.valor)}</td>
                <td>{estadoBadge(t.estadoTransacao)}</td>
                <td className="mono-cell" style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>{t.autorizacao || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-4)', borderTop: '1px solid var(--border)' }}>
          <button
            className="btn btn-ghost"
            disabled={filter.page <= 1}
            onClick={() => void loadTrans({ page: filter.page - 1 })}
          >
            ← Anterior
          </button>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
            Página {filter.page} / {totalPages}
          </span>
          <button
            className="btn btn-ghost"
            disabled={filter.page >= totalPages}
            onClick={() => void loadTrans({ page: filter.page + 1 })}
          >
            Próxima →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────

export function SitefPage() {
  const loadLotes     = useSitefStore(s => s.loadLotes);
  const loadTransacoes = useSitefStore(s => s.loadTransacoes);
  const lotesLoaded   = useSitefStore(s => s.lotesLoaded);

  useEffect(() => {
    if (!lotesLoaded) void loadLotes();
    void loadTransacoes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fade-in-up tab-content" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="section-header" style={{ marginBottom: 'var(--sp-5)' }}>
        <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1rem', color: 'var(--text-soft)' }}>
          Conciliação SITEF
        </h2>
        <span className="tab-badge tab-badge-teal" style={{ fontSize: '0.65rem' }}>Software Express</span>
      </div>

      <ErpSitefSyncPanel />
      <SitefDropzone />
      <LotesTable />

      <div className="section-header">
        <span className="section-title">Transações</span>
      </div>
      <TransacoesFilter />
      <TransacoesTable />
    </div>
  );
}
