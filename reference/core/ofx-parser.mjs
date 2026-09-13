/**
 * Parser OFX tolerante — validado contra bancos BR (Itaú, BB, Bradesco, Santander, Sicoob, Sicredi).
 * Suporta OFX 1.x (SGML sem tags de fechamento) e 2.x (XML).
 * NÃO reescrever do zero: cada regra aqui veio de um caso real.
 */
export const r2 = v => Math.round(v * 100) / 100;

/** Bancos BR exportam OFX em cp1252/latin1 mesmo declarando USASCII. */
export function decodeBuffer(buf) {
  let txt = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  const head = txt.slice(0, 600).toUpperCase();
  const declared1252 = /CHARSET\s*[:=]\s*"?1252|ENCODING\s*[:=]\s*"?USASCII|ISO-8859-1|WINDOWS-1252/.test(head);
  if (txt.includes('\uFFFD') || declared1252) {
    try { txt = new TextDecoder('windows-1252').decode(buf); } catch (e) { /* mantém utf-8 */ }
  }
  return txt;
}

export function parseDt(v) {
  const d = (v || '').replace(/[^0-9]/g, '').slice(0, 8);
  if (d.length < 8) return '';
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** Aceita "1500.25", "1500,25" e "1.234,56" (e o inverso US "1,234.56"). */
export function parseAmt(v) {
  if (v == null) return null;
  let s = String(v).trim().replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : r2(n);
}

/**
 * @returns lista de statements: {trns[], ledger, ledgerDt, bankId, branch, acctId, acctType, currency, dtStart, dtEnd, type}
 * trn: {type, date(ISO), amount(assinado: crédito +, débito −), fitid, memo, name, check}
 */
export function parseOFX(raw, fname = '') {
  const body = raw.includes('<OFX>') ? raw.slice(raw.indexOf('<OFX>')) : raw;
  const tokens = [];
  const re = /<(\/?)([A-Za-z0-9_.]+)>([^<\r\n]*)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    tokens.push({ close: m[1] === '/', tag: m[2].toUpperCase(), val: m[3].trim() });
  }
  const results = [];
  let cur = null, inTrn = false, trn = null, ledgerCtx = false, availCtx = false;
  const flushTrn = () => { if (trn && trn.amount !== null && trn.date) cur.trns.push(trn); trn = null; inTrn = false; };
  const openStmt = () => {
    cur = { trns: [], ledger: null, ledgerDt: '', bankId: '', branch: '', acctId: '', acctType: '', currency: 'BRL', dtStart: '', dtEnd: '', file: fname, type: 'BANK' };
    results.push(cur);
  };
  for (const t of tokens) {
    const { close, tag, val } = t;
    if (!close && (tag === 'STMTRS' || tag === 'CCSTMTRS')) { openStmt(); cur.type = tag === 'CCSTMTRS' ? 'CC' : 'BANK'; continue; }
    if (!cur && (tag === 'BANKTRANLIST' || tag === 'STMTTRN' || tag === 'BANKACCTFROM' || tag === 'CCACCTFROM' || tag === 'LEDGERBAL')) openStmt();
    if (!cur) continue;
    if (!close && tag === 'STMTTRN') { flushTrn(); inTrn = true; trn = { type: '', date: '', amount: null, fitid: '', memo: '', name: '', check: '' }; continue; }
    if (close && tag === 'STMTTRN') { flushTrn(); continue; }
    if (!close && tag === 'LEDGERBAL') { ledgerCtx = true; availCtx = false; continue; }
    if (!close && tag === 'AVAILBAL') { availCtx = true; ledgerCtx = false; continue; }
    if (close && tag === 'LEDGERBAL') { ledgerCtx = false; continue; }
    if (close && tag === 'AVAILBAL') { availCtx = false; continue; }
    if (inTrn && trn) {
      switch (tag) {
        case 'TRNTYPE': trn.type = val.toUpperCase(); break;
        case 'DTPOSTED': trn.date = parseDt(val); break;
        case 'TRNAMT': trn.amount = parseAmt(val); break;
        case 'FITID': trn.fitid = val; break;
        case 'CHECKNUM': case 'REFNUM': if (!trn.check) trn.check = val; break;
        case 'MEMO': trn.memo = val; break;
        case 'NAME': case 'PAYEE': trn.name = val; break;
      }
      continue;
    }
    switch (tag) {
      case 'BANKID': cur.bankId = val; break;
      case 'BRANCHID': cur.branch = val; break;
      case 'ACCTID': cur.acctId = val; break;
      case 'ACCTTYPE': cur.acctType = val; break;
      case 'CURDEF': if (val) cur.currency = val.toUpperCase(); break;
      case 'DTSTART': cur.dtStart = parseDt(val); break;
      case 'DTEND': cur.dtEnd = parseDt(val); break;
      case 'BALAMT': if (ledgerCtx) cur.ledger = parseAmt(val); break;
      case 'DTASOF': if (ledgerCtx) cur.ledgerDt = parseDt(val); break;
    }
  }
  flushTrn();
  return results.filter(r => r.trns.length || r.ledger !== null);
}

/** Identidade do lançamento p/ dedup entre arquivos sobrepostos. */
export const trnId = t => t.fitid || `${t.date}|${t.amount}|${t.memo}|${t.name}|${t.check}`;
