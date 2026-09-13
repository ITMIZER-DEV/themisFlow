import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { TimelineChart } from './TimelineChart';
import { DrilldownModal, type DrilldownTipo, type DrilldownFilterParams } from './DrilldownModal';

const GATEWAYS = ['GETNET', 'CIELO', 'STONE', 'REDE', 'PAGSEGURO', 'SUMUP', 'ALELO', 'TICKET', 'VR'];
const MESES_RAPIDOS = [
  { label: 'Maio/2026',  val: '2026-05' },
  { label: 'Junho/2026', val: '2026-06' },
  { label: 'Julho/2026', val: '2026-07' },
  { label: 'Agosto/2026', val: '2026-08' },
  { label: 'Set/2026 (Atual)', val: '2026-09' },
];

function fmtMoeda(v: number) {
  if (isNaN(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtPct(v: number) {
  if (isNaN(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

export function DashboardPage() {
  const [mes, setMes] = useState('2026-05');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [gateway, setGateway] = useState('');
  const [modalidade, setModalidade] = useState('');
  const [bandeira, setBandeira] = useState('');

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  // Drilldown Modal State
  const [drilldown, setDrilldown] = useState<{
    open: boolean;
    tipo: DrilldownTipo;
    title: string;
    subtitle?: string;
    filterParams: DrilldownFilterParams;
  }>({
    open: false,
    tipo: 'VENDAS',
    title: '',
    filterParams: {},
  });

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const qp: Record<string, string> = {};
      if (dataInicio && dataFim) {
        qp.dataInicio = dataInicio;
        qp.dataFim    = dataFim;
      } else {
        qp.mes = mes;
      }
      if (gateway)    qp.gateway    = gateway;
      if (modalidade) qp.modalidade = modalidade;
      if (bandeira)   qp.bandeira   = bandeira;

      const res = await api.get('/dashboard/gerencial', { params: qp });
      setData(res.data);
    } catch (err) {
      console.error('Erro ao carregar dashboard gerencial:', err);
    } finally {
      setLoading(false);
    }
  }, [mes, dataInicio, dataFim, gateway, modalidade, bandeira]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const openDrilldown = (tipo: DrilldownTipo, title: string, extraFilters?: Partial<DrilldownFilterParams>, subtitle?: string) => {
    setDrilldown({
      open: true,
      tipo,
      title,
      subtitle: subtitle || `Competência: ${dataInicio && dataFim ? `${dataInicio} até ${dataFim}` : mes}`,
      filterParams: {
        mes: !dataInicio ? mes : undefined,
        dataInicio: dataInicio || undefined,
        dataFim: dataFim || undefined,
        gateway: extraFilters?.gateway ?? (gateway || undefined),
        modalidade: extraFilters?.modalidade ?? (modalidade || undefined),
        bandeira: extraFilters?.bandeira ?? (bandeira || undefined),
        dia: extraFilters?.dia,
        statusConc: extraFilters?.statusConc,
      },
    });
  };

  const kpis = data?.kpis;
  const porOrigem = data?.porOrigem ?? [];
  const porModalidade = data?.porModalidade ?? [];
  const fluxoDiario = data?.fluxoDiario ?? [];
  const tarifasAudit = data?.tarifasAudit ?? [];
  const alertas = data?.alertas;

  return (
    <div className="fade-in-up" style={{ maxWidth: 1240, margin: '0 auto', paddingBottom: 'var(--sp-8)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-5)', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontFamily: 'var(--font-title)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
              Dashboard Gerencial
            </h1>
            <span className="tab-badge tab-badge-teal" style={{ fontSize: '0.7rem', padding: '3px 8px' }}>
              VISÃO EXECUTIVA
            </span>
            {loading && (
              <span className="tab-badge tab-badge-warn" style={{ fontSize: '0.65rem' }}>
                Atualizando...
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-soft)', margin: '4px 0 0' }}>
            Acompanhamento 360° de vendas por cartão, liquidações em conta bancária e custos de adquirência
          </p>
        </div>

        {/* Global Competence Quick Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--panel)', padding: '4px 8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginRight: 4 }}>Mês:</span>
          {MESES_RAPIDOS.map(m => (
            <button
              key={m.val}
              onClick={() => {
                setDataInicio('');
                setDataFim('');
                setMes(m.val);
              }}
              style={{
                background: mes === m.val && !dataInicio ? 'var(--teal)' : 'transparent',
                color: mes === m.val && !dataInicio ? '#0b1220' : 'var(--text-soft)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 10px',
                fontSize: '0.75rem',
                fontWeight: mes === m.val && !dataInicio ? 700 : 500,
                cursor: 'pointer',
                transition: 'all .12s',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        marginBottom: 'var(--sp-5)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-soft)' }}>Origem / Gateway:</span>
          <select
            value={gateway}
            onChange={e => setGateway(e.target.value)}
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
          <span style={{ fontSize: '0.75rem', color: 'var(--text-soft)' }}>Modalidade:</span>
          <select
            value={modalidade}
            onChange={e => setModalidade(e.target.value)}
            style={{
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 8px',
              fontSize: '0.75rem',
            }}
          >
            <option value="">Todas</option>
            <option value="CREDITO">Crédito</option>
            <option value="DEBITO">Débito</option>
            <option value="VOUCHER">Voucher</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-soft)' }}>Período Customizado:</span>
          <input
            type="date"
            value={dataInicio}
            onChange={e => setDataInicio(e.target.value)}
            style={{
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '3px 6px',
              fontSize: '0.75rem',
            }}
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>até</span>
          <input
            type="date"
            value={dataFim}
            onChange={e => setDataFim(e.target.value)}
            style={{
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '3px 6px',
              fontSize: '0.75rem',
            }}
          />
        </div>

        {(gateway || modalidade || bandeira || dataInicio || dataFim) && (
          <button
            onClick={() => {
              setGateway('');
              setModalidade('');
              setBandeira('');
              setDataInicio('');
              setDataFim('');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--coral)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              marginLeft: 'auto',
              textDecoration: 'underline',
            }}
          >
            Limpar Filtros
          </button>
        )}
      </div>

      {/* 5 Executive KPI Cards with Drilldown On Click */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 'var(--sp-4)',
        marginBottom: 'var(--sp-5)',
      }}>
        {/* Card 1: Vendas Brutas */}
        <div
          onClick={() => openDrilldown('VENDAS', 'Vendas em Cartão (PDV / TEF)')}
          className="kpi-card"
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            cursor: 'pointer',
            transition: 'transform .15s, border-color .15s',
            position: 'relative',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--teal)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Vendas Cartão (Bruto)
            </span>
            <span style={{ fontSize: '0.62rem', color: 'var(--teal)', background: 'rgba(0,201,177,0.1)', padding: '2px 6px', borderRadius: 4 }}>
              Drilldown ↗
            </span>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--teal)', margin: '8px 0 4px', fontFamily: 'var(--font-mono)' }}>
            {fmtMoeda(kpis?.vendasBrutas ?? 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-soft)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{kpis?.qtdVendas?.toLocaleString('pt-BR') ?? 0} transações</span>
            <span>Ticket médio: {fmtMoeda(kpis?.ticketMedio ?? 0)}</span>
          </div>
        </div>

        {/* Card 2: Liquidações Efetivas (Recebido) */}
        <div
          onClick={() => openDrilldown('RECEBIDOS', 'Liquidações Efetivas Recebidas no Banco')}
          className="kpi-card"
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            cursor: 'pointer',
            transition: 'transform .15s, border-color .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Efetivamente Recebido
            </span>
            <span style={{ fontSize: '0.62rem', color: 'var(--gold)', background: 'rgba(240,165,0,0.1)', padding: '2px 6px', borderRadius: 4 }}>
              Drilldown ↗
            </span>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--gold)', margin: '8px 0 4px', fontFamily: 'var(--font-mono)' }}>
            {fmtMoeda(kpis?.totalRecebidoLiquido ?? 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-soft)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{kpis?.countLiquidacoes?.toLocaleString('pt-BR') ?? 0} liquidações</span>
            <span>MDR retido: {fmtMoeda(kpis?.totalDescontosMdr ?? 0)}</span>
          </div>
        </div>

        {/* Card 3: Previsão Futura (A Receber) */}
        <div
          onClick={() => openDrilldown('PREVISAO', 'Previsão de Recebimentos Futuros')}
          className="kpi-card"
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            cursor: 'pointer',
            transition: 'transform .15s, border-color .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#818cf8')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Projeção / A Receber
            </span>
            <span style={{ fontSize: '0.62rem', color: '#818cf8', background: 'rgba(129,140,248,0.1)', padding: '2px 6px', borderRadius: 4 }}>
              Drilldown ↗
            </span>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#818cf8', margin: '8px 0 4px', fontFamily: 'var(--font-mono)' }}>
            {fmtMoeda(kpis?.totalAReceber ?? 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-soft)' }}>
            Parcelamentos e agenda futura a liquidar
          </div>
        </div>

        {/* Card 4: Custo de Adquirência & Tarifas */}
        <div
          onClick={() => openDrilldown('TARIFAS', 'Auditoria de Aluguéis & Tarifas de Máquinas')}
          className="kpi-card"
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            cursor: 'pointer',
            transition: 'transform .15s, border-color .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--coral)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Custo Total Adquirência
            </span>
            <span style={{ fontSize: '0.62rem', color: 'var(--coral)', background: 'rgba(255,93,108,0.1)', padding: '2px 6px', borderRadius: 4 }}>
              Auditar ↗
            </span>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--coral)', margin: '8px 0 4px', fontFamily: 'var(--font-mono)' }}>
            {fmtMoeda((kpis?.vendasTaxas ?? 0) + (kpis?.totalTarifasAluguel ?? 0))}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-soft)', display: 'flex', justifyContent: 'space-between' }}>
            <span>MDR Médio: {fmtPct(kpis?.taxaMdrMedia ?? 0)}</span>
            <span>Aluguéis: {fmtMoeda(kpis?.totalTarifasAluguel ?? 0)}</span>
          </div>
        </div>

        {/* Card 5: Eficiência SITEF */}
        <div
          onClick={() => openDrilldown('DIVERGENCIAS', 'Vendas com Divergência ou Sem SITEF', { statusConc: 'DIVERGENTE' })}
          className="kpi-card"
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            cursor: 'pointer',
            transition: 'transform .15s, border-color .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--teal)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Conciliação SITEF
            </span>
            <span style={{ fontSize: '0.62rem', color: 'var(--teal)', background: 'rgba(0,201,177,0.1)', padding: '2px 6px', borderRadius: 4 }}>
              Verificar ↗
            </span>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--teal)', margin: '8px 0 4px', fontFamily: 'var(--font-mono)' }}>
            {fmtPct(kpis?.taxaConciliacaoSitef ?? 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-soft)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Conciliado com PDV</span>
            <span style={{ color: alertas?.transacoesDivergentes ? 'var(--coral)' : 'var(--muted)' }}>
              {alertas?.transacoesDivergentes ?? 0} divergências
            </span>
          </div>
        </div>
      </div>

      {/* SVG Interactive Timeline Chart */}
      <div style={{ marginBottom: 'var(--sp-5)' }}>
        <TimelineChart
          data={fluxoDiario}
          onSelectDay={(dia) => {
            openDrilldown('VENDAS', `Detalhamento de Transações do Dia ${dia}`, { dia }, `Transações registradas em ${dia}`);
          }}
        />
      </div>

      {/* 2 Executive Analysis Panels */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
        gap: 'var(--sp-5)',
        marginBottom: 'var(--sp-5)',
      }}>
        {/* Panel 1: Performance por Origem (Credenciadoras) */}
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--sp-4)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Participação por Origem (Credenciadoras)
            </h3>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
              Clique para detalhar por adquirente
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {porOrigem.map((o: any) => (
              <div
                key={o.gateway}
                onClick={() => openDrilldown('VENDAS', `Vendas da Credenciadora: ${o.gateway}`, { gateway: o.gateway })}
                style={{
                  background: 'var(--panel-alt)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px',
                  cursor: 'pointer',
                  transition: 'background .12s, border-color .12s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--teal)';
                  e.currentTarget.style.background = 'rgba(0, 201, 177, 0.04)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'var(--panel-alt)';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{o.gateway}</strong>
                    <span className="tab-badge tab-badge-teal" style={{ fontSize: '0.62rem' }}>
                      {fmtPct(o.participacaoPct)} do total
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>
                    {fmtMoeda(o.vendasBrutas)}
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ width: `${Math.min(o.participacaoPct, 100)}%`, height: '100%', background: 'var(--teal)' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-soft)' }}>
                  <span>Efetivo Recebido: <strong style={{ color: 'var(--gold)' }}>{fmtMoeda(o.totalRecebido)}</strong></span>
                  <span>MDR Médio: <strong style={{ color: 'var(--text)' }}>{fmtPct(o.taxaMdrMedia)}</strong></span>
                  {o.tarifasAluguel > 0 && (
                    <span style={{ color: 'var(--coral)' }}>Aluguel/Tarifa: {fmtMoeda(o.tarifasAluguel)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Panel 2: Mix de Modalidades & Bandeiras */}
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--sp-4)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Mix de Modalidades (Crédito, Débito e Vouchers)
            </h3>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
              Distribuição por tipo de operação
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {porModalidade.map((m: any) => (
              <div
                key={m.modalidade}
                onClick={() => openDrilldown('VENDAS', `Modalidade: ${m.modalidade}`, { modalidade: m.modalidade })}
                style={{
                  background: 'var(--panel-alt)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px',
                  cursor: 'pointer',
                  transition: 'background .12s, border-color .12s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--gold)';
                  e.currentTarget.style.background = 'rgba(240, 165, 0, 0.04)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'var(--panel-alt)';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{m.modalidade}</strong>
                    <span className="tab-badge tab-badge-gold" style={{ fontSize: '0.62rem' }}>
                      {fmtPct(m.participacaoPct)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>
                    {fmtMoeda(m.totalBruto)}
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ width: `${Math.min(m.participacaoPct, 100)}%`, height: '100%', background: 'var(--gold)' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-soft)' }}>
                  <span>Transações: {m.qtd.toLocaleString('pt-BR')}</span>
                  <span>Taxa MDR Média: <strong style={{ color: 'var(--text)' }}>{fmtPct(m.taxaMdrMedia)}</strong></span>
                  <span>Líquido: <strong style={{ color: 'var(--teal)' }}>{fmtMoeda(m.totalLiquido)}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Auditoria & Riscos Operacionais: Aluguéis de Máquina e Tarifas Administrativas */}
      <div style={{
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--sp-4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Auditoria de Tarifas Administrativas & Aluguéis de Terminais (POS)
            </h3>
            <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: '2px 0 0' }}>
              Identificação de mensalidades, taxas de conectividade e alertas automáticos de duplicidade de cobrança
            </p>
          </div>

          <button
            onClick={() => openDrilldown('TARIFAS', 'Todas as Tarifas e Aluguéis Debitados')}
            className="btn btn-secondary"
            style={{ fontSize: '0.72rem', padding: '4px 12px' }}
          >
            Ver Extrato de Tarifas ↗
          </button>
        </div>

        {alertas?.tarifasDuplicadas > 0 && (
          <div className="alert alert-warn" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.1rem' }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <strong>Alerta de Auditoria:</strong> Foram detectadas cobranças com suspeita de duplicidade ou recorrência anômala no mesmo mês de competência.
            </div>
            <button
              onClick={() => openDrilldown('TARIFAS', 'Tarifas Sob Suspeita de Duplicidade')}
              className="btn btn-primary"
              style={{ fontSize: '0.7rem', padding: '4px 8px' }}
            >
              Auditar Agora
            </button>
          </div>
        )}

        {tarifasAudit.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.78rem' }}>
            Nenhuma tarifa administrativa ou aluguel de terminal debitado nesta competência.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', fontSize: '0.75rem' }}>
              <thead>
                <tr>
                  <th>Data Débito</th>
                  <th>Credenciadora</th>
                  <th>EC / Terminal</th>
                  <th>Descrição da Cobrança</th>
                  <th style={{ textAlign: 'right' }}>Valor Cobrado</th>
                  <th style={{ textAlign: 'center' }}>Diagnóstico de Auditoria</th>
                </tr>
              </thead>
              <tbody>
                {tarifasAudit.map((t: any) => (
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
          </div>
        )}
      </div>

      {/* Drilldown Modal */}
      <DrilldownModal
        open={drilldown.open}
        onClose={() => setDrilldown(d => ({ ...d, open: false }))}
        tipo={drilldown.tipo}
        title={drilldown.title}
        subtitle={drilldown.subtitle}
        filterParams={drilldown.filterParams}
      />
    </div>
  );
}
