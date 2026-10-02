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
  return str(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°]/g, 'o')
    .replace(/[ª]/g, 'a')
    .trim();
}

function parseBRL(v: RawCell): number {
  if (typeof v === 'number') return v;
  const s = str(v);
  if (!s || s === '-') return 0;
  const neg = s.includes('-'); // handles "R$ -1,22" and "-1,22"
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
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Excel serial date code
    const date = new Date(Math.round((v - 25569) * 86400 * 1000));
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth()+1)}-${pad2(date.getUTCDate())}`;
  }
  const s = str(v);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) {
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  return null;
}

function parseHourBR(v: RawCell): string {
  if (v instanceof Date) {
    return `${pad2(v.getHours())}:${pad2(v.getMinutes())}:${pad2(v.getSeconds())}`;
  }
  if (typeof v === 'number') {
    const fraction = v % 1;
    if (fraction > 0) {
      const totalSecs = Math.round(fraction * 86400);
      const h = Math.floor(totalSecs / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      const s = totalSecs % 60;
      return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
    }
  }
  const s = str(v);
  const mh = s.match(/(?:^|\s+)(\d{1,2})h(\d{2})(?:[m:]?(\d{2}))?/i);
  if (mh) {
    return `${pad2(Number(mh[1]))}:${mh[2]}:${mh[3] ? mh[3] : '00'}`;
  }
  const m = s.match(/(?:^|\s+)(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return `${pad2(Number(m[1]))}:${m[2]}:${m[3] ? m[3] : '00'}`;
  }
  return '12:00:00';
}

function parseDatetimeBR(v: RawCell): string | null {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${pad2(v.getMonth()+1)}-${pad2(v.getDate())}T${pad2(v.getHours())}:${pad2(v.getMinutes())}:00`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = parseDateBR(v);
    const h = parseHourBR(v);
    return d ? `${d}T${h}` : null;
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

function mapTicketProduto(raw: string): { produtoNome: string; modalidade: string } {
  const p = norm(raw).toUpperCase();
  if (p === 'TAE' || p.includes('ALIMENT')) return { produtoNome: 'Ticket Alimentação', modalidade: 'VOUCHER' };
  if (p === 'TRE' || p.includes('REFEIC')) return { produtoNome: 'Ticket Restaurante', modalidade: 'VOUCHER' };
  if (p === 'TF' || p.includes('FLEX')) return { produtoNome: 'Ticket Flex', modalidade: 'VOUCHER' };
  if (p === 'TKE' || p.includes('EDENRED')) return { produtoNome: 'Ticket Restaurante/Alimentação', modalidade: 'VOUCHER' };
  if (p === 'TCE' || p.includes('CULTURA')) return { produtoNome: 'Ticket Cultura', modalidade: 'VOUCHER' };
  return { produtoNome: raw.trim() || 'Ticket Voucher', modalidade: 'VOUCHER' };
}

export function parseTicketRows(rows: RawCell[][], fname = ''): VoucherResult {
  let hi = -1;
  const col: Record<string, number> = {};

  // Scan top rows for CNPJ
  let headerCnpj = '';
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i]!;
    for (let j = 0; j < row.length; j++) {
      const s = str(row[j]);
      if (s.toLowerCase().includes('cnpj')) {
        if (s.includes(':')) headerCnpj = s.split(':')[1]!.trim().replace(/[^\d]/g, '');
        if (!headerCnpj && j + 1 < row.length) headerCnpj = str(row[j + 1]).replace(/[^\d]/g, '');
        break;
      }
    }
    if (headerCnpj) break;
  }

  // Verifica layout oficial do Extrato de Transações Ticket Portal
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i]!;
    const normRow = row.map(c => norm(c));
    if (normRow.some(c => c.includes('transacao')) && (normRow.some(c => c.includes('vl')) || normRow.some(c => c.includes('valor')))) {
      hi = i;
      row.forEach((c, j) => {
        const s = norm(c);
        if (s.includes('data')) col.data = j;
        else if (s.includes('transacao') && (s.includes('no') || s.includes('num') || s.includes('n.') || s.includes('doc') || s.includes('nsu'))) col.nsu = j;
        else if (s === 'produto') col.produto = j;
        else if (s.includes('vl') || s.includes('valor') || s.includes('bruto')) col.valor = j;
        else if (s.includes('reembolso')) col.reembolso = j;
        else if (s.includes('codigo') || s.includes('cliente') || s.includes('estabelecimento') || s === 'ec') col.ec = j;
        else if (s.includes('cnpj')) col.cnpj = j;
      });
      break;
    }
  }

  // Se não encontrou as colunas essenciais do portal, tenta o parser genérico de voucher com keywords estendidas
  if (hi < 0 || col.valor == null || col.data == null || col.nsu == null) {
    return parseVoucherRows(rows, 'TICKET', fname, {
      ec: ['estabelecimento', 'codigo', 'cliente', 'loja', 'ec'],
      cnpj: ['cnpj'],
      dataVenda: ['data', 'data venda', 'data da transacao', 'data/hora'],
      status: ['status', 'situacao'],
      nsu: ['nsu', 'comprovante', 'doc', 'no transacao', 'transacao', 'documento'],
      autorizacao: ['autorizacao', 'aut'],
      valorBruto: ['valor', 'bruto', 'vl transacao', 'valor transacao', 'vl'],
      valorTaxa: ['taxa', 'comissao', 'desconto'],
      valorLiquido: ['liquido', 'valor liquido', 'receber'],
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

    const bruto = parseBRL(row[col.valor]);
    if (!bruto) {
      ignoradas++;
      continue;
    }

    const nsu = str(row[col.nsu]).replace(/[^\d]/g, '');
    if (!nsu) {
      ignoradas++;
      continue;
    }

    const rawData = str(row[col.data]);
    const dataDia = parseDateBR(rawData);
    if (!dataDia) {
      ignoradas++;
      continue;
    }

    const horaStr = parseHourBR(rawData);
    const dataHoraVenda = `${dataDia}T${horaStr}`;
    const cnpj = (col.cnpj != null ? str(row[col.cnpj]).replace(/[^\d]/g, '') : '') || headerCnpj;
    const ec = (col.ec != null ? str(row[col.ec]) : '') || (cnpj || 'GERAL');
    const prodRaw = col.produto != null ? str(row[col.produto]) : 'TICKET';
    const { produtoNome, modalidade } = mapTicketProduto(prodRaw);
    // numReembolso vincula esta venda ao PAGAMENTO_REALIZADO do extrato de recebidos
    const numReembolso = col.reembolso != null ? str(row[col.reembolso]).replace(/[^\d]/g, '') : '';

    vendas.push({
      idempotencyKey: `TICKET::${ec}::${nsu}::${dataDia}`,
      gateway: 'TICKET',
      ec,
      cnpj,
      bandeira: 'TICKET',
      bandeiraBruta: prodRaw,
      modalidade,
      formaPagamento: produtoNome,
      dataHoraVenda,
      status: 'APROVADA',
      parcelas: 1,
      dataPrimeiroPgto: null,
      cartaoMascarado: '',
      autorizacao: numReembolso || nsu,
      nsu,
      terminal: '',
      meioCaptura: 'TEF',
      valorBruto: r2(bruto),
      valorTaxa: 0,
      valorLiquido: r2(bruto),
    });
  }

  return {
    file: fname,
    gateway: 'TICKET',
    totalLinhas: rows.length,
    vendas,
    ignoradas,
  };
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


// ── Genérico: Pagamentos/Recebíveis (Sodexo, Pluxee) ─────────────────

function parseGenericPgtosRows(rows: RawCell[][], fname: string, gateway: string): any {
  let hi = -1;
  const col: any = {};

  let headerCnpj = '';
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i]!;
    for (let j = 0; j < row.length; j++) {
      const cellStr = str(row[j]);
      if (cellStr.toLowerCase().includes('cnpj')) {
        if (cellStr.includes(':')) headerCnpj = cellStr.split(':')[1]!.trim().replace(/[^\d]/g, '');
        else if (j + 1 < row.length) headerCnpj = str(row[j + 1]).replace(/[^\d]/g, '');
        break;
      }
    }
    if (headerCnpj) break;
  }

  for (let i = 0; i < Math.min(rows.length, 35); i++) {
    const row = rows[i]!;
    const normRow = row.map(c => norm(c));
    const matchesWord = (kws: string[]) => kws.some(kw => normRow.some(c => c.includes(kw)));

    if (matchesWord(['autorizacao']) && matchesWord(['pagamento']) && matchesWord(['bruto'])) {
      hi = i;
      row.forEach((c, j) => {
        const s = norm(c);
        if      (s.includes('cnpj'))                                              col.cnpj = j;
        else if (s.includes('estabelecimento'))                                   col.ec = j;
        else if ((s === 'data do pagamento' || s === 'data pagamento' || (s.includes('data') && s.includes('pagamento'))) && col.dataVenc == null) col.dataVenc = j;
        else if ((s === 'data da transacao' || s === 'data transacao') && col.dataVenda == null) col.dataVenda = j;
        else if (s.includes('status') || s.includes('situacao'))                  col.status = j;
        else if (s.includes('autorizacao') || s === 'aut')                        col.autorizacao = j;
        else if (s.includes('nsu') || s.includes('documento'))                   col.nsu = j;
        else if (s.includes('cartao'))                                            col.cartao = j;
        else if (s.includes('bruto'))                                             col.valorBruto = j;
        else if (s.includes('taxa') || s.includes('comissao') || s.includes('desconto')) col.valorTaxa = j;
        else if (s.includes('liquido'))                                           col.valorLiquido = j;
        else if (s.includes('origem'))                                            col.origem = j;
      });
      break;
    }
  }

  if (hi < 0) throw new Error(`Layout de pagamentos ${gateway} não reconhecido.`);

  const recebiveis: any[] = [];
  let ignoradas = 0;

  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (!row.length) { ignoradas++; continue; }

    const bruto = col.valorBruto != null ? parseBRL(row[col.valorBruto]) : 0;
    if (!bruto) { ignoradas++; continue; }

    const dataVencimento = col.dataVenc != null ? parseDateBR(row[col.dataVenc]) : null;
    if (!dataVencimento) { ignoradas++; continue; }

    const aut = col.autorizacao != null ? str(row[col.autorizacao]) : '';
    let nsu = col.nsu != null ? str(row[col.nsu]).replace(/[^\d]/g, '') : '';
    if (!nsu && aut) nsu = aut.replace(/[^\d]/g, '');
    if (!nsu) { ignoradas++; continue; }

    const cnpj = (col.cnpj != null ? str(row[col.cnpj]).replace(/[^\d]/g, '') : '') || headerCnpj;
    const ec   = col.ec != null ? str(row[col.ec]) : (cnpj || 'GERAL');
    const dataVenda = col.dataVenda != null ? parseDateBR(row[col.dataVenda]) : null;
    const taxaRaw   = col.valorTaxa != null ? parseBRL(row[col.valorTaxa]) : 0;
    const descontos = taxaRaw ? -Math.abs(taxaRaw) : 0;
    const liquidoRaw = col.valorLiquido != null ? parseBRL(row[col.valorLiquido]) : 0;
    const valorLiquido = liquidoRaw || r2(bruto + descontos);
    const origem = col.origem != null ? str(row[col.origem]).trim() : '';
    const lancamento = origem ? (origem.startsWith('COMPRAS') ? origem : `COMPRAS - ${origem}`) : 'COMPRAS';
    const isPago = col.status != null ? str(row[col.status]).toLowerCase().includes('pago') : true;

    recebiveis.push({
      idempotencyKey: `${gateway}::${ec}::${nsu}::${dataVencimento}`,
      gateway,
      ec,
      ecCentralizador: ec,
      cnpj,
      dataVencimento,
      bandeira: gateway,
      modalidade: 'VOUCHER',
      tipoLancamento: 'PAGAMENTO_REALIZADO',
      lancamento,
      origem: origem || undefined,
      valorLiquido: r2(valorLiquido),
      valorLiquidado: isPago ? r2(valorLiquido) : 0,
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

  return { file: fname, gateway, totalLinhas: rows.length, recebiveis, ignoradas };
}

export function parseSodexoRecebiveisRows(rows: RawCell[][], fname = ''): any {
  return parseGenericPgtosRows(rows, fname, 'SODEXO');
}

// ── Pluxee (ex-Sodexo) ───────────────────────────────────────────────

export interface PluxeeTaxaSumario {
  totalBruto:       number;
  totalTaxas:       number;
  taxaAdminPat:     number;
  taxaAdminAuxilio: number;
  gestaoAuxilio:    number;
  servContratados:  number;
  totalLiquido:     number;
}

function extractPluxeeResumo(rows: RawCell[][]): PluxeeTaxaSumario | null {
  const scan: Partial<PluxeeTaxaSumario> = {};

  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i]!;
    for (let j = 0; j < row.length; j++) {
      const s = norm(str(row[j]));
      const findVal = (): number | null => {
        for (let k = j + 1; k < row.length; k++) {
          const cell = row[k];
          if (cell === '' || cell == null) continue;
          const v = parseBRL(cell);
          if (v !== 0 || String(cell).replace(/[^\d]/g, '').length > 0) return v;
        }
        return null;
      };

      if (s.includes('total bruto') && s.includes('period')) {
        const v = findVal(); if (v != null) scan.totalBruto = v;
      } else if ((s === 'total taxas' || (s.includes('total') && s.includes('taxa'))) && !s.includes('bruto')) {
        const v = findVal(); if (v != null) scan.totalTaxas = v;
      } else if (s.includes('administracao') && s.includes('pat')) {
        const v = findVal(); if (v != null) scan.taxaAdminPat = v;
      } else if (s.includes('administracao') && s.includes('auxilio')) {
        const v = findVal(); if (v != null) scan.taxaAdminAuxilio = v;
      } else if (s.includes('gestao') && (s.includes('pagamento') || s.includes('auxilio'))) {
        const v = findVal(); if (v != null) scan.gestaoAuxilio = v;
      } else if (s.includes('total srv') || (s.includes('servico') && s.includes('contrat'))) {
        const v = findVal(); if (v != null) scan.servContratados = v;
      } else if (s.includes('total liquido') || (s.includes('total') && s.includes('liquid'))) {
        const v = findVal(); if (v != null) scan.totalLiquido = v;
      }
    }
  }

  if (scan.totalBruto == null && scan.totalLiquido == null) return null;
  return {
    totalBruto:       scan.totalBruto       ?? 0,
    totalTaxas:       scan.totalTaxas        ?? 0,
    taxaAdminPat:     scan.taxaAdminPat      ?? 0,
    taxaAdminAuxilio: scan.taxaAdminAuxilio  ?? 0,
    gestaoAuxilio:    scan.gestaoAuxilio     ?? 0,
    servContratados:  scan.servContratados   ?? 0,
    totalLiquido:     scan.totalLiquido      ?? 0,
  };
}

export function parsePluxeeVendasRows(rows: RawCell[][], fname = ''): VoucherResult {
  let hi = -1;
  const col: Record<string, number> = {};
  let headerCnpj = '';

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i]!;
    for (let j = 0; j < row.length; j++) {
      const s = str(row[j]);
      if (s.toLowerCase().includes('cnpj')) {
        if (s.includes(':')) headerCnpj = s.split(':')[1]!.trim().replace(/[^\d]/g, '');
        else if (j + 1 < row.length) headerCnpj = str(row[j + 1]).replace(/[^\d]/g, '');
        break;
      }
    }
    if (headerCnpj) break;
  }

  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i]!;
    const normRow = row.map(c => norm(c));
    if (normRow.some(c => c.includes('autorizacao')) && normRow.some(c => c.includes('bruto'))) {
      hi = i;
      row.forEach((c, j) => {
        const s = norm(c);
        if      (s.includes('cnpj'))                                                   col.cnpj = j;
        else if (s.includes('autorizacao'))                                            col.autorizacao = j;
        else if ((s.includes('data') && s.includes('transacao')) && !s.includes('processamento') && !s.includes('pagamento') && col.dataVenda == null) col.dataVenda = j;
        else if (s.includes('pagamento') && col.dataPgto == null)                     col.dataPgto = j;
        else if (s.includes('cartao') && !s.includes('rede'))                         col.cartao = j;
        else if (s.includes('bruto'))                                                  col.valorBruto = j;
        else if (s.includes('liquido'))                                                col.valorLiquido = j;
        else if ((s.includes('taxa') || s.includes('comissao')) && !s.includes('admin')) col.valorTaxa = j;
        else if (s.includes('origem'))                                                 col.origem = j;
        else if (s.includes('status') || s.includes('situacao'))                       col.status = j;
      });
      break;
    }
  }

  if (hi < 0 || col.valorBruto == null) throw new Error('Layout do extrato de vendas Pluxee não reconhecido.');

  const vendas: VoucherVenda[] = [];
  let ignoradas = 0;

  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (!row.length || row[col.valorBruto] === '' || row[col.valorBruto] == null) { ignoradas++; continue; }

    const bruto = parseBRL(row[col.valorBruto]);
    if (!bruto) { ignoradas++; continue; }

    const aut = col.autorizacao != null ? str(row[col.autorizacao]).trim() : '';
    const nsu = aut.replace(/[^\d]/g, '') || aut;
    if (!nsu) { ignoradas++; continue; }

    const dateStr = col.dataVenda != null ? parseDatetimeBR(row[col.dataVenda]) : null;
    if (!dateStr) { ignoradas++; continue; }

    const dt   = dateStr.slice(0, 10);
    const cnpj = (col.cnpj != null ? str(row[col.cnpj]).replace(/[^\d]/g, '') : '') || headerCnpj;
    const ec   = cnpj || 'GERAL';

    const taxaRaw      = col.valorTaxa    != null ? parseBRL(row[col.valorTaxa])    : 0;
    const valorTaxa    = taxaRaw ? -Math.abs(taxaRaw) : 0;
    const liquidoRaw   = col.valorLiquido != null ? parseBRL(row[col.valorLiquido]) : 0;
    const valorLiquido = r2(liquidoRaw || (bruto + valorTaxa));

    const dataPrimeiroPgto = col.dataPgto != null ? parseDateBR(row[col.dataPgto]) : null;
    const origem           = col.origem   != null ? str(row[col.origem]).trim()      : '';

    vendas.push({
      idempotencyKey: `PLUXEE::${ec}::${nsu}::${dt}`,
      gateway:         'PLUXEE',
      ec,
      cnpj,
      bandeira:        'PLUXEE',
      bandeiraBruta:   origem || 'PLUXEE',
      modalidade:      'VOUCHER',
      formaPagamento:  `Pluxee ${origem || 'Benefícios'}`,
      dataHoraVenda:   dateStr,
      status:          col.status != null ? str(row[col.status]).toUpperCase() : 'APROVADA',
      parcelas:        1,
      dataPrimeiroPgto,
      cartaoMascarado: col.cartao != null ? str(row[col.cartao]) : '',
      autorizacao:     aut,
      nsu,
      terminal:        '',
      meioCaptura:     'TEF',
      valorBruto:      r2(bruto),
      valorTaxa:       r2(valorTaxa),
      valorLiquido,
    });
  }

  return { file: fname, gateway: 'PLUXEE', totalLinhas: rows.length, vendas, ignoradas };
}

export function parsePluxeePgtosRows(rows: RawCell[][], fname = ''): any {
  const resumo = extractPluxeeResumo(rows);
  const base   = parseGenericPgtosRows(rows, fname, 'PLUXEE');

  // O extrato_pgtos Pluxee não tem coluna de taxa por linha — taxas ficam
  // consolidadas no cabeçalho do lote discriminadas por Origem (PAT vs Auxílio).
  if (resumo && base.recebiveis.length > 0) {
    const hasIndividualTax = base.recebiveis.some((r: any) => r.descontos !== 0);
    if (!hasIndividualTax) {
      const patRecs = base.recebiveis.filter((r: any) => {
        const o = ((r.origem || r.lancamento || '') as string).toUpperCase();
        return o.includes('PAT');
      });
      const auxRecs = base.recebiveis.filter((r: any) => {
        const o = ((r.origem || r.lancamento || '') as string).toUpperCase();
        return o.includes('AUXILIO');
      });

      if (resumo.taxaAdminPat || resumo.taxaAdminAuxilio) {
        // 1. Distribui taxa PAT proporcionalmente entre vendas PAT (3,60%)
        const totalBrutoPat = patRecs.reduce((s: number, r: any) => s + r.valorVenda, 0);
        if (totalBrutoPat > 0 && resumo.taxaAdminPat) {
          const taxaPatTotal = Math.abs(resumo.taxaAdminPat);
          let sumTaxaPat = 0;
          for (let i = 0; i < patRecs.length; i++) {
            const rec = patRecs[i]!;
            let tx = r2(taxaPatTotal * (rec.valorVenda / totalBrutoPat));
            if (i === patRecs.length - 1) {
              tx = r2(taxaPatTotal - sumTaxaPat);
            } else {
              sumTaxaPat = r2(sumTaxaPat + tx);
            }
            rec.descontos = -tx;
            rec.valorLiquido = r2(rec.valorVenda - tx);
            if (rec.valorLiquidado > 0) rec.valorLiquidado = rec.valorLiquido;
          }
        }

        // 2. Distribui taxa Auxílio proporcionalmente entre vendas Auxílio (6,90%)
        const totalBrutoAux = auxRecs.reduce((s: number, r: any) => s + r.valorVenda, 0);
        if (totalBrutoAux > 0 && resumo.taxaAdminAuxilio) {
          const taxaAuxTotal = Math.abs(resumo.taxaAdminAuxilio);
          let sumTaxaAux = 0;
          for (let i = 0; i < auxRecs.length; i++) {
            const rec = auxRecs[i]!;
            let tx = r2(taxaAuxTotal * (rec.valorVenda / totalBrutoAux));
            if (i === auxRecs.length - 1) {
              tx = r2(taxaAuxTotal - sumTaxaAux);
            } else {
              sumTaxaAux = r2(sumTaxaAux + tx);
            }
            rec.descontos = -tx;
            rec.valorLiquido = r2(rec.valorVenda - tx);
            if (rec.valorLiquidado > 0) rec.valorLiquidado = rec.valorLiquido;
          }
        }

        // 3. Tarifa fixa de Gestão de Pagamentos - Auxílio (R$ 5,99, R$ 11,98, etc.)
        // Lançada como linha de AJUSTE para fechar a conciliação bancária perfeitamente
        if (resumo.gestaoAuxilio && Math.abs(resumo.gestaoAuxilio) > 0) {
          const r0 = base.recebiveis[0];
          const valGestao = -Math.abs(resumo.gestaoAuxilio);
          base.recebiveis.push({
            idempotencyKey: `PLUXEE::${r0?.ec || 'GERAL'}::GESTAO_AUXILIO::${r0?.dataVencimento || 'LOTE'}::${Math.abs(Math.round(valGestao * 100))}`,
            gateway: 'PLUXEE',
            ec: r0?.ec || 'GERAL',
            ecCentralizador: r0?.ecCentralizador || r0?.ec || 'GERAL',
            cnpj: r0?.cnpj || '',
            dataVencimento: r0?.dataVencimento || new Date().toISOString().slice(0, 10),
            bandeira: 'PLUXEE',
            modalidade: 'VOUCHER',
            tipoLancamento: 'AJUSTE',
            lancamento: 'GESTÃO DE PAGAMENTOS - AUXILIO',
            valorLiquido: r2(valGestao),
            valorLiquidado: r2(valGestao),
            cartaoMascarado: null,
            autorizacao: null,
            nsu: null,
            terminal: null,
            dataVenda: r0?.dataVenda || null,
            horaVenda: null,
            valorVenda: 0,
            descontos: r2(valGestao),
            parcelasInfo: null,
          });
        }
      } else if (resumo.totalTaxas) {
        // Fallback linear se não houver discriminação por verba
        const totalBrutoCalc: number = base.recebiveis.reduce((s: number, r: any) => s + r.valorVenda, 0);
        if (totalBrutoCalc > 0) {
          const totalTaxas = Math.abs(resumo.totalTaxas);
          for (const rec of base.recebiveis) {
            const taxa = r2(totalTaxas * (rec.valorVenda / totalBrutoCalc));
            rec.descontos      = -taxa;
            rec.valorLiquido   = r2(rec.valorVenda - taxa);
            if (rec.valorLiquidado > 0) rec.valorLiquidado = rec.valorLiquido;
          }
        }
      }
    }
  }

  return { ...base, resumo };
}

// ── Alelo (portal novo) ───────────────────────────────────────────────

export function parseAleloVendasRows(rows: RawCell[][], fname = ''): VoucherResult {
  let hi = -1;
  const col: Record<string, number> = {};
  let headerCnpj = '';

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i]!;
    for (let j = 0; j < row.length; j++) {
      const s = str(row[j]);
      if (s.toLowerCase().includes('cnpj')) {
        if (s.includes(':')) headerCnpj = s.split(':')[1]!.trim().replace(/[^\d]/g, '');
        else if (j + 1 < row.length) headerCnpj = str(row[j + 1]).replace(/[^\d]/g, '');
        break;
      }
    }
    if (headerCnpj) break;
  }

  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i]!;
    const normRow = row.map(c => norm(c));
    if (normRow.some(c => c.includes('autorizacao')) && normRow.some(c => c.includes('bruto'))) {
      hi = i;
      row.forEach((c, j) => {
        const s = norm(c);
        if      (s === 'cnpj')                                                    col.cnpj = j;
        else if ((s.includes('no do ec') || s.includes('numero do ec')) && col.ec == null) col.ec = j;
        else if (s.includes('autorizacao'))                                       col.autorizacao = j;
        else if (s.includes('data da venda') || (s.includes('data') && !s.includes('pagamento') && !s.includes('hora') && col.dataVenda == null)) col.dataVenda = j;
        else if (s.includes('horario') || s.includes('hora da transacao'))        col.hora = j;
        else if (s === 'tipo cartao' || s.includes('tipo cartao'))                col.tipoCartao = j;
        else if (s.includes('cartao') && !s.includes('tipo'))                     col.cartao = j;
        else if (s.includes('valor bruto'))                                       col.valorBruto = j;
        else if (s.includes('valor liquido'))                                     col.valorLiquido = j;
        else if (s.includes('status') || s.includes('situacao'))                  col.status = j;
        else if (s.includes('pagamento') && col.dataPgto == null)                 col.dataPgto = j;
      });
      break;
    }
  }

  if (hi < 0 || col.valorBruto == null) {
    // Fallback para parser genérico Alelo (formatos antigos)
    return parseAleloRows(rows, fname);
  }

  const vendas: VoucherVenda[] = [];
  let ignoradas = 0;

  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (!row.length || row.every(c => c === '' || c == null)) { ignoradas++; continue; }

    const bruto = parseBRL(row[col.valorBruto]);
    if (!bruto) { ignoradas++; continue; }

    const aut = col.autorizacao != null ? str(row[col.autorizacao]).trim() : '';
    const nsu = aut.replace(/[^\d]/g, '') || aut;
    if (!nsu) { ignoradas++; continue; }

    const dataVendaStr = col.dataVenda != null ? parseDateBR(row[col.dataVenda]) : null;
    if (!dataVendaStr) { ignoradas++; continue; }

    const horaStr      = col.hora      != null ? parseHourBR(row[col.hora])  : '12:00:00';
    const dataHoraVenda = `${dataVendaStr}T${horaStr}`;

    const cnpj         = (col.cnpj != null ? str(row[col.cnpj]).replace(/[^\d]/g, '') : '') || headerCnpj;
    const ec           = col.ec    != null ? str(row[col.ec]).replace(/[^\d]/g, '')   : (cnpj || 'GERAL');
    const tipoCartao   = col.tipoCartao   != null ? str(row[col.tipoCartao]).trim()    : 'Alelo';
    const liquidoRaw   = col.valorLiquido != null ? parseBRL(row[col.valorLiquido])    : 0;
    const valorLiquido = r2(liquidoRaw || bruto);
    const valorTaxa    = r2(valorLiquido - bruto);
    const dataPrimeiroPgto = col.dataPgto != null ? parseDateBR(row[col.dataPgto]) : null;
    const statusRaw    = col.status != null ? str(row[col.status]).toUpperCase() : 'APROVADA';

    vendas.push({
      idempotencyKey:  `ALELO::${ec}::${nsu}::${dataVendaStr}`,
      gateway:          'ALELO',
      ec,
      cnpj,
      bandeira:         'ALELO',
      bandeiraBruta:    tipoCartao,
      modalidade:       'VOUCHER',
      formaPagamento:   `Alelo ${tipoCartao}`,
      dataHoraVenda,
      status:           statusRaw.includes('APROV') ? 'APROVADA' : statusRaw,
      parcelas:         1,
      dataPrimeiroPgto,
      cartaoMascarado:  col.cartao != null ? str(row[col.cartao]) : '',
      autorizacao:      aut,
      nsu,
      terminal:         '',
      meioCaptura:      'TEF',
      valorBruto:       r2(bruto),
      valorTaxa:        r2(valorTaxa),
      valorLiquido:     r2(valorLiquido),
    });
  }

  return { file: fname, gateway: 'ALELO', totalLinhas: rows.length, vendas, ignoradas };
}

export function parseNaipVendasRows(rows: RawCell[][], fname = ''): VoucherResult {
  const result = parseAleloVendasRows(rows, fname);
  return {
    ...result,
    gateway: 'NAIP',
    vendas: result.vendas.map(v => ({
      ...v,
      gateway:         'NAIP',
      bandeira:        'NAIP',
      idempotencyKey:  v.idempotencyKey.replace(/^ALELO::/, 'NAIP::'),
    })),
  };
}

export function parseAleloRecebimentosRows(rows: RawCell[][], fname = ''): any {
  let hi = -1;
  const col: Record<string, number> = {};

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i]!;
    const normRow = row.map(c => norm(c));
    // Header: has nsu ("transacao") + bruto (not tipo/horario row)
    if (normRow.some(c => c.includes('transacao') && !c.includes('tipo') && !c.includes('horario')) && normRow.some(c => c.includes('bruto'))) {
      hi = i;
      row.forEach((c, j) => {
        const s = norm(c);
        if      (s === 'cnpj')                                                    col.cnpj = j;
        else if ((s.includes('no do ec') || s.includes('numero do ec')) && col.ec == null) col.ec = j;
        else if ((s.includes('no da transacao') || s.includes('numero da transacao')) && !s.includes('tipo') && !s.includes('ec') && !s.includes('horario')) col.nsu = j;
        else if (s.includes('autorizacao'))                                       col.autorizacao = j;
        else if ((s.includes('data da venda') || s.includes('data venda')) && col.dataVenda == null) col.dataVenda = j;
        else if (s.includes('horario') || s.includes('hora da transacao'))        col.hora = j;
        else if (s === 'tipo cartao' || s.includes('tipo cartao'))                col.tipoCartao = j;
        else if (s.includes('cartao') && !s.includes('tipo'))                     col.cartao = j;
        else if (s.includes('valor bruto'))                                       col.valorBruto = j;
        else if (s.includes('valor liquido'))                                     col.valorLiquido = j;
        else if (s.includes('status') || s.includes('situacao'))                  col.status = j;
        else if (s.includes('pagamento') && col.dataPgto == null)                 col.dataPgto = j;
      });
      break;
    }
  }

  if (hi < 0 || col.valorBruto == null) throw new Error('Layout de recebimentos Alelo não reconhecido.');

  const recebiveis: any[] = [];
  let ignoradas = 0;

  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (!row.length || row.every(c => c === '' || c == null)) { ignoradas++; continue; }

    const bruto = parseBRL(row[col.valorBruto]);
    if (!bruto) { ignoradas++; continue; }

    const dataPgtoStr = col.dataPgto != null ? parseDateBR(row[col.dataPgto]) : null;
    if (!dataPgtoStr) { ignoradas++; continue; }

    const nsu = col.nsu        != null ? str(row[col.nsu]).replace(/[^\d]/g, '')  : '';
    const aut = col.autorizacao != null ? str(row[col.autorizacao]).trim()          : '';
    if (!nsu && !aut) { ignoradas++; continue; }

    const cnpj         = col.cnpj       != null ? str(row[col.cnpj]).replace(/[^\d]/g, '')  : '';
    const ec           = col.ec         != null ? str(row[col.ec]).replace(/[^\d]/g, '')     : (cnpj || 'GERAL');
    const dataVenda    = col.dataVenda   != null ? parseDateBR(row[col.dataVenda])            : null;
    const hora         = col.hora        != null ? parseHourBR(row[col.hora])                 : null;
    const tipoCartao   = col.tipoCartao  != null ? str(row[col.tipoCartao]).trim()            : 'Alelo';
    const liquidoRaw   = col.valorLiquido != null ? parseBRL(row[col.valorLiquido])           : 0;
    const valorLiquido = r2(liquidoRaw || bruto);
    const descontos    = r2(valorLiquido - bruto);
    const finalNsu     = nsu || aut.replace(/[^\d]/g, '');
    const isPago       = col.status != null && str(row[col.status]).toLowerCase().includes('aprov');

    recebiveis.push({
      idempotencyKey:  `ALELO::${ec}::${finalNsu}::${dataPgtoStr}`,
      gateway:          'ALELO',
      ec,
      ecCentralizador:  ec,
      cnpj,
      dataVencimento:   dataPgtoStr,
      bandeira:         'ALELO',
      modalidade:       'VOUCHER',
      tipoLancamento:   'PAGAMENTO_REALIZADO',
      lancamento:       tipoCartao,
      valorLiquido:     r2(valorLiquido),
      valorLiquidado:   isPago ? r2(valorLiquido) : 0,
      cartaoMascarado:  col.cartao != null ? str(row[col.cartao]) : null,
      autorizacao:      aut || null,
      nsu:              finalNsu || null,
      terminal:         null,
      dataVenda,
      horaVenda:        hora,
      valorVenda:       r2(bruto),
      descontos:        r2(descontos),
      parcelasInfo:     '1 de 1',
    });
  }

  return { file: fname, gateway: 'ALELO', totalLinhas: rows.length, recebiveis, ignoradas };
}

export function parseAleloOutrasRows(rows: RawCell[][], fname = ''): any {
  let hi = -1;
  const col: Record<string, number> = {};

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i]!;
    const normRow = row.map(c => norm(c));
    if (normRow.some(c => c.includes('descricao')) && normRow.some(c => c === 'valor' || c.includes('valor'))) {
      hi = i;
      row.forEach((c, j) => {
        const s = norm(c);
        if      (s === 'cnpj')                                     col.cnpj = j;
        else if ((s.includes('no do ec') || s.includes('numero do ec')) && col.ec == null) col.ec = j;
        else if (s === 'tipo cartao' || s.includes('tipo cartao')) col.tipoCartao = j;
        else if (s.includes('descricao'))                          col.descricao = j;
        else if (s === 'valor' || (s.includes('valor') && col.valor == null)) col.valor = j;
        else if (s.includes('debito') && s.includes('data'))       col.dataDebito = j;
        else if (s.includes('pagamento') && s.includes('data'))    col.dataPgto = j;
      });
      break;
    }
  }

  if (hi < 0 || col.valor == null) throw new Error('Layout de outras transações Alelo não reconhecido.');

  const recebiveis: any[] = [];
  let ignoradas = 0;

  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (!row.length || row.every(c => c === '' || c == null)) { ignoradas++; continue; }

    const val = parseBRL(row[col.valor]);
    if (val === 0) { ignoradas++; continue; }

    const dataDebito = col.dataDebito != null ? parseDateBR(row[col.dataDebito]) : null;
    const dataPgto   = col.dataPgto   != null ? parseDateBR(row[col.dataPgto])   : dataDebito;
    if (!dataPgto) { ignoradas++; continue; }

    const cnpj      = col.cnpj      != null ? str(row[col.cnpj]).replace(/[^\d]/g, '')  : '';
    const ec        = col.ec        != null ? str(row[col.ec]).replace(/[^\d]/g, '')     : (cnpj || 'GERAL');
    const descricao = col.descricao != null ? str(row[col.descricao]).trim()             : 'Ajuste Alelo';

    const descKey = norm(descricao).replace(/\W/g, '').substring(0, 8);
    const valKey  = Math.abs(Math.round(val * 100)).toString();
    const idKey   = `ALELO::${ec}::AJUSTE::${dataPgto}::${descKey}::${valKey}`;

    recebiveis.push({
      idempotencyKey:  idKey,
      gateway:          'ALELO',
      ec,
      ecCentralizador:  ec,
      cnpj,
      dataVencimento:   dataPgto,
      bandeira:         'ALELO',
      modalidade:       'VOUCHER',
      tipoLancamento:   'AJUSTE',
      lancamento:       descricao,
      valorLiquido:     r2(val),
      valorLiquidado:   r2(val),
      cartaoMascarado:  null,
      autorizacao:      null,
      nsu:              null,
      terminal:         null,
      dataVenda:        dataDebito,
      horaVenda:        null,
      valorVenda:       r2(Math.abs(val)),
      descontos:        val < 0 ? r2(val) : 0,
      parcelasInfo:     null,
    });
  }

  return { file: fname, gateway: 'ALELO', totalLinhas: rows.length, recebiveis, ignoradas };
}

export function parseNaipRecebimentosRows(rows: RawCell[][], fname = ''): any {
  const result = parseAleloRecebimentosRows(rows, fname);
  return {
    ...result,
    gateway: 'NAIP',
    recebiveis: result.recebiveis.map((r: any) => ({
      ...r,
      gateway:         'NAIP',
      bandeira:        'NAIP',
      idempotencyKey:  r.idempotencyKey.replace(/^ALELO::/, 'NAIP::'),
    })),
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

// ── Recebíveis / Extrato de Reembolso Detalhado Ticket (Edenred) ─────

export function parseTicketRecebiveisRows(rows: RawCell[][], fname = ''): any {
  let headerCnpj = '';
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!row) continue;
    for (let j = 0; j < row.length; j++) {
      const s = str(row[j]);
      if (s.toLowerCase().includes('cnpj')) {
        if (s.includes(':')) headerCnpj = s.split(':')[1]!.trim().replace(/[^\d]/g, '');
        if (!headerCnpj && j + 1 < row.length) headerCnpj = str(row[j + 1]).replace(/[^\d]/g, '');
        break;
      }
    }
    if (headerCnpj) break;
  }

  // Localiza cabeçalho da tabela de transações
  let hi = -1;
  const col: Record<string, number> = {};
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i];
    if (!row) continue;
    const normRow = row.map(c => norm(c));
    if (normRow.some(c => c.includes('reembolso')) && normRow.some(c => c.includes('transacao') || c.includes('documento'))) {
      hi = i;
      row.forEach((c, j) => {
        const s = norm(c);
        if (s.includes('numero do reembolso') || s === 'reembolso') col.numeroReembolso = j;
        else if (s.includes('contrato')) col.contrato = j;
        else if (s === 'produto') col.produto = j;
        else if (s.includes('corte')) col.dataCorte = j;
        else if (s.includes('credito') || s.includes('debito')) col.dataCredito = j;
        else if (s.includes('estabelecimento') && (s.includes('cod') || s.includes('numero'))) col.ec = j;
        else if (s.includes('estabelecimento da compra')) col.lojaNome = j;
        else if (s.includes('data da transacao') || s === 'data transacao') col.dataTransacao = j;
        else if (s.includes('postagem')) col.dataPostagem = j;
        else if (s.includes('documento') || s.includes('doc')) col.numeroDoc = j;
        else if (s.includes('tipo de transacao')) col.tipoTransacao = j;
        else if (s.includes('descricao')) col.descricao = j;
        else if (s.includes('cartao')) col.cartao = j;
        else if (s.includes('valor da transacao') || s.includes('valor transacao')) col.valorTransacao = j;
        else if (s.includes('cnpj')) col.cnpj = j;
      });
      break;
    }
  }

  if (hi < 0 || col.valorTransacao == null) {
    throw new Error('Layout do Extrato de Reembolso Detalhado da Ticket não reconhecido.');
  }

  const recebiveis: any[] = [];
  let ignoradas = 0;

  interface LoteTracker {
    numeroReembolso: string;
    ec: string;
    cnpj: string;
    produtoRaw: string;
    produtoNome: string;
    modalidade: string;
    dataCorte: string | null;
    dataCredito: string | null;
    subtotal: number;
    tarifaTransacao: number;
    tarifaGestao: number;
    taxaTpe: number;
    totalDescontos: number;
    valorLiquido: number;
    transacoesCount: number;
    toRecebivel: () => any;
  }

  let currentLote: LoteTracker | null = null;

  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || row.every(c => c === '' || c == null)) {
      ignoradas++;
      continue;
    }

    const colReembolso = col.numeroReembolso != null ? str(row[col.numeroReembolso]) : '';
    const desc = col.descricao != null ? str(row[col.descricao]) : '';
    const valorCell = col.valorTransacao != null ? row[col.valorTransacao] : null;
    const val = parseBRL(valorCell);

    if (colReembolso && /^\d+$/.test(colReembolso)) {
      if (!currentLote || currentLote.numeroReembolso !== colReembolso) {
        if (currentLote) {
          recebiveis.push(currentLote.toRecebivel());
        }
        const produtoRaw = col.produto != null ? str(row[col.produto]) : 'TICKET';
        const ec = (col.ec != null ? str(row[col.ec]) : '') || headerCnpj || 'GERAL';
        const cnpj = (col.cnpj != null ? str(row[col.cnpj]).replace(/[^\d]/g, '') : '') || headerCnpj;
        const dataCorte = col.dataCorte != null ? parseDateBR(row[col.dataCorte]) : null;
        const dataCredito = col.dataCredito != null ? parseDateBR(row[col.dataCredito]) : null;
        const { produtoNome, modalidade } = mapTicketProduto(produtoRaw);

        currentLote = {
          numeroReembolso: colReembolso,
          ec,
          cnpj,
          produtoRaw,
          produtoNome,
          modalidade,
          dataCorte,
          dataCredito,
          subtotal: 0,
          tarifaTransacao: 0,
          tarifaGestao: 0,
          taxaTpe: 0,
          totalDescontos: 0,
          valorLiquido: 0,
          transacoesCount: 0,
          toRecebivel() {
            const dtVenc = this.dataCredito || this.dataCorte || new Date().toISOString().slice(0, 10);
            const dtVenda = this.dataCorte || dtVenc;
            const descVal = r2(-Math.abs(this.totalDescontos));
            const liq = r2(this.valorLiquido || (this.subtotal + descVal));
            const taxasInfo: string[] = [];
            if (this.taxaTpe) taxasInfo.push(`TPE R$ ${this.taxaTpe.toFixed(2)}`);
            if (this.tarifaTransacao) taxasInfo.push(`Trans R$ ${this.tarifaTransacao.toFixed(2)}`);
            if (this.tarifaGestao) taxasInfo.push(`Gestão R$ ${this.tarifaGestao.toFixed(2)}`);
            const descStr = taxasInfo.length > 0 ? ` (Taxas: ${taxasInfo.join(' | ')})` : '';

            return {
              idempotencyKey: `TICKET::${this.ec}::${this.numeroReembolso}::${dtVenc}`,
              gateway: 'TICKET',
              ec: this.ec,
              ecCentralizador: this.ec,
              cnpj: this.cnpj,
              dataVencimento: dtVenc,
              bandeira: 'TICKET',
              modalidade: this.modalidade,
              tipoLancamento: 'PAGAMENTO_REALIZADO',
              lancamento: `Reembolso Ticket ${this.produtoNome} ${this.numeroReembolso}${descStr}`,
              valorLiquido: liq,
              valorLiquidado: liq,
              cartaoMascarado: null,
              autorizacao: this.numeroReembolso,
              nsu: this.numeroReembolso,
              terminal: null,
              dataVenda: dtVenda,
              horaVenda: null,
              valorVenda: r2(this.subtotal),
              descontos: descVal,
              parcelasInfo: '1 de 1',
            };
          },
        };
      }
    }

    if (!currentLote) {
      ignoradas++;
      continue;
    }

    const normDesc = norm(desc);
    if (normDesc === 'compra') {
      currentLote.transacoesCount++;
      const doc = col.numeroDoc != null ? str(row[col.numeroDoc]).replace(/[^\d]/g, '') : '';
      const cartao = col.cartao != null ? str(row[col.cartao]) : '';
      const dtTrans = col.dataTransacao != null ? parseDateBR(row[col.dataTransacao]) : null;
      const dtVenc = currentLote.dataCredito || currentLote.dataCorte || (dtTrans || new Date().toISOString().slice(0, 10));

      recebiveis.push({
        idempotencyKey: `TICKET::${currentLote.ec}::${doc || currentLote.transacoesCount}::${dtTrans || dtVenc}`,
        gateway: 'TICKET',
        ec: currentLote.ec,
        ecCentralizador: currentLote.ec,
        cnpj: currentLote.cnpj,
        dataVencimento: dtVenc,
        bandeira: 'TICKET',
        modalidade: currentLote.modalidade,
        tipoLancamento: 'VENDA',
        lancamento: `Venda Ticket ${currentLote.produtoNome} (Reembolso ${currentLote.numeroReembolso})`,
        valorLiquido: r2(val),
        valorLiquidado: r2(val),
        cartaoMascarado: cartao || null,
        autorizacao: doc || null,
        nsu: doc || null,
        terminal: null,
        dataVenda: dtTrans,
        horaVenda: null,
        valorVenda: r2(val),
        descontos: 0,
        parcelasInfo: '1 de 1',
      });
    } else if (normDesc.includes('subtotal')) {
      currentLote.subtotal = val;
    } else if (normDesc.includes('tarifa por transa')) {
      currentLote.tarifaTransacao = val;
    } else if (normDesc.includes('tarifa de gest')) {
      currentLote.tarifaGestao = val;
    } else if (normDesc.includes('tpe') || normDesc.includes('taxa tpe')) {
      currentLote.taxaTpe = val;
    } else if (normDesc.includes('total de desconto')) {
      currentLote.totalDescontos = val;
    } else if (normDesc.includes('valor liquido')) {
      currentLote.valorLiquido = val;
    } else {
      ignoradas++;
    }
  }

  if (currentLote) {
    recebiveis.push(currentLote.toRecebivel());
  }

  return {
    file: fname,
    gateway: 'TICKET',
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

