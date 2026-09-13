/**
 * sitefStore — estado SITEF com backend como fonte de verdade.
 *
 * R22 — Idempotência garantida pelo backend (skipDuplicates no createMany).
 * R23 — `transacoes` traz apenas EFETIVADAS por padrão.
 */
import { create } from 'zustand';
import { parseSitefRows } from '@themisflow/core';
import * as XLSX from 'xlsx';
import { api } from '../services/api';

export interface SitefImportResult {
  added:   number;
  skipped: number;
  arquivo: string;
  loteId:  string;
}

export interface SitefLote {
  id:          string;
  arquivo:     string;
  importadoEm: string;
  adicionadas: number;
  ignoradas:   number;
  importador:  { nome: string } | null;
  _count:      { transacoes: number };
}

export interface ApiTransacao {
  idempotencyKey:     string;
  loteId:             string;
  dataTrans:          string;
  dataDia:            string;
  dataFiscal:         string;
  codigoLoja:         string;
  cartao:             string;
  pdv:                string;
  nsu:                string;
  nsuHost:            string;
  valor:              string; // Decimal do Prisma serializado como string
  valorSaque:         string;
  rede:               string;
  tipoProduto:        string;
  tipoProdutoRaw:     string;
  autorizacao:        string;
  estabelecimento:    string;
  modoEntrada:        string;
  produto:            string;
  descricaoTransacao: string;
  nrParcelas:         number;
  estadoTransacao:    string;
  estadoTransacaoRaw: string;
  operador:           string;
  terminalLogico:     string;
  codSitef:           string;
  cupomFiscal:        string;
}

export interface TransacoesFilter {
  dataInicio?:      string;   // YYYY-MM-DD
  dataFim?:         string;   // YYYY-MM-DD
  nsuHost?:         string;
  autorizacao?:     string;
  estadoTransacao?: string;
  codigoLoja?:      string;
  loteId?:          string;
  page:             number;
  limit:            number;
}

type SitefState = {
  lotes:            SitefLote[];
  transacoes:       ApiTransacao[];
  totalTransacoes:  number;
  filter:           TransacoesFilter;

  importing:   boolean;
  importError: string | null;
  loadingLotes: boolean;
  loadingTrans: boolean;
  lotesLoaded:  boolean;

  /** Carrega lista de lotes. Idempotente — chame ao montar a página. */
  loadLotes: () => Promise<void>;
  /** Carrega transações com filtro atual. */
  loadTransacoes: (patch?: Partial<TransacoesFilter>) => Promise<void>;
  /** Parseia o arquivo localmente e envia ao backend. */
  importXLS: (file: File) => Promise<SitefImportResult>;
  /** Atualiza filtro e recarrega transações. */
  setFilter: (patch: Partial<TransacoesFilter>) => Promise<void>;
};

export const useSitefStore = create<SitefState>((set, get) => ({
  lotes:           [],
  transacoes:      [],
  totalTransacoes: 0,
  filter: {
    estadoTransacao: 'EFETIVADA',
    page:  1,
    limit: 100,
  },

  importing:    false,
  importError:  null,
  loadingLotes: false,
  loadingTrans: false,
  lotesLoaded:  false,

  loadLotes: async () => {
    if (get().loadingLotes) return;
    set({ loadingLotes: true });
    try {
      const { data } = await api.get<{ success: boolean; lotes: SitefLote[] }>('/sitef/lotes');
      set({ lotes: data.lotes, lotesLoaded: true });
    } finally {
      set({ loadingLotes: false });
    }
  },

  loadTransacoes: async (patch) => {
    const filter = patch ? { ...get().filter, ...patch } : get().filter;
    if (patch) set({ filter });
    set({ loadingTrans: true });
    try {
      const params: Record<string, string | number> = {
        page:  filter.page,
        limit: filter.limit,
      };
      if (filter.dataInicio)      params.dataInicio      = filter.dataInicio;
      if (filter.dataFim)         params.dataFim         = filter.dataFim;
      if (filter.nsuHost)         params.nsuHost         = filter.nsuHost;
      if (filter.autorizacao)     params.autorizacao     = filter.autorizacao;
      if (filter.estadoTransacao) params.estadoTransacao = filter.estadoTransacao;
      if (filter.codigoLoja)      params.codigoLoja      = filter.codigoLoja;
      if (filter.loteId)          params.loteId          = filter.loteId;

      const { data } = await api.get<{
        success: boolean;
        total: number;
        transacoes: ApiTransacao[];
      }>('/sitef/transacoes', { params });

      set({ transacoes: data.transacoes, totalTransacoes: data.total });
    } finally {
      set({ loadingTrans: false });
    }
  },

  importXLS: async (file: File) => {
    set({ importing: true, importError: null });
    try {
      const buf    = await file.arrayBuffer();
      const wb     = XLSX.read(new Uint8Array(buf), { type: 'array' });
      const ws     = wb.Sheets[wb.SheetNames[0]!];
      if (!ws) throw new Error('Planilha vazia ou não reconhecida');

      const rows   = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
      const parsed = parseSitefRows(rows as string[][], file.name);

      const { data } = await api.post<{
        success:    boolean;
        loteId:     string;
        adicionadas: number;
        ignoradas:  number;
      }>('/sitef/lotes', {
        arquivo:    file.name,
        transacoes: parsed.todas,
      });

      // Recarrega lotes e transações para refletir o novo lote
      await Promise.all([get().loadLotes(), get().loadTransacoes()]);

      set({ importing: false });

      return {
        added:   data.adicionadas,
        skipped: data.ignoradas,
        arquivo: file.name,
        loteId:  data.loteId,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ importError: msg, importing: false });
      throw err;
    }
  },

  setFilter: async (patch) => {
    await get().loadTransacoes({ ...patch, page: 1 });
  },
}));
