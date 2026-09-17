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

function parseDateBR(v: RawCell): string | null {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${pad2(v.getMonth()+1)}-${pad2(v.getDate())}`;
  }
  const s = str(v);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) {
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  return null;
}

function parseHourBR(v: RawCell): string {
  if (v instanceof Date) {
    return `${pad2(v.getHours())}:${pad2(v.getMinutes())}:${pad2(v.getSeconds())}`;
  }
  const s = str(v);
  const mh = s.match(/^(\d{1,2})h(\d{2})(?:[m:]?(\d{2}))?/i);
  if (mh) {
    return `${pad2(Number(mh[1]))}:${mh[2]}:${mh[3] ? mh[3] : '00'}`;
  }
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return `${pad2(Number(m[1]))}:${m[2]}:${m[3] ? m[3] : '00'}`;
  }
  return '12:00:00';
}

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
  let hi = -1;
  const col: Record<string, number> = {};

  // Scan top rows for CNPJ
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

  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i]!;
    const normRow = row.map(c => norm(c));

    const hasData = normRow.some(c => c === 'data' || c.includes('data'));
    const hasValor = normRow.some(c => c === 'valor' || c.includes('valor'));
    const hasAutOrNsu = normRow.some(c => c.includes('autorizacao') || c.includes('nsu'));

    if (hasData && hasValor && hasAutOrNsu) {
      hi = i;
      row.forEach((c, j) => {
        const s = norm(c);
        if (s === 'cnpj') col.cnpj = j;
        else if (s === 'produto') col.produto = j;
        else if (s === 'data' || s === 'dt. venda' || s === 'data transacao') col.data = j;
        else if (s === 'hora' || s === 'horario') col.hora = j;
        else if (s === 'cartao' || s.includes('cartao')) col.cartao = j;
        else if (s.includes('autorizacao') || s === 'aut') col.autorizacao = j;
        else if (s === 'nsu' || s.includes('nsu')) col.nsu = j;
        else if (s === 'valor' || s === 'valor bruto' || s.includes('bruto')) col.valor = j;
        else if (s.includes('taxa') || s.includes('comissao')) col.taxa = j;
        else if (s.includes('liquido')) col.liquido = j;
        else if (s.includes('estabelecimento') || s === 'ec') col.ec = j;
      });
      break;
    }
  }

  if (hi < 0 || col.valor == null || col.data == null) {
    return parseVoucherRows(rows, 'VR', fname, {
      ec: ['estabelecimento', 'ec', 'loja'],
      cnpj: ['cnpj'],
      dataVenda: ['data', 'data transacao', 'data/hora'],
      status: ['status'],
      nsu: ['nsu', 'comprovante', 'numero'],
      autorizacao: ['autorizacao', 'aut', 'numero autorizacao'],
      valorBruto: ['valor', 'valor bruto', 'valor transacao', 'bruto'],
      valorTaxa: ['taxa', 'comissao', 'valor taxa'],
      valorLiquido: ['valor liquido', 'liquido', 'receber'],
    });
  }

  const vendas: VoucherVenda[] = [];
  let ignoradas = 0;

  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.length === 0 || row.every(c => c === '' || c == null)) {
      ignoradas++;
      continue;
    }

    if (row.some(c => str(c).toLowerCase().includes('total'))) {
      ignoradas++;
      continue;
    }

    const bruto = parseBRL(row[col.valor]);
    if (!bruto) {
      ignoradas++;
      continue;
    }

    const dataDia = parseDateBR(row[col.data]);
    if (!dataDia) {
      ignoradas++;
      continue;
    }

    const horaStr = col.hora != null ? parseHourBR(row[col.hora]) : '12:00:00';
    const dataHoraVenda = `${dataDia}T${horaStr}`;

    const aut = col.autorizacao != null ? str(row[col.autorizacao]).trim() : '';
    let nsu = col.nsu != null ? str(row[col.nsu]).trim() : '';
    if (!nsu && aut) {
      nsu = aut.replace(/[^\d]/g, '');
    }
    if (!nsu) {
      ignoradas++;
      continue;
    }

    const cnpj = col.cnpj != null ? str(row[col.cnpj]).replace(/[^\d]/g, '') : headerCnpj;
    const ec = col.ec != null ? str(row[col.ec]).trim() : (cnpj || 'GERAL');
    const produto = col.produto != null ? str(row[col.produto]).trim() : 'VR Benefícios';
    const cartao = col.cartao != null ? str(row[col.cartao]).trim() : '';

    const taxaRaw = col.taxa != null ? parseBRL(row[col.taxa]) : 0;
    const valorTaxa = -Math.abs(taxaRaw);
    const liquidoRaw = col.liquido != null ? parseBRL(row[col.liquido]) : (bruto + valorTaxa);
    const valorLiquido = r2(liquidoRaw);

    const idempotencyKey = `VR::${ec}::${nsu}::${dataDia}`;

    vendas.push({
      idempotencyKey,
      gateway: 'VR',
      ec,
      cnpj,
      bandeira: 'VR',
      bandeiraBruta: produto,
      modalidade: 'VOUCHER',
      formaPagamento: produto,
      dataHoraVenda,
      status: 'APROVADA',
      parcelas: 1,
      dataPrimeiroPgto: null,
      cartaoMascarado: cartao,
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
    gateway: 'VR',
    totalLinhas: rows.length,
    vendas,
    ignoradas,
  };
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

  return {
    file: fname,
    gateway: 'SODEXO',
    totalLinhas: rows.length,
    recebiveis,
    ignoradas,
  };
}

// ── Recebíveis / Guias de Reembolso VR ──────────────────────────────

export function parseVrRecebiveisRows(rows: RawCell[][], fname = ''): any {
  let hi = -1;
  const col: Record<string, number> = {};

  // Scan top rows for CNPJ
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

  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i]!;
    const normRow = row.map(c => norm(c));

    const hasGuia = normRow.some(c => c.includes('guia'));
    const hasBruto = normRow.some(c => c.includes('bruto'));
    const hasLiq = normRow.some(c => c.includes('liquido'));

    if (hasGuia && (hasBruto || hasLiq)) {
      hi = i;
      row.forEach((c, j) => {
        const s = norm(c);
        if (s.includes('guia')) col.numeroGuia = j;
        else if (s === 'produto') col.produto = j;
        else if (s.includes('contrato')) col.contrato = j;
        else if (s.includes('status') || s.includes('situacao')) col.status = j;
        else if (s.includes('corte')) col.dataCorte = j;
        else if (s.includes('pagamento') || s.includes('pgto')) col.dataPagamento = j;
        else if (s.includes('bruto')) col.valorBruto = j;
        else if (s.includes('liquido')) col.valorLiquido = j;
      });
      break;
    }
  }

  if (hi < 0 || col.valorBruto == null || col.numeroGuia == null) {
    throw new Error('Layout de Guias de Reembolso VR não reconhecido.');
  }

  const recebiveis: any[] = [];
  let ignoradas = 0;

  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.length === 0 || row.every(c => c === '' || c == null)) {
      ignoradas++;
      continue;
    }

    if (row.some(c => str(c).toLowerCase().includes('total'))) {
      ignoradas++;
      continue;
    }

    const bruto = col.valorBruto != null ? parseBRL(row[col.valorBruto]) : 0;
    const liquido = col.valorLiquido != null ? parseBRL(row[col.valorLiquido]) : bruto;

    if (!bruto && !liquido) {
      ignoradas++;
      continue;
    }

    const numeroGuia = str(row[col.numeroGuia]).trim().replace(/^0+/, '') || str(row[col.numeroGuia]).trim();
    if (!numeroGuia) {
      ignoradas++;
      continue;
    }

    const dataPagamento = col.dataPagamento != null ? parseDateBR(row[col.dataPagamento]) : null;
    if (!dataPagamento) {
      ignoradas++;
      continue;
    }

    const dataCorte = col.dataCorte != null ? parseDateBR(row[col.dataCorte]) : dataPagamento;
    const status = col.status != null ? str(row[col.status]).trim() : 'Em processamento';
    const isPago = status.toLowerCase().includes('pago');
    const produto = col.produto != null ? str(row[col.produto]).trim() : 'VR Benefícios';
    const ec = headerCnpj || 'GERAL';
    const descontos = r2(liquido - bruto);

    const idempotencyKey = `VR::${ec}::${numeroGuia}::${dataPagamento}`;

    recebiveis.push({
      idempotencyKey,
      gateway: 'VR',
      ec,
      ecCentralizador: ec,
      cnpj: headerCnpj,
      dataVencimento: dataPagamento,
      bandeira: 'VR',
      modalidade: 'VOUCHER',
      tipoLancamento: 'PAGAMENTO_REALIZADO',
      lancamento: produto,
      valorLiquido: r2(liquido),
      valorLiquidado: isPago ? r2(liquido) : 0,
      cartaoMascarado: null,
      autorizacao: numeroGuia,
      nsu: numeroGuia,
      terminal: null,
      dataVenda: dataCorte,
      horaVenda: null,
      valorVenda: r2(bruto),
      descontos,
      parcelasInfo: '1 de 1',
    });
  }

  return {
    file: fname,
    gateway: 'VR',
    totalLinhas: rows.length,
    recebiveis,
    ignoradas,
  };
}

// ── Parsers EDI / TXT Posicional (VR Benefícios) ────────────────────

export function parseVrVendasEdi(text: string, fname = ''): VoucherResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  let headerCnpj = '';

  for (const line of lines) {
    if (line.startsWith('1') && line.length >= 15) {
      headerCnpj = line.slice(1, 15).trim().replace(/[^\d]/g, '');
      break;
    }
  }

  const ec = headerCnpj || 'GERAL';
  const vendas: VoucherVenda[] = [];
  let ignoradas = 0;

  for (const line of lines) {
    if (!line.startsWith('2') || line.length < 67) {
      ignoradas++;
      continue;
    }

    const tipoProdCode = line.charAt(1);
    let produto = 'VR Benefícios';
    if (tipoProdCode === '0') produto = 'VR Refeição';
    else if (tipoProdCode === '1') produto = 'VR Alimentação';
    else if (tipoProdCode === '2') produto = 'VR Auto';
    else if (tipoProdCode === '3') produto = 'VR Cultura';

    const dtRaw = line.slice(2, 16);
    let dataHoraVenda = '';
    let dataDia = '';
    const mDt = dtRaw.match(/^(\d{2})(\d{2})(\d{4})(\d{2})(\d{2})(\d{2})/);
    if (mDt) {
      dataDia = `${mDt[3]}-${mDt[2]}-${mDt[1]}`;
      dataHoraVenda = `${dataDia}T${mDt[4]}:${mDt[5]}:${mDt[6]}`;
    } else {
      ignoradas++;
      continue;
    }

    const valRaw = line.slice(16, 28).trim();
    const isNeg = valRaw.startsWith('-');
    const digits = valRaw.replace(/[^\d]/g, '');
    const numVal = parseInt(digits, 10) / 100;
    if (isNaN(numVal) || numVal === 0) {
      ignoradas++;
      continue;
    }
    const valorBruto = r2(isNeg ? -numVal : numVal);

    const cartao = line.slice(28, 47).trim();
    const autRaw = line.slice(47, 67).trim();
    const aut = autRaw.replace(/^0+/, '') || autRaw;
    const nsu = aut;

    const idempotencyKey = `VR::${ec}::${nsu}::${dataDia}`;

    vendas.push({
      idempotencyKey,
      gateway: 'VR',
      ec,
      cnpj: headerCnpj,
      bandeira: 'VR',
      bandeiraBruta: produto,
      modalidade: 'VOUCHER',
      formaPagamento: produto,
      dataHoraVenda,
      status: isNeg ? 'CANCELADA' : 'APROVADA',
      parcelas: 1,
      dataPrimeiroPgto: null,
      cartaoMascarado: cartao,
      autorizacao: aut,
      nsu,
      terminal: '',
      meioCaptura: 'TEF',
      valorBruto,
      valorTaxa: 0,
      valorLiquido: valorBruto,
    });
  }

  return {
    file: fname,
    gateway: 'VR',
    totalLinhas: lines.length,
    vendas,
    ignoradas,
  };
}

export function parseVrReembolsosEdi(text: string, fname = ''): any {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  let headerCnpj = '';

  for (const line of lines) {
    if (line.startsWith('1')) {
      const digits = line.slice(1, 30).replace(/[^\d]/g, '');
      if (digits.length >= 14) {
        headerCnpj = digits.slice(0, 14);
        break;
      }
    }
  }

  const ec = headerCnpj || 'GERAL';
  const recebiveis: any[] = [];
  let ignoradas = 0;

  for (const line of lines) {
    // 1. Layout oficial (layout_reembolsos_vr.pdf) onde tipoRec = '1' posicional de 200 pos
    if (line.startsWith('1') && /^\d{1}/.test(line) && line.length >= 78 && !line.includes('R$') && !line.includes('/')) {
      const guia = line.slice(1, 9).trim().replace(/^0+/, '');
      const cnpj = line.slice(9, 23).trim();
      const corteRaw = line.slice(38, 46);
      const pgtoRaw = line.slice(46, 54);
      const brutoRaw = line.slice(54, 66);
      const liqRaw = line.slice(66, 78);

      const mCorte = corteRaw.match(/^(\d{2})(\d{2})(\d{4})$/);
      const mPgto = pgtoRaw.match(/^(\d{2})(\d{2})(\d{4})$/);
      const dataVenda = mCorte ? `${mCorte[3]}-${mCorte[2]}-${mCorte[1]}` : null;
      const dataVencimento = mPgto ? `${mPgto[3]}-${mPgto[2]}-${mPgto[1]}` : null;

      const valorBruto = r2(parseInt(brutoRaw.replace(/[^\d]/g, ''), 10) / 100);
      const valorLiquido = r2(parseInt(liqRaw.replace(/[^\d]/g, ''), 10) / 100);
      const descontos = r2(valorLiquido - valorBruto);

      if (guia && dataVencimento) {
        recebiveis.push({
          idempotencyKey: `VR::${ec}::${guia}::${dataVencimento}`,
          gateway: 'VR',
          ec,
          ecCentralizador: ec,
          cnpj: cnpj || headerCnpj,
          dataVencimento,
          bandeira: 'VR',
          modalidade: 'VOUCHER',
          tipoLancamento: 'PAGAMENTO_REALIZADO',
          lancamento: 'VR Reembolso',
          valorLiquido,
          valorLiquidado: valorLiquido,
          cartaoMascarado: null,
          autorizacao: guia,
          nsu: guia,
          terminal: null,
          dataVenda,
          horaVenda: null,
          valorVenda: valorBruto,
          descontos,
          parcelasInfo: '1 de 1',
        });
        continue;
      }
    }

    // 2. Formato de exportação do portal da VR (ex: extrato_reembolsos_vr_undefined_a_undefined.txt)
    if (line.startsWith('2')) {
      const m = line.match(/^2(\d{8,10})(.*?)(\d{12,15})(.*?)(\d{2}\/\d{2}\/\d{4})(\d{2}\/\d{2}\/\d{4})(.*?R\$\s*[\d,.]+)(.*?R\$\s*[\d,.]+)/);
      if (m) {
        const guia = (m[1] ?? '').trim().replace(/^0+/, '');
        const produto = (m[2] ?? '').trim() || 'VR Benefícios';
        const status = (m[4] ?? '').trim();
        const corteRaw = m[5] ?? '';
        const pgtoRaw = m[6] ?? '';

        const mCorte = corteRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        const mPgto = pgtoRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        const dataVenda = mCorte ? `${mCorte[3]}-${mCorte[2]}-${mCorte[1]}` : null;
        const dataVencimento = mPgto ? `${mPgto[3]}-${mPgto[2]}-${mPgto[1]}` : null;


        const re = /R\$\s*(\d+(?:[.,]\d{2}))/g;
        let mR: RegExpExecArray | null;
        const valMatches: number[] = [];
        while ((mR = re.exec(line)) !== null) {
          valMatches.push(parseFloat(mR[1]!.replace(',', '.')));
        }

        const valorBruto = valMatches.length >= 1 ? r2(valMatches[0]!) : 0;
        const valorLiquido = valMatches.length >= 2 ? r2(valMatches[1]!) : valorBruto;
        const descontos = r2(valorLiquido - valorBruto);
        const isPago = status.toLowerCase().includes('pago');



        if (guia && dataVencimento) {
          recebiveis.push({
            idempotencyKey: `VR::${ec}::${guia}::${dataVencimento}`,
            gateway: 'VR',
            ec,
            ecCentralizador: ec,
            cnpj: headerCnpj,
            dataVencimento,
            bandeira: 'VR',
            modalidade: 'VOUCHER',
            tipoLancamento: 'PAGAMENTO_REALIZADO',
            lancamento: produto,
            valorLiquido,
            valorLiquidado: isPago ? valorLiquido : 0,
            cartaoMascarado: null,
            autorizacao: guia,
            nsu: guia,
            terminal: null,
            dataVenda,
            horaVenda: null,
            valorVenda: valorBruto,
            descontos,
            parcelasInfo: '1 de 1',
          });
          continue;
        }
      }
    }

    ignoradas++;
  }

  return {
    file: fname,
    gateway: 'VR',
    totalLinhas: lines.length,
    recebiveis,
    ignoradas,
  };
}

