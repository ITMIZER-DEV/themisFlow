import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { downloadCSV } from '../../lib/csv';

export type DrilldownTipo = 'VENDAS' | 'RECEBIDOS' | 'TARIFAS' | 'PREVISAO' | 'DIVERGENCIAS';

export interface DrilldownFilterParams {
  mes?:        string;
  dataInicio?: string;
  dataFim?:    string;
  gateway?:    string;
  modalidade?: string;
  bandeira?:   string;
  dia?:        string;
  statusConc?: string;
}

interface DrilldownModalProps {
  open:         boolean;
  onClose:      () => void;
  tipo:         DrilldownTipo;
  title:        string;
  subtitle?:    string;
  filterParams: DrilldownFilterParams;
}

function fmtMoeda(v: number | string) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDateTime(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  const [ano, mes, dia] = d.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

export function DrilldownModal({
  open,
  onClose,
  tipo,
  title,
  subtitle,
  filterParams,
}: DrilldownModalProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const limit = 50;

  const fetchData = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const qp: Record<string, string | number> = {
        tipo,
        page: p,
        limit,
      };
      if (filterParams.mes)        qp.mes        = filterParams.mes;
      if (filterParams.dataInicio) qp.dataInicio = filterParams.dataInicio;
      if (filterParams.dataFim)    qp.dataFim    = filterParams.dataFim;
      if (filterParams.gateway)    qp.gateway    = filterParams.gateway;
      if (filterParams.modalidade) qp.modalidade = filterParams.modalidade;
      if (filterParams.bandeira)   qp.bandeira   = filterParams.bandeira;
      if (filterParams.dia)        qp.dia        = filterParams.dia;
      if (filterParams.statusConc) qp.statusConc = filterParams.statusConc;

      const { data } = await api.get<{
        success: boolean;
        total: number;
        page: number;
        totalPages: number;
        rows: any[];
      }>('/dashboard/drilldown', { params: qp });

      setRows(data.rows);
      setTotal(data.total);
      setPage(data.page);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error('Erro ao carregar drilldown:', err);
    } finally {
      setLoading(false);
    }
  }, [tipo, filterParams]);

  useEffect(() => {
    if (open) {
      setPage(1);
      setSearch('');
      void fetchData(1);
    }
  }, [open, fetchData]);

  // Fechar com Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // Filtro de busca local rápida
  const filteredRows = rows.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const str = `${r.nsu ?? ''} ${r.autorizacao ?? ''} ${r.gateway ?? ''} ${r.bandeira ?? ''} ${r.modalidade ?? ''} ${r.lancamento ?? ''} ${r.terminal ?? ''}`.toLowerCase();
    return str.includes(q);
  });

  // Exportar CSV
  const handleExportCSV = () => {
    if (rows.length === 0) return;
    const BOM = '\uFEFF';
    const SEP = ';';
    const row = (cells: (string | number)[]) => cells.map(c => `"${String(c).replace(/"/g, '""')}"`).join(SEP);

    let header: string;
    let lines: string[];

    if (tipo === 'VENDAS' || tipo === 'DIVERGENCIAS') {
      header = row(['Data/Hora', 'Gateway', 'EC', 'NSU', 'Autorização', 'Bandeira', 'Modalidade', 'Bruto', 'Taxa', 'Líquido', 'Status Conc.']);
      lines = rows.map(r => row([
        fmtDateTime(r.dataHora),
        r.gateway,
        r.ec,
        r.nsu,
        r.autorizacao,
        r.bandeira,
        r.modalidade,
        r.valorBruto.toFixed(2).replace('.', ','),
        r.valorTaxa.toFixed(2).replace('.', ','),
        r.valorLiquido.toFixed(2).replace('.', ','),
        r.statusConc,
      ]));
    } else if (tipo === 'RECEBIDOS') {
      header = row(['Data Pagamento', 'Data Venda', 'Gateway', 'Lançamento', 'Bandeira', 'Modalidade', 'NSU', 'Valor Venda', 'Descontos', 'Valor Liquidado', 'Status']);
      lines = rows.map(r => row([
        fmtDate(r.dataVencimento),
        fmtDate(r.dataVenda),
        r.gateway,
        r.lancamento,
        r.bandeira,
        r.modalidade,
        r.nsu ?? '',
        r.valorBruto.toFixed(2).replace('.', ','),
        r.descontos.toFixed(2).replace('.', ','),
        r.valorLiquidado.toFixed(2).replace('.', ','),
        r.statusConc,
      ]));
    } else if (tipo === 'TARIFAS') {
      header = row(['Data Débito', 'Gateway', 'EC', 'Lançamento', 'Bandeira', 'Modalidade', 'Valor Debitado', 'Status']);
      lines = rows.map(r => row([
        fmtDate(r.dataVencimento),
        r.gateway,
        r.ec,
        r.lancamento,
        r.bandeira ?? '',
        r.modalidade ?? '',
        r.valorLiquidado.toFixed(2).replace('.', ','),
        r.statusConc,
      ]));
    } else {
      header = row(['Data Prevista', 'Data Venda', 'Gateway', 'NSU', 'Bandeira', 'Modalidade', 'Bruto', 'Taxa', 'Líquido Previsto', 'Status']);
      lines = rows.map(r => row([
        fmtDate(r.dataVencimento),
        fmtDate(r.dataVenda),
        r.gateway,
        r.nsu,
        r.bandeira,
        r.modalidade,
        r.valorBruto.toFixed(2).replace('.', ','),
        r.valorTaxa.toFixed(2).replace('.', ','),
        r.valorLiquidado.toFixed(2).replace('.', ','),
        r.statusConc,
      ]));
    }

    const csvContent = BOM + [header, ...lines].join('\n') + '\n';
    downloadCSV(csvContent, `drilldown_${tipo.toLowerCase()}_${new Date().toISOString().slice(0,10)}.csv`);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 'var(--sp-4)',
    }}>
      <div style={{
        background: 'var(--bg)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-lg)',
        width: '100%',
        maxWidth: 1100,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: 'var(--sp-4) var(--sp-6)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--panel)',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="tab-badge tab-badge-teal" style={{ fontSize: '0.65rem' }}>
                DRILLDOWN · {tipo}
              </span>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                {title}
              </h2>
            </div>
            {subtitle && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-soft)', margin: '4px 0 0' }}>
                {subtitle}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleExportCSV}
              className="btn btn-secondary"
              style={{ fontSize: '0.72rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
              title="Exportar registros filtrados para Excel/CSV"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Exportar CSV
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 'var(--radius-sm)',
              }}
              aria-label="Fechar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Filter and Stats bar */}
        <div style={{
          padding: 'var(--sp-3) var(--sp-6)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--panel-alt)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-soft)' }}>
              Total: <strong style={{ color: 'var(--teal)' }}>{total.toLocaleString('pt-BR')}</strong> registros
            </span>
            {filterParams.gateway && (
              <span className="tab-badge tab-badge-gold" style={{ fontSize: '0.65rem' }}>
                Gateway: {filterParams.gateway}
              </span>
            )}
            {filterParams.dia && (
              <span className="tab-badge tab-badge-teal" style={{ fontSize: '0.65rem' }}>
                Dia: {fmtDate(filterParams.dia)}
              </span>
            )}
            {filterParams.modalidade && (
              <span className="tab-badge" style={{ fontSize: '0.65rem' }}>
                {filterParams.modalidade}
              </span>
            )}
          </div>

          <div style={{ position: 'relative', width: 240 }}>
            <input
              type="text"
              placeholder="Buscar NSU, autorização..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '5px 10px',
                fontSize: '0.75rem',
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text)',
              }}
            />
          </div>
        </div>

        {/* Content Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--sp-6)' }}>
          {loading ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
              Carregando registros detalhados...
            </div>
          ) : filteredRows.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
              Nenhum registro encontrado para os critérios selecionados.
            </div>
          ) : (
            <table className="data-table" style={{ width: '100%', fontSize: '0.75rem' }}>
              <thead>
                <tr>
                  {tipo === 'VENDAS' || tipo === 'DIVERGENCIAS' ? (
                    <>
                      <th>Data / Hora</th>
                      <th>Origem</th>
                      <th>NSU</th>
                      <th>Autorização</th>
                      <th>Bandeira</th>
                      <th>Modalidade</th>
                      <th style={{ textAlign: 'right' }}>Valor Bruto</th>
                      <th style={{ textAlign: 'right' }}>Taxa</th>
                      <th style={{ textAlign: 'right' }}>Valor Líquido</th>
                      <th style={{ textAlign: 'center' }}>Conciliação</th>
                    </>
                  ) : tipo === 'RECEBIDOS' ? (
                    <>
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
                    </>
                  ) : tipo === 'TARIFAS' ? (
                    <>
                      <th>Data Débito</th>
                      <th>Origem</th>
                      <th>EC</th>
                      <th>Descrição do Lançamento</th>
                      <th>Bandeira</th>
                      <th style={{ textAlign: 'right' }}>Valor Retido</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </>
                  ) : (
                    <>
                      <th>Data Prevista</th>
                      <th>Data Venda</th>
                      <th>Origem</th>
                      <th>NSU</th>
                      <th>Bandeira</th>
                      <th>Modalidade</th>
                      <th style={{ textAlign: 'right' }}>Valor Bruto</th>
                      <th style={{ textAlign: 'right' }}>Taxa</th>
                      <th style={{ textAlign: 'right' }}>Líquido Previsto</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, idx) => (
                  <tr key={r.id || idx}>
                    {tipo === 'VENDAS' || tipo === 'DIVERGENCIAS' ? (
                      <>
                        <td className="mono-cell" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.dataHora)}</td>
                        <td style={{ fontWeight: 600 }}>{r.gateway}</td>
                        <td className="mono-cell">{r.nsu}</td>
                        <td className="mono-cell" style={{ color: 'var(--muted)' }}>{r.autorizacao || '—'}</td>
                        <td>{r.bandeira}</td>
                        <td style={{ color: 'var(--text-soft)' }}>{r.modalidade}</td>
                        <td className="cred-cell">{fmtMoeda(r.valorBruto)}</td>
                        <td className="deb-cell">{fmtMoeda(r.valorTaxa)}</td>
                        <td className="cred-cell" style={{ fontWeight: 600 }}>{fmtMoeda(r.valorLiquido)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`tab-badge ${r.statusConc === 'CONCILIADO' ? 'tab-badge-teal' : 'tab-badge-warn'}`} style={{ fontSize: '0.62rem' }}>
                            {r.statusConc}
                          </span>
                        </td>
                      </>
                    ) : tipo === 'RECEBIDOS' ? (
                      <>
                        <td className="mono-cell" style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtDate(r.dataVencimento)}</td>
                        <td className="mono-cell" style={{ color: 'var(--muted)' }}>{fmtDate(r.dataVenda)}</td>
                        <td style={{ fontWeight: 600 }}>{r.gateway}</td>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.lancamento}>
                          {r.lancamento}
                        </td>
                        <td>{r.bandeira}</td>
                        <td style={{ color: 'var(--text-soft)' }}>{r.modalidade}</td>
                        <td className="mono-cell">{r.nsu || '—'}</td>
                        <td className="cred-cell">{fmtMoeda(r.valorBruto)}</td>
                        <td className="deb-cell">{fmtMoeda(r.descontos)}</td>
                        <td className="cred-cell" style={{ fontWeight: 600, color: 'var(--gold)' }}>{fmtMoeda(r.valorLiquidado)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`tab-badge ${r.statusConc === 'CONCILIADO' ? 'tab-badge-teal' : 'tab-badge-warn'}`} style={{ fontSize: '0.62rem' }}>
                            {r.statusConc}
                          </span>
                        </td>
                      </>
                    ) : tipo === 'TARIFAS' ? (
                      <>
                        <td className="mono-cell" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.dataVencimento)}</td>
                        <td style={{ fontWeight: 600 }}>{r.gateway}</td>
                        <td className="mono-cell">{r.ec}</td>
                        <td style={{ fontWeight: 600, color: 'var(--text)' }}>{r.lancamento}</td>
                        <td>{r.bandeira || '—'}</td>
                        <td className="deb-cell" style={{ fontWeight: 600 }}>{fmtMoeda(r.valorLiquidado)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="tab-badge tab-badge-warn" style={{ fontSize: '0.62rem' }}>
                            {r.statusConc || 'DEBITADO'}
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="mono-cell" style={{ whiteSpace: 'nowrap', fontWeight: 600, color: '#818cf8' }}>{fmtDate(r.dataVencimento)}</td>
                        <td className="mono-cell" style={{ color: 'var(--muted)' }}>{fmtDate(r.dataVenda)}</td>
                        <td style={{ fontWeight: 600 }}>{r.gateway}</td>
                        <td className="mono-cell">{r.nsu}</td>
                        <td>{r.bandeira}</td>
                        <td style={{ color: 'var(--text-soft)' }}>{r.modalidade}</td>
                        <td className="cred-cell">{fmtMoeda(r.valorBruto)}</td>
                        <td className="deb-cell">{fmtMoeda(r.valorTaxa)}</td>
                        <td className="cred-cell" style={{ fontWeight: 600 }}>{fmtMoeda(r.valorLiquidado)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="tab-badge" style={{ fontSize: '0.62rem' }}>
                            PREVISTO
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer with Pagination */}
        <div style={{
          padding: 'var(--sp-3) var(--sp-6)',
          borderTop: '1px solid var(--border)',
          background: 'var(--panel)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            Página {page} de {totalPages || 1} ({total} itens)
          </span>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => fetchData(page - 1)}
              disabled={page <= 1 || loading}
              className="btn btn-secondary"
              style={{ fontSize: '0.72rem', padding: '4px 10px' }}
            >
              ← Anterior
            </button>
            <button
              onClick={() => fetchData(page + 1)}
              disabled={page >= totalPages || loading}
              className="btn btn-secondary"
              style={{ fontSize: '0.72rem', padding: '4px 10px' }}
            >
              Próxima →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
