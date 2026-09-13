/**
 * Motor de matching banco × sistema.
 *
 * R15 — Casa por valor assinado idêntico; preferir data exata, depois menor distância dentro da tolerância (0–3 dias).
 * R16 — 1:1 estrito: sem dupla contagem (2 itens iguais no sistema × 1 no banco ⇒ 1 par + 1 só-sistema).
 * R17 — "Só no banco" considera APENAS lançamentos OFX dos dias cobertos pelo arquivo do sistema.
 * R18 — Pagamento+estorno de mesmo valor sem par no banco ⇒ ambos em só-no-sistema (correto, não é bug).
 * R19 — Composição N:1: N itens do sistema com soma exata a 1 item do banco; backtracking com poda precoce.
 */
import type { OFXTransaction } from './ofx-parser.js';
import type { SystemItem } from './system-xls-parser.js';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface MatchPair {
  sys: SystemItem;
  ofx: OFXTransaction;
  dd: number;  // diferença de dias (0 = data exata)
}

export interface MatchGroup {
  sys: SystemItem[];      // 2+ itens do sistema que compõem este banco
  ofx: OFXTransaction;   // 1 lançamento bancário
  sumSys: number;         // soma dos sys (deve ≈ ofx.amount)
  maxWindow: number;      // maior distância de dias entre qualquer sys e ofx
}

export interface MatchResult {
  pairs: MatchPair[];
  groups: MatchGroup[];
  onlySys: SystemItem[];
  onlyBank: OFXTransaction[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Diferença absoluta em dias entre duas datas ISO. */
export const dayDiffISO = (a: string, b: string): number =>
  Math.round(
    (new Date(a + 'T12:00:00').getTime() - new Date(b + 'T12:00:00').getTime()) / 86_400_000,
  );

// ---------------------------------------------------------------------------
// groupEngine — composição N:1
// ---------------------------------------------------------------------------

type Candidate = { idx: number; item: SystemItem; cents: number; dd: number };

/**
 * Pós-processa um MatchResult já com pares 1:1 resolvidos e tenta compor
 * subsets dos onlySys que somem exatamente a algum item de onlyBank.
 *
 * @param result     resultado do passo 1:1 (modificado in-place e retornado)
 * @param maxN       tamanho máximo do subset (≥2)
 * @param windowDays janela de datas: |sys.date - ofx.date| ≤ windowDays
 */
export function groupEngine(result: MatchResult, maxN: number, windowDays: number): MatchResult {
  const resolvedSys = new Set<number>();   // índices em result.onlySys
  const resolvedBank = new Set<string>();  // ids dos ofx resolvidos

  const toCents = (v: number) => Math.round(v * 100);

  const bt = (
    cands: Candidate[],
    start: number,
    k: number,
    remaining: number,
    chosen: Candidate[],
  ): boolean => {
    if (chosen.length === k) return remaining === 0;
    for (let i = start; i < cands.length; i++) {
      const c = cands[i];
      if (c.cents > remaining) continue; // poda: valor acima do restante
      chosen.push(c);
      if (bt(cands, i + 1, k, remaining - c.cents, chosen)) return true;
      chosen.pop();
    }
    return false;
  };

  for (const bankItem of result.onlyBank) {
    const bankId = bankItem.id ?? bankItem.fitid;
    if (resolvedBank.has(bankId)) continue;

    const targetCents = toCents(bankItem.amount);

    // Candidatos dentro da janela de datas e ainda não resolvidos
    const candidates: Candidate[] = [];
    result.onlySys.forEach((s, idx) => {
      if (resolvedSys.has(idx)) return;
      const dd = Math.abs(dayDiffISO(bankItem.date, s.date));
      if (dd <= windowDays) {
        candidates.push({ idx, item: s, cents: toCents(s.value), dd });
      }
    });

    if (candidates.length < 2) continue;

    // Ordenar por valor DESC para melhorar poda precoce
    candidates.sort((a, b) => b.cents - a.cents);

    let found: Candidate[] | null = null;
    for (let k = 2; k <= Math.min(maxN, candidates.length); k++) {
      const chosen: Candidate[] = [];
      if (bt(candidates, 0, k, targetCents, chosen)) {
        found = chosen;
        break;
      }
    }

    if (!found) continue;

    const maxWindow = Math.max(...found.map(c => c.dd));
    const sumSys = Math.round(found.reduce((acc, c) => acc + c.cents, 0)) / 100;

    result.groups.push({ sys: found.map(c => c.item), ofx: bankItem, sumSys, maxWindow });

    for (const c of found) resolvedSys.add(c.idx);
    resolvedBank.add(bankId);
  }

  result.onlySys = result.onlySys.filter((_, i) => !resolvedSys.has(i));
  result.onlyBank = result.onlyBank.filter(t => !resolvedBank.has(t.id ?? t.fitid));

  return result;
}

// ---------------------------------------------------------------------------
// matchEngine
// ---------------------------------------------------------------------------

/**
 * R15–R19 — Confronta itens do sistema com transações OFX.
 *
 * @param sysItems    itens do sistema ({date, value, ...})
 * @param ofxTrns     transações OFX ({id, date, amount, ...})
 * @param sysDates    Set<string> de dias cobertos pelo arquivo do sistema (R17)
 * @param tol         tolerância em dias para matching 1:1 (0 = data exata)
 * @param groupMaxN   tamanho máximo de composição N:1 (0 = desabilitado)
 * @param groupWindow janela de datas em dias para groupEngine (default 7)
 */
export function matchEngine(
  sysItems: SystemItem[],
  ofxTrns: OFXTransaction[],
  sysDates: Set<string>,
  tol = 0,
  groupMaxN = 0,
  groupWindow = 7,
): MatchResult {
  // Indexar OFX por valor assinado (2 casas) para lookup O(1)
  const pool = new Map<string, OFXTransaction[]>();
  for (const t of ofxTrns) {
    const k = t.amount.toFixed(2);
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k)!.push(t);
  }

  const used = new Set<string>();
  const pairs: MatchPair[] = [];
  const onlySys: SystemItem[] = [];

  for (const s of sysItems) {
    // R15 — candidatos com mesmo valor assinado, ainda não usados
    const cands = (pool.get(s.value.toFixed(2)) ?? []).filter(t => !used.has(t.id ?? t.fitid));

    let best: OFXTransaction | null = null;
    let bd = Infinity;

    for (const t of cands) {
      const dd = Math.abs(dayDiffISO(t.date, s.date));
      if (dd <= tol && dd < bd) {
        bd = dd;
        best = t;
        if (dd === 0) break; // data exata → não precisa continuar
      }
    }

    if (best) {
      // R16 — 1:1 estrito: marcar como usado
      used.add(best.id ?? best.fitid);
      pairs.push({ sys: s, ofx: best, dd: bd });
    } else {
      onlySys.push(s);
    }
  }

  // R17 — "Só no banco": apenas dias cobertos pelo sistema, não usados no matching
  const onlyBank = ofxTrns.filter(t => sysDates.has(t.date) && !used.has(t.id ?? t.fitid));

  const result: MatchResult = { pairs, groups: [], onlySys, onlyBank };

  if (groupMaxN >= 2) {
    return groupEngine(result, groupMaxN, groupWindow);
  }

  return result;
}
