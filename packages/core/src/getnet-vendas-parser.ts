/**
 * Parser da planilha Getnet "Vendas_Detalhado_*.xlsx".
 * Suporta sheets CARTÕES e VOUCHER (layouts distintos).
 * Entrada: rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''})
 *
 * R10 — Mapeamento por NOME de coluna, nunca por posição.
 */

type RawCell = string | number | boolean | Date | null | undefined;

// ── Helpers ───────────────────────────────────────────────────────

function str(v: RawCell): string {
  return String(v ?? '').trim();
}

function norm(v: RawCell): string {
  return str(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** "R$ 8,14" / "-R$ 0,11" / 8.14 / -0.11 → número */
function parseBRL(v: RawCell): number {
  // SheetJS retorna células numéricas já como float JS — não converter para string
  if (typeof v === 'number') return v;
  const s = str(v);
  if (!s || s === '-') return 0;
  const neg = s.startsWith('-');
  const digits = s.replace(/[^\d,]/g, '').replace(',', '.');
  const n = parseFloat(digits);
  if (isNaN(n)) return 0;
  return neg ? -n : n;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Date | "05/06/2026" → "2026-06-05" */
function parseDateBR(v: RawCell): string | null {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${pad2(v.getMonth()+1)}-${pad2(v.getDate())}`;
  }
  const m = str(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Date | "05/06/2026 06:21" | "05/06/2026 06:21:30" → "2026-06-05T06:21:00" */
function parseDatetimeBR(v: RawCell): string | null {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${pad2(v.getMonth()+1)}-${pad2(v.getDate())}T${pad2(v.getHours())}:${pad2(v.getMinutes())}:00`;
  }
  const m = str(v).match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})(?::\d{2})?/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:00`;
}

function normalizaBandeira(raw: string): string {
  const s = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (s.includes('mastercard') || s === 'master')   return 'MASTER';
  if (s.includes('visa'))                            return 'VISA';
  if (s === 'elo')                                   return 'ELO';
  if (s.includes('amex') || s.includes('american')) return 'AMEX';
  if (s.includes('hipercard'))                       return 'HIPERCARD';
  if (s.includes('alelo'))                           return 'ALELO';
  if (s.includes('sodexo'))                          return 'SODEXO';
  if (s.includes('ticket'))                          return 'TICKET';
  if (s === 'ben' || s.includes('ben visa'))         return 'BEN';
  if (s.includes('vr') || s.includes('vale refeic')) return 'VR';
  if (s.includes('cabal'))                           return 'CABAL';
  return 'OUTROS';
}

function normalizaModalidade(raw: string): string {
  const s = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (s.includes('debito'))                                        return 'DEBITO';
  if (s.includes('credito'))                                       return 'CREDITO';
  if (s.includes('voucher') || s.includes('alimenta') ||
      s.includes('refei') || s.includes('combustiv'))              return 'VOUCHER';
  if (s.includes('pix'))                                           return 'PIX';
  return 'CREDITO';
}

function normalizaStatus(raw: string): string {
  const s = norm(raw);
  if (s.includes('aprovad'))   return 'APROVADA';
  if (s.includes('cancelad'))  return 'CANCELADA';
  if (s.includes('chargeback')) return 'CHARGEBACK';
  return raw.toUpperCase() || 'APROVADA';
}

function normalizaCaptura(raw: string): string {
  const s = raw.toLowerCase();
  if (s === 'tef')                          return 'TEF';
  if (s === 'pos')                          return 'POS';
  if (s.includes('ecommerce') ||
      s.includes('e-commerce'))             return 'ECOMMERCE';
  if (s.includes('digitado'))               return 'DIGITADO';
  return raw.toUpperCase() || 'OUTROS';
}

// ── Tipos públicos ────────────────────────────────────────────────

export interface GetnetVenda {
  idempotencyKey:  string;
  gateway:         string;
  ec:              string;
  cnpj:            string;
  bandeira:        string;
  bandeiraBruta:   string;
  modalidade:      string;
  formaPagamento:  string;
  dataHoraVenda:   string;          // ISO datetime
  status:          string;
  parcelas:        number;
  dataPrimeiroPgto: string | null;  // ISO date
  cartaoMascarado: string;
  autorizacao:     string;
  nsu:             string;
  terminal:        string;
  meioCaptura:     string;
  valorBruto:      number;
  valorTaxa:       number;          // negativo
  valorLiquido:    number;
}

export interface GetnetVendasResult {
  file:        string;
  gateway:     string;
  totalLinhas: number;
  vendas:      GetnetVenda[];
  ignoradas:   number;
}

// ── Mapa de colunas ───────────────────────────────────────────────

type ColMap = Partial<Record<
  | 'ec' | 'cnpj' | 'bandeira' | 'modalidade' | 'formaPagamento'
  | 'dataHoraVenda' | 'dataVenda' | 'status' | 'parcelas'
  | 'dataPrimeiroPgto' | 'cartao' | 'autorizacao' | 'nsu'
  | 'terminal' | 'meioCaptura' | 'valorBruto' | 'valorVenda'
  | 'valorTaxa' | 'valorLiquido',
  number
>>;

// ── Parser principal ──────────────────────────────────────────────

export function parseGetnetVendasRows(
  rows: RawCell[][],
  gateway = 'GETNET',
  fname = '',
): GetnetVendasResult {
  let hi = -1;
  const col: ColMap = {};

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i]!;
    const hasFn = (kw: string) => row.some(c => norm(c).includes(kw));

    // Header detectado por: presença de "cartao" E ("comprovante" OU "nsu")
    if (!hasFn('cartao'))                           continue;
    if (!hasFn('comprovante') && !hasFn('nsu'))     continue;

    hi = i;
    row.forEach((c, j) => {
      const s = norm(c);
      if (s === 'estabelecimento comercial')                        col.ec              = j;
      else if (s === 'cpf / cnpj' || s === 'cpf/cnpj')            col.cnpj            = j;
      else if (s === 'bandeira')                                    col.bandeira        = j;
      else if (s === 'modalidade')                                  col.modalidade      = j;
      else if (s === 'forma de pagamento')                          col.formaPagamento  = j;
      else if (s === 'data/hora da venda')                          col.dataHoraVenda   = j;
      else if (s === 'data da venda')                               col.dataVenda       = j;
      else if (s === 'status da transacao' || s === 'status')       col.status          = j;
      else if (s === 'parcelas')                                    col.parcelas        = j;
      else if (s.includes('data prevista') && s.includes('pagamento')) col.dataPrimeiroPgto = j;
      else if (s.includes('numero do cartao') || s.includes('num do cartao')) col.cartao = j;
      else if (
        // Exclui "DATA DA AUTORIZAÇÃO" (índice posterior que sobrescreveria o mapeamento correto)
        (s.includes('autorizacao') && !s.includes('data') && !s.includes('hora')) ||
        s === 'aut' || s === 'aut.' ||
        (s.includes('cod') && s.includes('aut') && !s.includes('data') && !s.includes('cartao')) ||
        (s.startsWith('aut') && s.length <= 10 && !s.includes('valor') && !s.includes('data'))
      )                                                              col.autorizacao     = j;
      else if (s.includes('comprovante') || s.includes('cv)') || s.includes('num. cv') || s === 'nsu') col.nsu = j;
      else if (s === 'meio de captura')                             col.meioCaptura     = j;
      else if (s === 'numero do terminal' || s === 'terminal')      col.terminal        = j;
      else if (s === 'valor bruto')                                 col.valorBruto      = j;
      else if (s === 'valor da venda')                              col.valorVenda      = j;
      else if (s === 'valor taxa')                                  col.valorTaxa       = j;
      else if (s === 'valor liquido' || s === 'valor liquido')      col.valorLiquido    = j;
    });
    break;
  }

  if (hi < 0) {
    throw new Error(
      `Layout de Vendas Getnet não reconhecido em "${fname}": ` +
      'cabeçalho com NÚMERO DO CARTÃO e COMPROVANTE DE VENDA não encontrado',
    );
  }

  const vendas: GetnetVenda[] = [];
  let ignoradas = 0;

  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i]!;

    const ec = str(row[col.ec ?? -1]);
    if (!ec || /[a-z]/i.test(ec) === false && isNaN(Number(ec.replace(/\D/g, '')))) {
      // Pula linhas de total/rodapé (ec vazio ou texto de resumo)
      if (!ec) continue;
    }
    // Ignora linhas onde ec não parece um número de estabelecimento
    if (ec && !/^\d+$/.test(ec.replace(/\D/g, ''))) { ignoradas++; continue; }

    const nsu = str(row[col.nsu ?? -1]);
    if (!nsu || nsu === '-') { ignoradas++; continue; }

    // Data/hora da venda
    let dt: string | null = null;
    if (col.dataHoraVenda != null) {
      dt = parseDatetimeBR(row[col.dataHoraVenda]);
    } else if (col.dataVenda != null) {
      const d = parseDateBR(row[col.dataVenda]);
      dt = d ? `${d}T00:00:00` : null;
    }
    if (!dt) { ignoradas++; continue; }

    const bandeiraBruta = str(row[col.bandeira ?? -1]);
    const modalidadeBruta = str(row[col.modalidade ?? -1]);
    const formaPagamento = col.formaPagamento != null ? str(row[col.formaPagamento]) : '';

    // Valor bruto: CARTÕES usa "VALOR BRUTO", VOUCHER usa "VALOR DA VENDA"
    const valorBruto  = col.valorBruto != null
      ? parseBRL(row[col.valorBruto])
      : col.valorVenda != null ? parseBRL(row[col.valorVenda]) : 0;
    const valorTaxa   = col.valorTaxa    != null ? parseBRL(row[col.valorTaxa])   : 0;
    const valorLiquido = col.valorLiquido != null
      ? parseBRL(row[col.valorLiquido])
      : valorBruto + valorTaxa; // taxa é negativa

    // Parcelas: "01", "1", "1 de 12" → pega o primeiro número
    const parcelasRaw = col.parcelas != null ? str(row[col.parcelas]) : '1';
    const parcelas    = parseInt(parcelasRaw.replace(/\D.*/, '')) || 1;

    const dpCell = col.dataPrimeiroPgto != null ? row[col.dataPrimeiroPgto] : null;

    vendas.push({
      idempotencyKey:  `${gateway}::${ec}::${nsu}`,
      gateway,
      ec,
      cnpj:            col.cnpj           != null ? str(row[col.cnpj])           : '',
      bandeira:        normalizaBandeira(bandeiraBruta),
      bandeiraBruta,
      modalidade:      normalizaModalidade(modalidadeBruta || formaPagamento),
      formaPagamento,
      dataHoraVenda:   dt,
      status:          normalizaStatus(col.status != null ? str(row[col.status]) : 'APROVADA'),
      parcelas,
      dataPrimeiroPgto: dpCell != null ? parseDateBR(dpCell) : null,
      cartaoMascarado: col.cartao         != null ? str(row[col.cartao])          : '',
      autorizacao:     col.autorizacao    != null ? str(row[col.autorizacao])     : '',
      nsu,
      terminal:        col.terminal       != null ? str(row[col.terminal])        : '',
      meioCaptura:     col.meioCaptura    != null ? normalizaCaptura(str(row[col.meioCaptura])) : '',
      valorBruto,
      valorTaxa,
      valorLiquido,
    });
  }

  return {
    file:        fname,
    gateway,
    totalLinhas: rows.length - hi - 1,
    vendas,
    ignoradas,
  };
}
