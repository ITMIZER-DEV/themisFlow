/**
 * Parser OFX tolerante — validado contra bancos BR (Itaú, BB, Bradesco, Santander, Sicoob, Sicredi).
 * Suporta OFX 1.x (SGML sem tags de fechamento) e 2.x (XML).
 * NÃO reescrever do zero: cada regra aqui veio de um caso real.
 *
 * R1 — Encoding: bancos BR exportam cp1252/latin1 declarando USASCII/CHARSET:1252.
 * R2 — SGML sem fechamento: parser tokenizador tolerante, nunca XML estrito.
 * R3 — Valores: aceitar 1500.25, 1500,25, 1.234,56 e 1,234.56. Arredondar a 2 casas (r2) em TODA aritmética.
 * R4 — Datas: usar só os 8 primeiros dígitos numéricos → YYYY-MM-DD.
 * R5 — Dedup: identidade = FITID; fallback composto date|amount|memo|name|check.
 * R6 — Sinal: crédito positivo, débito negativo, em todo o domínio.
 */

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface OFXTransaction {
  /** Identificador único do lançamento (FITID ou fallback composto) */
  id?: string;
  type: string;
  date: string;        // ISO YYYY-MM-DD
  amount: number;      // crédito +, débito −
  fitid: string;
  memo: string;
  name: string;
  check: string;
  /** Saldo corrente após este lançamento (preenchido pelo balance-engine) */
  run?: number;
}

export interface OFXStatement {
  trns: OFXTransaction[];
  ledger: number | null;
  ledgerDt: string;    // ISO YYYY-MM-DD ou ''
  bankId: string;
  branch: string;
  acctId: string;
  acctType: string;
  currency: string;
  dtStart: string;
  dtEnd: string;
  file: string;
  type: 'BANK' | 'CC';
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

/** Arredondamento a 2 casas decimais — usar em TODA aritmética monetária (R3). */
export const r2 = (v: number): number => Math.round(v * 100) / 100;

/** R1 — Decode cp1252 quando o banco declara USASCII/1252 mas envia latin1. */
export function decodeBuffer(buf: Uint8Array | ArrayBuffer): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let txt = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const head = txt.slice(0, 600).toUpperCase();
  const declared1252 =
    /CHARSET\s*[:=]\s*"?1252|ENCODING\s*[:=]\s*"?USASCII|ISO-8859-1|WINDOWS-1252/.test(head);
  if (txt.includes('\uFFFD') || declared1252) {
    try {
      txt = new TextDecoder('windows-1252').decode(bytes);
    } catch {
      /* mantém utf-8 */
    }
  }
  return txt;
}

/** R4 — Usa só os 8 primeiros dígitos → ISO YYYY-MM-DD. */
export function parseDt(v: string): string {
  const d = (v || '').replace(/[^0-9]/g, '').slice(0, 8);
  if (d.length < 8) return '';
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** R3 — Aceita "1500.25", "1500,25", "1.234,56" e "1,234.56". */
export function parseAmt(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  let s = String(v).trim().replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : r2(n);
}

/** R5 — Identidade do lançamento para dedup entre arquivos sobrepostos. */
export const trnId = (t: Partial<OFXTransaction>): string =>
  t.fitid || `${t.date}|${t.amount}|${t.memo}|${t.name}|${t.check}`;

// ---------------------------------------------------------------------------
// Parser principal
// ---------------------------------------------------------------------------

/**
 * R2 — Parse OFX/SGML tolerante. Retorna lista de statements.
 * Cada statement: {trns[], ledger, ledgerDt, bankId, branch, acctId, acctType, currency, dtStart, dtEnd, type}
 * Cada trn: {type, date(ISO), amount(assinado: crédito +, débito −), fitid, memo, name, check}
 */
export function parseOFX(raw: string, fname = ''): OFXStatement[] {
  const body = raw.includes('<OFX>') ? raw.slice(raw.indexOf('<OFX>')) : raw;

  // Tokenizar: <TAG>valor ou </TAG>
  const tokens: Array<{ close: boolean; tag: string; val: string }> = [];
  const re = /<(\/?)([\w.]+)>([^<\r\n]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    tokens.push({ close: m[1] === '/', tag: (m[2] ?? '').toUpperCase(), val: (m[3] ?? '').trim() });
  }

  const results: OFXStatement[] = [];
  let cur: OFXStatement | null = null;
  let inTrn = false;
  let trn: OFXTransaction | null = null;
  let ledgerCtx = false;
  let availCtx = false;

  const flushTrn = () => {
    if (trn && trn.amount !== null && trn.date) cur!.trns.push(trn);
    trn = null;
    inTrn = false;
  };

  const openStmt = () => {
    cur = {
      trns: [], ledger: null, ledgerDt: '', bankId: '', branch: '',
      acctId: '', acctType: '', currency: 'BRL', dtStart: '', dtEnd: '',
      file: fname, type: 'BANK',
    };
    results.push(cur);
  };

  for (const t of tokens) {
    const { close, tag, val } = t;

    if (!close && (tag === 'STMTRS' || tag === 'CCSTMTRS')) {
      openStmt();
      cur!.type = tag === 'CCSTMTRS' ? 'CC' : 'BANK';
      continue;
    }

    if (
      !cur &&
      (tag === 'BANKTRANLIST' || tag === 'STMTTRN' ||
        tag === 'BANKACCTFROM' || tag === 'CCACCTFROM' || tag === 'LEDGERBAL')
    ) {
      openStmt();
    }
    if (!cur) continue;

    if (!close && tag === 'STMTTRN') {
      flushTrn();
      inTrn = true;
      trn = { type: '', date: '', amount: 0, fitid: '', memo: '', name: '', check: '' };
      continue;
    }
    if (close && tag === 'STMTTRN') { flushTrn(); continue; }

    if (!close && tag === 'LEDGERBAL') { ledgerCtx = true; availCtx = false; continue; }
    if (!close && tag === 'AVAILBAL')  { availCtx = true; ledgerCtx = false; continue; }
    if (close  && tag === 'LEDGERBAL') { ledgerCtx = false; continue; }
    if (close  && tag === 'AVAILBAL')  { availCtx = false; continue; }

    if (inTrn && trn) {
      switch (tag) {
        case 'TRNTYPE':  trn.type = val.toUpperCase(); break;
        case 'DTPOSTED': trn.date = parseDt(val); break;
        case 'TRNAMT':   { const a = parseAmt(val); if (a !== null) trn.amount = a; break; }
        case 'FITID':    trn.fitid = val; break;
        case 'CHECKNUM':
        case 'REFNUM':   if (!trn.check) trn.check = val; break;
        case 'MEMO':     trn.memo = val; break;
        case 'NAME':
        case 'PAYEE':    trn.name = val; break;
      }
      continue;
    }

    // Contexto de statement — cur é garantidamente não-null (ver continue acima).
    // Asserção necessária: TS 6.x perde narrowing de variáveis capturadas em closures.
    if (!cur) continue;
    const stmt = cur as OFXStatement;
    switch (tag) {
      case 'BANKID':   stmt.bankId = val; break;
      case 'BRANCHID': stmt.branch = val; break;
      case 'ACCTID':   stmt.acctId = val; break;
      case 'ACCTTYPE': stmt.acctType = val; break;
      case 'CURDEF':   if (val) stmt.currency = val.toUpperCase(); break;
      case 'DTSTART':  stmt.dtStart = parseDt(val); break;
      case 'DTEND':    stmt.dtEnd = parseDt(val); break;
      case 'BALAMT':   if (ledgerCtx) stmt.ledger = parseAmt(val); break;
      case 'DTASOF':   if (ledgerCtx) stmt.ledgerDt = parseDt(val); break;
    }

    void availCtx; // suprime warning de unused
  }

  flushTrn();
  return results.filter(r => r.trns.length > 0 || r.ledger !== null);
}
