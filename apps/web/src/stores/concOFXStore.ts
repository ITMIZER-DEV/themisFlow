import { create } from 'zustand';
import {
  classificarEntradas,
  conciliaPixOfx,
  conciliaCartaoOfx,
  type PixMatch,
  type CartaoMatch,
  type OFXCredito,
  type SistemaPix,
  type LiquidacaoCartao,
} from '@themisflow/core';
import { api } from '../services/api';
import { useBankStore, type AccountEntry } from './bankStore';
import { useOfxPadroesStore, type OfxPadrao } from './ofxPadroesStore';

// ── Tipos expostos ─────────────────────────────────────────────────

export type { PixMatch, CartaoMatch };

export interface NaoClassificado {
  fitid:  string
  date:   string
  amount: number
  memo:   string
  name:   string
}

export interface ConcOFXParams {
  dataInicio:  string   // YYYY-MM-DD
  dataFim:     string   // YYYY-MM-DD
  accountKey:  string   // bankStore account key
}

// ── Store ─────────────────────────────────────────────────────────

interface State {
  params:           ConcOFXParams | null
  pixMatches:       PixMatch[]
  cartaoMatches:    CartaoMatch[]
  naoClassificados: NaoClassificado[]
  loading:          boolean
  error:            string | null

  runConciliacao: (params: ConcOFXParams) => Promise<void>
  classificarLocal: (fitid: string, tipo: string, bandeira: string | null) => void
  salvarPadrao: (texto: string, tipo: string, bandeira: string | null) => Promise<OfxPadrao>
}

export const useConcOFXStore = create<State>((set) => ({
  params:           null,
  pixMatches:       [],
  cartaoMatches:    [],
  naoClassificados: [],
  loading:          false,
  error:            null,

  runConciliacao: async (params) => {
    set({ loading: true, error: null, params });
    try {
      // 1. Conta OFX selecionada
      const account: AccountEntry | undefined = useBankStore.getState().accounts.get(params.accountKey);
      if (!account) throw new Error('Conta OFX não encontrada. Importe o extrato primeiro.');

      // 2. Padrões de classificação
      const { padroes, fetchPadroes } = useOfxPadroesStore.getState();
      if (padroes.length === 0) await fetchPadroes();
      const padroesAtivos = useOfxPadroesStore.getState().padroes.filter(p => p.ativo);

      // 3. Filtra transações OFX no período (apenas créditos > 0)
      const trns = account.trnsWithId.filter(t =>
        t.date >= params.dataInicio &&
        t.date <= params.dataFim,
      );

      // 4. Classifica com a biblioteca de padrões
      const classificadas = classificarEntradas(
        trns.map(t => ({ fitid: t.fitid, date: t.date, amount: t.amount, memo: t.memo, name: t.name })),
        padroesAtivos,
      );

      // Entradas não classificadas (qualquer valor/sinal)
      const naoClass: NaoClassificado[] = classificadas
        .filter(e => !e.classificado)
        .map(e => ({ fitid: e.fitid, date: e.date, amount: e.amount, memo: e.memo, name: '' }));

      // Apenas créditos classificados (amount > 0)
      const creditosPIX: OFXCredito[] = classificadas
        .filter(e => e.classificado && e.tipo === 'PIX' && e.amount > 0)
        .map(e => ({ fitid: e.fitid, date: e.date, amount: e.amount, memo: e.memo, bandeira: null, padraoId: e.padraoId }));

      const creditosCartao: OFXCredito[] = classificadas
        .filter(e => e.classificado && e.tipo === 'CARTAO' && e.amount > 0)
        .map(e => ({ fitid: e.fitid, date: e.date, amount: e.amount, memo: e.memo, bandeira: e.bandeira, padraoId: e.padraoId }));

      // 5. Busca dados do sistema em paralelo
      const [resPix, resLiq] = await Promise.all([
        api.get('/adquirente/vendas', {
          params: { modalidade: 'PIX', status: 'APROVADA', dataInicio: params.dataInicio, dataFim: params.dataFim, limit: 9999 },
        }),
        api.get('/adquirente/recebiveis/liquidacoes', {
          params: { dataInicio: params.dataInicio, dataFim: params.dataFim },
        }),
      ]);

      const vendas = (resPix.data.vendas as Array<{
        idempotencyKey: string; dataHoraVenda: string; valorLiquido: string; nsu: string; autorizacao: string;
      }>).map<SistemaPix>(v => ({
        idempotencyKey: v.idempotencyKey,
        data:           v.dataHoraVenda.slice(0, 10),
        valorLiquido:   Number(v.valorLiquido),
        nsu:            v.nsu,
        autorizacao:    v.autorizacao,
      }));

      const liquidacoes = resLiq.data.liquidacoes as LiquidacaoCartao[];

      // 6. Engines de matching
      const pixMatches    = conciliaPixOfx(creditosPIX, vendas);
      const cartaoMatches = conciliaCartaoOfx(creditosCartao, liquidacoes);

      set({ pixMatches, cartaoMatches, naoClassificados: naoClass, loading: false });
    } catch (e: unknown) {
      set({ loading: false, error: (e as Error).message });
    }
  },

  // Classifica um lançamento localmente (sem salvar no banco de padrões)
  classificarLocal: (fitid, tipo, _bandeira) => {
    set(s => ({
      naoClassificados: s.naoClassificados.filter(n => n.fitid !== fitid),
    }));
    // TODO: mover para aba correta se tipo=PIX ou CARTAO, rodando o match novamente
    // Por ora apenas remove da lista de não classificados
    void tipo;
  },

  // Salva um novo padrão a partir de aprendizado
  salvarPadrao: async (texto, tipo, bandeira) => {
    return useOfxPadroesStore.getState().createPadrao({
      texto:      texto.toUpperCase(),
      tipo:       tipo as never,
      bandeira:   bandeira as never,
      banco:      null,
      prioridade: 5,
      ativo:      true,
      origem:     'APRENDIDO',
    });
  },
}));
