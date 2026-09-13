/**
 * bankStore — estado do extrato bancário OFX
 * Suporta multi-conta: múltiplos OFX importados, conta ativa selecionável.
 */
import { create } from 'zustand';
import type { OFXStatement, OFXTransaction, DayComputed } from '@themisflow/core';
import { parseOFX, decodeBuffer, trnId, computeDays } from '@themisflow/core';

export type AccountEntry = OFXStatement & {
  /** Transações com id de dedup aplicado */
  trnsWithId: (OFXTransaction & { id: string })[];
  dayComputed: DayComputed;
};

export function acctKey(s: Pick<OFXStatement, 'bankId' | 'acctId'>): string {
  return `${s.bankId}·${s.acctId}`;
}

type BankState = {
  accounts: Map<string, AccountEntry>;
  selectedKey: string | null;
  importErrors: string[];

  importOFX: (file: File) => Promise<void>;
  selectAccount: (key: string) => void;
  clearErrors: () => void;
  activeAccount: () => AccountEntry | null;
};

export const useBankStore = create<BankState>((set, get) => ({
  accounts: new Map(),
  selectedKey: null,
  importErrors: [],

  importOFX: async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const raw = decodeBuffer(new Uint8Array(buf));
      const statements = parseOFX(raw, file.name);

      if (!statements.length) {
        set(s => ({ importErrors: [...s.importErrors, `${file.name}: nenhum extrato encontrado`] }));
        return;
      }

      set(s => {
        const accounts = new Map(s.accounts);

        for (const stmt of statements) {
          const key = acctKey(stmt);
          const existing = accounts.get(key);

          // R5 — Dedup: nunca duplicar lançamentos ao reimportar OFX sobrepostos
          const existingIds = new Set(existing?.trnsWithId.map(t => t.id) ?? []);
          const newTrns = stmt.trns
            .map(t => ({ ...t, id: trnId(t) }))
            .filter(t => !existingIds.has(t.id));

          const allTrns = [...(existing?.trnsWithId ?? []), ...newTrns];
          const dayComputed = computeDays({
            trns: allTrns,
            ledger: stmt.ledger ?? existing?.ledger ?? null,
            ledgerDt: stmt.ledgerDt || existing?.ledgerDt || '',
          });

          accounts.set(key, {
            ...stmt,
            trnsWithId: allTrns,
            dayComputed,
          });
        }

        const selectedKey = s.selectedKey ?? [...accounts.keys()][0] ?? null;
        return { accounts, selectedKey, importErrors: [] };
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set(s => ({ importErrors: [...s.importErrors, `${file.name}: ${msg}`] }));
    }
  },

  selectAccount: (key: string) => set({ selectedKey: key }),

  clearErrors: () => set({ importErrors: [] }),

  activeAccount: () => {
    const { accounts, selectedKey } = get();
    return selectedKey ? (accounts.get(selectedKey) ?? null) : null;
  },
}));
