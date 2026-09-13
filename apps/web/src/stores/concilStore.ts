/**
 * concilStore — marcações manuais de conciliação
 * R19 — Marcação por FITID, por conta, persistente no IndexedDB.
 * R20 — "Marcar casados" aplica os pares do matchEngine sobre a marcação manual.
 */
import { create } from 'zustand';
import { loadConc, saveConc, exportConcJSON, importConcJSON } from '../lib/persistence';
import type { MatchPair, MatchGroup } from '@themisflow/core';

type ConcilState = {
  /** Map: acctKey → Set<fitid> */
  marks: Map<string, Set<string>>;
  loadedKeys: Set<string>;

  /** Carrega marcações do IndexedDB para uma conta */
  ensureLoaded: (acctKey: string) => Promise<void>;
  /** Toggle de um lançamento */
  toggle: (acctKey: string, fitid: string) => Promise<void>;
  /** Marcar todos os pares e grupos como conciliados (R20) */
  applyPairs: (acctKey: string, pairs: MatchPair[], groups?: MatchGroup[]) => Promise<void>;
  /** Verificar se um id está conciliado */
  isConc: (acctKey: string, fitid: string) => boolean;
  /** Exportar JSON de backup */
  exportJSON: () => Promise<string>;
  /** Importar JSON */
  importJSON: (json: string) => Promise<void>;
  /** Contar conciliados de uma conta */
  countConc: (acctKey: string) => number;
};

export const useConcilStore = create<ConcilState>((set, get) => ({
  marks: new Map(),
  loadedKeys: new Set(),

  ensureLoaded: async (acctKey: string) => {
    if (get().loadedKeys.has(acctKey)) return;
    const ids = await loadConc(acctKey);
    set(s => {
      const marks = new Map(s.marks);
      marks.set(acctKey, ids);
      const loadedKeys = new Set(s.loadedKeys);
      loadedKeys.add(acctKey);
      return { marks, loadedKeys };
    });
  },

  toggle: async (acctKey: string, fitid: string) => {
    await get().ensureLoaded(acctKey);
    set(s => {
      const marks = new Map(s.marks);
      const set_ = new Set(marks.get(acctKey) ?? []);
      if (set_.has(fitid)) set_.delete(fitid);
      else set_.add(fitid);
      marks.set(acctKey, set_);
      // Persistir assincronamente
      void saveConc(acctKey, set_);
      return { marks };
    });
  },

  applyPairs: async (acctKey: string, pairs: MatchPair[], groups: MatchGroup[] = []) => {
    await get().ensureLoaded(acctKey);
    set(s => {
      const marks = new Map(s.marks);
      const ids = new Set(marks.get(acctKey) ?? []);
      for (const p of pairs) ids.add(p.ofx.id ?? p.ofx.fitid);
      for (const g of groups) ids.add(g.ofx.id ?? g.ofx.fitid);
      marks.set(acctKey, ids);
      void saveConc(acctKey, ids);
      return { marks };
    });
  },

  isConc: (acctKey: string, fitid: string) => {
    return get().marks.get(acctKey)?.has(fitid) ?? false;
  },

  countConc: (acctKey: string) => {
    return get().marks.get(acctKey)?.size ?? 0;
  },

  exportJSON: async () => exportConcJSON(),

  importJSON: async (json: string) => {
    await importConcJSON(json);
    // Recarregar todos os keys já em memória
    const keys = [...get().loadedKeys];
    set({ marks: new Map(), loadedKeys: new Set() });
    for (const key of keys) {
      await get().ensureLoaded(key);
    }
  },
}));
