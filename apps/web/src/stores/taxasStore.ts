import { create } from 'zustand';
import { api } from '../services/api';

export const TIPOS_PAGAMENTO = ['CREDITO', 'DEBITO', 'ALIMENTACAO', 'REFEICAO', 'COMBUSTIVEL', 'VOUCHER', 'PIX'] as const;
export const MODALIDADES     = ['A_VISTA', 'PARCELADO_LOJA', 'PARCELADO_ADM'] as const;
export const TIPOS_ENCARGO   = ['MENSAL', 'POR_OCORRENCIA', 'PERCENTUAL_VENDA', 'ANUAL'] as const;

export const BANDEIRAS_CARTAO    = ['VISA', 'MASTER', 'ELO', 'AMEX', 'HIPERCARD', 'CABAL', 'OUTROS'];
export const BANDEIRAS_BENEFICIO = ['VR', 'VA', 'ALELO', 'SODEXO', 'TICKET', 'BEN', 'OUTROS'];

export function bandeirasPorTipo(tipo: string): string[] {
  if (tipo === 'PIX') return ['PIX'];
  if (['ALIMENTACAO', 'REFEICAO', 'VOUCHER'].includes(tipo)) return BANDEIRAS_BENEFICIO;
  return BANDEIRAS_CARTAO;
}

export const LABEL_TIPO: Record<string, string> = {
  CREDITO:     'Crédito',
  DEBITO:      'Débito',
  ALIMENTACAO: 'Alimentação',
  REFEICAO:    'Refeição',
  COMBUSTIVEL: 'Combustível',
  VOUCHER:     'Voucher',
  PIX:         'PIX',
};

export const LABEL_MODALIDADE: Record<string, string> = {
  A_VISTA:        'À Vista',
  PARCELADO_LOJA: 'Parc. Lojista',
  PARCELADO_ADM:  'Parc. Administradora',
};

export const LABEL_ENCARGO: Record<string, string> = {
  MENSAL:            'Mensal (R$)',
  POR_OCORRENCIA:    'Por Ocorrência (R$)',
  PERCENTUAL_VENDA:  '% sobre Venda',
  ANUAL:             'Anual (R$)',
};

export interface TaxaItem {
  id: string;
  contratoId: string;
  tipoPagamento: string;
  bandeira: string;
  modalidade: string;
  parcelaMin: number;
  parcelaMax: number;
  taxaMdr: string;
  taxaAntecipacao: string;
  prazoRecebimento: number;
  taxaFixa: string;
}

export interface TaxaAluguel {
  id: string;
  contratoId: string;
  descricao: string;
  qtdTerminais: number;
  valorUnitario: string;
  ativo: boolean;
}

export interface TaxaEncargo {
  id: string;
  contratoId: string;
  descricao: string;
  tipo: string;
  valor: string;
  ativo: boolean;
}

export interface TaxaContrato {
  id: string;
  nome: string;
  rede: string;
  dataInicio: string;
  dataFim: string | null;
  ativo: boolean;
  observacoes: string | null;
  criadoEm: string;
  criador: { nome: string } | null;
  _count?: { itens: number; alugueis: number; encargos: number };
  itens?:    TaxaItem[];
  alugueis?: TaxaAluguel[];
  encargos?: TaxaEncargo[];
}

type TaxasState = {
  contratos:  TaxaContrato[];
  detalhe:    TaxaContrato | null;
  loading:    boolean;
  loadingDet: boolean;
  error:      string | null;

  loadContratos:  () => Promise<void>;
  loadDetalhe:    (id: string) => Promise<void>;
  createContrato: (data: Omit<TaxaContrato, 'id' | 'criadoEm' | 'criador' | '_count' | 'itens' | 'alugueis' | 'encargos'>) => Promise<TaxaContrato>;
  updateContrato: (id: string, data: Partial<TaxaContrato>) => Promise<void>;
  deleteContrato: (id: string) => Promise<void>;

  addItem:    (contratoId: string, data: Omit<TaxaItem, 'id' | 'contratoId'>) => Promise<void>;
  updateItem: (contratoId: string, itemId: string, data: Partial<TaxaItem>) => Promise<void>;
  deleteItem: (contratoId: string, itemId: string) => Promise<void>;

  addAluguel:    (contratoId: string, data: Omit<TaxaAluguel, 'id' | 'contratoId'>) => Promise<void>;
  updateAluguel: (contratoId: string, aluguelId: string, data: Partial<TaxaAluguel>) => Promise<void>;
  deleteAluguel: (contratoId: string, aluguelId: string) => Promise<void>;

  addEncargo:    (contratoId: string, data: Omit<TaxaEncargo, 'id' | 'contratoId'>) => Promise<void>;
  updateEncargo: (contratoId: string, encargoId: string, data: Partial<TaxaEncargo>) => Promise<void>;
  deleteEncargo: (contratoId: string, encargoId: string) => Promise<void>;
};

export const useTaxasStore = create<TaxasState>((set) => ({
  contratos:  [],
  detalhe:    null,
  loading:    false,
  loadingDet: false,
  error:      null,

  loadContratos: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get<{ contratos: TaxaContrato[] }>('/taxas/contratos');
      set({ contratos: data.contratos });
    } catch (e: unknown) {
      set({ error: (e as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  loadDetalhe: async (id) => {
    set({ loadingDet: true, detalhe: null });
    try {
      const { data } = await api.get<{ contrato: TaxaContrato }>(`/taxas/contratos/${id}`);
      set({ detalhe: data.contrato });
    } finally {
      set({ loadingDet: false });
    }
  },

  createContrato: async (data) => {
    const res = await api.post<{ contrato: TaxaContrato }>('/taxas/contratos', data);
    const novo = res.data.contrato;
    set(s => ({ contratos: [novo, ...s.contratos] }));
    return novo;
  },

  updateContrato: async (id, data) => {
    const res = await api.put<{ contrato: TaxaContrato }>(`/taxas/contratos/${id}`, data);
    const upd = res.data.contrato;
    set(s => ({
      contratos: s.contratos.map(c => c.id === id ? { ...c, ...upd } : c),
      detalhe: s.detalhe?.id === id ? { ...s.detalhe, ...upd } : s.detalhe,
    }));
  },

  deleteContrato: async (id) => {
    await api.delete(`/taxas/contratos/${id}`);
    set(s => ({ contratos: s.contratos.filter(c => c.id !== id), detalhe: null }));
  },

  // ── Itens MDR ─────────────────────────────────────────────────
  addItem: async (contratoId, data) => {
    const res = await api.post<{ item: TaxaItem }>(`/taxas/contratos/${contratoId}/itens`, data);
    set(s => ({
      detalhe: s.detalhe?.id === contratoId
        ? { ...s.detalhe, itens: [...(s.detalhe.itens ?? []), res.data.item] }
        : s.detalhe,
    }));
  },

  updateItem: async (contratoId, itemId, data) => {
    const res = await api.put<{ item: TaxaItem }>(`/taxas/contratos/${contratoId}/itens/${itemId}`, data);
    set(s => ({
      detalhe: s.detalhe?.id === contratoId
        ? { ...s.detalhe, itens: s.detalhe.itens?.map(i => i.id === itemId ? res.data.item : i) }
        : s.detalhe,
    }));
  },

  deleteItem: async (contratoId, itemId) => {
    await api.delete(`/taxas/contratos/${contratoId}/itens/${itemId}`);
    set(s => ({
      detalhe: s.detalhe?.id === contratoId
        ? { ...s.detalhe, itens: s.detalhe.itens?.filter(i => i.id !== itemId) }
        : s.detalhe,
    }));
  },

  // ── Aluguéis ──────────────────────────────────────────────────
  addAluguel: async (contratoId, data) => {
    const res = await api.post<{ aluguel: TaxaAluguel }>(`/taxas/contratos/${contratoId}/alugueis`, data);
    set(s => ({
      detalhe: s.detalhe?.id === contratoId
        ? { ...s.detalhe, alugueis: [...(s.detalhe.alugueis ?? []), res.data.aluguel] }
        : s.detalhe,
    }));
  },

  updateAluguel: async (contratoId, aluguelId, data) => {
    const res = await api.put<{ aluguel: TaxaAluguel }>(`/taxas/contratos/${contratoId}/alugueis/${aluguelId}`, data);
    set(s => ({
      detalhe: s.detalhe?.id === contratoId
        ? { ...s.detalhe, alugueis: s.detalhe.alugueis?.map(a => a.id === aluguelId ? res.data.aluguel : a) }
        : s.detalhe,
    }));
  },

  deleteAluguel: async (contratoId, aluguelId) => {
    await api.delete(`/taxas/contratos/${contratoId}/alugueis/${aluguelId}`);
    set(s => ({
      detalhe: s.detalhe?.id === contratoId
        ? { ...s.detalhe, alugueis: s.detalhe.alugueis?.filter(a => a.id !== aluguelId) }
        : s.detalhe,
    }));
  },

  // ── Encargos ──────────────────────────────────────────────────
  addEncargo: async (contratoId, data) => {
    const res = await api.post<{ encargo: TaxaEncargo }>(`/taxas/contratos/${contratoId}/encargos`, data);
    set(s => ({
      detalhe: s.detalhe?.id === contratoId
        ? { ...s.detalhe, encargos: [...(s.detalhe.encargos ?? []), res.data.encargo] }
        : s.detalhe,
    }));
  },

  updateEncargo: async (contratoId, encargoId, data) => {
    const res = await api.put<{ encargo: TaxaEncargo }>(`/taxas/contratos/${contratoId}/encargos/${encargoId}`, data);
    set(s => ({
      detalhe: s.detalhe?.id === contratoId
        ? { ...s.detalhe, encargos: s.detalhe.encargos?.map(e => e.id === encargoId ? res.data.encargo : e) }
        : s.detalhe,
    }));
  },

  deleteEncargo: async (contratoId, encargoId) => {
    await api.delete(`/taxas/contratos/${contratoId}/encargos/${encargoId}`);
    set(s => ({
      detalhe: s.detalhe?.id === contratoId
        ? { ...s.detalhe, encargos: s.detalhe.encargos?.filter(e => e.id !== encargoId) }
        : s.detalhe,
    }));
  },
}));
