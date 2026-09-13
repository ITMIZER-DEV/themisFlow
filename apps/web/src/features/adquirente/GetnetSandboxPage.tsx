import { useState, useMemo, useRef } from 'react';
import { parseGetnetEdiFile, type GetnetEdiResult } from '@themisflow/core';
import { api } from '../../services/api';

function fmtMoeda(val: number | undefined | null): string {
  if (val == null || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDateBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parts = iso.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return iso;
}

export function GetnetSandboxPage() {
  const [ediResult, setEdiResult] = useState<GetnetEdiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'cvs' | 'rvs' | 'auditoria' | 'recebiveis' | 'extras'>('cvs');

  // Filtros de busca na lista de CVs
  const [search, setSearch] = useState('');
  const [bandeiraFilter, setBandeiraFilter] = useState('TODAS');
  const [modalidadeFilter, setModalidadeFilter] = useState('TODAS');
  const [statusFilter, setStatusFilter] = useState('TODOS');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 5000);
  };

  const processText = (text: string, filename: string) => {
    try {
      setLoading(true);
      const res = parseGetnetEdiFile(text, filename);
      setEdiResult(res);
      setPage(1);
      if (res.auditoria.auditoriaBatida) {
        showToast(`Arquivo "${filename}" validado com sucesso! Batimento 100% batido.`, 'success');
      } else {
        showToast(`Arquivo processado, mas foram encontradas divergências no batimento.`, 'error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao processar arquivo EDI';
      showToast(`Erro no parser: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      processText(content, file.name);
    };
    reader.readAsText(file, 'latin1');
  };

  const loadSample = async (sampleName: string) => {
    setLoading(true);
    try {
      const res = await api.get<{ success: boolean; content: string; filename: string }>(
        `/adquirente/getnet/samples/${sampleName}`
      );
      if (res.data.success && res.data.content) {
        processText(res.data.content, res.data.filename || sampleName);
      } else {
        showToast('Amostra não encontrada no servidor.', 'error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao buscar amostra';
      showToast(`Falha ao carregar exemplo: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Salvar no ThemisFlow como lote oficial
  const handleImportToSystem = async () => {
    if (!ediResult) return;
    setSubmitting(true);
    try {
      const res = await api.post<{ success: boolean; lote?: { id: string }; adicionadas?: number; ignoradas?: number }>(
        '/adquirente/lotes',
        {
          arquivo: ediResult.file,
          gateway: 'GETNET',
          tipo: 'VENDAS',
          dataInicio: ediResult.header?.dataMovimento || new Date().toISOString().substring(0, 10),
          dataFim: ediResult.header?.dataMovimento || new Date().toISOString().substring(0, 10),
          vendas: ediResult.vendas,
          recebiveis: ediResult.recebiveis,
        }
      );

      if (res.data.success) {
        showToast(`Lote oficial criado com sucesso! ${res.data.adicionadas ?? ediResult.vendas.length} transações salvas no banco.`, 'success');
      } else {
        showToast('Erro ao salvar lote no banco.', 'error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro na requisição';
      showToast(`Falha ao importar lote: ${msg}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Exportar CSV
  const handleExportCSV = () => {
    if (!ediResult || ediResult.vendas.length === 0) return;
    const headers = [
      'DataHora',
      'NSU',
      'Autorizacao',
      'Cartao',
      'Bandeira',
      'Modalidade',
      'Terminal',
      'ValorBruto',
      'MDR',
      'ValorLiquido',
      'Parcelas',
      'Status',
    ];
    const rows = ediResult.vendas.map((v) => [
      v.dataHoraVenda,
      v.nsu,
      v.autorizacao,
      v.cartaoMascarado,
      v.bandeira,
      v.modalidade,
      v.terminal,
      v.valorBruto.toFixed(2).replace('.', ','),
      Math.abs(v.valorTaxa).toFixed(2).replace('.', ','),
      v.valorLiquido.toFixed(2).replace('.', ','),
      v.parcelas,
      v.status,
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `getnet_vendas_${ediResult.header?.dataMovimento || 'extrato'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exportação CSV gerada!', 'info');
  };

  // Filtragem de CVs
  const filteredCVs = useMemo(() => {
    if (!ediResult) return [];
    return ediResult.cvs.filter((cv) => {
      if (bandeiraFilter !== 'TODAS' && cv.bandeira !== bandeiraFilter) return false;
      if (modalidadeFilter !== 'TODAS' && cv.modalidade !== modalidadeFilter) return false;
      if (statusFilter !== 'TODOS' && cv.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matches =
          cv.nsu.toLowerCase().includes(q) ||
          cv.nsuRaw.toLowerCase().includes(q) ||
          cv.autorizacao.toLowerCase().includes(q) ||
          cv.cartao.toLowerCase().includes(q) ||
          cv.terminal.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [ediResult, search, bandeiraFilter, modalidadeFilter, statusFilter]);

  const paginatedCVs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCVs.slice(start, start + pageSize);
  }, [filteredCVs, page, pageSize]);

  const totalPages = Math.ceil(filteredCVs.length / pageSize) || 1;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', color: 'var(--text)' }}>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: 8,
            fontSize: '0.85rem',
            fontWeight: 600,
            background: toast.type === 'error' ? 'var(--red)' : toast.type === 'info' ? 'var(--gold)' : 'var(--teal)',
            color: '#0b1220',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontFamily: 'var(--font-title)', fontSize: '1.4rem', margin: 0, color: 'var(--text)' }}>
              Sandbox de Validação — Getnet EDI V10
            </h1>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 4,
                background: 'rgba(0, 201, 177, 0.15)',
                color: 'var(--teal)',
                border: '1px solid var(--teal)',
              }}
            >
              400 BYTES · OFICIAL
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
            Ambiente de homologação analítica: inspecione registros 0, 1, 2, 3, 5, 6 e 9 com validação matemática centavo a centavo.
          </p>
        </div>

        {/* Amostras Rápidas */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => loadSample('20260911')}
            disabled={loading}
            style={{
              padding: '8px 14px',
              fontSize: '0.78rem',
              fontWeight: 600,
              borderRadius: 6,
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>⚡</span> Carregar Exemplo 11/09 (469 lin)
          </button>
          <button
            onClick={() => loadSample('20260912')}
            disabled={loading}
            style={{
              padding: '8px 14px',
              fontSize: '0.78rem',
              fontWeight: 600,
              borderRadius: 6,
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>⚡</span> Carregar Exemplo 12/09 (364 lin)
          </button>
        </div>
      </div>

      {/* Dropzone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed var(--border)',
          borderRadius: 12,
          padding: '24px 20px',
          textAlign: 'center',
          background: 'rgba(21, 34, 56, 0.4)',
          cursor: 'pointer',
          marginBottom: 24,
          transition: 'border-color .15s, background .15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--teal)';
          e.currentTarget.style.background = 'rgba(0, 201, 177, 0.04)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.background = 'rgba(21, 34, 56, 0.4)';
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>📄</div>
        <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text)' }}>
          {ediResult ? `Arquivo Carregado: ${ediResult.file}` : 'Arraste ou clique para carregar o arquivo .txt de Extrato Getnet'}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 }}>
          {ediResult
            ? `${ediResult.auditoria.totalLinhas} linhas processadas com precisão posicional`
            : 'Padrão Getnet Sant. V.10 (400 bytes por linha) · Decodificação imediata'}
        </div>
      </div>

      {/* Painel do Resultado */}
      {ediResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header Metadata & Auditoria */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {/* Card Auditoria */}
            <div
              style={{
                background: 'var(--panel)',
                border: `1px solid ${ediResult.auditoria.auditoriaBatida ? 'var(--teal)' : 'var(--red)'}`,
                borderRadius: 10,
                padding: 16,
                boxShadow: ediResult.auditoria.auditoriaBatida
                  ? '0 0 20px rgba(0, 201, 177, 0.15)'
                  : '0 0 20px rgba(255, 93, 108, 0.15)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  Auditoria Matemática (RV × CV)
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: ediResult.auditoria.auditoriaBatida ? 'rgba(0, 201, 177, 0.18)' : 'rgba(255, 93, 108, 0.18)',
                    color: ediResult.auditoria.auditoriaBatida ? 'var(--teal)' : 'var(--red)',
                  }}
                >
                  {ediResult.auditoria.auditoriaBatida ? '✓ 100% BATIDO (Divergência R$ 0,00)' : '⚠ DIVERGÊNCIA'}
                </span>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                {fmtMoeda(ediResult.auditoria.somaBrutoRVs)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 }}>
                Soma Bruta RV: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{fmtMoeda(ediResult.auditoria.somaBrutoRVs)}</span> | 
                Soma Bruta CV: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{fmtMoeda(ediResult.auditoria.somaBrutoCVs)}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>
                MDR RV: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{fmtMoeda(ediResult.auditoria.somaMdrRVs)}</span> | 
                MDR CV: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{fmtMoeda(ediResult.auditoria.somaMdrCVs)}</span>
              </div>
            </div>

            {/* Card Totais Financeiros */}
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                Total Líquido do Movimento
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>
                {fmtMoeda(ediResult.auditoria.somaLiquidoRVs)}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: '0.75rem', color: 'var(--muted)' }}>
                <div>
                  Transações (CVs): <strong style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{ediResult.cvs.length}</strong>
                </div>
                <div>
                  Resumos (RVs): <strong style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{ediResult.rvs.length}</strong>
                </div>
                <div>
                  Recebíveis LQ: <strong style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>
                    {ediResult.rvs.filter((r) => r.tipoPagamento === 'LQ').length}
                  </strong>
                </div>
              </div>
            </div>

            {/* Card Header Metadata */}
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                Dados do Cabeçalho (Registro 0)
              </div>
              <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Data Movimento:</span>{' '}
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>{fmtDateBR(ediResult.header?.dataMovimento)}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Estabelecimento (EC):</span>{' '}
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>{ediResult.header?.ec}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Adquirente:</span>{' '}
                  <strong>{ediResult.header?.nomeAdquirente}</strong> (CNPJ: {ediResult.header?.cnpjAdquirente})
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Layout:</span>{' '}
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-soft)' }}>{ediResult.header?.versaoLayout}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Barra de Ações */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, background: 'var(--panel)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
              <button
                onClick={() => setActiveTab('cvs')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeTab === 'cvs' ? 'var(--teal)' : 'transparent',
                  color: activeTab === 'cvs' ? '#0b1220' : 'var(--muted)',
                  transition: 'all .12s',
                }}
              >
                Transações (CVs) · {ediResult.cvs.length}
              </button>
              <button
                onClick={() => setActiveTab('rvs')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeTab === 'rvs' ? 'var(--teal)' : 'transparent',
                  color: activeTab === 'rvs' ? '#0b1220' : 'var(--muted)',
                  transition: 'all .12s',
                }}
              >
                Resumos (RVs) · {ediResult.rvs.length}
              </button>
              <button
                onClick={() => setActiveTab('auditoria')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeTab === 'auditoria' ? 'var(--teal)' : 'transparent',
                  color: activeTab === 'auditoria' ? '#0b1220' : 'var(--muted)',
                  transition: 'all .12s',
                }}
              >
                Batimento RV × CV
              </button>
              <button
                onClick={() => setActiveTab('recebiveis')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeTab === 'recebiveis' ? 'var(--teal)' : 'transparent',
                  color: activeTab === 'recebiveis' ? '#0b1220' : 'var(--muted)',
                  transition: 'all .12s',
                }}
              >
                Recebíveis & Liquidação
              </button>
              {(ediResult.cessoes.length > 0 || ediResult.urs.length > 0) && (
                <button
                  onClick={() => setActiveTab('extras')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: activeTab === 'extras' ? 'var(--teal)' : 'transparent',
                    color: activeTab === 'extras' ? '#0b1220' : 'var(--muted)',
                    transition: 'all .12s',
                  }}
                >
                  Cessões & URs ({ediResult.cessoes.length + ediResult.urs.length})
                </button>
              )}
            </div>

            {/* Ações: Exportar CSV e Ingerir */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleExportCSV}
                style={{
                  padding: '8px 16px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  borderRadius: 6,
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                📥 Exportar CSV
              </button>
              <button
                onClick={handleImportToSystem}
                disabled={submitting}
                style={{
                  padding: '8px 18px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  borderRadius: 6,
                  background: 'var(--teal)',
                  border: 'none',
                  color: '#0b1220',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0,201,177,0.3)',
                }}
              >
                {submitting ? 'Salvando...' : '✓ Ingerir no Sistema como Lote Oficial'}
              </button>
            </div>
          </div>

          {/* Conteúdo da Aba 1: CVs */}
          {activeTab === 'cvs' && (
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              {/* Filtros */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Buscar por NSU, Autorização, Cartão, Terminal..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  style={{
                    flex: 1,
                    minWidth: 260,
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: 'var(--text)',
                    fontSize: '0.8rem',
                  }}
                />
                <select
                  value={bandeiraFilter}
                  onChange={(e) => {
                    setBandeiraFilter(e.target.value);
                    setPage(1);
                  }}
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: 'var(--text)',
                    fontSize: '0.8rem',
                  }}
                >
                  <option value="TODAS">Todas as Bandeiras</option>
                  <option value="VISA">Visa</option>
                  <option value="MASTER">Mastercard</option>
                  <option value="ELO">Elo</option>
                  <option value="PIX">Pix</option>
                </select>
                <select
                  value={modalidadeFilter}
                  onChange={(e) => {
                    setModalidadeFilter(e.target.value);
                    setPage(1);
                  }}
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: 'var(--text)',
                    fontSize: '0.8rem',
                  }}
                >
                  <option value="TODAS">Todas as Modalidades</option>
                  <option value="CREDITO">Crédito</option>
                  <option value="DEBITO">Débito</option>
                  <option value="PIX">Pix</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: 'var(--text)',
                    fontSize: '0.8rem',
                  }}
                >
                  <option value="TODOS">Todos os Status</option>
                  <option value="APROVADA">Aprovada</option>
                  <option value="CANCELADA">Cancelada</option>
                  <option value="OUTRO">Outros</option>
                </select>
              </div>

              {/* Tabela de CVs */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 6px' }}>Data/Hora</th>
                      <th style={{ padding: '8px 6px' }}>NSU</th>
                      <th style={{ padding: '8px 6px' }}>Autorização</th>
                      <th style={{ padding: '8px 6px' }}>Cartão</th>
                      <th style={{ padding: '8px 6px' }}>Bandeira</th>
                      <th style={{ padding: '8px 6px' }}>Modalidade</th>
                      <th style={{ padding: '8px 6px' }}>Terminal</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>Valor Bruto</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>Taxa MDR</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>Valor Líquido</th>
                      <th style={{ padding: '8px 6px' }}>Prev. Pagamento</th>
                      <th style={{ padding: '8px 6px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCVs.map((cv, idx) => {
                      const mdr = cv.valorComissao;
                      const liq = cv.valorTransacao - mdr;
                      return (
                        <tr
                          key={cv.idempotencyKey + idx}
                          style={{
                            borderBottom: '1px solid rgba(35, 58, 92, 0.4)',
                            transition: 'background .1s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '7px 6px', fontFamily: 'var(--font-mono)' }}>
                            {fmtDateBR(cv.dataTransacao)} {cv.horaTransacao}
                          </td>
                          <td style={{ padding: '7px 6px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{cv.nsu}</td>
                          <td style={{ padding: '7px 6px', fontFamily: 'var(--font-mono)' }}>{cv.autorizacao}</td>
                          <td style={{ padding: '7px 6px', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{cv.cartao}</td>
                          <td style={{ padding: '7px 6px' }}>
                            <span
                              style={{
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                background: 'rgba(255,255,255,0.06)',
                              }}
                            >
                              {cv.bandeira}
                            </span>
                          </td>
                          <td style={{ padding: '7px 6px' }}>{cv.modalidade}</td>
                          <td style={{ padding: '7px 6px', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{cv.terminal}</td>
                          <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            {fmtMoeda(cv.valorTransacao)}
                          </td>
                          <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>
                            -{fmtMoeda(mdr)}
                          </td>
                          <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--teal)', fontWeight: 600 }}>
                            {fmtMoeda(liq)}
                          </td>
                          <td style={{ padding: '7px 6px', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                            {fmtDateBR(cv.dataPagamento)}
                          </td>
                          <td style={{ padding: '7px 6px' }}>
                            <span
                              style={{
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                background: cv.status === 'APROVADA' ? 'rgba(0,201,177,0.15)' : 'rgba(255,93,108,0.15)',
                                color: cv.status === 'APROVADA' ? 'var(--teal)' : 'var(--red)',
                              }}
                            >
                              {cv.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, fontSize: '0.78rem', color: 'var(--muted)' }}>
                <div>
                  Mostrando {paginatedCVs.length} de {filteredCVs.length} transações
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      cursor: page === 1 ? 'default' : 'pointer',
                    }}
                  >
                    Anterior
                  </button>
                  <span>Página {page} de {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      cursor: page >= totalPages ? 'default' : 'pointer',
                    }}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Conteúdo da Aba 2: RVs */}
          {activeTab === 'rvs' && (
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 6px' }}>Número RV</th>
                    <th style={{ padding: '8px 6px' }}>Produto</th>
                    <th style={{ padding: '8px 6px' }}>Captura</th>
                    <th style={{ padding: '8px 6px' }}>Data RV</th>
                    <th style={{ padding: '8px 6px' }}>Data Pagamento</th>
                    <th style={{ padding: '8px 6px' }}>Banco / Ag / CC</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center' }}>Qtd CVs</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Valor Bruto</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>MDR</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Valor Líquido</th>
                    <th style={{ padding: '8px 6px' }}>Tipo Pagto</th>
                  </tr>
                </thead>
                <tbody>
                  {ediResult.rvs.map((rv) => (
                    <tr key={rv.numeroRV} style={{ borderBottom: '1px solid rgba(35, 58, 92, 0.4)' }}>
                      <td style={{ padding: '7px 6px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{rv.numeroRV}</td>
                      <td style={{ padding: '7px 6px' }}>
                        <strong>{rv.descricaoProduto}</strong> ({rv.codigoProduto})
                      </td>
                      <td style={{ padding: '7px 6px' }}>{rv.formaCaptura}</td>
                      <td style={{ padding: '7px 6px', fontFamily: 'var(--font-mono)' }}>{fmtDateBR(rv.dataRV)}</td>
                      <td style={{ padding: '7px 6px', fontFamily: 'var(--font-mono)' }}>{fmtDateBR(rv.dataPagamento)}</td>
                      <td style={{ padding: '7px 6px', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                        {rv.banco} / {rv.agencia} / {rv.contaCorrente || '—'}
                      </td>
                      <td style={{ padding: '7px 6px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{rv.cvsAceitos}</td>
                      <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {fmtMoeda(rv.valorBruto)}
                      </td>
                      <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>
                        -{fmtMoeda(rv.valorTaxaDesconto)}
                      </td>
                      <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--teal)', fontWeight: 600 }}>
                        {fmtMoeda(rv.valorLiquido)}
                      </td>
                      <td style={{ padding: '7px 6px' }}>
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            background: rv.tipoPagamento === 'LQ' ? 'rgba(0,201,177,0.15)' : 'rgba(240,165,0,0.15)',
                            color: rv.tipoPagamento === 'LQ' ? 'var(--teal)' : 'var(--gold)',
                          }}
                        >
                          {rv.tipoPagamento === 'LQ' ? 'LQ (Liquidado)' : `${rv.tipoPagamento} (Previsão)`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Conteúdo da Aba 3: Auditoria RV x CV */}
          {activeTab === 'auditoria' && (
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ marginBottom: 12, fontSize: '0.82rem', color: 'var(--muted)' }}>
                Confronto matemático linha a linha entre cada Resumo de Vendas (Tipo 1) e a soma real das transações filhas (Tipo 2):
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 6px' }}>Número RV</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Total Declarado no RV</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Soma dos CVs Filhos</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Diferença Centavos</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center' }}>Status de Batimento</th>
                  </tr>
                </thead>
                <tbody>
                  {ediResult.auditoria.rvsDetalhamento.map((item) => (
                    <tr key={item.rv} style={{ borderBottom: '1px solid rgba(35, 58, 92, 0.4)' }}>
                      <td style={{ padding: '7px 6px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{item.rv}</td>
                      <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {fmtMoeda(item.brutoRV)}
                      </td>
                      <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {fmtMoeda(item.brutoCV)}
                      </td>
                      <td
                        style={{
                          padding: '7px 6px',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          color: Math.abs(item.dif) > 0.01 ? 'var(--red)' : 'var(--text-soft)',
                        }}
                      >
                        {fmtMoeda(item.dif)}
                      </td>
                      <td style={{ padding: '7px 6px', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            background: item.status === 'OK' ? 'rgba(0,201,177,0.15)' : 'rgba(255,93,108,0.15)',
                            color: item.status === 'OK' ? 'var(--teal)' : 'var(--red)',
                          }}
                        >
                          {item.status === 'OK' ? '✓ EXATO (R$ 0,00)' : 'DIVERGENTE'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Conteúdo da Aba 4: Recebíveis */}
          {activeTab === 'recebiveis' && (
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ marginBottom: 12, fontSize: '0.82rem', color: 'var(--muted)' }}>
                Valores previstos e liquidados com informações de domicílio bancário para conciliação com extrato OFX:
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 6px' }}>Data Vencimento</th>
                    <th style={{ padding: '8px 6px' }}>Bandeira / Modalidade</th>
                    <th style={{ padding: '8px 6px' }}>Tipo Lançamento</th>
                    <th style={{ padding: '8px 6px' }}>Descrição / Domicílio</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Valor Líquido</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Valor Liquidado (Pago)</th>
                  </tr>
                </thead>
                <tbody>
                  {ediResult.recebiveis.map((rec, i) => (
                    <tr key={rec.idempotencyKey + i} style={{ borderBottom: '1px solid rgba(35, 58, 92, 0.4)' }}>
                      <td style={{ padding: '7px 6px', fontFamily: 'var(--font-mono)' }}>{fmtDateBR(rec.dataVencimento)}</td>
                      <td style={{ padding: '7px 6px' }}>
                        {rec.bandeira} {rec.modalidade}
                      </td>
                      <td style={{ padding: '7px 6px' }}>
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            background: rec.tipoLancamento === 'PAGAMENTO' ? 'rgba(0,201,177,0.15)' : 'rgba(240,165,0,0.15)',
                            color: rec.tipoLancamento === 'PAGAMENTO' ? 'var(--teal)' : 'var(--gold)',
                          }}
                        >
                          {rec.tipoLancamento}
                        </span>
                      </td>
                      <td style={{ padding: '7px 6px', color: 'var(--text-soft)' }}>{rec.lancamento}</td>
                      <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {fmtMoeda(rec.valorLiquido)}
                      </td>
                      <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: rec.valorLiquidado > 0 ? 'var(--teal)' : 'var(--muted)' }}>
                        {fmtMoeda(rec.valorLiquidado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Conteúdo da Aba 5: Extras */}
          {activeTab === 'extras' && (
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              {ediResult.cessoes.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.88rem', color: 'var(--gold)' }}>
                    Cessões de Crédito / Gravames (Registro 5)
                  </h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', textAlign: 'left' }}>
                        <th style={{ padding: '6px' }}>Operação</th>
                        <th style={{ padding: '6px' }}>Tipo</th>
                        <th style={{ padding: '6px' }}>Data Operação</th>
                        <th style={{ padding: '6px' }}>Data Crédito</th>
                        <th style={{ padding: '6px', textAlign: 'right' }}>Valor Bruto Total</th>
                        <th style={{ padding: '6px', textAlign: 'right' }}>Custo</th>
                        <th style={{ padding: '6px', textAlign: 'right' }}>Valor Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ediResult.cessoes.map((c, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(35,58,92,0.4)' }}>
                          <td style={{ padding: '6px', fontFamily: 'var(--font-mono)' }}>{c.numeroOperacao}</td>
                          <td style={{ padding: '6px' }}>{c.tipoOperacao}</td>
                          <td style={{ padding: '6px' }}>{fmtDateBR(c.dataOperacao)}</td>
                          <td style={{ padding: '6px' }}>{fmtDateBR(c.dataCredito)}</td>
                          <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtMoeda(c.valorBrutoTotal)}</td>
                          <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>-{fmtMoeda(c.valorCusto)}</td>
                          <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{fmtMoeda(c.valorLiquido)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {ediResult.urs.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.88rem', color: 'var(--teal)' }}>
                    Unidades de Recebíveis - UR (Registro 6)
                  </h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', textAlign: 'left' }}>
                        <th style={{ padding: '6px' }}>Chave UR</th>
                        <th style={{ padding: '6px' }}>Operação</th>
                        <th style={{ padding: '6px' }}>Vencimento UR</th>
                        <th style={{ padding: '6px', textAlign: 'right' }}>Valor Bruto Total</th>
                        <th style={{ padding: '6px', textAlign: 'right' }}>Custo</th>
                        <th style={{ padding: '6px', textAlign: 'right' }}>Valor Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ediResult.urs.map((u, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(35,58,92,0.4)' }}>
                          <td style={{ padding: '6px', fontFamily: 'var(--font-mono)' }}>{u.chaveUR}</td>
                          <td style={{ padding: '6px', fontFamily: 'var(--font-mono)' }}>{u.numeroOperacao}</td>
                          <td style={{ padding: '6px' }}>{fmtDateBR(u.dataVencimentoUR)}</td>
                          <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtMoeda(u.valorBrutoTotal)}</td>
                          <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>-{fmtMoeda(u.valorCusto)}</td>
                          <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{fmtMoeda(u.valorLiquido)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
