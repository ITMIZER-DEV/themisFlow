/**
 * matchStore — resultado do matchEngine com tolerância e composição N:1 configuráveis
 */
import { create } from 'zustand';
import type { MatchResult } from '@themisflow/core';
import { matchEngine } from '@themisflow/core';
import { useBankStore } from './bankStore';
import { useSystemStore } from './systemStore';

type MatchState = {
  result: MatchResult | null;
  tolerance: number;    // 0–3 dias
  groupMaxN: number;    // 0 = desabilitado; ≥2 = composição N:1
  groupWindow: number;  // janela de datas em dias para groupEngine

  runMatch: () => void;
  setTolerance: (tol: number) => void;
  setGroupMaxN: (n: number) => void;
  setGroupWindow: (w: number) => void;
};

export const useMatchStore = create<MatchState>((set, get) => ({
  result: null,
  tolerance: 0,
  groupMaxN: 0,
  groupWindow: 7,

  runMatch: () => {
    const acct = useBankStore.getState().activeAccount();
    const sys = useSystemStore.getState().statement;
    if (!acct || !sys) { set({ result: null }); return; }

    const { tolerance, groupMaxN, groupWindow } = get();
    const result = matchEngine(
      sys.items,
      acct.trnsWithId,
      new Set(sys.days.keys()),
      tolerance,
      groupMaxN,
      groupWindow,
    );
    set({ result });
  },

  setTolerance: (tol: number) => {
    set({ tolerance: Math.max(0, Math.min(3, tol)) });
    get().runMatch();
  },

  setGroupMaxN: (n: number) => {
    set({ groupMaxN: n < 2 ? 0 : Math.min(10, n) });
    get().runMatch();
  },

  setGroupWindow: (w: number) => {
    set({ groupWindow: Math.max(1, Math.min(31, w)) });
    get().runMatch();
  },
}));
