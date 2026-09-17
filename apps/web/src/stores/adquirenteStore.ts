import { create } from 'zustand';
import * as XLSX from 'xlsx';
import {
  parseGetnetVendasRows,
  parseGetnetRecebiveisRows,
  parseAleloRows,
  parseSodexoRows,
  parseTicketRows,
  parseVrBeneficiosRows,
  parseSodexoRecebiveisRows,
  parseVrRecebiveisRows,
  parseVrVendasEdi,
  parseVrReembolsosEdi,
} from '@themisflow/core';
import { api } from '../services/api';

async function readTextFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('latin1').decode(buf);
  }
}

// ── Tipos da API ──────────────────────────────────────────────────

export interface AdquirenteLote {
  id:          string;
  gateway:     string;
  tipo:        string;
  arquivo:     string;
  dataInicio:  string;
  dataFim:     string;
  importadoEm: string;
  adicionadas: number;
  ignoradas:   number;
  importador:  { nome: string } | null;
  _count:      { vendas: number; recebiveis: number };
}

export interface ApiVenda {
  idempotencyKey:  string;
  loteId:          string;
  gateway:         string;
  ec:              string;
  bandeira:        string;
  modalidade:      string;
  formaPagamento:  string;
  dataHoraVenda:   string;
  status:          string;
  parcelas:        number;
  cartaoMascarado: string;
  autorizacao:     string;
  nsu:             string;
  terminal:        string;
  valorBruto:      string;
  valorTaxa:       string;
  valorLiquido:    string;
  sitefKey:        string | null;
  statusConc:      string;
}

export interface KpiTaxaLinha {
  bandeira:          string;
  modalidade:        string;
  qtdTransacoes:     number;
  totalBruto:        number;
  totalTaxa:         number;
  totalLiquido:      number;
  taxaEfetivaPct:    number;
  taxaMdrContratada: number | null;
  divergenciaPct:    number | null;
  divergenciaReais:  number | null;
}

export interface KpiStatusConc {
  statusConc:           string;
  _count:               { idempotencyKey: number };
  _sum:                 { valorBruto: string | null };
}

export interface KpiRecebiveisFuturos {
  bandeira:   string;
  modalidade: string;
  _count:     { idempotencyKey: number };
  _sum:       { valorLiquido: string | null };
}

export interface KpiData {
  periodo:     { dataInicio: string | undefined; dataFim: string | undefined };
  gateway:     string | undefined;
  totais: {
    qtdTransacoes: number;
    totalBruto:    number;
    totalTaxa:     number;
    totalLiquido:  number;
  };
  taxasEfetivas:     KpiTaxaLinha[];
  statusConcVendas:  KpiStatusConc[];
  recebiveisFuturos: KpiRecebiveisFuturos[];
}

export interface ImportResult {
  arquivo:    string;
  adicionadas: number;
  atualizadas: number;
  loteId:     string;
}

export interface ConciliarResult {
  loteId:  string;
  periodo: { dataInicio: string; dataFim: string };
  resumo: {
    conciliados: number;
    divergentes: number;
    semSitef:    number;
    semAdq:      number;
  };
}

export interface VendasFilter {
  gateway?:    string;
  loteId?:     string;
  bandeira?:   string;
  modalidade?: string;
  statusConc?: string;
  dataInicio?: string;
  dataFim?:    string;
  page:        number;
  limit:       number;
}

export interface KpiParams {
  gateway?:    string;
  dataInicio?: string;
  dataFim?:    string;
  contratoId?: string;
}

export interface ContratosSimples { id: string; nome: string; rede: string; }

export interface ResumoLinha {
  bandeira:       string;
  modalidade:     string;
  qtd:            number;
  totalBruto:     number;
  totalTaxa:      number;
  totalLiquido:   number;
  taxaEfetivaPct: number;
}

export interface ResumoVendas {
  totais: { qtd: number; totalBruto: number; totalTaxa: number; totalLiquido: number };
  porBandeira: ResumoLinha[];
}

export interface PrevisaoDia {
  data:     string;
  total:    number;
  parcelas: number;
}

export interface PrevisaoDetalhe {
  data:       string;
  bandeira:   string;
  modalidade: string;
  parcelas:   number;
  total:      number;
}

export interface PrevisaoData {
  periodo:        { dataInicio: string; dataFim: string };
  totais:         { totalLiquido: number; parcelas: number };
  porDia:         PrevisaoDia[];
  detalhes:       PrevisaoDetalhe[];
  fonteUtilizada?: 'VENDAS' | 'RECEBIVEIS';
}

export interface PrevisaoParams {
  gateway?:    string;
  dataInicio?: string;
  dataFim?:    string;
  dias?:       number;
  origem?:     'AUTO' | 'VENDAS' | 'RECEBIVEIS';
}

// ── Rastreio analítico triplo ─────────────────────────────────────

export interface DivergenciaItem {
  tipo:       string;
  campo:      string;
  esperado:   string;
  encontrado: string;
  dif?:       number;
}

export interface RastreioSitef {
  idempotencyKey:  string;
  nsu:             string;
  nsuHost:         string;
  autorizacao:     string | null;
  terminalLogico:  string | null;
  valor:           number;
  dataDia:         string;
  estadoTransacao: string;
  tipoProduto:     string | null;
  nrParcelas:      number;
}

export interface RastreioRecebivel {
  idempotencyKey: string;
  nsu:            string | null;
  autorizacao:    string | null;
  dataVencimento: string;
  valorLiquido:   number;
  tipoLancamento: string;
  parcelasInfo:   string | null;
  bandeira:       string;
  modalidade:     string;
}

export type StatusTriplo = 'TRIPLO_OK' | 'SEM_RECEBIVEL' | 'SEM_SITEF' | 'PENDENTE' | 'DIVERGENTE';
export type MatchVia = 'NSU_TERMINAL' | 'NSU_AUTORIZACAO' | 'AUTORIZACAO_TERMINAL' | 'AUTORIZACAO';

export interface RastreioTransacao {
  idempotencyKey:  string;
  gateway:         string;
  bandeira:        string;
  modalidade:      string;
  dataHoraVenda:   string;
  nsu:             string;
  autorizacao:     string | null;
  terminal:        string | null;
  cartaoMascarado: string | null;
  valorBruto:      number;
  valorTaxa:       number;
  valorLiquido:    number;
  parcelas:        number;
  statusConc:      string;
  meioCaptura:     string | null;
  sitef:           RastreioSitef | null;
  recebiveis:      RastreioRecebivel[];
  statusTriplo:    StatusTriplo;
  matchVia:        MatchVia | null;
  divergencias:    DivergenciaItem[];
}

export interface RastreioResumoConc {
  statusConc: string;
  _count:     { idempotencyKey: number };
}

export interface RastreioData {
  total:      number;
  page:       number;
  limit:      number;
  resumoConc: RastreioResumoConc[];
  transacoes: RastreioTransacao[];
}

export interface RastreioFilter {
  gateway?:        string;
  loteId?:         string;
  bandeira?:       string;
  modalidade?:     string;
  statusConc?:     string;
  tipoLancamento?: string;
  dataInicio?:     string;
  dataFim?:        string;
  page:            number;
  limit:           number;
}

export interface TaxasFilter {
  gateway?:    string;
  dataInicio?: string;
  dataFim?:    string;
}

export interface PagamentosOrigem {
  gateway:         string;
  count:           number;
  totalBruto:      number;
  totalDescontos:  number;
  totalTarifas:    number;
  totalRecebido:   number;
  taxaEfetivaPct:  number;
  participacaoPct: number;
}

export interface TarifaAuditItem {
  id:                string;
  gateway:           string;
  ec:                string;
  dataVencimento:    string;
  lancamento:        string;
  valor:             number;
  duplicada:         boolean;
  motivoDuplicidade?: string;
}

export interface PagamentoItem {
  id:             string;
  gateway:        string;
  ec:             string;
  dataVencimento: string;
  dataVenda:      string | null;
  tipoLancamento: string;
  lancamento:     string;
  bandeira:       string;
  modalidade:     string;
  nsu:            string | null;
  autorizacao:    string | null;
  terminal:       string | null;
  valorBruto:     number;
  descontos:      number;
  valorLiquidado: number;
  statusConc:     string;
  parcelasInfo:   string | null;
}

export interface PagamentosData {
  periodo: {
    mes:        string;
    dataInicio: string;
    dataFim:    string;
  };
  kpis: {
    totalRecebido:     number;
    totalBruto:        number;
    totalDescontosMdr: number;
    totalTarifas:      number;
    countLiquidacoes:  number;
    countTarifas:      number;
  };
  porOrigem:    PagamentosOrigem[];
  tarifasAudit: TarifaAuditItem[];
  paginacao: {
    page:       number;
    limit:      number;
    total:      number;
    totalPages: number;
  };
  itens: PagamentoItem[];
}

export interface LoteAnaliseData {
  success: boolean;
  lote: {
    id: string;
    arquivo: string;
    gateway: string;
    tipo: 'VENDAS' | 'RECEBIVEIS';
    dataInicio: string;
    dataFim: string;
    importadoEm: string;
    importador?: string;
  };
  auditoria: {
    totalRegistros: number;
    totalBruto: number;
    totalTaxa: number;
    totalLiquido: number;
    totalLiquidado?: number;
    diferenca: number;
    taxaMediaPct: number;
    acuraciaBatida: boolean;
  };
  porBandeira: Array<{
    bandeira: string;
    modalidade: string;
    qtd: number;
    bruto: number;
    taxa: number;
    liquido: number;
    liquidado?: number;
    taxaPct: number;
  }>;
  paginacao: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  itens: Array<{
    id: string;
    dataHora?: string;
    dataVencimento?: string;
    dataVenda?: string | null;
    nsu?: string | null;
    autorizacao?: string | null;
    cartao?: string | null;
    bandeira: string;
    modalidade: string;
    terminal?: string | null;
    tipoLancamento?: string;
    lancamento?: string;
    parcelasInfo?: string | null;
    valorBruto: number;
    valorTaxa?: number;
    descontos?: number;
    valorLiquido: number;
    valorLiquidado?: number;
    status?: string;
    statusConc?: string;
  }>;
}

export interface PagamentosFilter {
  mes?:        string;
  dataInicio?: string;
  dataFim?:    string;
  gateway?:    string;
  tipo?:       'TODOS' | 'LIQUIDACOES' | 'TARIFAS' | 'PAGAMENTO_REALIZADO';
  bandeira?:   string;
  modalidade?: string;
  page?:       number;
  limit?:      number;
}

// ── Store ─────────────────────────────────────────────────────────

type AdquirenteState = {
  lotes:       AdquirenteLote[];
  lotesLoaded: boolean;
  loadingLotes: boolean;

  importingVendas:     boolean;
  importingRecebiveis: boolean;
  importError:         string | null;
  lastImport:          ImportResult | null;

  vendas:       ApiVenda[];
  totalVendas:  number;
  vendasFilter: VendasFilter;
  loadingVendas: boolean;

  kpi:        KpiData | null;
  loadingKpi: boolean;
  kpiParams:  KpiParams;

  contratos:       ContratosSimples[];
  contratosLoaded: boolean;

  conciliando:     boolean;
  conciliaResult:  ConciliarResult | null;

  resumoVendas:    ResumoVendas | null;
  loadingResumo:   boolean;

  previsao:        PrevisaoData | null;
  loadingPrevisao: boolean;
  previsaoParams:  PrevisaoParams;

  rastreio:        RastreioData | null;
  loadingRastreio: boolean;
  rastreioFilter:  RastreioFilter;

  taxasResumo:     ResumoVendas | null;
  loadingTaxas:    boolean;
  taxasFilter:     TaxasFilter;

  pagamentosData:    PagamentosData | null;
  loadingPagamentos: boolean;
  pagamentosFilter:  PagamentosFilter;

  loadLotes:          () => Promise<void>;
  loadVendas:         (patch?: Partial<VendasFilter>) => Promise<void>;
  setVendasFilter:    (patch: Partial<VendasFilter>) => Promise<void>;
  loadKpi:            (patch?: Partial<KpiParams>) => Promise<void>;
  loadContratos:      () => Promise<void>;
  loadResumoVendas:   () => Promise<void>;
  loadPrevisao:       (patch?: Partial<PrevisaoParams>) => Promise<void>;
  loadRastreio:       (patch?: Partial<RastreioFilter>) => Promise<void>;
  loadTaxasResumo:    (patch?: Partial<TaxasFilter>) => Promise<void>;
  loadPagamentos:     (patch?: Partial<PagamentosFilter>) => Promise<void>;
  importVendas:       (file: File, gateway: string) => Promise<ImportResult>;
  importRecebiveis:   (file: File, gateway: string) => Promise<ImportResult>;
  conciliar:          (loteId: string) => Promise<ConciliarResult>;
  deleteLote:         (loteId: string) => Promise<void>;
  fetchLoteAnalise:   (loteId: string, params?: { search?: string; page?: number; limit?: number }) => Promise<LoteAnaliseData>;
  clearImportError:   () => void;
};

const today = new Date().toISOString().slice(0, 10);
const mesAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const useAdquirenteStore = create<AdquirenteState>((set, get) => ({
  lotes:        [],
  lotesLoaded:  false,
  loadingLotes: false,

  importingVendas:     false,
  importingRecebiveis: false,
  importError:         null,
  lastImport:          null,

  vendas:        [],
  totalVendas:   0,
  vendasFilter:  { page: 1, limit: 100 },
  loadingVendas: false,

  kpi:        null,
  loadingKpi: false,
  kpiParams:  { dataInicio: mesAtras, dataFim: today },

  contratos:       [],
  contratosLoaded: false,

  conciliando:    false,
  conciliaResult: null,

  resumoVendas:    null,
  loadingResumo:   false,

  previsao:        null,
  loadingPrevisao: false,
  previsaoParams:  { dias: 90 },

  rastreio:        null,
  loadingRastreio: false,
  rastreioFilter:  { page: 1, limit: 50 },

  taxasResumo:  null,
  loadingTaxas: false,
  taxasFilter:  { dataInicio: mesAtras, dataFim: today },

  pagamentosData:    null,
  loadingPagamentos: false,
  pagamentosFilter:  { mes: '2026-05', page: 1, limit: 50, tipo: 'TODOS' },

  // ── Lotes ──────────────────────────────────────────────────────

  loadLotes: async () => {
    if (get().loadingLotes) return;
    set({ loadingLotes: true });
    try {
      const { data } = await api.get<{ success: boolean; lotes: AdquirenteLote[] }>('/adquirente/lotes');
      set({ lotes: data.lotes, lotesLoaded: true });
    } finally {
      set({ loadingLotes: false });
    }
  },

  // ── Vendas ─────────────────────────────────────────────────────

  loadVendas: async (patch) => {
    const filter = patch ? { ...get().vendasFilter, ...patch } : get().vendasFilter;
    if (patch) set({ vendasFilter: filter });
    set({ loadingVendas: true });
    try {
      const params: Record<string, string | number> = { page: filter.page, limit: filter.limit };
      if (filter.gateway)    params.gateway    = filter.gateway;
      if (filter.loteId)     params.loteId     = filter.loteId;
      if (filter.bandeira)   params.bandeira   = filter.bandeira;
      if (filter.modalidade) params.modalidade = filter.modalidade;
      if (filter.statusConc) params.statusConc = filter.statusConc;
      if (filter.dataInicio) params.dataInicio = filter.dataInicio;
      if (filter.dataFim)    params.dataFim    = filter.dataFim;

      const { data } = await api.get<{ success: boolean; total: number; vendas: ApiVenda[] }>(
        '/adquirente/vendas', { params },
      );
      set({ vendas: data.vendas, totalVendas: data.total });
    } finally {
      set({ loadingVendas: false });
    }
  },

  setVendasFilter: async (patch) => {
    await get().loadVendas({ ...patch, page: 1 });
  },

  // ── KPI ────────────────────────────────────────────────────────

  loadKpi: async (patch) => {
    const params = patch ? { ...get().kpiParams, ...patch } : get().kpiParams;
    if (patch) set({ kpiParams: params });
    set({ loadingKpi: true });
    try {
      const qp: Record<string, string> = {};
      if (params.gateway)    qp.gateway    = params.gateway;
      if (params.dataInicio) qp.dataInicio = params.dataInicio;
      if (params.dataFim)    qp.dataFim    = params.dataFim;
      if (params.contratoId) qp.contratoId = params.contratoId;

      const { data } = await api.get<{ success: boolean } & KpiData>('/adquirente/kpi', { params: qp });
      set({ kpi: data });
    } finally {
      set({ loadingKpi: false });
    }
  },

  // ── Contratos (para comparação de taxa) ───────────────────────

  loadContratos: async () => {
    if (get().contratosLoaded) return;
    try {
      const { data } = await api.get<{ success: boolean; contratos: ContratosSimples[] }>('/taxas/contratos');
      set({ contratos: data.contratos, contratosLoaded: true });
    } catch { /* silencioso — contrato é opcional */ }
  },

  // ── Importação: Vendas_Detalhado ───────────────────────────────

  importVendas: async (file, gateway) => {
    set({ importingVendas: true, importError: null, lastImport: null });
    try {
      const isTxt = file.name.toLowerCase().endsWith('.txt');
      const allVendas: any[] = [];

      if (isTxt) {
        const text = await readTextFile(file);
        if (gateway === 'VR') {
          const parsed = parseVrVendasEdi(text, file.name);
          allVendas.push(...parsed.vendas);
        } else {
          throw new Error(`Arquivo .txt não suportado para o gateway ${gateway}.`);
        }
      } else {
        const buf  = await file.arrayBuffer();
        const wb   = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });

        // Determina o parser com base no gateway
        let parseFn = parseGetnetVendasRows as (rows: any[][], gateway: string, fname: string) => any;
        if (gateway === 'ALELO') parseFn = parseAleloRows;
        else if (gateway === 'SODEXO') parseFn = parseSodexoRows;
        else if (gateway === 'TICKET') parseFn = parseTicketRows;
        else if (gateway === 'VR') parseFn = parseVrBeneficiosRows;

        // Tenta parsear cada sheet — combina tudo
        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          if (!ws) continue;
          const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
          try {
            const parsed = parseFn(rows as string[][], gateway, file.name);
            allVendas.push(...parsed.vendas);
          } catch {
            // Sheet sem layout reconhecido — pula
          }
        }
      }

      if (allVendas.length === 0) {
        throw new Error(`Nenhuma venda encontrada nas planilhas. Verifique se o arquivo corresponde ao formato de ${gateway}.`);
      }

      // Extrai período dos dados
      const datas = allVendas.map(v => v.dataHoraVenda.slice(0, 10)).sort();
      const dataInicio = datas[0]!;
      const dataFim    = datas[datas.length - 1]!;

      const { data } = await api.post<{ success: boolean; loteId: string; adicionadas: number; atualizadas: number }>(
        '/adquirente/lotes',
        { arquivo: file.name, gateway, tipo: 'VENDAS', dataInicio, dataFim, vendas: allVendas },
      );

      const result: ImportResult = {
        arquivo:    file.name,
        adicionadas: data.adicionadas,
        atualizadas: data.atualizadas,
        loteId:     data.loteId,
      };
      set({ lastImport: result });
      await Promise.all([get().loadLotes(), get().loadVendas()]);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ importError: msg });
      throw err;
    } finally {
      set({ importingVendas: false });
    }
  },

  // ── Importação: Recebivel_Completos ───────────────────────────

  importRecebiveis: async (file, gateway) => {
    set({ importingRecebiveis: true, importError: null, lastImport: null });
    try {
      const isTxt = file.name.toLowerCase().endsWith('.txt');
      let parsed: any;

      if (isTxt) {
        const text = await readTextFile(file);
        if (gateway === 'VR') {
          parsed = parseVrReembolsosEdi(text, file.name);
        } else {
          throw new Error(`Arquivo .txt não suportado para o gateway ${gateway}.`);
        }
      } else {
        const buf = await file.arrayBuffer();
        const wb  = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });

        if (gateway === 'SODEXO') {
          const sheetName = wb.SheetNames.find(n =>
            n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes('pagam') ||
            n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes('pgto')
          ) ?? wb.SheetNames[0]!;
          const ws = wb.Sheets[sheetName];
          if (!ws) throw new Error('Planilha de pagamentos não encontrada');
          const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
          parsed = parseSodexoRecebiveisRows(rows as string[][], file.name);
        } else if (gateway === 'VR') {
          const sheetName = wb.SheetNames.find(n =>
            n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes('reembolso') ||
            n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes('guia')
          ) ?? wb.SheetNames[0]!;
          const ws = wb.Sheets[sheetName];
          if (!ws) throw new Error('Planilha de guias de reembolso não encontrada');
          const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
          parsed = parseVrRecebiveisRows(rows as string[][], file.name);
        } else {
          const sheetName = wb.SheetNames.find(n =>
            n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes('detalh'),
          ) ?? wb.SheetNames[0]!;
          const ws = wb.Sheets[sheetName];
          if (!ws) throw new Error('Sheet "Detalhado" não encontrada no arquivo');
          const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
          parsed = parseGetnetRecebiveisRows(rows as string[][], gateway, file.name);
        }
      }

      if (parsed.recebiveis.length === 0) {
        throw new Error(`Nenhum recebível encontrado. Verifique se o arquivo corresponde ao formato de ${gateway}.`);
      }

      // Extrai período das datas de venda (mais relevante que dataVencimento para o período da importação)
      const datasVenda = parsed.recebiveis
        .filter((r: any) => r.dataVenda)
        .map((r: any) => r.dataVenda!)
        .sort();
      const datasVenc = parsed.recebiveis.map((r: any) => r.dataVencimento).sort();
      const dataInicio = datasVenda[0]             ?? datasVenc[0]!;
      const dataFim    = datasVenda[datasVenda.length - 1] ?? datasVenc[datasVenc.length - 1]!;

      const { data } = await api.post<{ success: boolean; loteId: string; adicionadas: number; atualizadas: number }>(
        '/adquirente/lotes',
        { arquivo: file.name, gateway, tipo: 'RECEBIVEIS', dataInicio, dataFim, recebiveis: parsed.recebiveis },
      );

      const result: ImportResult = {
        arquivo:    file.name,
        adicionadas: data.adicionadas,
        atualizadas: data.atualizadas,
        loteId:     data.loteId,
      };
      set({ lastImport: result });
      await get().loadLotes();
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ importError: msg });
      throw err;
    } finally {
      set({ importingRecebiveis: false });
    }
  },

  // ── Conciliação ────────────────────────────────────────────────

  conciliar: async (loteId) => {
    set({ conciliando: true, conciliaResult: null });
    try {
      const { data } = await api.post<{ success: boolean } & ConciliarResult>(
        `/adquirente/lotes/${loteId}/conciliar-duck`,
      );
      set({ conciliaResult: data });
      await get().loadVendas();
      return data;
    } finally {
      set({ conciliando: false });
    }
  },

  deleteLote: async (loteId) => {
    await api.delete(`/adquirente/lotes/${loteId}`);
    set(s => ({ lotes: s.lotes.filter(l => l.id !== loteId) }));
    if (get().vendasFilter.loteId === loteId) {
      await get().loadVendas({ loteId: undefined });
    }
  },

  // ── Resumo de vendas (KPI por bandeira) ───────────────────────────

  loadResumoVendas: async () => {
    const f = get().vendasFilter;
    set({ loadingResumo: true });
    try {
      const params: Record<string, string> = {};
      if (f.gateway)    params.gateway    = f.gateway;
      if (f.loteId)     params.loteId     = f.loteId;
      if (f.bandeira)   params.bandeira   = f.bandeira;
      if (f.modalidade) params.modalidade = f.modalidade;
      if (f.statusConc) params.statusConc = f.statusConc;
      if (f.dataInicio) params.dataInicio = f.dataInicio;
      if (f.dataFim)    params.dataFim    = f.dataFim;

      const { data } = await api.get<{ success: boolean } & ResumoVendas>(
        '/adquirente/vendas/resumo', { params },
      );
      set({ resumoVendas: { totais: data.totais, porBandeira: data.porBandeira } });
    } finally {
      set({ loadingResumo: false });
    }
  },

  // ── Previsão de recebimento ────────────────────────────────────────

  loadPrevisao: async (patch) => {
    const params = patch ? { ...get().previsaoParams, ...patch } : get().previsaoParams;
    if (patch) set({ previsaoParams: params });
    set({ loadingPrevisao: true });
    try {
      const qp: Record<string, string | number> = { dias: params.dias ?? 90 };
      if (params.gateway)    qp.gateway    = params.gateway;
      if (params.dataInicio) qp.dataInicio = params.dataInicio;
      if (params.dataFim)    qp.dataFim    = params.dataFim;
      if (params.origem)     qp.origem     = params.origem;

      const { data } = await api.get<{ success: boolean } & PrevisaoData>(
        '/adquirente/previsao', { params: qp },
      );
      set({ previsao: data });
    } finally {
      set({ loadingPrevisao: false });
    }
  },

  // ── Rastreio analítico triplo ──────────────────────────────────────

  loadRastreio: async (patch) => {
    const filter = patch ? { ...get().rastreioFilter, ...patch, page: patch.page ?? 1 } : get().rastreioFilter;
    if (patch) set({ rastreioFilter: filter });
    set({ loadingRastreio: true });
    try {
      const qp: Record<string, string | number> = { page: filter.page, limit: filter.limit };
      if (filter.gateway)        qp.gateway        = filter.gateway;
      if (filter.loteId)         qp.loteId         = filter.loteId;
      if (filter.bandeira)       qp.bandeira        = filter.bandeira;
      if (filter.modalidade)     qp.modalidade      = filter.modalidade;
      if (filter.statusConc)     qp.statusConc      = filter.statusConc;
      if (filter.tipoLancamento) qp.tipoLancamento  = filter.tipoLancamento;
      if (filter.dataInicio)     qp.dataInicio      = filter.dataInicio;
      if (filter.dataFim)        qp.dataFim         = filter.dataFim;

      const { data } = await api.get<{ success: boolean } & RastreioData>(
        '/adquirente/rastreio-duck', { params: qp },
      );
      set({ rastreio: { total: data.total, page: data.page, limit: data.limit, resumoConc: data.resumoConc, transacoes: data.transacoes } });
    } finally {
      set({ loadingRastreio: false });
    }
  },

  loadTaxasResumo: async (patch) => {
    const f = patch ? { ...get().taxasFilter, ...patch } : get().taxasFilter;
    if (patch) set({ taxasFilter: f });
    set({ loadingTaxas: true });
    try {
      const params: Record<string, string> = {};
      if (f.gateway)    params.gateway    = f.gateway;
      if (f.dataInicio) params.dataInicio = f.dataInicio;
      if (f.dataFim)    params.dataFim    = f.dataFim;
      const { data } = await api.get<{ success: boolean } & ResumoVendas>(
        '/adquirente/vendas/resumo', { params },
      );
      set({ taxasResumo: { totais: data.totais, porBandeira: data.porBandeira } });
    } finally {
      set({ loadingTaxas: false });
    }
  },

  loadPagamentos: async (patch) => {
    const f = patch ? { ...get().pagamentosFilter, ...patch } : get().pagamentosFilter;
    if (patch) set({ pagamentosFilter: f });
    set({ loadingPagamentos: true });
    try {
      const qp: Record<string, string | number> = {
        page:  f.page  ?? 1,
        limit: f.limit ?? 50,
      };
      if (f.mes)        qp.mes = f.mes;
      if (f.dataInicio) qp.dataInicio = f.dataInicio;
      if (f.dataFim)    qp.dataFim    = f.dataFim;
      if (f.gateway)    qp.gateway    = f.gateway;
      if (f.tipo)       qp.tipo       = f.tipo;
      if (f.bandeira)   qp.bandeira   = f.bandeira;
      if (f.modalidade) qp.modalidade = f.modalidade;

      const { data } = await api.get<{ success: boolean } & PagamentosData>(
        '/adquirente/pagamentos', { params: qp },
      );
      set({ pagamentosData: data });
    } finally {
      set({ loadingPagamentos: false });
    }
  },

  fetchLoteAnalise: async (loteId, params) => {
    const qp: Record<string, string | number> = {};
    if (params?.search) qp.search = params.search;
    if (params?.page)   qp.page   = params.page;
    if (params?.limit)  qp.limit  = params.limit;

    const { data } = await api.get<LoteAnaliseData>(
      `/adquirente/lotes/${loteId}/analise`,
      { params: qp },
    );
    return data;
  },

  clearImportError: () => set({ importError: null, lastImport: null }),
}));
