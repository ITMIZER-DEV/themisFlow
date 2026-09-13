/**
 * Motor de matching banco × sistema.
 * Regras validadas:
 *  - Casa por VALOR ASSINADO idêntico (crédito↔crédito, débito↔débito), preferindo data exata,
 *    depois a menor distância dentro da tolerância (dias).
 *  - 1:1 estrito — um lançamento do banco casa com no máximo um do sistema (sem dupla contagem).
 *  - "Só no banco" considera APENAS lançamentos OFX nos dias cobertos pelo arquivo do sistema
 *    (carregar XLS de um dia não pode marcar o mês inteiro como divergente).
 *  - Pagamento+estorno de mesmo valor no sistema: o estorno (crédito) só casa com crédito igual
 *    no banco; sem par, ambos caem em "só no sistema" — comportamento correto.
 */
export const dayDiffISO = (a, b) =>
  Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000);

/**
 * @param sysItems itens do sistema ({date, value, ...})
 * @param ofxTrns  transações OFX ({id, date, amount, ...})
 * @param sysDates Set<string> dias cobertos pelo arquivo do sistema
 * @param tol      tolerância em dias (0 = data exata)
 */
export function matchEngine(sysItems, ofxTrns, sysDates, tol = 0) {
  const pool = new Map();
  for (const t of ofxTrns) {
    const k = t.amount.toFixed(2);
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push(t);
  }
  const used = new Set(), pairs = [], onlySys = [];
  for (const s of sysItems) {
    const cands = (pool.get(s.value.toFixed(2)) || []).filter(t => !used.has(t.id));
    let best = null, bd = Infinity;
    for (const t of cands) {
      const dd = Math.abs(dayDiffISO(t.date, s.date));
      if (dd <= tol && dd < bd) { bd = dd; best = t; if (dd === 0) break; }
    }
    if (best) { used.add(best.id); pairs.push({ sys: s, ofx: best, dd: bd }); }
    else onlySys.push(s);
  }
  const onlyBank = ofxTrns.filter(t => sysDates.has(t.date) && !used.has(t.id));
  return { pairs, onlySys, onlyBank };
}
