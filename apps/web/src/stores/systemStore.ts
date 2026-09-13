/**
 * systemStore — estado do extrato do sistema (XLS)
 */
import { create } from 'zustand';
import type { SystemStatement } from '@themisflow/core';
import { parseSystemRows } from '@themisflow/core';
import * as XLSX from 'xlsx';

type SystemState = {
  statement: SystemStatement | null;
  filename: string;
  importError: string | null;
  importing: boolean;

  importXLS: (file: File) => Promise<void>;
  setStatementFromErp: (data: {
    file: string;
    days: Array<{ key: string; day: any }>;
    items: any[];
  }) => void;
  clear: () => void;
};

export const useSystemStore = create<SystemState>((set) => ({
  statement: null,
  filename: '',
  importError: null,
  importing: false,

  importXLS: async (file: File) => {
    set({ importing: true, importError: null });
    try {
      const buf = await file.arrayBuffer();
      // R14 — .xls legado (BIFF8) e .xlsx via SheetJS
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]!];
      if (!ws) throw new Error('Planilha vazia ou não reconhecida');
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
      const stmt = parseSystemRows(rows as string[][], file.name);
      set({ statement: stmt, filename: file.name, importing: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ importError: msg, importing: false });
    }
  },

  setStatementFromErp: (data) => {
    const daysMap = new Map<string, any>();
    for (const d of data.days) {
      daysMap.set(d.key, d.day);
    }
    const stmt: SystemStatement = {
      file: data.file,
      days: daysMap,
      items: data.items,
    };
    set({ statement: stmt, filename: data.file, importError: null, importing: false });
  },

  clear: () => set({ statement: null, filename: '', importError: null }),
}));
