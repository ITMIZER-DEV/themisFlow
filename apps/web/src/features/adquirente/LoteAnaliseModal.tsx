import { useEffect, useState } from 'react';
import { useAdquirenteStore, type LoteAnaliseData } from '../../stores/adquirenteStore';
import { fmtDate, fmtDateTime } from '../../lib/date';
import { downloadCSV } from '../../lib/csv';

function fmtMoeda(v: number | string | null | undefined) {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
  if (isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtPct(v: number | null | undefined) {
  if (v == null || isNaN(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + '%';
}

interface LoteAnaliseModalProps {
  loteId: string;
  onClose: () => void;
}

export function LoteAnaliseModal({ loteId, onClose }: LoteAnaliseModalProps) {
  const fetchLoteAnalise = useAdquirenteStore(s => s.fetchLoteAnalise);
  const [data, setData] = useState<LoteAnaliseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const loadData = async (p = 1, q = search) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLoteAnalise(loteId, { page: p, limit: 50, search: q || undefined });
      setData(res);
      setPage(p);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar análise do lote';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(1, '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loteId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadData(1, search);
  };

  const handleExportCSV = () => {
    if (!data || !data.itens || data.itens.length === 0) return;
    const isVendas = data.lote.tipo === 'VENDAS';
    const BOM = '\uFEFF';
    const SEP = ';';
    const row = (cells: (string | number)[]) => cells.map(c => `"${String(c).replace(/"/g, '""')}"`).join(SEP);

    let header: string;
    let lines: string[];

    if (isVendas) {
      header = row(['Data/Hora', 'NSU', 'Autorizacao', 'Cartao', 'Bandeira', 'Modalidade', 'Terminal', 'Valor Bruto', 'Taxa MDR', 'Valor Liquido', 'Status']);
      lines = data.itens.map(v => row([
        v.dataHora ? fmtDateTime(v.dataHora, true) : '',
        v.nsu || '',
        v.autorizacao || '',
        v.cartao || '',
        v.bandeira,
        v.modalidade,
        v.terminal || '',
        v.valorBruto.toFixed(2).replace('.', ','),
        (v.valorTaxa ?? 0).toFixed(2).replace('.', ','),
        v.valorLiquido.toFixed(2).replace('.', ','),
        v.status || '',
      ]));
    } else {
      header = row(['Data Vencimento', 'Data Venda', 'Lancamento', 'Bandeira', 'Modalidade', 'Parcelas', 'Valor Bruto', 'Descontos MDR', 'Valor Liquido', 'Valor Liquidado', 'Tipo Lancamento']);
      lines = data.itens.map(r => row([
        r.dataVencimento ? fmtDate(r.dataVencimento) : '',
        r.dataVenda ? fmtDate(r.dataVenda) : '',
        r.lancamento || '',
        r.bandeira,
        r.modalidade,
        r.parcelasInfo || '',
        r.valorBruto.toFixed(2).replace('.', ','),
        (r.descontos ?? 0).toFixed(2).replace('.', ','),
        r.valorLiquido.toFixed(2).replace('.', ','),
        (r.valorLiquidado ?? 0).toFixed(2).replace('.', ','),
        r.tipoLancamento || '',
      ]));
    }

    const csvContent = BOM + [header, ...lines].join('\n') + '\n';
    downloadCSV(csvContent, `auditoria_lote_${data.lote.tipo.toLowerCase()}_${data.lote.arquivo}.csv`);
  };

  const isVendas = data?.lote.tipo === 'VENDAS';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 10, 20, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: 1100,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0,0,0,0.7)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
                Auditoria & Acurácia do Lote
              </h3>
              {data && (
                <span
                  className={`tab-badge ${data.lote.tipo === 'VENDAS' ? 'tab-badge-teal' : 'tab-badge-warn'}`}
                  style={{ fontSize: '0.7rem', fontWeight: 700 }}
                >
                  LOTE DE {data.lote.tipo}
                </span>
              )}
            </div>
            {data && (
              <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-soft)' }}>
                Arquivo: <strong style={{ color: 'var(--text)' }}>{data.lote.arquivo}</strong> · Período: {fmtDate(data.lote.dataInicio)} a {fmtDate(data.lote.dataFim)} · Importado em: {fmtDateTime(data.lote.importadoEm)}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {data && (
              <button
                onClick={handleExportCSV}
                className="btn btn-secondary"
                style={{ fontSize: '0.72rem', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                ↓ Exportar CSV
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--muted)',
                fontSize: '1.3rem',
                cursor: 'pointer',
                padding: '4px 8px',
                lineHeight: 1,
              }}
              title="Fechar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          {loading && !data && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              Carregando auditoria detalhada do lote...
            </div>
          )}

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          {data && (
            <>
              {/* Card de Acurácia */}
              <div
                style={{
                  background: 'rgba(0, 201, 177, 0.04)',
                  border: `1px solid ${data.auditoria.acuraciaBatida ? 'rgba(0, 201, 177, 0.4)' : 'var(--red)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: 16,
                  marginBottom: 20,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 16,
                }}
              >
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Volume Total de Itens</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                    {data.auditoria.totalRegistros.toLocaleString('pt-BR')}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-soft)' }}>
                    {isVendas ? 'Comprovantes de Venda (CVs)' : 'Resumos de Venda (RVs)'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Total Bruto (Faturamento)</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>
                    {fmtMoeda(data.auditoria.totalBruto)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-soft)' }}>Soma dos valores de transação</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Descontos MDR / Taxas</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>
                    {fmtMoeda(data.auditoria.totalTaxa)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-soft)' }}>
                    Taxa média efetiva: {fmtPct(data.auditoria.taxaMediaPct)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Total Líquido</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>
                    {fmtMoeda(data.auditoria.totalLiquido)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-soft)' }}>
                    {isVendas ? 'Valor líquido creditável' : `Liquidado: ${fmtMoeda(data.auditoria.totalLiquidado ?? 0)}`}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Batimento Matemático</div>
                  {data.auditoria.acuraciaBatida ? (
                    <span className="tab-badge tab-badge-teal" style={{ padding: '6px 10px', fontSize: '0.75rem', fontWeight: 700, width: 'fit-content' }}>
                      ✓ 100% EXATO (Divergência R$ 0,00)
                    </span>
                  ) : (
                    <span className="tab-badge tab-badge-warn" style={{ padding: '6px 10px', fontSize: '0.75rem', fontWeight: 700, width: 'fit-content' }}>
                      ⚠️ DIVERGÊNCIA: {fmtMoeda(data.auditoria.diferenca)}
                    </span>
                  )}
                </div>
              </div>

              {/* Tabela de Grupos por Bandeira */}
              {data.porBandeira && data.porBandeira.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: '0.8rem', fontWeight: 700, margin: '0 0 10px', color: 'var(--text-soft)' }}>
                    Composição por Bandeira e Modalidade
                  </h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="trn-table">
                      <thead>
                        <tr>
                          <th>Bandeira</th>
                          <th>Modalidade</th>
                          <th className="right">Qtd</th>
                          <th className="right">Total Bruto</th>
                          <th className="right">Taxas MDR</th>
                          <th className="right">Taxa %</th>
                          <th className="right">Total Líquido</th>
                          {!isVendas && <th className="right">Total Liquidado</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {data.porBandeira.map((b, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: 600 }}>{b.bandeira}</td>
                            <td style={{ fontSize: '0.72rem', color: 'var(--text-soft)' }}>{b.modalidade}</td>
                            <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--muted)' }}>{b.qtd.toLocaleString('pt-BR')}</td>
                            <td className="cred-cell">{fmtMoeda(b.bruto)}</td>
                            <td className="deb-cell">{fmtMoeda(b.taxa)}</td>
                            <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--gold)' }}>{fmtPct(b.taxaPct)}</td>
                            <td className="cred-cell">{fmtMoeda(b.liquido)}</td>
                            {!isVendas && <td className="cred-cell" style={{ fontWeight: 700, color: 'var(--gold)' }}>{fmtMoeda(b.liquidado ?? 0)}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tabela Analítica dos Lançamentos */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
                  <h4 style={{ fontSize: '0.8rem', fontWeight: 700, margin: 0, color: 'var(--text-soft)' }}>
                    Lançamentos Individuais ({data.paginacao.total} registros)
                  </h4>

                  <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      placeholder={isVendas ? "Buscar NSU, autorização, cartão..." : "Buscar lançamento, banco, modalidade..."}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.75rem',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text)',
                        width: 240,
                      }}
                    />
                    <button type="submit" className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '4px 10px' }}>
                      Buscar
                    </button>
                  </form>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ width: '100%', fontSize: '0.75rem' }}>
                    <thead>
                      {isVendas ? (
                        <tr>
                          <th>Data/Hora</th>
                          <th>NSU</th>
                          <th>Autorização</th>
                          <th>Cartão</th>
                          <th>Bandeira</th>
                          <th>Modalidade</th>
                          <th>Terminal</th>
                          <th style={{ textAlign: 'right' }}>Valor Bruto</th>
                          <th style={{ textAlign: 'right' }}>MDR</th>
                          <th style={{ textAlign: 'right' }}>Valor Líquido</th>
                          <th style={{ textAlign: 'center' }}>Status</th>
                        </tr>
                      ) : (
                        <tr>
                          <th>Data Pagto</th>
                          <th>Data Venda</th>
                          <th>Lançamento / Banco</th>
                          <th>Bandeira</th>
                          <th>Modalidade</th>
                          <th>Parcela</th>
                          <th style={{ textAlign: 'right' }}>Valor Venda</th>
                          <th style={{ textAlign: 'right' }}>Descontos</th>
                          <th style={{ textAlign: 'right' }}>Valor Líquido</th>
                          <th style={{ textAlign: 'right' }}>Liquidado</th>
                          <th style={{ textAlign: 'center' }}>Tipo</th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {data.itens.length === 0 ? (
                        <tr>
                          <td colSpan={11} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
                            Nenhum registro encontrado para a busca.
                          </td>
                        </tr>
                      ) : (
                        data.itens.map((it) => (
                          <tr key={it.id}>
                            {isVendas ? (
                              <>
                                <td className="mono-cell">{it.dataHora ? fmtDateTime(it.dataHora, true) : '—'}</td>
                                <td className="mono-cell" style={{ fontWeight: 600 }}>{it.nsu || '—'}</td>
                                <td className="mono-cell">{it.autorizacao || '—'}</td>
                                <td className="mono-cell" style={{ color: 'var(--text-soft)' }}>{it.cartao || '—'}</td>
                                <td>{it.bandeira}</td>
                                <td style={{ color: 'var(--text-soft)' }}>{it.modalidade}</td>
                                <td className="mono-cell" style={{ color: 'var(--muted)' }}>{it.terminal || '—'}</td>
                                <td className="cred-cell">{fmtMoeda(it.valorBruto)}</td>
                                <td className="deb-cell">{fmtMoeda(it.valorTaxa ?? 0)}</td>
                                <td className="cred-cell" style={{ fontWeight: 700, color: 'var(--gold)' }}>{fmtMoeda(it.valorLiquido)}</td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className="tab-badge tab-badge-teal" style={{ fontSize: '0.62rem' }}>
                                    {it.status || 'APROVADA'}
                                  </span>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="mono-cell" style={{ fontWeight: 600 }}>{it.dataVencimento ? fmtDate(it.dataVencimento) : '—'}</td>
                                <td className="mono-cell" style={{ color: 'var(--muted)' }}>{it.dataVenda ? fmtDate(it.dataVenda) : '—'}</td>
                                <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.lancamento}>
                                  {it.lancamento}
                                </td>
                                <td>{it.bandeira}</td>
                                <td style={{ color: 'var(--text-soft)' }}>{it.modalidade}</td>
                                <td className="mono-cell" style={{ color: 'var(--muted)' }}>{it.parcelasInfo || '1/1'}</td>
                                <td className="cred-cell">{fmtMoeda(it.valorBruto)}</td>
                                <td className="deb-cell">{fmtMoeda(it.descontos ?? 0)}</td>
                                <td className="cred-cell" style={{ fontWeight: 700, color: 'var(--gold)' }}>{fmtMoeda(it.valorLiquido)}</td>
                                <td className="cred-cell">{fmtMoeda(it.valorLiquidado ?? 0)}</td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className={`tab-badge ${it.tipoLancamento === 'PAGAMENTO_REALIZADO' ? 'tab-badge-teal' : 'tab-badge-warn'}`} style={{ fontSize: '0.62rem' }}>
                                    {it.tipoLancamento === 'PAGAMENTO_REALIZADO' ? 'LIQUIDADO' : 'PREVISÃO'}
                                  </span>
                                </td>
                              </>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Paginação */}
                {data.paginacao.totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                      Página {data.paginacao.page} de {data.paginacao.totalPages}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => void loadData(page - 1)}
                        disabled={page <= 1 || loading}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.7rem', padding: '3px 8px' }}
                      >
                        ← Anterior
                      </button>
                      <button
                        onClick={() => void loadData(page + 1)}
                        disabled={page >= data.paginacao.totalPages || loading}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.7rem', padding: '3px 8px' }}
                      >
                        Próxima →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
