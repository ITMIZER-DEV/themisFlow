/**
 * Parser da planilha Getnet "Recebivel_Completos_*.xlsx" (sheet "Detalhado").
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

function parseBRL(v: RawCell): number | null {
  // SheetJS retorna células numéricas já como float JS — não converter para string
  if (typeof v === 'number') return v;
  const s = str(v);
  if (!s || s === '-') return null;
  const neg = s.startsWith('-');
  const digits = s.replace(/[^\d,]/g, '').replace(',', '.');
  const n = parseFloat(digits);
  if (isNaN(n)) return null;
  return neg ? -n : n;
}

function parseBRL0(v: RawCell): number {
  return parseBRL(v) ?? 0;
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

/**
 * "Elo Crédito" → { bandeira: 'ELO', modalidade: 'CREDITO', raw: 'Elo Crédito' }
 * A última palavra é a modalidade; o restante é a bandeira.
 */
function splitBandeiraModalidade(raw: string): {
  bandeira: string;
  modalidade: string;
} {
  const parts = raw.trim().split(/\s+/);
  if (parts.length < 2) {
    return { bandeira: normalizaBandeira(raw), modalidade: 'CREDITO' };
  }
  const modalidadePart = parts[parts.length - 1]!;
  const bandeiraPart   = parts.slice(0, -1).join(' ');
  return {
    bandeira:  normalizaBandeira(bandeiraPart),
    modalidade: normalizaModalidade(modalidadePart),
  };
}

function normalizaTipoLancamento(raw: string): string {
  const s = norm(raw);
  if (s.includes('saldo anterior'))     return 'SALDO_ANTERIOR';
  if (s.includes('pagamento realizado') ||
      s.includes('valor liquidado'))     return 'PAGAMENTO_REALIZADO';
  if (s.includes('chargeback'))          return 'CHARGEBACK';
  if (s.includes('cancelamento') ||
      s.includes('cancelado'))           return 'CANCELAMENTO';
  if (s.includes('ajuste'))             return 'AJUSTE';
  if (s.includes('venda') ||
      s.includes('vendas'))             return 'VENDA';
  return raw.toUpperCase().replace(/\s+/g, '_') || 'OUTRO';
}

// ── Tipos públicos ────────────────────────────────────────────────

export interface GetnetRecebivel {
  idempotencyKey:  string;
  gateway:         string;
  ec:              string;
  ecCentralizador: string;
  cnpj:            string;
  dataVencimento:  string;    // ISO date YYYY-MM-DD
  bandeira:        string;
  modalidade:      string;
  tipoLancamento:  string;
  lancamento:      string;
  valorLiquido:    number;
  valorLiquidado:  number;
  cartaoMascarado: string | null;
  autorizacao:     string | null;
  nsu:             string | null;
  terminal:        string | null;
  dataVenda:       string | null;   // ISO date
  horaVenda:       string | null;
  valorVenda:      number | null;   // VALOR DA VENDA (bruto)
  descontos:       number | null;   // DESCONTOS (negativo = taxa)
  parcelasInfo:    string | null;   // "1 de 1", "2 de 12"
}

export interface GetnetRecebiveisResult {
  file:        string;
  gateway:     string;
  totalLinhas: number;
  recebiveis:  GetnetRecebivel[];
  ignoradas:   number;
}

// ── Mapa de colunas ───────────────────────────────────────────────

type ColMap = Partial<Record<
  | 'ecCentral' | 'ec' | 'cnpj' | 'dataVenc' | 'bandeiraModal'
  | 'tipoLanc' | 'lancamento' | 'valorLiq' | 'valorLiquidado'
  | 'cartao' | 'autorizacao' | 'nsu' | 'terminal' | 'dataVenda' | 'horaVenda'
  | 'valorVenda' | 'parcelas' | 'valorParcela' | 'descontos' | 'valorLiqParcela',
  number
>>;

// ── Parser principal ──────────────────────────────────────────────

export function parseGetnetRecebiveisRows(
  rows: RawCell[][],
  gateway = 'GETNET',
  fname = '',
): GetnetRecebiveisResult {
  let hi = -1;
  const col: ColMap = {};

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i]!;
    const hasFn = (kw: string) => row.some(c => norm(c).includes(kw));

    // Header detectado por: "bandeira" E ("vencimento" OU "lancamento")
    if (!hasFn('bandeira'))                               continue;
    if (!hasFn('vencimento') && !hasFn('lancamento'))     continue;

    hi = i;
    row.forEach((c, j) => {
      const s = norm(c);
      if (s === 'ec centralizador')                         col.ecCentral    = j;
      else if (s === 'estabelecimento comercial')           col.ec           = j;
      else if (s === 'cpf / cnpj' || s === 'cpf/cnpj')    col.cnpj         = j;
      else if (s.includes('vencimento'))                    col.dataVenc     = j;
      else if (s.includes('bandeira') && s.includes('mod')) col.bandeiraModal = j;
      else if (s.includes('tipo') && s.includes('lanc'))   col.tipoLanc     = j;
      else if (s === 'lancamento' || s === 'lançamento')   col.lancamento   = j;
      else if (s === 'valor liquido' || s === 'valor líquido') col.valorLiq = j;
      else if (s.includes('liquidado') && !s.includes('contrat') &&
               !s.includes('parcela'))                     col.valorLiquidado = j;
      else if (s.includes('numero do cartao') ||
               s.includes('numero do cartão'))             col.cartao        = j;
      else if (s === 'autorizacao' || s === 'autorização') col.autorizacao  = j;
      else if (s.includes('comprovante') || s.includes('nsu)')) col.nsu     = j;
      else if (s.includes('terminal'))                     col.terminal     = j;
      else if (s === 'data da venda')                      col.dataVenda    = j;
      else if (s === 'hora da venda')                      col.horaVenda    = j;
      else if (s === 'valor da venda')                     col.valorVenda   = j;
      else if (s === 'parcelas')                           col.parcelas     = j;
      else if (s === 'valor da parcela')                   col.valorParcela = j;
      else if (s === 'descontos')                          col.descontos    = j;
      else if (s === 'valor liquido da parcela' ||
               s === 'valor líquido da parcela')           col.valorLiqParcela = j;
    });
    break;
  }

  if (hi < 0) {
    throw new Error(
      `Layout de Recebíveis Getnet não reconhecido em "${fname}": ` +
      'cabeçalho com BANDEIRA/MODALIDADE e DATA DE VENCIMENTO não encontrado',
    );
  }

  const recebiveis: GetnetRecebivel[] = [];
  let ignoradas = 0;

  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i]!;

    const ecCentral = str(row[col.ecCentral ?? -1]);
    const ec        = str(row[col.ec        ?? -1]);
    if (!ec) continue;  // linha vazia

    // Ignora totalizadores (EC não é número)
    if (!/^\d+$/.test(ec.replace(/\D/g, ''))) { ignoradas++; continue; }

    const dataVencimento = parseDateBR(row[col.dataVenc ?? -1]);
    if (!dataVencimento) { ignoradas++; continue; }

    const bandeiraModalRaw = str(row[col.bandeiraModal ?? -1]);
    const { bandeira, modalidade } = splitBandeiraModalidade(bandeiraModalRaw);

    const tipoLancRaw = str(row[col.tipoLanc   ?? -1]);
    const tipoLancamento = normalizaTipoLancamento(tipoLancRaw);

    const nsuRaw = col.nsu != null ? str(row[col.nsu]).replace(/\s+/g, '') : '';
    const nsu    = nsuRaw && nsuRaw !== '-' ? nsuRaw : null;

    // Constrói chave de idempotência:
    // Linhas de venda → gateway::ec::nsu::dataVenc
    // Linhas de pagamento/saldo → gateway::ec::tipo::dataVenc::bandeiraModal
    const idempotencyKey = nsu
      ? `${gateway}::${ec}::${nsu}::${dataVencimento}`
      : `${gateway}::${ec}::${tipoLancamento}::${dataVencimento}::${bandeiraModalRaw.replace(/\s+/g, '_')}`;

    const cartaoRaw = col.cartao != null ? str(row[col.cartao]) : '-';
    const autRaw    = col.autorizacao != null ? str(row[col.autorizacao]) : '-';
    const termRaw   = col.terminal != null ? str(row[col.terminal]) : '-';
    const dvRaw     = col.dataVenda != null ? row[col.dataVenda] : null;
    const hvRaw     = col.horaVenda != null ? str(row[col.horaVenda]) : '';
    const parcRaw   = col.parcelas  != null ? str(row[col.parcelas]) : null;

    recebiveis.push({
      idempotencyKey,
      gateway,
      ec,
      ecCentralizador: ecCentral || ec,
      cnpj:            col.cnpj        != null ? str(row[col.cnpj])              : '',
      dataVencimento,
      bandeira,
      modalidade,
      tipoLancamento,
      lancamento:      col.lancamento  != null ? str(row[col.lancamento])        : '',
      valorLiquido:    col.valorLiq    != null ? parseBRL0(row[col.valorLiq])    : 0,
      valorLiquidado:  col.valorLiquidado != null ? parseBRL0(row[col.valorLiquidado]) : 0,
      cartaoMascarado: cartaoRaw && cartaoRaw !== '-' ? cartaoRaw : null,
      autorizacao:     autRaw    && autRaw    !== '-' ? autRaw    : null,
      nsu,
      terminal:        termRaw   && termRaw   !== '-' ? termRaw   : null,
      dataVenda:       dvRaw != null ? parseDateBR(dvRaw) : null,
      horaVenda:       hvRaw && hvRaw !== '-' ? hvRaw : null,
      valorVenda:      col.valorVenda  != null ? parseBRL(row[col.valorVenda])   : null,
      descontos:       col.descontos   != null ? parseBRL(row[col.descontos])    : null,
      parcelasInfo:    parcRaw && parcRaw !== '-' ? parcRaw : null,
    });
  }

  return {
    file:        fname,
    gateway,
    totalLinhas: rows.length - hi - 1,
    recebiveis,
    ignoradas,
  };
}
