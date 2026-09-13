/**
 * lib/persistence.ts — IndexedDB via idb
 *
 * R19 — Marcações amarradas ao FITID, por conta (bankId·acctId), persistentes.
 * R21 — Zero dados saem da máquina.
 * R22 — Idempotência SITEF: chave composta nsu::pdv::codigoLoja::rede::dataDia.
 *
 * v1: conciliacao + sessoes
 * v2: + sitefTransacoes (keyPath: idempotencyKey)
 *
 * Migração v0: marcações do localStorage com chave "itmizer-ofx-conc::*" são
 * importadas automaticamente na primeira abertura.
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { SitefTransacao } from '@themisflow/core';

const DB_NAME = 'themisflow';
const DB_VERSION = 2;

export interface SitefTransacaoStored extends SitefTransacao {
  importedAt: number;  // timestamp Unix (ms) do lote de importação
  arquivo: string;     // nome do arquivo de origem
}

type ThemisDB = {
  conciliacao: {
    key: string;                 // acctKey = "bankId·acctId"
    value: { acctKey: string; ids: string[] };
  };
  sessoes: {
    key: string;
    value: { id: string; ofxRaw?: string; xlsData?: number[]; savedAt: number };
  };
  sitefTransacoes: {
    key: string;                 // idempotencyKey = "nsu::pdv::codigoLoja::rede::dataDia"
    value: SitefTransacaoStored;
  };
};

let _db: IDBPDatabase<ThemisDB> | null = null;

async function getDB(): Promise<IDBPDatabase<ThemisDB>> {
  if (_db) return _db;
  _db = await openDB<ThemisDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains('conciliacao'))
          db.createObjectStore('conciliacao', { keyPath: 'acctKey' });
        if (!db.objectStoreNames.contains('sessoes'))
          db.createObjectStore('sessoes', { keyPath: 'id' });
      }
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('sitefTransacoes'))
          db.createObjectStore('sitefTransacoes', { keyPath: 'idempotencyKey' });
      }
    },
  });
  // Migrar marcações do v0 (localStorage) se existirem
  await migrateV0(_db);
  return _db;
}

/** Migração v0 — move marcações do localStorage para IndexedDB. */
async function migrateV0(db: IDBPDatabase<ThemisDB>) {
  const prefix = 'itmizer-ofx-conc::';
  const keysToMigrate: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(prefix)) keysToMigrate.push(k);
  }
  if (!keysToMigrate.length) return;

  const tx = db.transaction('conciliacao', 'readwrite');
  for (const lsKey of keysToMigrate) {
    const acctKey = lsKey.slice(prefix.length);
    const raw = localStorage.getItem(lsKey);
    if (!raw) continue;
    try {
      const ids: string[] = JSON.parse(raw);
      const existing = await tx.store.get(acctKey);
      if (!existing) {
        await tx.store.put({ acctKey, ids });
      }
    } catch {
      /* ignora entrada corrompida */
    }
    localStorage.removeItem(lsKey);
  }
  await tx.done;
  console.info('[ThemisFlow] Migração v0 concluída — marcações importadas do localStorage.');
}

// ── API pública ──────────────────────────────────────────────────

/** Carrega Set de ids conciliados para uma conta. */
export async function loadConc(acctKey: string): Promise<Set<string>> {
  const db = await getDB();
  const row = await db.get('conciliacao', acctKey);
  return new Set(row?.ids ?? []);
}

/** Persiste Set de ids conciliados para uma conta. */
export async function saveConc(acctKey: string, ids: Set<string>): Promise<void> {
  const db = await getDB();
  await db.put('conciliacao', { acctKey, ids: [...ids] });
}

/** Exporta todas as marcações como JSON (para backup). */
export async function exportConcJSON(): Promise<string> {
  const db = await getDB();
  const all = await db.getAll('conciliacao');
  return JSON.stringify(all, null, 2);
}

/** Importa marcações de um JSON exportado anteriormente. */
export async function importConcJSON(json: string): Promise<void> {
  const db = await getDB();
  const data = JSON.parse(json) as Array<{ acctKey: string; ids: string[] }>;
  const tx = db.transaction('conciliacao', 'readwrite');
  for (const row of data) {
    await tx.store.put(row);
  }
  await tx.done;
}

// ── SITEF ────────────────────────────────────────────────────────

/** Carrega todas as transações SITEF persistidas. */
export async function loadSitefTransacoes(): Promise<SitefTransacaoStored[]> {
  const db = await getDB();
  return db.getAll('sitefTransacoes');
}

/**
 * Persiste um lote de transações SITEF.
 * PUT é naturalmente idempotente: repetir a mesma idempotencyKey apenas sobrescreve.
 */
export async function upsertSitefTransacoes(items: SitefTransacaoStored[]): Promise<void> {
  if (!items.length) return;
  const db = await getDB();
  const tx = db.transaction('sitefTransacoes', 'readwrite');
  for (const item of items) {
    await tx.store.put(item);
  }
  await tx.done;
}

/** Remove todas as transações SITEF do IndexedDB. */
export async function clearSitefTransacoes(): Promise<void> {
  const db = await getDB();
  await db.clear('sitefTransacoes');
}
