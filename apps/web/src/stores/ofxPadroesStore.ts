import { create } from 'zustand';
import { api } from '../services/api';

// ── Constantes ────────────────────────────────────────────────────

export const TIPOS_OFX  = ['PIX', 'CARTAO', 'TARIFA', 'TRANSFERENCIA', 'OUTRO', 'IGNORAR'] as const;
export const BANDEIRAS  = ['VISA', 'MASTER', 'ELO', 'AMEX', 'HIPERCARD', 'CABAL', 'OUTROS'] as const;
export const BANCOS     = ['SICOOB', 'SICREDI', 'BB', 'ITAU', 'BRADESCO', 'SANTANDER', 'CAIXA', 'NUBANK', 'INTER'] as const;

export type TipoOfx = typeof TIPOS_OFX[number];

export const LABEL_TIPO: Record<TipoOfx, string> = {
  PIX:           'PIX',
  CARTAO:        'Cartão',
  TARIFA:        'Tarifa',
  TRANSFERENCIA: 'Transferência',
  OUTRO:         'Outro',
  IGNORAR:       'Ignorar',
};

export const COR_TIPO: Record<TipoOfx, string> = {
  PIX:           'var(--teal)',
  CARTAO:        'var(--gold)',
  TARIFA:        'var(--red)',
  TRANSFERENCIA: '#7b8fcc',
  OUTRO:         'var(--muted)',
  IGNORAR:       'var(--muted)',
};

// ── Tipos ─────────────────────────────────────────────────────────

export interface OfxPadrao {
  id:         number;
  texto:      string;
  tipo:       TipoOfx;
  bandeira:   string | null;
  banco:      string | null;
  prioridade: number;
  ativo:      boolean;
  origem:     'MANUAL' | 'APRENDIDO';
  criadoEm:  string;
}

export type OfxPadraoInput = Omit<OfxPadrao, 'id' | 'criadoEm'>;

// ── Store ─────────────────────────────────────────────────────────

interface State {
  padroes:  OfxPadrao[];
  loading:  boolean;
  error:    string | null;

  fetchPadroes:   () => Promise<void>;
  createPadrao:   (data: OfxPadraoInput) => Promise<OfxPadrao>;
  updatePadrao:   (id: number, data: Partial<OfxPadraoInput>) => Promise<void>;
  deletePadrao:   (id: number) => Promise<void>;
  classificar:    (texto: string, banco?: string) => Promise<OfxPadrao | null>;
}

const sortPadroes = (list: OfxPadrao[]) =>
  [...list].sort((a, b) => b.prioridade - a.prioridade || a.texto.localeCompare(b.texto));

export const useOfxPadroesStore = create<State>((set) => ({
  padroes:  [],
  loading:  false,
  error:    null,

  fetchPadroes: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get<{ padroes: OfxPadrao[] }>('/ofx-padroes');
      set({ padroes: sortPadroes(data.padroes), loading: false });
    } catch {
      set({ loading: false, error: 'Erro ao carregar padrões.' });
    }
  },

  createPadrao: async (input) => {
    const { data } = await api.post<{ padrao: OfxPadrao }>('/ofx-padroes', input);
    set(s => ({ padroes: sortPadroes([...s.padroes, data.padrao]) }));
    return data.padrao;
  },

  updatePadrao: async (id, input) => {
    const { data } = await api.put<{ padrao: OfxPadrao }>(`/ofx-padroes/${id}`, input);
    set(s => ({ padroes: sortPadroes(s.padroes.map(p => p.id === id ? data.padrao : p)) }));
  },

  deletePadrao: async (id) => {
    await api.delete(`/ofx-padroes/${id}`);
    set(s => ({ padroes: s.padroes.filter(p => p.id !== id) }));
  },

  classificar: async (texto, banco) => {
    const { data } = await api.post<{ match: OfxPadrao | null }>(
      '/ofx-padroes/classificar',
      { texto, banco },
    );
    return data.match;
  },
}));
