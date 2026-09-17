import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAdquirenteStore,
  type AdquirenteLote, type ImportResult,
  type PrevisaoDia, type PrevisaoDetalhe,
  type RastreioTransacao, type DivergenciaItem,
  type ResumoVendas,
} from '../../stores/adquirenteStore';
import { fmtDate, fmtDateTime } from '../../lib/date';
import { exportTaxasCSV, downloadCSV } from '../../lib/csv';
import { api } from '../../services/api';

// ── Helpers ───────────────────────────────────────────────────────

const GATEWAYS = ['GETNET', 'CIELO', 'STONE', 'REDE', 'PAGSEGURO', 'SUMUP', 'ALELO', 'TICKET', 'VR'];

function fmtMoeda(v: string | number) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtPct(v: number | null) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + '%';
}

function statusConcBadge(s: string) {
  const map: Record<string, { cls: string; label: string }> = {
    CONCILIADO:  { cls: 'tab-badge tab-badge-teal', label: 'CONCILIADO' },
    DIVERGENTE:  { cls: 'tab-badge tab-badge-warn', label: 'DIVERGENTE' },
    SEM_SITEF:   { cls: 'tab-badge',                label: 'SEM SITEF'  },
    SEM_ADQ:     { cls: 'tab-badge',                label: 'SEM ADQ'    },
    PENDENTE:    { cls: 'tab-badge tab-badge-warn',  label: 'PENDENTE'   },
  };
  const e = map[s] ?? { cls: 'tab-badge', label: s };
  return <span className={e.cls} style={{ fontSize: '0.62rem' }}>{e.label}</span>;
}

function statusVendaBadge(s: string) {
  const map: Record<string, { cls: string; label: string }> = {
    APROVADA:    { cls: 'tab-badge tab-badge-teal', label: 'APROVADA'   },
    CANCELADA:   { cls: 'tab-badge',                label: 'CANCELADA'  },
    CHARGEBACK:  { cls: 'tab-badge tab-badge-warn', label: 'CHARGEBACK' },
  };
  const e = map[s] ?? { cls: 'tab-badge', label: s };
  return <span className={e.cls} style={{ fontSize: '0.62rem' }}>{e.label}</span>;
}

// ── Modal: Situação de Pagamento ──────────────────────────────────

interface VendaPagamentoRecebivel {
  idempotencyKey: string;
  dataVencimento: string;
  dataVenda:      string | null;
  tipoLancamento: string;
  lancamento:     string;
  bandeira:       string;
  modalidade:     string;
  parcelasInfo:   string | null;
  valorLiquido:   number;
  valorLiquidado: number;
}

interface VendaPagamento {
  venda: {
    idempotencyKey:   string;
    nsu:              string;
    autorizacao:      string | null;
    terminal:         string | null;
    gateway:          string;
    bandeira:         string;
    modalidade:       string;
    status:           string;
    parcelas:         number;
    valorBruto:       number;
    valorTaxa:        number;
    valorLiquido:     number;
    dataHoraVenda:    string;
    cartaoMascarado:  string;
    dataPrimeiroPgto: string | null;
  };
  statusPagamento: string;
  somaLiquidado:   number;
  somaLiquido:     number;
  recebiveis:      VendaPagamentoRecebivel[];
}

const STATUS_PGTO_MAP: Record<string, { label: string; cls: string; desc: (d: VendaPagamento) => string }> = {
  PAGO:          { label: 'PAGO',          cls: 'tab-badge tab-badge-teal', desc: d => `Totalmente liquidado pela adquirente — ${fmtMoeda(d.somaLiquidado)}` },
  PARCIAL:       { label: 'PARCIAL',       cls: 'tab-badge tab-badge-warn', desc: d => `${fmtMoeda(d.somaLiquidado)} de ${fmtMoeda(d.somaLiquido)} liquidados` },
  AGUARDANDO:    { label: 'AGUARDANDO',    cls: 'tab-badge',               desc: _ => 'Transação aprovada — aguardando liquidação pela adquirente' },
  VENCIDO:       { label: 'VENCIDO',       cls: 'tab-badge',               desc: _ => 'Prazo de pagamento vencido sem liquidação registrada' },
  SEM_RECEBIVEL: { label: 'SEM RECEBÍVEL', cls: 'tab-badge',               desc: _ => 'Nenhum recebível importado para esta venda' },
  CANCELADA:     { label: 'CANCELADA',     cls: 'tab-badge',               desc: _ => 'Transação cancelada — sem liquidação' },
  CHARGEBACK:    { label: 'CHARGEBACK',    cls: 'tab-badge tab-badge-warn', desc: _ => 'Chargeback registrado — valor em disputa' },
};

function statusPgtoBadge(s: string, size = '0.72rem') {
  const e = STATUS_PGTO_MAP[s] ?? { label: s, cls: 'tab-badge', desc: () => '' };
  return <span className={e.cls} style={{ fontSize: size }}>{e.label}</span>;
}

function VendaPagamentoModal({ vendaKey, onClose }: { vendaKey: string; onClose: () => void }) {
  const [data, setData]     = useState<VendaPagamento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    api.get<{ success: boolean } & VendaPagamento>(`/adquirente/vendas/${encodeURIComponent(vendaKey)}/pagamento`)
      .then(res => setData(res.data))
      .catch((e: any) => setError(e?.response?.data?.error ?? 'Erro ao buscar dados de pagamento'))
      .finally(() => setLoading(false));
  }, [vendaKey]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Situação de Pagamento</div>
            {data && (
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                NSU {data.venda.nsu} · {data.venda.gateway} · {data.venda.bandeira} {data.venda.modalidade}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.1rem', padding: 4, lineHeight: 1 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: 'var(--sp-4) var(--sp-5)', flex: 1 }}>
          {loading && <div style={{ color: 'var(--muted)', fontSize: '0.8rem', textAlign: 'center', padding: 'var(--sp-8)' }}>Carregando...</div>}
          {error   && <div className="alert alert-error" style={{ marginTop: 8 }}>{error}</div>}

          {data && !loading && (() => {
            const meta = STATUS_PGTO_MAP[data.statusPagamento] ?? STATUS_PGTO_MAP['SEM_RECEBIVEL'];
            return (
              <>
                {/* Status principal */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--sp-4)', padding: 'var(--sp-3) var(--sp-4)', background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  {statusPgtoBadge(data.statusPagamento, '0.78rem')}
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-soft)' }}>{meta.desc(data)}</span>
                </div>

                {/* Identificação */}
                <div style={{ marginBottom: 'var(--sp-4)' }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Identificação da Venda</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: '0.74rem' }}>
                    {[
                      ['Data/Hora', fmtDateTime(data.venda.dataHoraVenda)],
                      ['NSU',        data.venda.nsu || '—'],
                      ['Autorização',data.venda.autorizacao || '—'],
                      ['Terminal',   data.venda.terminal || '—'],
                      ['Cartão',     data.venda.cartaoMascarado ? `••••${data.venda.cartaoMascarado.slice(-4)}` : '—'],
                      ['Parcelas',   `${data.venda.parcelas}x`],
                    ].map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                        <span style={{ color: 'var(--muted)', minWidth: 82, flexShrink: 0 }}>{label}</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* KPI valores */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-2)', marginTop: 12 }}>
                    {[
                      { label: 'BRUTO',   v: data.venda.valorBruto,   color: 'var(--text)' },
                      { label: 'TAXA',    v: data.venda.valorTaxa,    color: 'var(--red)'  },
                      { label: 'LÍQUIDO', v: data.venda.valorLiquido, color: 'var(--teal)' },
                    ].map(({ label, v, color }) => (
                      <div key={label} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-2) var(--sp-3)' }}>
                        <div style={{ fontSize: '0.58rem', color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color }}>{fmtMoeda(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Agenda de Recebimento */}
                {data.recebiveis.length > 0 ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: '0.62rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Agenda de Recebimento — {data.recebiveis.length} parcela{data.recebiveis.length !== 1 ? 's' : ''}
                      </span>
                      {data.venda.dataPrimeiroPgto && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
                          1º pgto previsto: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-soft)' }}>{fmtDate(data.venda.dataPrimeiroPgto)}</span>
                        </span>
                      )}
                    </div>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                      <table className="trn-table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th>Parcela</th>
                            <th>Vencimento</th>
                            <th className="right">Prev. Líquido</th>
                            <th className="right">Liquidado</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.recebiveis.map((r, idx) => {
                            const isPast = r.dataVencimento < hoje;
                            const isPago = r.valorLiquidado > 0;
                            const rowStatus = isPago ? 'PAGO' : isPast ? 'VENCIDO' : 'PREVISTO';
                            const rowCls   = isPago ? 'tab-badge tab-badge-teal' : isPast ? 'tab-badge' : 'tab-badge';
                            const rowColor = isPago ? 'var(--red-bg)' : undefined;
                            return (
                              <tr key={r.idempotencyKey} style={{ opacity: isPast && !isPago ? 0.7 : 1, background: rowColor }}>
                                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--muted)' }}>
                                  {r.parcelasInfo ?? `${idx + 1}/${data.recebiveis.length}`}
                                </td>
                                <td className="date-cell" style={{ fontSize: '0.7rem' }}>{fmtDate(r.dataVencimento)}</td>
                                <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--text-soft)' }}>{fmtMoeda(r.valorLiquido)}</td>
                                <td className="mono-cell" style={{ textAlign: 'right', color: isPago ? 'var(--teal)' : 'var(--muted)' }}>
                                  {isPago ? fmtMoeda(r.valorLiquidado) : '—'}
                                </td>
                                <td><span className={rowCls} style={{ fontSize: '0.58rem' }}>{rowStatus}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {data.recebiveis.length > 1 && (
                          <tfoot>
                            <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 600 }}>
                              <td colSpan={2} style={{ fontSize: '0.68rem', color: 'var(--muted)', padding: '6px 8px' }}>TOTAL</td>
                              <td className="mono-cell" style={{ textAlign: 'right' }}>{fmtMoeda(data.somaLiquido)}</td>
                              <td className="mono-cell" style={{ textAlign: 'right', color: data.somaLiquidado > 0 ? 'var(--teal)' : 'var(--muted)' }}>
                                {data.somaLiquidado > 0 ? fmtMoeda(data.somaLiquidado) : '—'}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: 'var(--sp-4)', textAlign: 'center', color: 'var(--muted)', fontSize: '0.75rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius)' }}>
                    Nenhum recebível vinculado. Importe o arquivo <strong>Recebivel_Completos</strong> para ver a agenda de pagamento.
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ── Dropzone genérico ─────────────────────────────────────────────

interface DropzoneProps {
  label:    string;
  sub:      string;
  loading:  boolean;
  onFile:   (f: File) => void;
  accent?:  'teal' | 'gold';
  accept?:  string;
}

function Dropzone({ label, sub, loading, onFile, accent = 'teal', accept = '.xlsx,.xls,.txt' }: DropzoneProps) {
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const handle = useCallback((f: File) => { onFile(f); }, [onFile]);

  return (
    <div
      className={`dropzone dropzone-system${over ? ' over' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => !loading && ref.current?.click()}
      onKeyDown={e => e.key === 'Enter' && ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault(); setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) handle(f);
      }}
      style={{
        cursor: loading ? 'wait' : 'pointer',
        borderColor: over ? `var(--${accent})` : undefined,
      }}
    >
      {loading ? (
        <>
          <svg className="dropzone-icon loading-pulse" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span className="dropzone-title">Enviando para o servidor...</span>
        </>
      ) : (
        <>
          <svg className="dropzone-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={`var(--${accent})`} strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <polyline points="9 15 12 12 15 15"/>
          </svg>
          <span className="dropzone-title">{label}</span>
          <span className="dropzone-sub">{sub}</span>
        </>
      )}
      <input
        ref={ref}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handle(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ── Resultado de importação ───────────────────────────────────────

function ImportResultBanner({ result, onConciliar, conciliando }: {
  result: ImportResult;
  onConciliar: () => void;
  conciliando: boolean;
}) {
  return (
    <div className="alert alert-info" style={{ marginTop: 10, gap: 10 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>
      </svg>
      <div style={{ flex: 1 }}>
        <strong>{result.arquivo}</strong> —{' '}
        <span style={{ color: 'var(--teal)' }}>{result.adicionadas} novas</span>
        {result.atualizadas > 0 && <span style={{ color: 'var(--gold)' }}>, {result.atualizadas} atualizadas</span>}
      </div>
      <button
        className="btn btn-primary"
        style={{ fontSize: '0.72rem', padding: '4px 12px', whiteSpace: 'nowrap' }}
        disabled={conciliando}
        onClick={onConciliar}
      >
        {conciliando ? 'Conciliando...' : '↔ Conciliar com SITEF'}
      </button>
    </div>
  );
}

// ── Tab: Importar ─────────────────────────────────────────────────

function TabImportar() {
  const [gateway, setGateway] = useState('GETNET');

  const importVendas     = useAdquirenteStore(s => s.importVendas);
  const importRecebiveis = useAdquirenteStore(s => s.importRecebiveis);
  const importingV       = useAdquirenteStore(s => s.importingVendas);
  const importingR       = useAdquirenteStore(s => s.importingRecebiveis);
  const importError      = useAdquirenteStore(s => s.importError);
  const lastImport       = useAdquirenteStore(s => s.lastImport);
  const lotes            = useAdquirenteStore(s => s.lotes);
  const conciliar        = useAdquirenteStore(s => s.conciliar);
  const conciliando      = useAdquirenteStore(s => s.conciliando);
  const conciliaResult   = useAdquirenteStore(s => s.conciliaResult);
  const clearError       = useAdquirenteStore(s => s.clearImportError);

  const [lastLoteId, setLastLoteId] = useState<string | null>(null);

  const displayGateway = gateway;

  async function handleVendas(file: File) {
    clearError();
    try {
      const r = await importVendas(file, gateway);
      setLastLoteId(r.loteId);
    } catch { /* importError setado no store */ }
  }

  async function handleRecebiveis(file: File) {
    clearError();
    try {
      await importRecebiveis(file, gateway);
    } catch { /* importError setado no store */ }
  }

  async function handleConciliar() {
    if (!lastLoteId) return;
    await conciliar(lastLoteId);
  }

  return (
    <div>
      {/* Gateway selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-soft)' }}>Gateway:</span>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          {GATEWAYS.map(g => (
            <button
              key={g}
              onClick={() => setGateway(g)}
              style={{
                background: gateway === g ? 'var(--teal)' : 'var(--panel)',
                color:      gateway === g ? '#000' : 'var(--text-soft)',
                border:     `1px solid ${gateway === g ? 'var(--teal)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                fontSize:   '0.72rem',
                padding:    '4px 12px',
                cursor:     'pointer',
                fontFamily: 'var(--font-mono)',
                fontWeight: gateway === g ? 700 : 400,
                transition: 'var(--transition)',
              }}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Dropzones */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
            VENDAS_DETALHADO
          </div>
          <Dropzone
            label={`Importar Vendas (${displayGateway})`}
            sub={gateway === 'VR' ? 'Extrato de Vendas VR — .xlsx, .xls ou .txt (EDI 200 posições)' : 'Arquivo Vendas_Detalhado_*.xlsx — sheets CARTÕES e VOUCHER'}
            loading={importingV}
            onFile={handleVendas}
            accent="teal"
            accept=".xlsx,.xls,.txt"
          />
        </div>
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
            RECEBIVEL_COMPLETOS
          </div>
          <Dropzone
            label={`Importar Recebíveis (${displayGateway})`}
            sub={gateway === 'VR' ? 'Guias de Reembolso VR — .xlsx, .xls ou .txt (EDI 200 posições)' : gateway === 'SODEXO' ? 'Extrato de pagamentos Sodexo — .xlsx' : 'Arquivo Recebivel_Completos_*.xlsx — sheet Detalhado'}
            loading={importingR}
            onFile={handleRecebiveis}
            accent="gold"
            accept=".xlsx,.xls,.txt"
          />
        </div>
      </div>

      {/* Erro */}
      {importError && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <div><strong>Erro:</strong> {importError}</div>
        </div>
      )}

      {/* Resultado + botão de conciliação */}
      {lastImport && !importError && lastLoteId && (
        <ImportResultBanner
          result={lastImport}
          onConciliar={handleConciliar}
          conciliando={conciliando}
        />
      )}

      {/* Resultado da conciliação */}
      {conciliaResult && (
        <div className="alert alert-info" style={{ marginTop: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>
          </svg>
          <div style={{ flex: 1 }}>
            <strong>Conciliação concluída</strong> —{' '}
            <span style={{ color: 'var(--teal)' }}>{conciliaResult.resumo.conciliados} conciliados</span>
            {conciliaResult.resumo.divergentes > 0 && (
              <span style={{ color: 'var(--gold)' }}>, {conciliaResult.resumo.divergentes} divergentes</span>
            )}
            {conciliaResult.resumo.semSitef > 0 && (
              <span style={{ color: 'var(--red)' }}>, {conciliaResult.resumo.semSitef} sem SITEF</span>
            )}
            {conciliaResult.resumo.semAdq > 0 && (
              <span style={{ color: 'var(--muted)' }}>, {conciliaResult.resumo.semAdq} sem adquirente</span>
            )}
          </div>
        </div>
      )}

      {/* Histórico de lotes */}
      {lotes.length > 0 && (
        <div style={{ marginTop: 'var(--sp-6)' }}>
          <div className="section-header" style={{ marginBottom: 'var(--sp-3)' }}>
            <span className="section-title">Importações</span>
            <span className="text-muted" style={{ fontSize: '0.7rem' }}>{lotes.length} lote{lotes.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="transactions-section">
            <div style={{ overflowX: 'auto' }}>
              <table className="trn-table">
                <thead>
                  <tr>
                    <th>Arquivo</th>
                    <th>Gateway</th>
                    <th>Tipo</th>
                    <th>Período</th>
                    <th>Importado em</th>
                    <th>Por</th>
                    <th className="right">Novas</th>
                    <th className="right">Atualizadas</th>
                  </tr>
                </thead>
                <tbody>
                  {lotes.map(l => (
                    <LoteRow key={l.id} lote={l} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LoteRow({ lote }: { lote: AdquirenteLote }) {
  const setFilter    = useAdquirenteStore(s => s.setVendasFilter);
  const conciliar    = useAdquirenteStore(s => s.conciliar);
  const conciliando  = useAdquirenteStore(s => s.conciliando);

  return (
    <tr>
      <td className="mono-cell" style={{ fontSize: '0.68rem', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {lote.arquivo}
      </td>
      <td>
        <span className="tab-badge" style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)' }}>{lote.gateway}</span>
      </td>
      <td>
        <span className={`tab-badge ${lote.tipo === 'VENDAS' ? 'tab-badge-teal' : 'tab-badge-warn'}`} style={{ fontSize: '0.62rem' }}>
          {lote.tipo}
        </span>
      </td>
      <td className="mono-cell" style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
        {fmtDate(lote.dataInicio)} → {fmtDate(lote.dataFim)}
      </td>
      <td className="date-cell">{fmtDate(lote.importadoEm)}</td>
      <td style={{ fontSize: '0.72rem', color: 'var(--text-soft)' }}>{lote.importador?.nome ?? '—'}</td>
      <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--teal)' }}>{lote.adicionadas}</td>
      <td className="mono-cell" style={{ textAlign: 'right', color: lote.ignoradas > 0 ? 'var(--gold)' : 'var(--muted)' }}>{lote.ignoradas}</td>
      {lote.tipo === 'VENDAS' && (
        <td>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-ghost" style={{ fontSize: '0.68rem', padding: '2px 8px' }}
              onClick={() => void setFilter({ loteId: lote.id })}>
              Ver vendas
            </button>
            <button className="btn btn-ghost" style={{ fontSize: '0.68rem', padding: '2px 8px' }}
              disabled={conciliando}
              onClick={() => void conciliar(lote.id)}>
              ↔ Conciliar
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

// ── Tab: Vendas ───────────────────────────────────────────────────

function ResumoVendasBlock() {
  const resumo       = useAdquirenteStore(s => s.resumoVendas);
  const loadingR     = useAdquirenteStore(s => s.loadingResumo);

  if (loadingR) return (
    <div style={{ padding: 'var(--sp-4)', color: 'var(--muted)', fontSize: '0.78rem' }}>
      Calculando resumo...
    </div>
  );
  if (!resumo || resumo.totais.qtd === 0) return null;

  const { totais, porBandeira } = resumo;
  const taxaMedia = totais.totalBruto > 0
    ? (totais.totalTaxa / totais.totalBruto) * 100
    : 0;

  return (
    <div style={{ marginBottom: 'var(--sp-5)' }}>
      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Transações</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)' }}>
            {totais.qtd.toLocaleString('pt-BR')}
          </div>
        </div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Volume Bruto</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--teal)' }}>
            {fmtMoeda(totais.totalBruto)}
          </div>
        </div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Taxas Pagas</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--red)' }}>
            {fmtMoeda(totais.totalTaxa)}
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 2 }}>
            média {fmtPct(taxaMedia)}
          </div>
        </div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Líquido</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--teal)' }}>
            {fmtMoeda(totais.totalLiquido)}
          </div>
        </div>
      </div>

      {/* Mini-tabela por bandeira */}
      <div className="transactions-section">
        <div className="transactions-header">
          <span className="transactions-title">Resumo por Bandeira</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="trn-table">
            <thead>
              <tr>
                <th>Bandeira</th>
                <th>Modalidade</th>
                <th className="right">Qtd</th>
                <th className="right">Bruto</th>
                <th className="right">Taxas</th>
                <th className="right">Líquido</th>
                <th className="right">Taxa Efetiva</th>
              </tr>
            </thead>
            <tbody>
              {porBandeira.map(row => (
                <tr key={`${row.bandeira}-${row.modalidade}`}>
                  <td style={{ fontWeight: 600 }}>{row.bandeira}</td>
                  <td style={{ fontSize: '0.72rem', color: 'var(--text-soft)' }}>{row.modalidade}</td>
                  <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--muted)' }}>{row.qtd.toLocaleString('pt-BR')}</td>
                  <td className="mono-cell" style={{ textAlign: 'right' }}>{fmtMoeda(row.totalBruto)}</td>
                  <td className="mono-cell deb-cell">{fmtMoeda(row.totalTaxa)}</td>
                  <td className="mono-cell cred-cell">{fmtMoeda(row.totalLiquido)}</td>
                  <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--gold)' }}>{fmtPct(row.taxaEfetivaPct)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 600 }}>
                <td colSpan={2} style={{ color: 'var(--text-soft)', fontSize: '0.75rem' }}>TOTAL</td>
                <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--muted)' }}>{totais.qtd.toLocaleString('pt-BR')}</td>
                <td className="mono-cell" style={{ textAlign: 'right' }}>{fmtMoeda(totais.totalBruto)}</td>
                <td className="mono-cell deb-cell">{fmtMoeda(totais.totalTaxa)}</td>
                <td className="mono-cell cred-cell">{fmtMoeda(totais.totalLiquido)}</td>
                <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--gold)' }}>{fmtPct(taxaMedia)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TabVendas() {
  const vendas          = useAdquirenteStore(s => s.vendas);
  const total           = useAdquirenteStore(s => s.totalVendas);
  const filter          = useAdquirenteStore(s => s.vendasFilter);
  const loading         = useAdquirenteStore(s => s.loadingVendas);
  const loadVendas      = useAdquirenteStore(s => s.loadVendas);
  const setFilter       = useAdquirenteStore(s => s.setVendasFilter);
  const loadResumo      = useAdquirenteStore(s => s.loadResumoVendas);
  const [pagamentoKey, setPagamentoKey] = useState<string | null>(null);

  const totalPages = Math.ceil(total / filter.limit);

  const selStyle: React.CSSProperties = {
    background: 'var(--panel)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text)',
    fontFamily: 'var(--font-ui)', fontSize: '0.75rem',
    padding: '5px 10px', outline: 'none', cursor: 'pointer',
  };
  const inpStyle: React.CSSProperties = { ...selStyle, fontFamily: 'var(--font-mono)', width: 130 };

  const applyFilter = async (patch: Parameters<typeof setFilter>[0]) => {
    await setFilter(patch);
    void loadResumo();
  };

  return (
    <div>
      {/* KPI + Resumo por bandeira */}
      <ResumoVendasBlock />

      {/* Filtros */}
      <div className="actions-row" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
        <select style={selStyle} value={filter.gateway ?? ''} onChange={e => void applyFilter({ gateway: e.target.value || undefined })}>
          <option value="">Todos gateways</option>
          {GATEWAYS.map(g => <option key={g}>{g}</option>)}
        </select>
        <select style={selStyle} value={filter.bandeira ?? ''} onChange={e => void applyFilter({ bandeira: e.target.value || undefined })}>
          <option value="">Todas bandeiras</option>
          {['VISA','MASTER','ELO','AMEX','HIPERCARD','ALELO','TICKET','BEN','OUTROS'].map(b => <option key={b}>{b}</option>)}
        </select>
        <select style={selStyle} value={filter.modalidade ?? ''} onChange={e => void applyFilter({ modalidade: e.target.value || undefined })}>
          <option value="">Todas modalidades</option>
          {['CREDITO','DEBITO','VOUCHER'].map(m => <option key={m}>{m}</option>)}
        </select>
        <select style={selStyle} value={filter.meioCaptura ?? ''} onChange={e => void applyFilter({ meioCaptura: e.target.value || undefined })}>
          <option value="">Todos meios (TEF/POS)</option>
          <option value="TEF">TEF</option>
          <option value="POS">POS</option>
          <option value="ECOMMERCE">ECOMMERCE</option>
          <option value="DIGITADO">DIGITADO</option>
        </select>
        <select style={selStyle} value={filter.statusConc ?? ''} onChange={e => void applyFilter({ statusConc: e.target.value || undefined })}>
          <option value="">Todos status</option>
          {['PENDENTE','CONCILIADO','DIVERGENTE','SEM_SITEF','SEM_ADQ'].map(s => <option key={s}>{s}</option>)}
        </select>
        <input style={inpStyle} type="date" value={filter.dataInicio ?? ''}
          onChange={e => void applyFilter({ dataInicio: e.target.value || undefined })} />
        <input style={inpStyle} type="date" value={filter.dataFim ?? ''}
          onChange={e => void applyFilter({ dataFim: e.target.value || undefined })} />
        {filter.loteId && (
          <button className="btn btn-ghost" style={{ fontSize: '0.7rem' }}
            onClick={() => void applyFilter({ loteId: undefined })}>✕ lote</button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
          {loading ? 'Carregando...' : `${total.toLocaleString('pt-BR')} vendas`}
        </span>
      </div>

      {/* Tabela */}
      {vendas.length === 0 && !loading ? (
        <div className="transactions-section">
          <div className="empty-state">
            <svg className="empty-state-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5">
              <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <div className="empty-state-title">Nenhuma venda encontrada</div>
            <div className="empty-state-sub">Importe um arquivo Vendas_Detalhado ou ajuste os filtros.</div>
          </div>
        </div>
      ) : (
        <div className="transactions-section">
          <div className="transactions-header">
            <span className="transactions-title">Vendas Adquirente</span>
            <span className="transactions-count">{vendas.length} de {total.toLocaleString('pt-BR')}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="trn-table">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Gateway</th>
                  <th>Meio</th>
                  <th>NSU</th>
                  <th>Bandeira</th>
                  <th>Modal.</th>
                  <th>Parcelas</th>
                  <th>Cartão</th>
                  <th className="right">Bruto</th>
                  <th className="right">Taxa</th>
                  <th className="right">Líquido</th>
                  <th>Venda</th>
                  <th>Concil.</th>
                  <th>Pgto.</th>
                </tr>
              </thead>
              <tbody>
                {vendas.map(v => (
                  <tr key={v.idempotencyKey}>
                    <td className="date-cell" style={{ fontSize: '0.7rem' }}>
                      {fmtDateTime(v.dataHoraVenda)}
                    </td>
                    <td style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{v.gateway}</td>
                    <td>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 700,
                        fontSize: '0.65rem',
                        background: (v.meioCaptura || 'TEF') === 'TEF' ? 'rgba(0,201,177,0.15)' : (v.meioCaptura === 'POS' ? 'rgba(240,165,0,0.15)' : 'rgba(255,255,255,0.08)'),
                        color: (v.meioCaptura || 'TEF') === 'TEF' ? 'var(--teal)' : (v.meioCaptura === 'POS' ? 'var(--gold)' : 'var(--muted)'),
                        border: `1px solid ${(v.meioCaptura || 'TEF') === 'TEF' ? 'rgba(0,201,177,0.35)' : (v.meioCaptura === 'POS' ? 'rgba(240,165,0,0.35)' : 'var(--border)')}`,
                      }}>
                        {v.meioCaptura || 'TEF'}
                      </span>
                    </td>
                    <td className="mono-cell" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{v.nsu}</td>
                    <td style={{ fontSize: '0.72rem' }}>{v.bandeira}</td>
                    <td style={{ fontSize: '0.7rem', color: 'var(--text-soft)' }}>{v.modalidade}</td>
                    <td className="mono-cell" style={{ textAlign: 'center', color: 'var(--muted)' }}>{v.parcelas}x</td>
                    <td className="mono-cell" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
                      ••••{v.cartaoMascarado.slice(-4)}
                    </td>
                    <td className="cred-cell">{fmtMoeda(v.valorBruto)}</td>
                    <td className="deb-cell">{fmtMoeda(v.valorTaxa)}</td>
                    <td className="cred-cell">{fmtMoeda(v.valorLiquido)}</td>
                    <td>{statusVendaBadge(v.status)}</td>
                    <td>{statusConcBadge(v.statusConc)}</td>
                    <td>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: '0.62rem', padding: '2px 8px', whiteSpace: 'nowrap' }}
                        onClick={e => { e.stopPropagation(); setPagamentoKey(v.idempotencyKey); }}
                      >
                        Ver Pgto.
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-4)', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost" disabled={filter.page <= 1}
                onClick={() => void loadVendas({ page: filter.page - 1 })}>← Anterior</button>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                {filter.page} / {totalPages}
              </span>
              <button className="btn btn-ghost" disabled={filter.page >= totalPages}
                onClick={() => void loadVendas({ page: filter.page + 1 })}>Próxima →</button>
            </div>
          )}
        </div>
      )}

      {pagamentoKey && (
        <VendaPagamentoModal vendaKey={pagamentoKey} onClose={() => setPagamentoKey(null)} />
      )}
    </div>
  );
}

// ── Tab: Indicadores ──────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: 'teal' | 'gold' | 'red';
}) {
  const color = accent ? `var(--${accent})` : 'var(--text)';
  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: 'var(--sp-4)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: '1.25rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color }}>{value}</span>
      {sub && <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{sub}</span>}
    </div>
  );
}

function TabIndicadores() {
  const kpi          = useAdquirenteStore(s => s.kpi);
  const loadingKpi   = useAdquirenteStore(s => s.loadingKpi);
  const kpiParams    = useAdquirenteStore(s => s.kpiParams);
  const loadKpi      = useAdquirenteStore(s => s.loadKpi);
  const contratos    = useAdquirenteStore(s => s.contratos);
  const loadContratos = useAdquirenteStore(s => s.loadContratos);

  useEffect(() => { void loadContratos(); }, [loadContratos]);

  const selStyle: React.CSSProperties = {
    background: 'var(--panel)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text)',
    fontFamily: 'var(--font-ui)', fontSize: '0.75rem',
    padding: '5px 10px', outline: 'none', cursor: 'pointer',
  };
  const inpStyle: React.CSSProperties = { ...selStyle, fontFamily: 'var(--font-mono)', width: 140 };

  const taxaMediaGeral = kpi && kpi.totais.totalBruto > 0
    ? ((kpi.totais.totalTaxa / kpi.totais.totalBruto) * 100)
    : null;

  const totalRecFuturo = kpi?.recebiveisFuturos.reduce(
    (acc, r) => acc + Number(r._sum.valorLiquido ?? 0), 0,
  ) ?? 0;

  return (
    <div>
      {/* Filtros */}
      <div className="actions-row" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-5)' }}>
        <select style={selStyle} value={kpiParams.gateway ?? ''} onChange={e => void loadKpi({ gateway: e.target.value || undefined })}>
          <option value="">Todos gateways</option>
          {GATEWAYS.map(g => <option key={g}>{g}</option>)}
        </select>
        <input style={inpStyle} type="date" value={kpiParams.dataInicio ?? ''}
          onChange={e => void loadKpi({ dataInicio: e.target.value || undefined })} />
        <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>→</span>
        <input style={inpStyle} type="date" value={kpiParams.dataFim ?? ''}
          onChange={e => void loadKpi({ dataFim: e.target.value || undefined })} />
        <select style={{ ...selStyle, maxWidth: 240 }} value={kpiParams.contratoId ?? ''}
          onChange={e => void loadKpi({ contratoId: e.target.value || undefined })}>
          <option value="">Sem contrato (só taxas efetivas)</option>
          {contratos.map(c => (
            <option key={c.id} value={c.id}>{c.nome} — {c.rede}</option>
          ))}
        </select>
        <button className="btn btn-primary" style={{ fontSize: '0.72rem' }}
          onClick={() => void loadKpi()}>
          Atualizar
        </button>
        {loadingKpi && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Carregando...</span>}
      </div>

      {/* KPI Cards */}
      {kpi && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)' }}>
            <KpiCard
              label="Volume Total Bruto"
              value={fmtMoeda(kpi.totais.totalBruto)}
              sub={`${kpi.totais.qtdTransacoes.toLocaleString('pt-BR')} transações`}
              accent="teal"
            />
            <KpiCard
              label="Total Taxas Pagas"
              value={fmtMoeda(kpi.totais.totalTaxa)}
              sub={taxaMediaGeral != null ? `Média: ${fmtPct(taxaMediaGeral)}` : undefined}
              accent="red"
            />
            <KpiCard
              label="Líquido Recebido"
              value={fmtMoeda(kpi.totais.totalLiquido)}
              accent="teal"
            />
            <KpiCard
              label="Recebíveis Futuros"
              value={fmtMoeda(totalRecFuturo)}
              sub={`${kpi.recebiveisFuturos.reduce((a, r) => a + r._count.idempotencyKey, 0)} parcelas`}
              accent="gold"
            />
          </div>

          {/* Tabela por bandeira/modalidade */}
          <div className="section-header" style={{ marginBottom: 'var(--sp-3)' }}>
            <span className="section-title">Taxas por Bandeira / Modalidade</span>
            {kpiParams.contratoId && (
              <span className="tab-badge tab-badge-teal" style={{ fontSize: '0.62rem' }}>Comparando com contrato</span>
            )}
          </div>
          <div className="transactions-section" style={{ marginBottom: 'var(--sp-5)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="trn-table">
                <thead>
                  <tr>
                    <th>Bandeira</th>
                    <th>Modalidade</th>
                    <th className="right">Qtd</th>
                    <th className="right">Volume Bruto</th>
                    <th className="right">Taxas Pagas</th>
                    <th className="right">Taxa Efetiva</th>
                    {kpiParams.contratoId && <>
                      <th className="right">Contratada</th>
                      <th className="right">Div. R$</th>
                      <th className="right">Div. %</th>
                    </>}
                  </tr>
                </thead>
                <tbody>
                  {kpi.taxasEfetivas.map(row => {
                    const temDivergencia = row.divergenciaReais != null && Math.abs(row.divergenciaReais) > 0.01;
                    const divColor = row.divergenciaReais != null
                      ? (row.divergenciaReais > 0.01 ? 'var(--red)' : row.divergenciaReais < -0.01 ? 'var(--teal)' : 'var(--muted)')
                      : 'var(--muted)';
                    return (
                      <tr key={`${row.bandeira}-${row.modalidade}`} style={temDivergencia ? { background: 'var(--red-bg)' } : {}}>
                        <td style={{ fontWeight: 600 }}>{row.bandeira}</td>
                        <td style={{ fontSize: '0.72rem', color: 'var(--text-soft)' }}>{row.modalidade}</td>
                        <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--muted)' }}>{row.qtdTransacoes.toLocaleString('pt-BR')}</td>
                        <td className="mono-cell" style={{ textAlign: 'right' }}>{fmtMoeda(row.totalBruto)}</td>
                        <td className="mono-cell deb-cell">{fmtMoeda(row.totalTaxa)}</td>
                        <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--gold)' }}>
                          {fmtPct(row.taxaEfetivaPct)}
                        </td>
                        {kpiParams.contratoId && <>
                          <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                            {fmtPct(row.taxaMdrContratada)}
                          </td>
                          <td className="mono-cell" style={{ textAlign: 'right', color: divColor }}>
                            {row.divergenciaReais != null ? fmtMoeda(row.divergenciaReais) : '—'}
                          </td>
                          <td className="mono-cell" style={{ textAlign: 'right', color: divColor }}>
                            {fmtPct(row.divergenciaPct)}
                          </td>
                        </>}
                      </tr>
                    );
                  })}
                  {/* Totalizador */}
                  <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 600 }}>
                    <td colSpan={3} style={{ color: 'var(--text-soft)', fontSize: '0.75rem' }}>TOTAL</td>
                    <td className="mono-cell" style={{ textAlign: 'right' }}>{fmtMoeda(kpi.totais.totalBruto)}</td>
                    <td className="mono-cell deb-cell">{fmtMoeda(kpi.totais.totalTaxa)}</td>
                    <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--gold)' }}>
                      {fmtPct(taxaMediaGeral)}
                    </td>
                    {kpiParams.contratoId && <><td/><td/><td/></>}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Status de conciliação */}
          {kpi.statusConcVendas.length > 0 && (
            <>
              <div className="section-header" style={{ marginBottom: 'var(--sp-3)' }}>
                <span className="section-title">Status de Conciliação</span>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-5)' }}>
                {kpi.statusConcVendas.map(s => (
                  <div key={s.statusConc} style={{
                    background: 'var(--panel)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)',
                    display: 'flex', flexDirection: 'column', gap: 2, minWidth: 130,
                  }}>
                    {statusConcBadge(s.statusConc)}
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700 }}>
                      {s._count.idempotencyKey.toLocaleString('pt-BR')}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
                      {fmtMoeda(s._sum.valorBruto ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Recebíveis futuros */}
          {kpi.recebiveisFuturos.length > 0 && (
            <>
              <div className="section-header" style={{ marginBottom: 'var(--sp-3)' }}>
                <span className="section-title">Recebíveis Futuros</span>
                <span className="text-muted" style={{ fontSize: '0.7rem' }}>{fmtMoeda(totalRecFuturo)} a receber</span>
              </div>
              <div className="transactions-section">
                <table className="trn-table">
                  <thead>
                    <tr>
                      <th>Bandeira</th>
                      <th>Modalidade</th>
                      <th className="right">Parcelas</th>
                      <th className="right">Valor Líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpi.recebiveisFuturos.map(r => (
                      <tr key={`${r.bandeira}-${r.modalidade}`}>
                        <td style={{ fontWeight: 600 }}>{r.bandeira}</td>
                        <td style={{ fontSize: '0.72rem', color: 'var(--text-soft)' }}>{r.modalidade}</td>
                        <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                          {r._count.idempotencyKey.toLocaleString('pt-BR')}
                        </td>
                        <td className="cred-cell">{fmtMoeda(r._sum.valorLiquido ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {!kpi && !loadingKpi && (
        <div className="empty-state" style={{ padding: 'var(--sp-10)' }}>
          <svg className="empty-state-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          <div className="empty-state-title">Configure o período e clique em Atualizar</div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Previsão de Recebimento ──────────────────────────────────

function BarraRelativa({ valor, max }: { valor: number; max: number }) {
  const pct = max > 0 ? Math.min((valor / max) * 100, 100) : 0;
  return (
    <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 4, width: '100%' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--teal)', borderRadius: 2, transition: 'width 0.3s' }} />
    </div>
  );
}

function TabPrevisao() {
  const previsao       = useAdquirenteStore(s => s.previsao);
  const loading        = useAdquirenteStore(s => s.loadingPrevisao);
  const params         = useAdquirenteStore(s => s.previsaoParams);
  const loadPrevisao   = useAdquirenteStore(s => s.loadPrevisao);

  useEffect(() => { void loadPrevisao(); }, [loadPrevisao]);

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const toggleDia = (data: string) =>
    setExpandidos(prev => { const s = new Set(prev); s.has(data) ? s.delete(data) : s.add(data); return s; });

  const selStyle: React.CSSProperties = {
    background: 'var(--panel)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text)',
    fontFamily: 'var(--font-ui)', fontSize: '0.75rem',
    padding: '5px 10px', outline: 'none', cursor: 'pointer',
  };
  const inpStyle: React.CSSProperties = { ...selStyle, fontFamily: 'var(--font-mono)', width: 140 };

  const maxDia = previsao
    ? Math.max(...previsao.porDia.map((d: PrevisaoDia) => d.total), 0)
    : 0;

  const detalhesPorDia = (data: string): PrevisaoDetalhe[] =>
    previsao?.detalhes.filter((d: PrevisaoDetalhe) => d.data === data) ?? [];

  // KPI: semana atual e mês
  const hoje = new Date().toISOString().slice(0, 10);
  const em7d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const em30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const totalSemana = previsao?.porDia.filter((d: PrevisaoDia) => d.data >= hoje && d.data <= em7d)
    .reduce((a: number, d: PrevisaoDia) => a + d.total, 0) ?? 0;
  const total30 = previsao?.porDia.filter((d: PrevisaoDia) => d.data >= hoje && d.data <= em30d)
    .reduce((a: number, d: PrevisaoDia) => a + d.total, 0) ?? 0;

  return (
    <div>
      {/* Filtros */}
      <div className="actions-row" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-5)' }}>
        <select style={selStyle} value={params.gateway ?? ''} onChange={e => void loadPrevisao({ gateway: e.target.value || undefined })}>
          <option value="">Todos gateways</option>
          {GATEWAYS.map(g => <option key={g}>{g}</option>)}
        </select>
        <select
          style={selStyle}
          value={params.origem ?? 'AUTO'}
          onChange={e => void loadPrevisao({ origem: (e.target.value as any) || undefined })}
        >
          <option value="AUTO">Origem: Automático</option>
          <option value="VENDAS">Origem: Vendas (Previsto 1º Pgto)</option>
          <option value="RECEBIVEIS">Origem: Recebíveis (Agenda Adquirente)</option>
        </select>
        <input style={inpStyle} type="date" value={params.dataInicio ?? ''}
          onChange={e => void loadPrevisao({ dataInicio: e.target.value || undefined, dataFim: params.dataFim })} />
        <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>→</span>
        <input style={inpStyle} type="date" value={params.dataFim ?? ''}
          onChange={e => void loadPrevisao({ dataFim: e.target.value || undefined })} />
        {!params.dataInicio && !params.dataFim && (
          <select style={selStyle} value={params.dias ?? 90} onChange={e => void loadPrevisao({ dias: Number(e.target.value), dataInicio: undefined, dataFim: undefined })}>
            {[30, 60, 90, 180, 365].map(d => <option key={d} value={d}>Próximos {d} dias</option>)}
          </select>
        )}
        {loading && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Carregando...</span>}
      </div>

      {/* KPI cards */}
      {previsao && (
        <>
          {previsao.fonteUtilizada && (
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Base de cálculo:</span>
              <span className={`tab-badge ${previsao.fonteUtilizada === 'VENDAS' ? 'tab-badge-gold' : 'tab-badge-teal'}`} style={{ fontSize: '0.68rem', fontWeight: 700 }}>
                {previsao.fonteUtilizada === 'VENDAS'
                  ? '📊 Vendas Previstas (Coluna: DATA PREVISTA DO 1° PAGAMENTO)'
                  : '🏦 Recebíveis Agendados (Agenda Financeira da Adquirente)'}
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)' }}>
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-4)' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Total no Período</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: 'var(--teal)' }}>{fmtMoeda(previsao.totais.totalLiquido)}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 4 }}>{previsao.totais.parcelas.toLocaleString('pt-BR')} parcelas — {previsao.periodo.dataInicio} a {previsao.periodo.dataFim}</div>
            </div>
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-4)' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Próximos 7 dias</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: 'var(--gold)' }}>{fmtMoeda(totalSemana)}</div>
            </div>
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-4)' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Próximos 30 dias</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: 'var(--gold)' }}>{fmtMoeda(total30)}</div>
            </div>
          </div>

          {/* Timeline por dia */}
          {previsao.porDia.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--sp-10)' }}>
              <svg className="empty-state-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <div className="empty-state-title">Nenhuma previsão encontrada no período</div>
              <div className="empty-state-sub">
                {params.origem === 'RECEBIVEIS'
                  ? 'Nenhum recebível encontrado. Tente alternar a origem para "Vendas (Previsto 1º Pgto)" ou importe Recebivel_Completos.'
                  : 'Nenhuma venda ou recebível com previsão de pagamento encontrado para os filtros selecionados.'}
              </div>
            </div>
          ) : (
            <div className="transactions-section">
              <div className="transactions-header">
                <span className="transactions-title">Calendário de Recebimentos</span>
                <span className="transactions-count">{previsao.porDia.length} dias com vencimentos</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="trn-table">
                  <thead>
                    <tr>
                      <th style={{ width: 24 }}></th>
                      <th>Data</th>
                      <th className="right">Parcelas</th>
                      <th className="right">Valor Líquido</th>
                      <th style={{ width: 180 }}>Volume relativo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previsao.porDia.map((dia: PrevisaoDia) => {
                      const isExpanded = expandidos.has(dia.data);
                      const detalhes = detalhesPorDia(dia.data);
                      const isHoje = dia.data === hoje;
                      const isPast = dia.data < hoje;
                      return (
                        <>
                          <tr
                            key={dia.data}
                            style={{
                              cursor: detalhes.length > 1 ? 'pointer' : undefined,
                              opacity: isPast ? 0.6 : 1,
                              background: isHoje ? 'rgba(0, 201, 177, 0.04)' : undefined,
                            }}
                            onClick={() => detalhes.length > 1 && toggleDia(dia.data)}
                          >
                            <td style={{ fontSize: '0.65rem', color: 'var(--muted)', textAlign: 'center' }}>
                              {detalhes.length > 1 ? (isExpanded ? '▼' : '▶') : ''}
                            </td>
                            <td className="date-cell" style={{ fontWeight: isHoje ? 700 : undefined, color: isHoje ? 'var(--teal)' : undefined }}>
                              {new Date(dia.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                              {isHoje && <span style={{ marginLeft: 6, fontSize: '0.6rem', background: 'var(--teal)', color: '#000', borderRadius: 3, padding: '1px 5px' }}>HOJE</span>}
                            </td>
                            <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--muted)' }}>{dia.parcelas.toLocaleString('pt-BR')}</td>
                            <td className="cred-cell">{fmtMoeda(dia.total)}</td>
                            <td style={{ paddingRight: 'var(--sp-4)' }}>
                              <BarraRelativa valor={dia.total} max={maxDia} />
                            </td>
                          </tr>
                          {isExpanded && detalhes.map((det: PrevisaoDetalhe, i: number) => (
                            <tr key={`${dia.data}-${i}`} style={{ background: 'rgba(255,255,255,0.02)', fontSize: '0.88em' }}>
                              <td />
                              <td style={{ paddingLeft: 'var(--sp-5)', color: 'var(--text-soft)', fontSize: '0.72rem' }}>
                                {det.bandeira} · {det.modalidade}
                              </td>
                              <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--muted)', fontSize: '0.72rem' }}>{det.parcelas.toLocaleString('pt-BR')}</td>
                              <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--teal)', fontSize: '0.72rem' }}>{fmtMoeda(det.total)}</td>
                              <td />
                            </tr>
                          ))}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!previsao && !loading && (
        <div className="empty-state" style={{ padding: 'var(--sp-10)' }}>
          <svg className="empty-state-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <div className="empty-state-title">Importe recebíveis para ver a previsão</div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Rastreio Analítico Triplo ────────────────────────────────

const STATUS_TRIPLO_MAP: Record<string, { cls: string; label: string; title: string }> = {
  TRIPLO_OK:     { cls: 'tab-badge tab-badge-teal', label: 'TRIPLO OK',    title: 'Venda, SITEF e Recebível conciliados sem divergências' },
  SEM_RECEBIVEL: { cls: 'tab-badge tab-badge-warn', label: 'SEM RECEBÍVEL', title: 'Conciliado com SITEF, mas sem recebível encontrado' },
  SEM_SITEF:     { cls: 'tab-badge',                label: 'SEM SITEF',    title: 'Sem correspondência no SITEF — pode ser operação POS offline ou tipo de operação não registrado no TEF' },
  PENDENTE:      { cls: 'tab-badge',                label: 'PENDENTE',     title: 'Sem SITEF e sem recebível — dados ainda não importados' },
  DIVERGENTE:    { cls: 'tab-badge',                label: 'DIVERGENTE',   title: 'Divergência detectada entre os dados das três fontes' },
};

const DIV_LABEL: Record<string, string> = {
  VALOR_VENDA_SITEF:    'Valor bruto',
  AUTORIZACAO_MISMATCH: 'Autorização',
  TERMINAL_MISMATCH:    'Terminal',
  NSU_MISMATCH:         'NSU (nsuHost)',
  REC_SOMA_MISMATCH:    'Soma recebíveis',
  REC_PARCELAS_MISMATCH:'Parcelas',
};

const MATCH_VIA_LABEL: Record<string, string> = {
  NSU_TERMINAL:        'NSU + Terminal (forte)',
  NSU_AUTORIZACAO:     'NSU + Autorização (médio)',
  AUTORIZACAO_TERMINAL:'Autorização + Terminal (fallback)',
  AUTORIZACAO:         'Só Autorização (fallback final)',
};

function statusTriploBadge(s: string) {
  const e = STATUS_TRIPLO_MAP[s] ?? { cls: 'tab-badge', label: s, title: s };
  return <span className={e.cls} style={{ fontSize: '0.62rem' }} title={e.title}>{e.label}</span>;
}

function DivergenciaRow({ div }: { div: DivergenciaItem }) {
  const isValor = div.dif !== undefined;
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8,
      padding: '3px 0', borderBottom: '1px solid var(--border)',
      fontSize: '0.72rem',
    }}>
      <span style={{
        background: 'rgba(255,93,108,0.12)', color: 'var(--red)',
        border: '1px solid rgba(255,93,108,0.3)', borderRadius: 3,
        padding: '1px 6px', fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        {DIV_LABEL[div.tipo] ?? div.campo}
      </span>
      <span style={{ color: 'var(--muted)', flexShrink: 0 }}>esperado:</span>
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{div.esperado}</span>
      <span style={{ color: 'var(--muted)', flexShrink: 0 }}>encontrado:</span>
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>{div.encontrado}</span>
      {isValor && div.dif !== 0 && (
        <span style={{ fontFamily: 'var(--font-mono)', color: div.dif! > 0 ? 'var(--teal)' : 'var(--red)', marginLeft: 'auto', flexShrink: 0 }}>
          {div.dif! > 0 ? '+' : ''}{fmtMoeda(div.dif!)}
        </span>
      )}
    </div>
  );
}

function RastreioExpandido({ tx }: { tx: RastreioTransacao }) {
  const cell: React.CSSProperties = {
    padding: '4px 8px', fontSize: '0.7rem',
    fontFamily: 'var(--font-mono)', verticalAlign: 'top',
  };
  const label: React.CSSProperties = {
    fontSize: '0.62rem', color: 'var(--muted)', fontFamily: 'var(--font-ui)',
    textTransform: 'uppercase', letterSpacing: '0.04em', padding: '4px 8px',
    whiteSpace: 'nowrap',
  };

  const somaRec = tx.recebiveis.reduce((a, r) => a + r.valorLiquido, 0);

  return (
    <tr style={{ background: 'rgba(0,0,0,0.18)' }}>
      <td colSpan={10} style={{ padding: 'var(--sp-3) var(--sp-5)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-4)' }}>

          {/* Coluna: Venda (Getnet) */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <div style={{ padding: '4px 8px', background: 'rgba(0,201,177,0.08)', borderBottom: '1px solid var(--border)', fontSize: '0.68rem', fontWeight: 600, color: 'var(--teal)', letterSpacing: '0.04em' }}>
              VENDA · {tx.gateway}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr><td style={label}>NSU</td><td style={cell}>{tx.nsu || '—'}</td></tr>
                <tr><td style={label}>Autorização</td><td style={cell}>{tx.autorizacao || '—'}</td></tr>
                <tr><td style={label}>Terminal</td><td style={cell}>{tx.terminal || '—'}</td></tr>
                <tr><td style={label}>Cartão</td><td style={cell}>{tx.cartaoMascarado ? `••••${tx.cartaoMascarado.slice(-4)}` : '—'}</td></tr>
                <tr><td style={label}>Meio captura</td><td style={{ ...cell, fontSize: '0.68rem', color: 'var(--muted)' }}>{tx.meioCaptura || '—'}</td></tr>
                <tr><td style={label}>Bruto</td><td style={{ ...cell, color: 'var(--teal)' }}>{fmtMoeda(tx.valorBruto)}</td></tr>
                <tr><td style={label}>Taxa</td><td style={{ ...cell, color: 'var(--red)' }}>{fmtMoeda(tx.valorTaxa)}</td></tr>
                <tr><td style={label}>Líquido</td><td style={{ ...cell, color: 'var(--teal)' }}>{fmtMoeda(tx.valorLiquido)}</td></tr>
                <tr><td style={label}>Parcelas</td><td style={cell}>{tx.parcelas}x</td></tr>
              </tbody>
            </table>
          </div>

          {/* Coluna: SITEF */}
          <div style={{ border: `1px solid ${tx.sitef ? 'var(--border)' : 'rgba(255,93,108,0.25)'}`, borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <div style={{
              padding: '4px 8px',
              background: tx.sitef ? 'rgba(240,165,0,0.06)' : 'rgba(255,93,108,0.06)',
              borderBottom: '1px solid var(--border)',
              fontSize: '0.68rem', fontWeight: 600,
              color: tx.sitef ? 'var(--gold)' : 'var(--red)',
              letterSpacing: '0.04em',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>SITEF</span>
              {tx.matchVia && (
                <span style={{ fontSize: '0.55rem', fontWeight: 400, color: 'var(--muted)', fontFamily: 'var(--font-ui)' }}>
                  via {MATCH_VIA_LABEL[tx.matchVia] ?? tx.matchVia}
                </span>
              )}
            </div>
            {tx.sitef ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td style={label}>NSU</td><td style={cell}>{tx.sitef.nsu || '—'}</td></tr>
                  <tr><td style={label}>NSU Host</td><td style={{ ...cell, color: tx.nsu === tx.sitef.nsuHost ? 'var(--teal)' : 'var(--red)' }}>{tx.sitef.nsuHost || '—'}</td></tr>
                  <tr><td style={label}>Autorização</td><td style={{ ...cell, color: tx.autorizacao === tx.sitef.autorizacao ? 'var(--teal)' : 'var(--red)' }}>{tx.sitef.autorizacao || '—'}</td></tr>
                  <tr><td style={label}>Terminal</td><td style={{ ...cell, color: tx.terminal === tx.sitef.terminalLogico ? 'var(--teal)' : 'var(--red)' }}>{tx.sitef.terminalLogico || '—'}</td></tr>
                  <tr><td style={label}>Estado</td><td style={cell}><span className="tab-badge tab-badge-teal" style={{ fontSize: '0.58rem' }}>{tx.sitef.estadoTransacao}</span></td></tr>
                  <tr><td style={label}>Valor</td><td style={{ ...cell, color: Math.abs(tx.valorBruto - tx.sitef.valor) <= 0.05 ? 'var(--teal)' : 'var(--red)' }}>{fmtMoeda(tx.sitef.valor)}</td></tr>
                  <tr><td style={label}>Produto</td><td style={{ ...cell, fontSize: '0.68rem', color: 'var(--muted)' }}>{tx.sitef.tipoProduto || '—'}</td></tr>
                  <tr><td style={label}>Parcelas</td><td style={cell}>{tx.sitef.nrParcelas > 0 ? `${tx.sitef.nrParcelas}x` : '—'}</td></tr>
                  <tr><td style={label}>Data</td><td style={cell}>{tx.sitef.dataDia || '—'}</td></tr>
                </tbody>
              </table>
            ) : (
              <div style={{ padding: 'var(--sp-4)', color: 'var(--muted)', fontSize: '0.72rem' }}>
                <div style={{ color: 'var(--red)', fontWeight: 600, marginBottom: 4 }}>Sem correspondência no SITEF</div>
                {tx.meioCaptura && (
                  <div style={{ fontSize: '0.68rem' }}>
                    Meio captura: <span style={{ color: 'var(--text)' }}>{tx.meioCaptura}</span>
                    {['POS', 'PDV', 'OFFLINE'].some(m => tx.meioCaptura?.toUpperCase().includes(m)) && (
                      <div style={{ marginTop: 4, color: 'var(--gold)', fontSize: '0.65rem' }}>
                        Operação POS/offline pode não estar registrada no SITEF
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Coluna: Recebiveis */}
          <div style={{ border: `1px solid ${tx.recebiveis.length > 0 ? 'var(--border)' : 'rgba(255,93,108,0.25)'}`, borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <div style={{
              padding: '4px 8px',
              background: tx.recebiveis.length > 0 ? 'rgba(240,165,0,0.06)' : 'rgba(255,93,108,0.06)',
              borderBottom: '1px solid var(--border)',
              fontSize: '0.68rem', fontWeight: 600,
              color: tx.recebiveis.length > 0 ? 'var(--gold)' : 'var(--red)',
              letterSpacing: '0.04em',
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span>RECEBÍVEIS</span>
              {tx.recebiveis.length > 0 && (
                <span style={{ fontWeight: 400, color: 'var(--muted)', fontFamily: 'var(--font-ui)', fontSize: '0.6rem' }}>
                  {tx.recebiveis.length} registro{tx.recebiveis.length !== 1 ? 's' : ''} · {fmtMoeda(somaRec)}
                </span>
              )}
            </div>
            {tx.recebiveis.length === 0 ? (
              <div style={{ padding: 'var(--sp-4)', color: 'var(--muted)', fontSize: '0.72rem' }}>
                <div style={{ color: 'var(--red)', fontWeight: 600, marginBottom: 4 }}>Nenhum recebível encontrado</div>
                <div style={{ fontSize: '0.68rem' }}>NSU: {tx.nsu || '—'} · Aut: {tx.autorizacao || '—'}</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...label }}>Venc.</td>
                    <td style={{ ...label }}>Bandeira</td>
                    <td style={{ ...label }}>Tipo</td>
                    <td style={{ ...label, textAlign: 'right' }}>Líquido</td>
                  </tr>
                </thead>
                <tbody>
                  {tx.recebiveis.map(r => (
                    <tr key={r.idempotencyKey} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ ...cell, whiteSpace: 'nowrap' }}>{fmtDate(r.dataVencimento)}</td>
                      <td style={{ ...cell, fontSize: '0.65rem', color: 'var(--muted)' }}>{r.bandeira}</td>
                      <td style={{ ...cell, fontSize: '0.62rem', color: 'var(--muted)' }}>{r.tipoLancamento}</td>
                      <td style={{ ...cell, textAlign: 'right', color: 'var(--teal)' }}>{fmtMoeda(r.valorLiquido)}</td>
                    </tr>
                  ))}
                  {tx.recebiveis.length > 1 && (
                    <tr style={{ borderTop: '1px solid var(--border)', fontWeight: 600 }}>
                      <td colSpan={3} style={{ ...label }}>SOMA</td>
                      <td style={{ ...cell, textAlign: 'right', color: Math.abs(somaRec - tx.valorLiquido) <= 0.05 ? 'var(--teal)' : 'var(--red)' }}>
                        {fmtMoeda(somaRec)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Divergências */}
        {tx.divergencias.length > 0 && (
          <div style={{ marginTop: 'var(--sp-3)', padding: 'var(--sp-3)', background: 'rgba(255,93,108,0.05)', border: '1px solid rgba(255,93,108,0.2)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--red)', marginBottom: 'var(--sp-2)', letterSpacing: '0.05em' }}>
              DIVERGÊNCIAS DETECTADAS ({tx.divergencias.length})
            </div>
            {tx.divergencias.map((d, i) => <DivergenciaRow key={i} div={d} />)}
          </div>
        )}
      </td>
    </tr>
  );
}

function TabRastreio() {
  const rastreio       = useAdquirenteStore(s => s.rastreio);
  const loading        = useAdquirenteStore(s => s.loadingRastreio);
  const filter         = useAdquirenteStore(s => s.rastreioFilter);
  const loadRastreio   = useAdquirenteStore(s => s.loadRastreio);

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [pagamentoKey, setPagamentoKey] = useState<string | null>(null);

  const toggleRow = (key: string) =>
    setExpandidos(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  const selStyle: React.CSSProperties = {
    background: 'var(--panel)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text)',
    fontFamily: 'var(--font-ui)', fontSize: '0.75rem',
    padding: '5px 10px', outline: 'none', cursor: 'pointer',
  };
  const inpStyle: React.CSSProperties = { ...selStyle, fontFamily: 'var(--font-mono)', width: 140 };

  const applyFilter = (patch: Parameters<typeof loadRastreio>[0]) => {
    void loadRastreio({ ...patch, page: 1 });
    setExpandidos(new Set());
  };

  const totalPages = rastreio ? Math.ceil(rastreio.total / filter.limit) : 0;

  // Contagens KPI por status
  const kpiConc = rastreio?.resumoConc ?? [];
  const total   = rastreio?.total ?? 0;
  const concCount = kpiConc.find(s => s.statusConc === 'CONCILIADO')?._count.idempotencyKey ?? 0;
  const divCount  = kpiConc.find(s => s.statusConc === 'DIVERGENTE')?._count.idempotencyKey ?? 0;
  const semCount  = kpiConc.find(s => s.statusConc === 'SEM_SITEF')?._count.idempotencyKey ?? 0;

  return (
    <div>
      {/* Nota explicativa */}
      <div style={{
        padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-4)',
        background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)',
        borderRadius: 'var(--radius)', fontSize: '0.72rem', color: 'var(--text-soft)',
        display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start',
      }}>
        <span style={{ color: 'var(--gold)', fontSize: '0.9rem', lineHeight: 1 }}>ⓘ</span>
        <span>
          Rastreio analítico: cruza <strong>Venda (Getnet)</strong> × <strong>SITEF</strong> × <strong>Recebível</strong> por NSU, NSU Host e Autorização.
          Operações POS e tipos sem registro no TEF podem aparecer como <strong>SEM SITEF</strong> sem ser erro.
          Clique em uma linha para ver o detalhe campo a campo.
        </span>
      </div>

      {/* KPI Summary */}
      {rastreio && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Total Vendas</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700 }}>{total.toLocaleString('pt-BR')}</div>
          </div>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--teal)', borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Conciliados</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--teal)' }}>{concCount.toLocaleString('pt-BR')}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: 2 }}>
              {total > 0 ? `${((concCount / total) * 100).toFixed(1)}%` : '—'}
            </div>
          </div>
          <div style={{ background: 'var(--panel)', border: divCount > 0 ? '1px solid var(--red)' : '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Divergentes</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: divCount > 0 ? 'var(--red)' : 'var(--muted)' }}>
              {divCount.toLocaleString('pt-BR')}
            </div>
          </div>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Sem SITEF</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: semCount > 0 ? 'var(--gold)' : 'var(--muted)' }}>
              {semCount.toLocaleString('pt-BR')}
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: 2 }}>POS/offline incluído</div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="actions-row" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
        <select style={selStyle} value={filter.gateway ?? ''} onChange={e => applyFilter({ gateway: e.target.value || undefined })}>
          <option value="">Todos gateways</option>
          {GATEWAYS.map(g => <option key={g}>{g}</option>)}
        </select>
        <select style={selStyle} value={filter.bandeira ?? ''} onChange={e => applyFilter({ bandeira: e.target.value || undefined })}>
          <option value="">Todas bandeiras</option>
          {['VISA','MASTER','ELO','AMEX','HIPERCARD','ALELO','TICKET','BEN','OUTROS'].map(b => <option key={b}>{b}</option>)}
        </select>
        <select style={selStyle} value={filter.modalidade ?? ''} onChange={e => applyFilter({ modalidade: e.target.value || undefined })}>
          <option value="">Todas modalidades</option>
          {['CREDITO','DEBITO','VOUCHER'].map(m => <option key={m}>{m}</option>)}
        </select>
        <select style={selStyle} value={filter.statusConc ?? ''} onChange={e => applyFilter({ statusConc: e.target.value || undefined })}>
          <option value="">Todos status conc.</option>
          {['PENDENTE','CONCILIADO','DIVERGENTE','SEM_SITEF','SEM_ADQ'].map(s => <option key={s}>{s}</option>)}
        </select>
        <input style={inpStyle} type="date" value={filter.dataInicio ?? ''}
          onChange={e => applyFilter({ dataInicio: e.target.value || undefined })} />
        <input style={inpStyle} type="date" value={filter.dataFim ?? ''}
          onChange={e => applyFilter({ dataFim: e.target.value || undefined })} />
        <button className="btn btn-primary" style={{ fontSize: '0.72rem' }}
          onClick={() => { void loadRastreio(); setExpandidos(new Set()); }}>
          Buscar
        </button>
        {loading && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Analisando...</span>}
        {rastreio && !loading && (
          <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
            {rastreio.total.toLocaleString('pt-BR')} transações
          </span>
        )}
      </div>

      {/* Tabela */}
      {!rastreio && !loading ? (
        <div className="empty-state" style={{ padding: 'var(--sp-10)' }}>
          <svg className="empty-state-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <div className="empty-state-title">Configure os filtros e clique em Buscar</div>
          <div className="empty-state-sub">O rastreio cruza Venda × SITEF × Recebível e detecta divergências por campo.</div>
        </div>
      ) : rastreio?.transacoes.length === 0 && !loading ? (
        <div className="empty-state" style={{ padding: 'var(--sp-10)' }}>
          <div className="empty-state-title">Nenhuma venda encontrada para os filtros selecionados</div>
        </div>
      ) : rastreio && (
        <div className="transactions-section">
          <div className="transactions-header">
            <span className="transactions-title">Rastreio Analítico</span>
            <span className="transactions-count">
              {rastreio.transacoes.length} de {rastreio.total.toLocaleString('pt-BR')} · página {filter.page}
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="trn-table">
              <thead>
                <tr>
                  <th style={{ width: 24 }}></th>
                  <th>Data/Hora</th>
                  <th>NSU</th>
                  <th>Bandeira</th>
                  <th>Modal.</th>
                  <th>Parcelas</th>
                  <th className="right">Bruto</th>
                  <th className="right">Líquido</th>
                  <th>Conc.</th>
                  <th>Rastreio</th>
                  <th>Pgto.</th>
                </tr>
              </thead>
              <tbody>
                {rastreio.transacoes.map(tx => {
                  const expanded = expandidos.has(tx.idempotencyKey);
                  const temDiv   = tx.divergencias.length > 0;
                  return (
                    <>
                      <tr
                        key={tx.idempotencyKey}
                        style={{
                          cursor: 'pointer',
                          background: expanded ? 'rgba(0,201,177,0.04)' : temDiv ? 'rgba(255,93,108,0.04)' : undefined,
                        }}
                        onClick={() => toggleRow(tx.idempotencyKey)}
                      >
                        <td style={{ textAlign: 'center', fontSize: '0.65rem', color: 'var(--muted)' }}>
                          {expanded ? '▼' : '▶'}
                        </td>
                        <td className="date-cell" style={{ fontSize: '0.7rem' }}>
                          {fmtDateTime(tx.dataHoraVenda)}
                        </td>
                        <td className="mono-cell" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
                          {tx.nsu}
                        </td>
                        <td style={{ fontSize: '0.72rem' }}>{tx.bandeira}</td>
                        <td style={{ fontSize: '0.7rem', color: 'var(--text-soft)' }}>{tx.modalidade}</td>
                        <td className="mono-cell" style={{ textAlign: 'center', color: 'var(--muted)' }}>{tx.parcelas}x</td>
                        <td className="cred-cell">{fmtMoeda(tx.valorBruto)}</td>
                        <td className="cred-cell">{fmtMoeda(tx.valorLiquido)}</td>
                        <td>{statusConcBadge(tx.statusConc)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {statusTriploBadge(tx.statusTriplo)}
                            {temDiv && (
                              <span style={{
                                background: 'var(--red)', color: '#fff',
                                borderRadius: '50%', width: 16, height: 16,
                                fontSize: '0.6rem', fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                              }}>
                                {tx.divergencias.length}
                              </span>
                            )}
                          </div>
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: '0.62rem', padding: '2px 8px', whiteSpace: 'nowrap' }}
                            onClick={() => setPagamentoKey(tx.idempotencyKey)}
                          >
                            Ver Pgto.
                          </button>
                        </td>
                      </tr>
                      {expanded && <RastreioExpandido key={`exp-${tx.idempotencyKey}`} tx={tx} />}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-4)', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost" disabled={filter.page <= 1}
                onClick={() => { void loadRastreio({ page: filter.page - 1 }); setExpandidos(new Set()); }}>← Anterior</button>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                {filter.page} / {totalPages}
              </span>
              <button className="btn btn-ghost" disabled={filter.page >= totalPages}
                onClick={() => { void loadRastreio({ page: filter.page + 1 }); setExpandidos(new Set()); }}>Próxima →</button>
            </div>
          )}
        </div>
      )}

      {pagamentoKey && (
        <VendaPagamentoModal vendaKey={pagamentoKey} onClose={() => setPagamentoKey(null)} />
      )}
    </div>
  );
}

// ── Relatório de Taxas — impressão ───────────────────────────────

function printTaxasRelatorio(resumo: ResumoVendas, periodo: { dataInicio?: string; dataFim?: string }) {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const taxaMedia = resumo.totais.totalBruto > 0
    ? ((resumo.totais.totalTaxa / resumo.totais.totalBruto) * 100)
    : 0;

  const linhas = resumo.porBandeira.map(l => {
    const pct = l.taxaEfetivaPct.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    return `<tr>
      <td>${l.bandeira}</td><td>${l.modalidade}</td>
      <td class="r">${l.qtd}</td>
      <td class="r">R$ ${fmt(l.totalBruto)}</td>
      <td class="r">R$ ${fmt(l.totalTaxa)}</td>
      <td class="r">${pct}%</td>
      <td class="r">R$ ${fmt(l.totalLiquido)}</td>
    </tr>`;
  }).join('');

  const pct = taxaMedia.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório de Taxas — ThemisFlow</title>
<style>
  body{font-family:Arial,sans-serif;margin:24px;color:#222;font-size:12px}
  h1{font-size:15px;margin-bottom:4px}
  .meta{font-size:11px;color:#555;margin-bottom:20px}
  table{border-collapse:collapse;width:100%}
  th{background:#f0f0f0;padding:7px 8px;text-align:left;border:1px solid #ccc;font-weight:bold;font-size:11px}
  td{padding:5px 8px;border:1px solid #ddd}
  tr:nth-child(even){background:#f9f9f9}
  .r{text-align:right}
  tfoot td{font-weight:bold;background:#e3f2fd;border-top:2px solid #aaa}
  @media print{body{margin:0}}
</style></head><body>
<h1>Relatório de Taxas de Cartão</h1>
<div class="meta">
  ${periodo.dataInicio && periodo.dataFim
    ? `Período: ${periodo.dataInicio.split('-').reverse().join('/')} a ${periodo.dataFim.split('-').reverse().join('/')}&nbsp;&nbsp;·&nbsp;&nbsp;`
    : ''}
  Emitido em: ${new Date().toLocaleDateString('pt-BR')} &nbsp;·&nbsp; ThemisFlow
</div>
<table>
<thead><tr>
  <th>Bandeira</th><th>Modalidade</th><th class="r">Qtd</th>
  <th class="r">Total Bruto</th><th class="r">Total Taxas</th>
  <th class="r">Taxa %</th><th class="r">Total Líquido</th>
</tr></thead>
<tbody>${linhas}</tbody>
<tfoot><tr>
  <td>TOTAL</td><td>—</td>
  <td class="r">${resumo.totais.qtd}</td>
  <td class="r">R$ ${fmt(resumo.totais.totalBruto)}</td>
  <td class="r">R$ ${fmt(resumo.totais.totalTaxa)}</td>
  <td class="r">${pct}%</td>
  <td class="r">R$ ${fmt(resumo.totais.totalLiquido)}</td>
</tr></tfoot>
</table>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

// ── Tab Taxas ─────────────────────────────────────────────────────

function TabTaxas() {
  const taxasResumo     = useAdquirenteStore(s => s.taxasResumo);
  const loadingTaxas    = useAdquirenteStore(s => s.loadingTaxas);
  const taxasFilter     = useAdquirenteStore(s => s.taxasFilter);
  const loadTaxasResumo = useAdquirenteStore(s => s.loadTaxasResumo);

  const [draft, setDraft] = useState(taxasFilter);

  const buscar = () => void loadTaxasResumo(draft);

  const inpStyle: React.CSSProperties = {
    background: 'var(--panel)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text)',
    fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
    padding: '5px 10px', outline: 'none', width: 140,
  };
  const selStyle: React.CSSProperties = { ...inpStyle, fontFamily: 'var(--font-ui)', width: 'auto', cursor: 'pointer' };

  const totais = taxasResumo?.totais;
  const taxaMedia = totais && totais.totalBruto > 0
    ? (totais.totalTaxa / totais.totalBruto) * 100
    : 0;

  const handleCSV = () => {
    if (!taxasResumo) return;
    const csv = exportTaxasCSV(taxasResumo, { dataInicio: taxasFilter.dataInicio, dataFim: taxasFilter.dataFim });
    const dataStr = taxasFilter.dataInicio && taxasFilter.dataFim
      ? `${taxasFilter.dataInicio}_${taxasFilter.dataFim}`
      : new Date().toISOString().slice(0, 10);
    downloadCSV(csv, `taxas-cartao-${dataStr}.csv`);
  };

  const handlePrint = () => {
    if (!taxasResumo) return;
    printTaxasRelatorio(taxasResumo, { dataInicio: taxasFilter.dataInicio, dataFim: taxasFilter.dataFim });
  };

  return (
    <div>
      {/* Nota */}
      <div style={{
        padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-4)',
        background: 'rgba(0,201,177,0.06)', border: '1px solid rgba(0,201,177,0.2)',
        borderRadius: 'var(--radius)', fontSize: '0.72rem', color: 'var(--text-soft)',
        display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start',
      }}>
        <span style={{ color: 'var(--teal)', fontSize: '0.9rem', lineHeight: 1 }}>ⓘ</span>
        <span>
          Relatório de taxas cobradas por bandeira e modalidade no período selecionado.
          Utilize <strong>Exportar CSV</strong> para enviar à contabilidade no Excel
          ou <strong>Imprimir / PDF</strong> para gerar um relatório formatado.
        </span>
      </div>

      {/* Filtros */}
      <div className="actions-row" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
        <select style={selStyle} value={draft.gateway ?? ''} onChange={e => setDraft(d => ({ ...d, gateway: e.target.value || undefined }))}>
          <option value="">Todos gateways</option>
          {GATEWAYS.map(g => <option key={g}>{g}</option>)}
        </select>
        <input style={inpStyle} type="date" value={draft.dataInicio ?? ''}
          onChange={e => setDraft(d => ({ ...d, dataInicio: e.target.value || undefined }))} />
        <span style={{ color: 'var(--muted)', fontSize: '0.72rem', alignSelf: 'center' }}>até</span>
        <input style={inpStyle} type="date" value={draft.dataFim ?? ''}
          onChange={e => setDraft(d => ({ ...d, dataFim: e.target.value || undefined }))} />
        <button className="btn btn-primary" style={{ fontSize: '0.72rem' }} onClick={buscar}>
          Buscar
        </button>
        {loadingTaxas && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Carregando...</span>}

        {taxasResumo && !loadingTaxas && (
          <>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.72rem', marginLeft: 'auto' }}
              onClick={handleCSV}
            >
              ↓ Exportar CSV
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.72rem' }}
              onClick={handlePrint}
            >
              ⎙ Imprimir / PDF
            </button>
          </>
        )}
      </div>

      {/* KPI cards */}
      {taxasResumo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Total Bruto</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700 }}>{fmtMoeda(taxasResumo.totais.totalBruto)}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: 2 }}>{taxasResumo.totais.qtd} transações</div>
          </div>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--red)', borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Total Taxas</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--red)' }}>{fmtMoeda(taxasResumo.totais.totalTaxa)}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: 2 }}>custo MDR cobrado</div>
          </div>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--gold)', borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>% Taxa Média</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--gold)' }}>
              {taxaMedia.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}%
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: 2 }}>taxa efetiva geral</div>
          </div>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--teal)', borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Total Líquido</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--teal)' }}>{fmtMoeda(taxasResumo.totais.totalLiquido)}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: 2 }}>recebido após taxas</div>
          </div>
        </div>
      )}

      {/* Tabela */}
      {!taxasResumo && !loadingTaxas ? (
        <div className="empty-state" style={{ padding: 'var(--sp-10)' }}>
          <svg className="empty-state-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5">
            <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          <div className="empty-state-title">Selecione o período e clique em Buscar</div>
          <div className="empty-state-sub">O relatório agrega as taxas cobradas por bandeira e modalidade para envio à contabilidade.</div>
        </div>
      ) : taxasResumo && (
        <div className="transactions-section">
          <div className="transactions-header">
            <span className="transactions-title">Taxas por Bandeira / Modalidade</span>
            <span className="transactions-count">{taxasResumo.porBandeira.length} combinações</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="trn-table">
              <thead>
                <tr>
                  <th>Bandeira</th>
                  <th>Modalidade</th>
                  <th className="right">Qtd</th>
                  <th className="right">Total Bruto</th>
                  <th className="right">Total Taxas</th>
                  <th className="right">Taxa %</th>
                  <th className="right">Total Líquido</th>
                </tr>
              </thead>
              <tbody>
                {taxasResumo.porBandeira.map((l, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{l.bandeira}</td>
                    <td style={{ fontSize: '0.72rem', color: 'var(--text-soft)' }}>{l.modalidade}</td>
                    <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--muted)' }}>{l.qtd.toLocaleString('pt-BR')}</td>
                    <td className="cred-cell">{fmtMoeda(l.totalBruto)}</td>
                    <td className="deb-cell">{fmtMoeda(l.totalTaxa)}</td>
                    <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--gold)' }}>{fmtPct(l.taxaEfetivaPct)}</td>
                    <td className="cred-cell">{fmtMoeda(l.totalLiquido)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'rgba(0,201,177,0.06)', fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                  <td colSpan={2} style={{ color: 'var(--text-soft)', fontSize: '0.72rem' }}>TOTAL</td>
                  <td className="mono-cell" style={{ textAlign: 'right' }}>{taxasResumo.totais.qtd.toLocaleString('pt-BR')}</td>
                  <td className="cred-cell">{fmtMoeda(taxasResumo.totais.totalBruto)}</td>
                  <td className="deb-cell">{fmtMoeda(taxasResumo.totais.totalTaxa)}</td>
                  <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--gold)' }}>
                    {fmtPct(taxaMedia)}
                  </td>
                  <td className="cred-cell">{fmtMoeda(taxasResumo.totais.totalLiquido)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Pagamentos / Recebidos ──────────────────────────────────

function TabPagamentos() {
  const loadPagamentos    = useAdquirenteStore(s => s.loadPagamentos);
  const loading           = useAdquirenteStore(s => s.loadingPagamentos);
  const data              = useAdquirenteStore(s => s.pagamentosData);
  const filter            = useAdquirenteStore(s => s.pagamentosFilter);

  const [mes, setMes]               = useState(filter.mes || '2026-05');
  const [dataInicio, setDataInicio] = useState(filter.dataInicio || '');
  const [dataFim, setDataFim]       = useState(filter.dataFim || '');
  const [gateway, setGateway]       = useState(filter.gateway || '');
  const [tipo, setTipo]             = useState(filter.tipo || 'TODOS');
  const [search, setSearch]         = useState('');

  useEffect(() => {
    void loadPagamentos({ mes: '2026-05' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyFilter = (patch?: Partial<typeof filter>) => {
    void loadPagamentos({
      mes: !dataInicio ? mes : undefined,
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      gateway: gateway || undefined,
      tipo: tipo as any,
      page: 1,
      ...patch,
    });
  };

  const kpis = data?.kpis;
  const porOrigem = data?.porOrigem ?? [];
  const tarifasAudit = data?.tarifasAudit ?? [];
  const itens = data?.itens ?? [];
  const paginacao = data?.paginacao;

  const filteredItens = itens.filter(i => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return `${i.nsu ?? ''} ${i.autorizacao ?? ''} ${i.gateway} ${i.bandeira} ${i.modalidade} ${i.lancamento}`.toLowerCase().includes(q);
  });

  const handleExportCSV = () => {
    if (!itens || itens.length === 0) return;
    const BOM = '\uFEFF';
    const SEP = ';';
    const row = (cells: (string | number)[]) => cells.map(c => `"${String(c).replace(/"/g, '""')}"`).join(SEP);
    const header = row(['Data Pagamento', 'Data Venda', 'Origem', 'Lançamento', 'Bandeira', 'Modalidade', 'NSU', 'Valor Venda', 'Descontos', 'Valor Liquidado', 'Status']);
    const lines = itens.map(r => row([
      r.dataVencimento,
      r.dataVenda || '',
      r.gateway,
      r.lancamento,
      r.bandeira,
      r.modalidade,
      r.nsu || '',
      r.valorBruto.toFixed(2).replace('.', ','),
      r.descontos.toFixed(2).replace('.', ','),
      r.valorLiquidado.toFixed(2).replace('.', ','),
      r.statusConc,
    ]));
    downloadCSV(BOM + [header, ...lines].join('\n') + '\n', `pagamentos_${mes}_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div>
      {/* Subheader & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            Controle de Pagamentos Realizados (Liquidações Efetivas)
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-soft)', margin: '2px 0 0' }}>
            Acompanhe o que de fato foi liquidado na conta bancária por credenciadora e audite tarifas debitadas
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleExportCSV}
            className="btn btn-secondary"
            style={{ fontSize: '0.72rem', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Exportar Extrato CSV
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        marginBottom: 'var(--sp-4)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-soft)' }}>Mês:</span>
          <select
            value={mes}
            onChange={e => {
              setMes(e.target.value);
              setDataInicio('');
              setDataFim('');
              void loadPagamentos({ mes: e.target.value, dataInicio: undefined, dataFim: undefined, page: 1 });
            }}
            style={{
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 8px',
              fontSize: '0.75rem',
            }}
          >
            <option value="2026-05">Maio / 2026</option>
            <option value="2026-06">Junho / 2026</option>
            <option value="2026-07">Julho / 2026</option>
            <option value="2026-08">Agosto / 2026</option>
            <option value="2026-09">Setembro / 2026</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-soft)' }}>Origem:</span>
          <select
            value={gateway}
            onChange={e => {
              setGateway(e.target.value);
              handleApplyFilter({ gateway: e.target.value });
            }}
            style={{
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 8px',
              fontSize: '0.75rem',
            }}
          >
            <option value="">Todas as Credenciadoras</option>
            {GATEWAYS.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-soft)' }}>Tipo:</span>
          <select
            value={tipo}
            onChange={e => {
              setTipo(e.target.value as any);
              handleApplyFilter({ tipo: e.target.value as any });
            }}
            style={{
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 8px',
              fontSize: '0.75rem',
            }}
          >
            <option value="TODOS">Todos os Lançamentos</option>
            <option value="LIQUIDACOES">Somente Liquidações de Vendas</option>
            <option value="TARIFAS">Somente Tarifas e Aluguéis</option>
            <option value="PAGAMENTO_REALIZADO">Lotes Consolidados (Crédito em Conta)</option>
          </select>
        </div>

        <button
          onClick={() => handleApplyFilter()}
          className="btn btn-primary"
          style={{ fontSize: '0.72rem', padding: '4px 10px', marginLeft: 'auto' }}
        >
          {loading ? 'Filtrando...' : 'Filtrar'}
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 'var(--sp-4)',
        marginBottom: 'var(--sp-5)',
      }}>
        <div className="kpi-card" style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16 }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Total Efetivo Recebido</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--gold)', margin: '6px 0 2px', fontFamily: 'var(--font-mono)' }}>
            {fmtMoeda(kpis?.totalRecebido ?? 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-soft)' }}>
            {kpis?.countLiquidacoes?.toLocaleString('pt-BR') ?? 0} transações liquidadas
          </div>
        </div>

        <div className="kpi-card" style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16 }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Valor Bruto das Vendas</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--teal)', margin: '6px 0 2px', fontFamily: 'var(--font-mono)' }}>
            {fmtMoeda(kpis?.totalBruto ?? 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-soft)' }}>
            Faturamento liquidado
          </div>
        </div>

        <div className="kpi-card" style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16 }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Descontos MDR Retidos</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--coral)', margin: '6px 0 2px', fontFamily: 'var(--font-mono)' }}>
            {fmtMoeda(kpis?.totalDescontosMdr ?? 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-soft)' }}>
            Taxa média retida: {kpis?.totalBruto ? fmtPct((kpis.totalDescontosMdr / kpis.totalBruto) * 100) : '—'}
          </div>
        </div>

        <div className="kpi-card" style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16 }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Tarifas / Aluguéis Debitados</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--coral)', margin: '6px 0 2px', fontFamily: 'var(--font-mono)' }}>
            {fmtMoeda(kpis?.totalTarifas ?? 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-soft)' }}>
            {kpis?.countTarifas ?? 0} débitos de máquina / mensais
          </div>
        </div>
      </div>

      {/* Quadro: Resumo por Origem (Credenciadoras) */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 'var(--sp-5)' }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '0 0 12px', color: 'var(--text)' }}>
          Resumo de Recebimentos por Origem (Credenciadora / Voucher)
        </h4>

        <table className="data-table" style={{ width: '100%', fontSize: '0.75rem' }}>
          <thead>
            <tr>
              <th>Origem (Credenciadora)</th>
              <th style={{ textAlign: 'right' }}>Qtd Vendas Pagas</th>
              <th style={{ textAlign: 'right' }}>Total Bruto</th>
              <th style={{ textAlign: 'right' }}>Taxa MDR Retida</th>
              <th style={{ textAlign: 'right' }}>Aluguéis / Tarifas</th>
              <th style={{ textAlign: 'right' }}>Líquido Recebido</th>
              <th style={{ textAlign: 'right' }}>% Participação</th>
            </tr>
          </thead>
          <tbody>
            {porOrigem.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)' }}>Nenhum recebimento registrado neste período.</td></tr>
            ) : (
              porOrigem.map(o => (
                <tr key={o.gateway}>
                  <td style={{ fontWeight: 700, color: 'var(--teal)' }}>{o.gateway}</td>
                  <td className="mono-cell" style={{ textAlign: 'right' }}>{o.count.toLocaleString('pt-BR')}</td>
                  <td className="cred-cell">{fmtMoeda(o.totalBruto)}</td>
                  <td className="deb-cell">{fmtMoeda(o.totalDescontos)}</td>
                  <td className="deb-cell" style={{ color: o.totalTarifas > 0 ? 'var(--coral)' : 'var(--muted)' }}>
                    {fmtMoeda(o.totalTarifas)}
                  </td>
                  <td className="cred-cell" style={{ fontWeight: 700, color: 'var(--gold)' }}>{fmtMoeda(o.totalRecebido)}</td>
                  <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--text-soft)' }}>{fmtPct(o.participacaoPct)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Auditoria de Tarifas & Duplicidades */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 'var(--sp-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Auditoria de Tarifas Administrativas & Aluguéis de POS
            </h4>
            <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: '2px 0 0' }}>
              Validação automática de encargos e detecção de cobranças duplicadas ou fora do período contratual
            </p>
          </div>
        </div>

        {tarifasAudit.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.78rem' }}>
            Nenhum encargo ou aluguel de terminal debitado nesta competência.
          </div>
        ) : (
          <table className="data-table" style={{ width: '100%', fontSize: '0.75rem' }}>
            <thead>
              <tr>
                <th>Data Débito</th>
                <th>Origem</th>
                <th>EC / Terminal</th>
                <th>Descrição do Encargo</th>
                <th style={{ textAlign: 'right' }}>Valor Debitado</th>
                <th style={{ textAlign: 'center' }}>Auditoria / Status</th>
              </tr>
            </thead>
            <tbody>
              {tarifasAudit.map(t => (
                <tr key={t.id}>
                  <td className="mono-cell">{t.dataVencimento}</td>
                  <td style={{ fontWeight: 600 }}>{t.gateway}</td>
                  <td className="mono-cell">{t.ec}</td>
                  <td style={{ fontWeight: 600, color: 'var(--text)' }}>{t.lancamento}</td>
                  <td className="deb-cell" style={{ fontWeight: 700 }}>{fmtMoeda(t.valor)}</td>
                  <td style={{ textAlign: 'center' }}>
                    {t.duplicada ? (
                      <span className="tab-badge tab-badge-warn" style={{ fontSize: '0.62rem' }} title={t.motivoDuplicidade}>
                        ⚠️ POSSÍVEL DUPLICIDADE
                      </span>
                    ) : (
                      <span className="tab-badge tab-badge-teal" style={{ fontSize: '0.62rem' }}>
                        ✓ REGULAR
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Extrato Analítico de Liquidações */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            Extrato Analítico de Liquidações ({paginacao?.total ?? 0} registros)
          </h4>

          <input
            type="text"
            placeholder="Filtrar por NSU, autorização..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '4px 10px',
              fontSize: '0.75rem',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)',
              width: 220,
            }}
          />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', fontSize: '0.75rem' }}>
            <thead>
              <tr>
                <th>Data Pagto</th>
                <th>Data Venda</th>
                <th>Origem</th>
                <th>Lançamento</th>
                <th>Bandeira</th>
                <th>Modalidade</th>
                <th>NSU</th>
                <th style={{ textAlign: 'right' }}>Valor Venda</th>
                <th style={{ textAlign: 'right' }}>Descontos</th>
                <th style={{ textAlign: 'right' }}>Valor Liquidado</th>
                <th style={{ textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredItens.length === 0 ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>Nenhum lançamento encontrado.</td></tr>
              ) : (
                filteredItens.map(r => (
                  <tr key={r.id}>
                    <td className="mono-cell" style={{ fontWeight: 600 }}>{r.dataVencimento}</td>
                    <td className="mono-cell" style={{ color: 'var(--muted)' }}>{r.dataVenda || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{r.gateway}</td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.lancamento}>
                      {r.lancamento}
                    </td>
                    <td>{r.bandeira}</td>
                    <td style={{ color: 'var(--text-soft)' }}>{r.modalidade}</td>
                    <td className="mono-cell">{r.nsu || '—'}</td>
                    <td className="cred-cell">{fmtMoeda(r.valorBruto)}</td>
                    <td className="deb-cell">{fmtMoeda(r.descontos)}</td>
                    <td className="cred-cell" style={{ fontWeight: 700, color: 'var(--gold)' }}>{fmtMoeda(r.valorLiquidado)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`tab-badge ${r.statusConc === 'CONCILIADO' ? 'tab-badge-teal' : 'tab-badge-warn'}`} style={{ fontSize: '0.62rem' }}>
                        {r.statusConc}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {paginacao && paginacao.totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              Página {paginacao.page} de {paginacao.totalPages}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => handleApplyFilter({ page: (paginacao.page || 1) - 1 })}
                disabled={paginacao.page <= 1 || loading}
                className="btn btn-secondary"
                style={{ fontSize: '0.7rem', padding: '3px 8px' }}
              >
                ← Anterior
              </button>
              <button
                onClick={() => handleApplyFilter({ page: (paginacao.page || 1) + 1 })}
                disabled={paginacao.page >= paginacao.totalPages || loading}
                className="btn btn-secondary"
                style={{ fontSize: '0.7rem', padding: '3px 8px' }}
              >
                Próxima →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab: Cruzamento ERP ───────────────────────────────────────────

interface CruzamentoKpis {
  totalAdquirente:   number;
  totalErp:          number;
  matches:           number;
  divergentes:       number;
  soAdquirente:      number;
  soErp:             number;
  valorSoAdquirente: number;
  valorSoErp:        number;
  taxaMatch:         number;
}

interface CruzamentoDia {
  data:            string;
  qtdAdquirente:   number;
  valorAdquirente: number;
  qtdErp:          number;
  valorErp:        number;
  difQtd:          number;
  difValor:        number;
}

interface CruzamentoMatch {
  vendaKey:        string;
  nsuAdq:          string | null;
  nsuErp:          string | null;
  nsuHostErp:      string | null;
  autorizacao:     string | null;
  valorAdquirente: number;
  valorErp:        number;
  dif:             number;
  matchVia:        string;
  bandeira:        string;
  dataHoraVenda:   string;
  pdvErp:          string;
}

interface CruzamentoSoAdq {
  vendaKey:      string;
  nsu:           string | null;
  autorizacao:   string | null;
  terminal:      string | null;
  bandeira:      string;
  modalidade:    string;
  parcelas:      number;
  valorBruto:    number;
  dataHoraVenda: string;
  gateway:       string;
}

interface CruzamentoSoErp {
  id:           string;
  nsu:          string | null;
  nsuHost:      string | null;
  autorizacao:  string | null;
  pdv:          string | null;
  nomecartao:   string | null;
  parcelas:     number;
  valorErp:     number;
  data:         string;
  hora:         string;
}

interface CruzamentoResult {
  periodo:      { dataInicio?: string; dataFim?: string };
  kpis:         CruzamentoKpis;
  resumoPorDia: CruzamentoDia[];
  matches:      CruzamentoMatch[];
  divergentes:  CruzamentoMatch[];
  soAdquirente: CruzamentoSoAdq[];
  soErp:        CruzamentoSoErp[];
}

const MATCH_VIA_BADGE: Record<string, string> = {
  NSU_HOST:    'NSU Host',
  NSU:         'NSU',
  AUTORIZACAO: 'Autorização',
};

function TabCruzamentoERP() {
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim,    setDataFim]    = useState('');
  const [gateway,    setGateway]    = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [result,     setResult]     = useState<CruzamentoResult | null>(null);
  const [secao,      setSecao]      = useState<'resumo' | 'divergentes' | 'soAdq' | 'soErp'>('resumo');

  const selStyle: React.CSSProperties = {
    background: 'var(--panel)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text)',
    fontFamily: 'var(--font-ui)', fontSize: '0.75rem',
    padding: '5px 10px', outline: 'none', cursor: 'pointer',
  };
  const inpStyle: React.CSSProperties = { ...selStyle, fontFamily: 'var(--font-mono)', width: 140 };

  const buscar = async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.post<{ success: boolean } & CruzamentoResult>(
        '/adquirente/cruzamento-erp',
        { dataInicio: dataInicio || undefined, dataFim: dataFim || undefined, gateway: gateway || undefined },
      );
      setResult(res.data);
      setSecao('resumo');
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Erro ao executar cruzamento');
    } finally {
      setLoading(false);
    }
  };

  const kpi = result?.kpis;

  return (
    <div>
      {/* Nota explicativa */}
      <div style={{
        padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-4)',
        background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)',
        borderRadius: 'var(--radius)', fontSize: '0.72rem', color: 'var(--text-soft)',
        display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start',
      }}>
        <span style={{ color: 'var(--gold)', fontSize: '0.9rem', lineHeight: 1 }}>ⓘ</span>
        <span>
          Cruza <strong>Adquirente (Getnet/etc.)</strong> × <strong>ERP (pdv.vendatef)</strong> por NSU Host, NSU e Autorização.
          Requer conexão ERP configurada em <strong>Administração → Configuração da Empresa</strong>.
          Mostra o que está em um lado mas não no outro, e divergências de valor.
        </span>
      </div>

      {/* Filtros */}
      <div className="actions-row" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-5)' }}>
        <select style={selStyle} value={gateway} onChange={e => setGateway(e.target.value)}>
          <option value="">Todos gateways</option>
          {GATEWAYS.map(g => <option key={g}>{g}</option>)}
        </select>
        <input style={inpStyle} type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
        <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>→</span>
        <input style={inpStyle} type="date" value={dataFim}    onChange={e => setDataFim(e.target.value)} />
        <button
          className="btn btn-primary"
          style={{ fontSize: '0.78rem' }}
          disabled={loading}
          onClick={() => void buscar()}
        >
          {loading ? 'Cruzando...' : '↔ Cruzar Adquirente × ERP'}
        </button>
        {loading && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Consultando ERP...</span>}
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--sp-4)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <div><strong>Erro:</strong> {error}</div>
        </div>
      )}

      {/* KPI Cards */}
      {kpi && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)' }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Total Adquirente</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700 }}>{kpi.totalAdquirente.toLocaleString('pt-BR')}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 2 }}>vendas aprovadas no período</div>
          </div>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Total ERP</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700 }}>{kpi.totalErp.toLocaleString('pt-BR')}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 2 }}>vendas TEF no pdv.vendatef</div>
          </div>
          <div style={{ background: 'var(--panel)', border: `1px solid ${kpi.taxaMatch >= 95 ? 'var(--teal)' : kpi.taxaMatch >= 80 ? 'rgba(240,165,0,0.5)' : 'var(--red)'}`, borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Taxa de Match</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: kpi.taxaMatch >= 95 ? 'var(--teal)' : kpi.taxaMatch >= 80 ? 'var(--gold)' : 'var(--red)' }}>
              {kpi.taxaMatch.toFixed(1)}%
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 2 }}>{kpi.matches + kpi.divergentes} de {kpi.totalAdquirente} encontrados no ERP</div>
          </div>

          <div style={{ background: 'var(--panel)', border: kpi.divergentes > 0 ? '1px solid rgba(255,93,108,0.5)' : '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Divergências de Valor</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: kpi.divergentes > 0 ? 'var(--red)' : 'var(--muted)' }}>
              {kpi.divergentes.toLocaleString('pt-BR')}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 2 }}>mesmo NSU/Aut, valores divergem</div>
          </div>
          <div style={{ background: 'var(--panel)', border: kpi.soAdquirente > 0 ? '1px solid rgba(255,93,108,0.4)' : '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Só na Adquirente</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: kpi.soAdquirente > 0 ? 'var(--gold)' : 'var(--muted)' }}>
              {kpi.soAdquirente.toLocaleString('pt-BR')}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 2 }}>{fmtMoeda(kpi.valorSoAdquirente)} não encontrados no ERP</div>
          </div>
          <div style={{ background: 'var(--panel)', border: kpi.soErp > 0 ? '1px solid rgba(255,93,108,0.4)' : '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-3) var(--sp-4)' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Só no ERP</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: kpi.soErp > 0 ? 'var(--gold)' : 'var(--muted)' }}>
              {kpi.soErp.toLocaleString('pt-BR')}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 2 }}>{fmtMoeda(kpi.valorSoErp)} sem registro na adquirente</div>
          </div>
        </div>
      )}

      {/* Sub-tabs de resultado */}
      {result && (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--sp-4)', borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
            {([
              { key: 'resumo',     label: `Resumo por Dia (${result.resumoPorDia.length})` },
              { key: 'divergentes',label: `Divergências de Valor (${result.divergentes.length})` },
              { key: 'soAdq',      label: `Só Adquirente (${result.soAdquirente.length})` },
              { key: 'soErp',      label: `Só ERP (${result.soErp.length})` },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSecao(key)}
                style={{
                  background: 'none', border: 'none',
                  borderBottom: secao === key ? '2px solid var(--teal)' : '2px solid transparent',
                  color: secao === key ? 'var(--teal)' : 'var(--muted)',
                  cursor: 'pointer', fontFamily: 'var(--font-ui)',
                  fontSize: '0.76rem', fontWeight: secao === key ? 600 : 400,
                  padding: '6px 12px', marginBottom: -1,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Resumo por Dia ── */}
          {secao === 'resumo' && (
            <div className="transactions-section">
              <div style={{ overflowX: 'auto' }}>
                <table className="trn-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th className="right">Qtd Adq.</th>
                      <th className="right">Valor Adq.</th>
                      <th className="right">Qtd ERP</th>
                      <th className="right">Valor ERP</th>
                      <th className="right">Δ Qtd</th>
                      <th className="right">Δ Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.resumoPorDia.map(d => {
                      const temDif = Math.abs(d.difValor) > 0.01 || d.difQtd !== 0;
                      return (
                        <tr key={d.data} style={{ background: temDif ? 'rgba(255,93,108,0.04)' : undefined }}>
                          <td className="date-cell">{new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                          <td className="mono-cell" style={{ textAlign: 'right' }}>{d.qtdAdquirente}</td>
                          <td className="mono-cell" style={{ textAlign: 'right' }}>{fmtMoeda(d.valorAdquirente)}</td>
                          <td className="mono-cell" style={{ textAlign: 'right' }}>{d.qtdErp}</td>
                          <td className="mono-cell" style={{ textAlign: 'right' }}>{fmtMoeda(d.valorErp)}</td>
                          <td className="mono-cell" style={{ textAlign: 'right', color: d.difQtd !== 0 ? 'var(--red)' : 'var(--muted)' }}>
                            {d.difQtd > 0 ? `+${d.difQtd}` : d.difQtd}
                          </td>
                          <td className="mono-cell" style={{ textAlign: 'right', color: Math.abs(d.difValor) > 0.01 ? (d.difValor > 0 ? 'var(--teal)' : 'var(--red)') : 'var(--muted)' }}>
                            {d.difValor > 0.01 ? `+${fmtMoeda(d.difValor)}` : fmtMoeda(d.difValor)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {result.resumoPorDia.length > 1 && (() => {
                    const totAdqQtd = result.resumoPorDia.reduce((a, d) => a + d.qtdAdquirente, 0);
                    const totAdqVal = result.resumoPorDia.reduce((a, d) => a + d.valorAdquirente, 0);
                    const totErpQtd = result.resumoPorDia.reduce((a, d) => a + d.qtdErp, 0);
                    const totErpVal = result.resumoPorDia.reduce((a, d) => a + d.valorErp, 0);
                    const difQtdT   = totAdqQtd - totErpQtd;
                    const difValT   = Math.round((totAdqVal - totErpVal) * 100) / 100;
                    return (
                      <tfoot>
                        <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 600 }}>
                          <td style={{ color: 'var(--text-soft)', fontSize: '0.72rem', padding: '6px 8px' }}>TOTAL</td>
                          <td className="mono-cell" style={{ textAlign: 'right' }}>{totAdqQtd}</td>
                          <td className="mono-cell" style={{ textAlign: 'right' }}>{fmtMoeda(totAdqVal)}</td>
                          <td className="mono-cell" style={{ textAlign: 'right' }}>{totErpQtd}</td>
                          <td className="mono-cell" style={{ textAlign: 'right' }}>{fmtMoeda(totErpVal)}</td>
                          <td className="mono-cell" style={{ textAlign: 'right', color: difQtdT !== 0 ? 'var(--red)' : 'var(--muted)' }}>
                            {difQtdT > 0 ? `+${difQtdT}` : difQtdT}
                          </td>
                          <td className="mono-cell" style={{ textAlign: 'right', color: Math.abs(difValT) > 0.01 ? 'var(--red)' : 'var(--muted)' }}>
                            {difValT > 0.01 ? `+${fmtMoeda(difValT)}` : fmtMoeda(difValT)}
                          </td>
                        </tr>
                      </tfoot>
                    );
                  })()}
                </table>
              </div>
            </div>
          )}

          {/* ── Divergências de Valor ── */}
          {secao === 'divergentes' && (
            result.divergentes.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--sp-8)' }}>
                <div className="empty-state-title" style={{ color: 'var(--teal)' }}>Nenhuma divergência de valor</div>
                <div className="empty-state-sub">Todos os matches têm valores dentro da tolerância de R$0,05.</div>
              </div>
            ) : (
              <div className="transactions-section">
                <div style={{ overflowX: 'auto' }}>
                  <table className="trn-table">
                    <thead>
                      <tr>
                        <th>Data/Hora</th>
                        <th>NSU Adq.</th>
                        <th>NSU ERP</th>
                        <th>Autorização</th>
                        <th>Bandeira</th>
                        <th>PDV ERP</th>
                        <th>Match via</th>
                        <th className="right">Adquirente</th>
                        <th className="right">ERP</th>
                        <th className="right">Diferença</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.divergentes.map(r => (
                        <tr key={r.vendaKey} style={{ background: 'rgba(255,93,108,0.04)' }}>
                          <td className="date-cell" style={{ fontSize: '0.7rem' }}>{fmtDateTime(r.dataHoraVenda)}</td>
                          <td className="mono-cell" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{r.nsuAdq || '—'}</td>
                          <td className="mono-cell" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{r.nsuHostErp || r.nsuErp || '—'}</td>
                          <td className="mono-cell" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{r.autorizacao || '—'}</td>
                          <td style={{ fontSize: '0.72rem' }}>{r.bandeira}</td>
                          <td className="mono-cell" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{r.pdvErp || '—'}</td>
                          <td><span className="tab-badge" style={{ fontSize: '0.6rem' }}>{MATCH_VIA_BADGE[r.matchVia] ?? r.matchVia}</span></td>
                          <td className="mono-cell cred-cell">{fmtMoeda(r.valorAdquirente)}</td>
                          <td className="mono-cell" style={{ textAlign: 'right' }}>{fmtMoeda(r.valorErp)}</td>
                          <td className="mono-cell" style={{ textAlign: 'right', color: r.dif > 0 ? 'var(--teal)' : 'var(--red)', fontWeight: 700 }}>
                            {r.dif > 0 ? `+${fmtMoeda(r.dif)}` : fmtMoeda(r.dif)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}

          {/* ── Só na Adquirente ── */}
          {secao === 'soAdq' && (
            result.soAdquirente.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--sp-8)' }}>
                <div className="empty-state-title" style={{ color: 'var(--teal)' }}>Todas as vendas têm correspondência no ERP</div>
              </div>
            ) : (
              <div className="transactions-section">
                <div style={{ marginBottom: 8, fontSize: '0.72rem', color: 'var(--text-soft)', padding: '0 var(--sp-1)' }}>
                  Vendas capturadas na adquirente mas <strong>sem registro em pdv.vendatef</strong>.
                  Pode indicar transações não baixadas no ERP, operações via POS avulso ou cancelamento pendente.
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="trn-table">
                    <thead>
                      <tr>
                        <th>Data/Hora</th>
                        <th>Gateway</th>
                        <th>NSU</th>
                        <th>Autorização</th>
                        <th>Terminal</th>
                        <th>Bandeira</th>
                        <th>Modal.</th>
                        <th className="right">Valor Bruto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.soAdquirente.map(v => (
                        <tr key={v.vendaKey}>
                          <td className="date-cell" style={{ fontSize: '0.7rem' }}>{fmtDateTime(v.dataHoraVenda)}</td>
                          <td style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{v.gateway}</td>
                          <td className="mono-cell" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{v.nsu || '—'}</td>
                          <td className="mono-cell" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{v.autorizacao || '—'}</td>
                          <td className="mono-cell" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{v.terminal || '—'}</td>
                          <td style={{ fontSize: '0.72rem' }}>{v.bandeira}</td>
                          <td style={{ fontSize: '0.7rem', color: 'var(--text-soft)' }}>{v.modalidade}</td>
                          <td className="mono-cell cred-cell">{fmtMoeda(v.valorBruto)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {result.soAdquirente.length > 1 && (
                      <tfoot>
                        <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 600 }}>
                          <td colSpan={7} style={{ color: 'var(--text-soft)', fontSize: '0.72rem', padding: '6px 8px' }}>
                            TOTAL — {result.soAdquirente.length} transações
                          </td>
                          <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--gold)' }}>
                            {fmtMoeda(result.soAdquirente.reduce((a, v) => a + v.valorBruto, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )
          )}

          {/* ── Só no ERP ── */}
          {secao === 'soErp' && (
            result.soErp.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--sp-8)' }}>
                <div className="empty-state-title" style={{ color: 'var(--teal)' }}>Todos os registros ERP têm correspondência na adquirente</div>
              </div>
            ) : (
              <div className="transactions-section">
                <div style={{ marginBottom: 8, fontSize: '0.72rem', color: 'var(--text-soft)', padding: '0 var(--sp-1)' }}>
                  Vendas em pdv.vendatef <strong>sem registro na adquirente</strong>.
                  Pode indicar cancelamentos registrados como venda no ERP, operações TEF sem captura efetiva ou dados históricos divergentes.
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="trn-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Hora</th>
                        <th>NSU (ERP)</th>
                        <th>NSU Host</th>
                        <th>Autorização</th>
                        <th>PDV</th>
                        <th>Bandeira</th>
                        <th className="right">Valor ERP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.soErp.map(r => (
                        <tr key={r.id}>
                          <td className="date-cell" style={{ fontSize: '0.7rem' }}>{new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                          <td className="mono-cell" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{r.hora || '—'}</td>
                          <td className="mono-cell" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{r.nsu || '—'}</td>
                          <td className="mono-cell" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{r.nsuHost || '—'}</td>
                          <td className="mono-cell" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{r.autorizacao || '—'}</td>
                          <td className="mono-cell" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{r.pdv || '—'}</td>
                          <td style={{ fontSize: '0.72rem' }}>{r.nomecartao || '—'}</td>
                          <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--text-soft)' }}>{fmtMoeda(r.valorErp)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {result.soErp.length > 1 && (
                      <tfoot>
                        <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 600 }}>
                          <td colSpan={7} style={{ color: 'var(--text-soft)', fontSize: '0.72rem', padding: '6px 8px' }}>
                            TOTAL — {result.soErp.length} transações
                          </td>
                          <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--gold)' }}>
                            {fmtMoeda(result.soErp.reduce((a, r) => a + r.valorErp, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )
          )}
        </>
      )}

      {!result && !loading && (
        <div className="empty-state" style={{ padding: 'var(--sp-12)' }}>
          <svg className="empty-state-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
          </svg>
          <div className="empty-state-title">Selecione o período e clique em Cruzar</div>
          <div className="empty-state-sub">Requer conexão ERP configurada em Administração.</div>
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────

import { GetnetSandboxPage } from './GetnetSandboxPage';

type Tab = 'importar' | 'vendas' | 'previsao' | 'pagamentos' | 'rastreio' | 'cruzamento' | 'indicadores' | 'taxas' | 'sandbox';

export function AdquirentePage() {
  const [tab, setTab] = useState<Tab>('importar');

  const loadLotes      = useAdquirenteStore(s => s.loadLotes);
  const loadVendas     = useAdquirenteStore(s => s.loadVendas);
  const loadResumo     = useAdquirenteStore(s => s.loadResumoVendas);
  const lotesLoaded    = useAdquirenteStore(s => s.lotesLoaded);

  useEffect(() => {
    if (!lotesLoaded) void loadLotes();
    void loadVendas();
    void loadResumo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    background:   'none',
    border:       'none',
    borderBottom: active ? '2px solid var(--teal)' : '2px solid transparent',
    color:        active ? 'var(--teal)' : 'var(--muted)',
    cursor:       'pointer',
    fontFamily:   'var(--font-ui)',
    fontSize:     '0.8rem',
    fontWeight:   active ? 600 : 400,
    padding:      'var(--sp-2) var(--sp-4)',
    transition:   'var(--transition)',
  });

  return (
    <div className="fade-in-up tab-content" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="section-header" style={{ marginBottom: 'var(--sp-4)' }}>
        <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1rem', color: 'var(--text-soft)' }}>
          Conciliação de Adquirentes
        </h2>
        <span className="tab-badge tab-badge-teal" style={{ fontSize: '0.65rem' }}>Getnet · Cielo · Stone · Rede</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 'var(--sp-5)' }}>
        <button style={tabStyle(tab === 'importar')}    onClick={() => setTab('importar')}>Importar</button>
        <button style={tabStyle(tab === 'vendas')}      onClick={() => setTab('vendas')}>Vendas</button>
        <button style={tabStyle(tab === 'previsao')}    onClick={() => setTab('previsao')}>Previsão</button>
        <button style={tabStyle(tab === 'pagamentos')}  onClick={() => setTab('pagamentos')}>Pagamentos (Realizado)</button>
        <button style={tabStyle(tab === 'rastreio')}    onClick={() => setTab('rastreio')}>Rastreio</button>
        <button style={tabStyle(tab === 'cruzamento')}  onClick={() => setTab('cruzamento')}>Cruzamento ERP</button>
        <button style={tabStyle(tab === 'indicadores')} onClick={() => setTab('indicadores')}>Indicadores</button>
        <button style={tabStyle(tab === 'taxas')}      onClick={() => setTab('taxas')}>Rel. Taxas</button>
        <button
          style={{
            ...tabStyle(tab === 'sandbox'),
            color: tab === 'sandbox' ? 'var(--teal)' : 'var(--gold)',
            fontWeight: 700,
          }}
          onClick={() => setTab('sandbox')}
        >
          ⚡ Sandbox EDI Getnet
        </button>
      </div>

      {tab === 'importar'    && <TabImportar />}
      {tab === 'vendas'      && <TabVendas />}
      {tab === 'previsao'    && <TabPrevisao />}
      {tab === 'pagamentos'  && <TabPagamentos />}
      {tab === 'rastreio'    && <TabRastreio />}
      {tab === 'cruzamento'  && <TabCruzamentoERP />}
      {tab === 'indicadores' && <TabIndicadores />}
      {tab === 'taxas'       && <TabTaxas />}
      {tab === 'sandbox'     && <GetnetSandboxPage />}
    </div>
  );
}

