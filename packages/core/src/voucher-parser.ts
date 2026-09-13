/**
 * Parsers de planilhas de Vouchers/Vales Benefícios (Alelo, Sodexo, Ticket, VR).
 * R10 — Mapeamento por NOME de coluna, nunca por posição.
 */
import { r2 } from './ofx-parser.js';

type RawCell = string | number | boolean | Date | null | undefined;

function str(v: RawCell): string {
  return String(v ?? '').trim();
}

function norm(v: RawCell): string {
  return str(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function parseBRL(v: RawCell): number {
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

function parseDatetimeBR(v: RawCell): string | null {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${pad2(v.getMonth()+1)}-${pad2(v.getDate())}T${pad2(v.getHours())}:${pad2(v.getMinutes())}:00`;
  }
  const s = str(v);
  // DD/MM/AAAA HH:MM
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})(?::\d{2})?/);
  if (m) {
    return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:00`;
  }
  // DD/MM/AAAA
  const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m2) {
    return `${m2[3]}-${m2[2]}-${m2[1]}T12:00:00`;
  }
  return null;
}

export interface VoucherVenda {
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

export interface VoucherResult {
  file:        string;
  gateway:     string;
  totalLinhas: number;
  vendas:      VoucherVenda[];
  ignoradas:   number;
}

type ColMap = Partial<Record<
  | 'ec' | 'cnpj' | 'dataVenda' | 'status' | 'nsu'
  | 'autorizacao' | 'valorBruto' | 'valorTaxa' | 'valorLiquido',
  number
>>;

function parseVoucherRows(
  rows: RawCell[][],
  gateway: string,
  fname: string,
  keywords: {
    ec: string[];
    cnpj: string[];
    dataVenda: string[];
    status: string[];
    nsu: string[];
    autorizacao: string[];
    valorBruto: string[];
    valorTaxa: string[];
    valorLiquido: string[];
  }
): VoucherResult {
  let hi = -1;
  const col: ColMap = {};

  // Scan top rows for CNPJ if not found as a column
  let headerCnpj = '';
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i]!;
    for (let j = 0; j < row.length; j++) {
      const cellStr = str(row[j]);
      if (cellStr.toLowerCase().includes('cnpj')) {
        if (cellStr.includes(':')) {
          headerCnpj = cellStr.split(':')[1]!.trim().replace(/[^\d]/g, '');
        } else if (j + 1 < row.length) {
          headerCnpj = str(row[j + 1]).replace(/[^\d]/g, '');
        }
        break;
      }
    }
    if (headerCnpj) break;
  }

  // Procurar o cabeçalho
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i]!;
    const normRow = row.map(c => norm(c));

    const matchesWord = (kws: string[]) => kws.some(kw => normRow.some(c => c.includes(kw)));

    // Cabeçalho encontrado se achar valor e nsu/data
    if (matchesWord(keywords.valorBruto) && (matchesWord(keywords.nsu) || matchesWord(keywords.dataVenda))) {
      hi = i;
      row.forEach((c, j) => {
        const s = norm(c);
        const findMatch = (kws: string[]) => kws.some(kw => s.includes(kw));

        if      (findMatch(keywords.ec))           col.ec = j;
        else if (findMatch(keywords.cnpj))         col.cnpj = j;
        else if (findMatch(keywords.dataVenda) && !s.includes('pagamento') && !s.includes('processamento'))    col.dataVenda = j;
        else if (findMatch(keywords.status))      col.status = j;
        else if (findMatch(keywords.nsu))         col.nsu = j;
        else if (findMatch(keywords.autorizacao))  col.autorizacao = j;
        else if (findMatch(keywords.valorBruto))   col.valorBruto = j;
        else if (findMatch(keywords.valorTaxa))    col.valorTaxa = j;
        else if (findMatch(keywords.valorLiquido)) col.valorLiquido = j;
      });
      break;
    }
  }

  if (hi < 0 || col.valorBruto == null) {
    throw new Error(`Layout da planilha de ${gateway} não reconhecido.`);
  }

  const vendas: VoucherVenda[] = [];
  let ignoradas = 0;

  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.length === 0 || row[col.valorBruto!] === '' || row[col.valorBruto!] == null) {
      ignoradas++;
      continue;
    }

    const rawVal = row[col.valorBruto!];
    const bruto = parseBRL(rawVal);
    if (!bruto) {
      ignoradas++;
      continue;
    }

    let nsu = col.nsu != null ? str(row[col.nsu!]).replace(/[^\d]/g, '') : '';
    const aut = col.autorizacao != null ? str(row[col.autorizacao!]) : '';
    if (!nsu && aut) {
      nsu = aut.replace(/[^\d]/g, '');
    }

    const dateStr = col.dataVenda != null ? parseDatetimeBR(row[col.dataVenda!]) : null;
    const ec = col.ec != null ? str(row[col.ec!]) : (headerCnpj || 'GERAL');

    if (!nsu || !dateStr) {
      ignoradas++;
      continue;
    }

    const dt = dateStr.slice(0, 10);
    const idKey = `${gateway}::${ec}::${nsu}::${dt}`;

    const taxaRaw = col.valorTaxa != null ? parseBRL(row[col.valorTaxa!]) : 0;
    const valorTaxa = -Math.abs(taxaRaw);

    const liquidoRaw = col.valorLiquido != null ? parseBRL(row[col.valorLiquido!]) : (bruto + valorTaxa);
    const valorLiquido = r2(liquidoRaw);

    vendas.push({
      idempotencyKey: idKey,
      gateway,
      ec,
      cnpj: col.cnpj != null ? str(row[col.cnpj!]).replace(/[^\d]/g, '') : headerCnpj,
      bandeira: gateway,
      bandeiraBruta: gateway,
      modalidade: 'VOUCHER',
      formaPagamento: `${gateway} Voucher`,
      dataHoraVenda: dateStr,
      status: col.status != null ? str(row[col.status!]).toUpperCase() : 'APROVADA',
      parcelas: 1,
      dataPrimeiroPgto: null,
      cartaoMascarado: '',
      autorizacao: aut,
      nsu,
      terminal: '',
      meioCaptura: 'TEF',
      valorBruto: r2(bruto),
      valorTaxa: r2(valorTaxa),
      valorLiquido,
    });
  }

  return {
    file: fname,
    gateway,
    totalLinhas: rows.length,
    vendas,
    ignoradas,
  };
}

// ── Exportações dos Parsers Específicos ─────────────────────────────

export function parseAleloRows(rows: RawCell[][], fname = ''): VoucherResult {
  return parseVoucherRows(rows, 'ALELO', fname, {
    ec: ['estabelecimento', 'nro estab', 'ec'],
    cnpj: ['cnpj', 'cpf'],
    dataVenda: ['data', 'dt. venda', 'data da transacao'],
    status: ['status', 'situacao'],
    nsu: ['nsu', 'doc', 'documento', 'numero da transacao'],
    autorizacao: ['autorizacao', 'aut.'],
    valorBruto: ['valor bruto', 'valor da transacao', 'valor transacao', 'bruto'],
    valorTaxa: ['taxa', 'comissao', 'desconto', 'valor taxa'],
    valorLiquido: ['valor liquido', 'valor liquido estimado', 'liquido'],
  });
}

export function parseSodexoRows(rows: RawCell[][], fname = ''): VoucherResult {
  return parseVoucherRows(rows, 'SODEXO', fname, {
    ec: ['estabelecimento', 'numero do estabelecimento', 'ec'],
    cnpj: ['cnpj'],
    dataVenda: ['data', 'data da venda', 'data da transacao'],
    status: ['status', 'situacao'],
    nsu: ['nsu', 'documento', 'numero da transacao', 'seq'],
    autorizacao: ['autorizacao', 'aut.', 'numero da autorizacao', 'autorizacao'],
    valorBruto: ['valor', 'valor bruto', 'bruto', 'valor venda'],
    valorTaxa: ['taxa', 'comissao', 'valor taxa'],
    valorLiquido: ['valor liquido', 'liquido', 'receber'],
  });
}

export function parseTicketRows(rows: RawCell[][], fname = ''): VoucherResult {
  return parseVoucherRows(rows, 'TICKET', fname, {
    ec: ['estabelecimento', 'codigo', 'loja'],
    cnpj: ['cnpj'],
    dataVenda: ['data', 'data venda', 'data/hora'],
    status: ['status'],
    nsu: ['nsu', 'comprovante', 'doc'],
    autorizacao: ['autorizacao', 'aut'],
    valorBruto: ['valor', 'bruto', 'valor transacao'],
    valorTaxa: ['taxa', 'comissao', 'desconto'],
    valorLiquido: ['liquido', 'valor liquido'],
  });
}

export function parseVrBeneficiosRows(rows: RawCell[][], fname = ''): VoucherResult {
  return parseVoucherRows(rows, 'VR', fname, {
    ec: ['estabelecimento', 'ec', 'loja'],
    cnpj: ['cnpj'],
    dataVenda: ['data', 'data transacao', 'data/hora'],
    status: ['status'],
    nsu: ['nsu', 'comprovante', 'numero'],
    autorizacao: ['autorizacao', 'aut'],
    valorBruto: ['valor bruto', 'valor transacao', 'bruto'],
    valorTaxa: ['taxa', 'comissao', 'valor taxa'],
    valorLiquido: ['valor liquido', 'liquido', 'receber'],
  });
}

export function parseSodexoRecebiveisRows(rows: RawCell[][], fname = ''): any {
  let hi = -1;
  const col: any = {};

  // Scan top rows for CNPJ if not found as a column
  let headerCnpj = '';
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i]!;
    for (let j = 0; j < row.length; j++) {
      const cellStr = str(row[j]);
      if (cellStr.toLowerCase().includes('cnpj')) {
        if (cellStr.includes(':')) {
          headerCnpj = cellStr.split(':')[1]!.trim().replace(/[^\d]/g, '');
        } else if (j + 1 < row.length) {
          headerCnpj = str(row[j + 1]).replace(/[^\d]/g, '');
        }
        break;
      }
    }
    if (headerCnpj) break;
  }

  // Cabeçalho dos recebíveis/pagamentos
  for (let i = 0; i < Math.min(rows.length, 35); i++) {
    const row = rows[i]!;
    const normRow = row.map(c => norm(c));

    const matchesWord = (kws: string[]) => kws.some(kw => normRow.some(c => c.includes(kw)));

    if (matchesWord(['autorizacao']) && matchesWord(['pagamento']) && matchesWord(['bruto'])) {
      hi = i;
      row.forEach((c, j) => {
        const s = norm(c);
        if      (s.includes('cnpj'))                                             col.cnpj = j;
        else if (s.includes('estabelecimento'))                                  col.ec = j;
        else if (s === 'data do pagamento' || s === 'data pagamento')            col.dataVenc = j;
        else if (s === 'data da transacao' || s === 'data transacao')            col.dataVenda = j;
        else if (s === 'data do processamento')                                  col.dataProcessamento = j;
        else if (s.includes('status') || s.includes('situacao'))                 col.status = j;
        else if (s.includes('autorizacao') || s === 'aut')                       col.autorizacao = j;
        else if (s.includes('nsu') || s.includes('documento'))                  col.nsu = j;
        else if (s.includes('cartao'))                                           col.cartao = j;
        else if (s.includes('bruto'))                                            col.valorBruto = j;
        else if (s.includes('taxa') || s.includes('comissao') || s.includes('desconto')) col.valorTaxa = j;
        else if (s.includes('liquido'))                                          col.valorLiquido = j;
        else if (s.includes('origem'))                                           col.origem = j;
      });
      break;
    }
  }

  if (hi < 0) {
    throw new Error('Layout de pagamentos Sodexo/Pluxee não reconhecido.');
  }

  const recebiveis: any[] = [];
  let ignoradas = 0;

  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.length === 0) {
      ignoradas++;
      continue;
    }

    const rawVal = col.valorBruto != null ? row[col.valorBruto] : null;
    const bruto = parseBRL(rawVal);
    if (!bruto) {
      ignoradas++;
      continue;
    }

    const dataVencimento = col.dataVenc != null ? parseDateBR(row[col.dataVenc]) : null;
    if (!dataVencimento) {
      ignoradas++;
      continue;
    }

    const aut = col.autorizacao != null ? str(row[col.autorizacao]) : '';
    let nsu = col.nsu != null ? str(row[col.nsu]).replace(/[^\d]/g, '') : '';
    if (!nsu && aut) {
      nsu = aut.replace(/[^\d]/g, '');
    }

    if (!nsu) {
      ignoradas++;
      continue;
    }

    const cnpj = col.cnpj != null ? str(row[col.cnpj]).replace(/[^\d]/g, '') : headerCnpj;
    const ec = col.ec != null ? str(row[col.ec]) : (cnpj || 'GERAL');

    const dtVendaRaw = col.dataVenda != null ? row[col.dataVenda] : null;
    const dataVenda = dtVendaRaw ? parseDateBR(dtVendaRaw) : null;

    const taxaRaw = col.valorTaxa != null ? parseBRL(row[col.valorTaxa]) : 0;
    const descontos = -Math.abs(taxaRaw);

    const valorLiquido = col.valorLiquido != null ? (parseBRL(row[col.valorLiquido]) ?? r2(bruto + descontos)) : r2(bruto + descontos);

    // Mapeia Pluxee Alimentação / Pluxee Refeição com base na origem ou no produto do cabeçalho
    const modalidade = 'VOUCHER';
    const bandeira = 'SODEXO';

    const idempotencyKey = `SODEXO::${ec}::${nsu}::${dataVencimento}`;

    recebiveis.push({
      idempotencyKey,
      gateway: 'SODEXO',
      ec,
      ecCentralizador: ec,
      cnpj,
      dataVencimento,
      bandeira,
      modalidade,
      tipoLancamento: 'PAGAMENTO_REALIZADO',
      lancamento: 'COMPRAS',
      valorLiquido,
      valorLiquidado: col.status != null && str(row[col.status]).toLowerCase().includes('pago') ? valorLiquido : 0,
      cartaoMascarado: col.cartao != null ? str(row[col.cartao]) : null,
      autorizacao: aut || null,
      nsu,
      terminal: null,
      dataVenda,
      horaVenda: null,
      valorVenda: r2(bruto),
      descontos: r2(descontos),
      parcelasInfo: '1 de 1',
    });
  }

  // Date parsing helper local
  function parseDateBR(v: RawCell): string | null {
    if (v instanceof Date) {
      return `${v.getFullYear()}-${pad2(v.getMonth()+1)}-${pad2(v.getDate())}`;
    }
    const m = str(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    return `${m[3]}-${m[2]}-${m[1]}`;
  }

  return {
    file: fname,
    gateway: 'SODEXO',
    totalLinhas: rows.length,
    recebiveis,
    ignoradas,
  };
}
