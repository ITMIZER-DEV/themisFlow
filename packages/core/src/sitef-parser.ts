/**
 * Parser do relatório SITEF "TRANSACOES_SITEF_*.xlsx".
 * Entrada: rows = matriz de células (XLSX.utils.sheet_to_json(ws, {header:1, defval:''})).
 *
 * R10 — Mapeamento por NOME de coluna, nunca por posição.
 * R22 — Chave de idempotência: nsu + pdv + codigoLoja + rede + dataDia
 * R23 — Apenas "Efetuada PDV" é considerada efetivada; demais: CANCELADA, NEGADA, DESFAZIMENTO.
 * R24 — Valor BR "1.234,56" → number via parseAmt.
 */
import { r2, parseAmt } from './ofx-parser.js';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type SitefEstado =
  | 'EFETIVADA'
  | 'CANCELADA'
  | 'NEGADA'
  | 'DESFAZIMENTO'
  | 'OUTRO';

export type SitefTipoProduto =
  | 'DEBITO'
  | 'CREDITO'
  | 'PIX'
  | 'VOUCHER'
  | 'CARTEIRA_DIGITAL'
  | 'NAO_INFORMADO';

export interface SitefTransacao {
  /** Chave de idempotência composta */
  idempotencyKey: string;
  dataTrans:         string;   // ISO datetime YYYY-MM-DDTHH:MM:SS
  dataDia:           string;   // ISO date YYYY-MM-DD (da coluna "Data")
  dataFiscal:        string;   // ISO date YYYY-MM-DD (da coluna "Data Fiscal sem hora" ou "Data Fiscal")
  codigoLoja:        string;
  cartao:            string;   // mascarado ex. "498407******2795"
  pdv:               string;
  nsu:               string;
  nsuHost:           string;
  valor:             number;
  valorSaque:        number;
  rede:              string;   // "GetNetLac", "CardSE", etc.
  tipoProduto:       SitefTipoProduto;
  tipoProdutoRaw:    string;
  autorizacao:       string;
  estabelecimento:   string;
  modoEntrada:       string;
  produto:           string;   // bandeira: "Visa", "Mastercard", "ELO Debito", etc.
  descricaoTransacao: string;
  nrParcelas:        number;
  estadoTransacao:   SitefEstado;
  estadoTransacaoRaw: string;
  operador:          string;
  terminalLogico:    string;
  codSitef:          string;
  cupomFiscal:       string;
}

export interface SitefResult {
  file:          string;
  geradoEm:      string;   // "Gerado às HH:MM do dia DD/MM/YYYY" raw
  totalLinhas:   number;   // total de linhas de dados na planilha
  transacoes:    SitefTransacao[];   // apenas Efetuada PDV
  todas:         SitefTransacao[];   // todos os estados (para auditoria)
}

// ---------------------------------------------------------------------------
// Mapa de colunas
// ---------------------------------------------------------------------------

type ColMap = {
  data?:               number;
  codigoLoja?:         number;
  cartao?:             number;
  pdv?:                number;
  nsu?:                number;
  nsuHost?:            number;
  valor?:              number;
  valorSaque?:         number;
  rede?:               number;
  tipoProduto?:        number;
  autorizacao?:        number;
  estabelecimento?:    number;
  modoEntrada?:        number;
  dataFiscal?:         number;
  produto?:            number;
  descricaoTransacao?: number;
  nrParcelas?:         number;
  estadoTransacao?:    number;
  cupomFiscal?:        number;
  terminalLogico?:     number;
  operador?:           number;
  codSitef?:           number;
  dataFiscalSemHora?:  number;
};

type RawCell = string | number | boolean | null | undefined;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: RawCell): string {
  return String(v ?? '').trim();
}

function num(v: RawCell): number {
  if (v === '' || v == null) return 0;
  if (typeof v === 'number') return r2(v);
  const n = parseAmt(String(v));
  return n == null ? 0 : n;
}

/** "01/05/2026 08:03:20" → "2026-05-01T08:03:20" */
function parseDatetimeBR(s: string): string {
  // Aceita "DD/MM/YYYY HH:MM:SS" ou "DD/MM/YYYY"
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?/);
  if (!m) return s;
  const date = `${m[3]}-${m[2]}-${m[1]}`;
  return m[4] ? `${date}T${m[4]}` : date;
}

/** Extrai parte de data "YYYY-MM-DD" de datetime ISO ou data ISO */
function datePart(iso: string): string {
  return iso.slice(0, 10);
}

/** Normaliza "Tipo Produto" da planilha para o enum */
function normalizaTipoProduto(raw: string): SitefTipoProduto {
  const s = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (s.includes('debito') || s.includes('débito')) return 'DEBITO';
  if (s.includes('credito') || s.includes('crédito')) return 'CREDITO';
  if (s.includes('pix'))                               return 'PIX';
  if (s.includes('voucher'))                           return 'VOUCHER';
  if (s.includes('carteira'))                          return 'CARTEIRA_DIGITAL';
  return 'NAO_INFORMADO';
}

/** Normaliza "Estado Transação" para o enum */
function normalizaEstado(raw: string): SitefEstado {
  const s = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (s.includes('efetuada'))    return 'EFETIVADA';
  if (s.includes('cancelada'))   return 'CANCELADA';
  if (s.includes('desfazimento')) return 'DESFAZIMENTO';
  if (s.includes('negada'))      return 'NEGADA';
  return 'OUTRO';
}

// ---------------------------------------------------------------------------
// parseSitefRows — função principal
// ---------------------------------------------------------------------------

export function parseSitefRows(rows: RawCell[][], fname = ''): SitefResult {
  // R10 — Localizar linha de cabeçalho pela presença de "Data" e "NSU" na mesma linha
  let hi = -1;
  const col: ColMap = {};
  let geradoEm = '';

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i]!;
    const low = row.map(c => String(c ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));

    // Captura a linha "Gerado às HH:MM do dia DD/MM/YYYY"
    if (low[0]?.startsWith('gerado')) {
      geradoEm = str(row[0]);
      continue;
    }

    // Detecta linha de cabeçalho: contém "data" e "nsu"
    const hasData = low.findIndex(c => c === 'data') >= 0;
    const hasNsu  = low.findIndex(c => c === 'nsu')  >= 0;
    if (!hasData || !hasNsu) continue;

    hi = i;
    row.forEach((c, j) => {
      const s = String(c ?? '').trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');

      if      (s === 'data')                                       col.data               = j;
      else if (s === 'codigo loja' || s === 'codigo da loja')      col.codigoLoja         = j;
      else if (s === 'cartao' || s === 'cartão')                   col.cartao             = j;
      else if (s === 'pdv')                                        col.pdv                = j;
      else if (s === 'nsu' && col.nsu == null)                     col.nsu                = j;
      else if (s === 'nsu host')                                   col.nsuHost            = j;
      else if (s === 'valor' && col.valor == null)                 col.valor              = j;
      else if (s === 'valor saque')                                col.valorSaque         = j;
      else if (s === 'rede')                                       col.rede               = j;
      else if (s === 'tipo produto')                               col.tipoProduto        = j;
      else if (s === 'autorizacao' || s === 'autorização')         col.autorizacao        = j;
      else if (s === 'estabelecimento')                            col.estabelecimento    = j;
      else if (s === 'modo de entrada')                            col.modoEntrada        = j;
      else if (s === 'data fiscal' && col.dataFiscal == null)      col.dataFiscal         = j;
      else if (s === 'produto')                                    col.produto            = j;
      else if (s === 'descricao transacao' || s === 'descrição transação') col.descricaoTransacao = j;
      else if (s === 'nr. parcelas' || s === 'nr parcelas')        col.nrParcelas         = j;
      else if (s === 'estado transacao' || s === 'estado transação') col.estadoTransacao  = j;
      else if (s === 'cupom fiscal')                               col.cupomFiscal        = j;
      else if (s === 'terminal logico' || s === 'terminal lógico') col.terminalLogico     = j;
      else if (s === 'operador')                                   col.operador           = j;
      else if (s === 'cod. sitef' || s === 'cod sitef')            col.codSitef           = j;
      else if (s === 'data fiscal sem hora')                       col.dataFiscalSemHora  = j;
    });
    break;
  }

  if (hi < 0 || col.data == null || col.nsu == null) {
    throw new Error(
      'layout SITEF não reconhecido: cabeçalho com colunas "Data" e "NSU" não encontrado'
    );
  }

  const todas: SitefTransacao[] = [];

  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i]!;
    const dataRaw = str(row[col.data]);
    if (!dataRaw) continue;

    const dataTrans  = parseDatetimeBR(dataRaw);
    const dataDia    = datePart(dataTrans);

    // Data fiscal: preferir "Data Fiscal sem hora", fallback para "Data Fiscal"
    const dfRaw = col.dataFiscalSemHora != null
      ? str(row[col.dataFiscalSemHora])
      : col.dataFiscal != null ? str(row[col.dataFiscal]) : '';
    const dataFiscal = dfRaw ? datePart(parseDatetimeBR(dfRaw)) : dataDia;

    const codigoLoja = str(row[col.codigoLoja ?? -1]) || '?';
    const pdv        = str(row[col.pdv       ?? -1]);
    const nsu        = str(row[col.nsu]);
    const rede       = str(row[col.rede      ?? -1]);
    const estadoRaw  = str(row[col.estadoTransacao ?? -1]);

    const idempotencyKey = `${nsu}::${pdv}::${codigoLoja}::${rede}::${dataDia}`;

    const t: SitefTransacao = {
      idempotencyKey,
      dataTrans,
      dataDia,
      dataFiscal,
      codigoLoja,
      cartao:             str(row[col.cartao          ?? -1]),
      pdv,
      nsu,
      nsuHost:            str(row[col.nsuHost         ?? -1]),
      valor:              num(row[col.valor            ?? -1]),
      valorSaque:         num(row[col.valorSaque       ?? -1]),
      rede,
      tipoProduto:        normalizaTipoProduto(str(row[col.tipoProduto ?? -1])),
      tipoProdutoRaw:     str(row[col.tipoProduto      ?? -1]),
      autorizacao:        str(row[col.autorizacao      ?? -1]),
      estabelecimento:    str(row[col.estabelecimento  ?? -1]),
      modoEntrada:        str(row[col.modoEntrada      ?? -1]),
      produto:            str(row[col.produto          ?? -1]).trim(),
      descricaoTransacao: str(row[col.descricaoTransacao ?? -1]),
      nrParcelas:         Math.max(1, num(row[col.nrParcelas ?? -1])),
      estadoTransacao:    normalizaEstado(estadoRaw),
      estadoTransacaoRaw: estadoRaw,
      operador:           str(row[col.operador         ?? -1]),
      terminalLogico:     str(row[col.terminalLogico   ?? -1]),
      codSitef:           str(row[col.codSitef         ?? -1]),
      cupomFiscal:        str(row[col.cupomFiscal      ?? -1]),
    };

    todas.push(t);
  }

  if (!todas.length) {
    throw new Error('nenhuma transação encontrada no arquivo SITEF');
  }

  return {
    file: fname,
    geradoEm,
    totalLinhas: todas.length,
    transacoes: todas.filter(t => t.estadoTransacao === 'EFETIVADA'),
    todas,
  };
}
