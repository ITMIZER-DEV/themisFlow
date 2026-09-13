/**
 * Parser do Extrato Eletrônico EDI Getnet (Layout V.10 - 400 bytes).
 * 
 * Processa registros posicionais fixos:
 *   Tipo 0 - Header do Arquivo
 *   Tipo 1 - Resumo de Vendas (RV) / Lote Financeiro
 *   Tipo 2 - Comprovante de Vendas (CV) / Transação Detalhada
 *   Tipo 3 - Ajustes e Tarifas
 *   Tipo 4 - Antecipação de Recebíveis
 *   Tipo 5 - Cessões de Crédito / Gravames
 *   Tipo 6 - Unidades de Recebíveis (UR)
 *   Tipo 9 - Trailer do Arquivo
 * 
 * Zero dependências de Node.js ou DOM — 100% TypeScript puro.
 */

import type { GetnetVenda } from './getnet-vendas-parser.js';
import type { GetnetRecebivel } from './getnet-recebiveis-parser.js';

// ── Tipos Públicos ───────────────────────────────────────────────────

export interface GetnetEdiHeader {
  tipo: '0';
  dataCriacao: string;       // YYYY-MM-DD
  horaCriacao: string;       // HH:MM:SS
  dataMovimento: string;     // YYYY-MM-DD
  arquivoVersao: string;     // ex: CEADM100
  ec: string;                // Código do Estabelecimento
  cnpjAdquirente: string;
  nomeAdquirente: string;
  sequencia: string;
  codigoAdquirente: string;
  versaoLayout: string;      // ex: SANT. V.10.3 400 BYTES
}

export interface GetnetEdiRV {
  tipo: '1';
  ec: string;
  codigoProduto: string;     // SV, SM, EC, ED, SR, SE, PN, PL, PC, PS...
  bandeira: string;          // VISA, MASTER, ELO, PIX, OUTROS
  modalidade: string;        // CREDITO, DEBITO, PIX, VOUCHER
  descricaoProduto: string;
  formaCaptura: string;      // TEF, POS, etc.
  numeroRV: string;
  dataRV: string;            // YYYY-MM-DD
  dataPagamento: string;     // YYYY-MM-DD
  banco: string;
  agencia: string;
  contaCorrente: string;
  cvsAceitos: number;
  cvsRejeitados: number;
  valorBruto: number;
  valorLiquido: number;
  valorTarifa: number;
  valorTaxaDesconto: number; // MDR
  valorRejeitado: number;
  valorCredito: number;
  valorEncargos: number;
  tipoPagamento: string;     // PF, LQ, PG, AC, RA, PR, PD, CI, CS
  parcelaRV: number;
  totalParcelasRV: number;
  ecCentralizador: string;
  sinal: string;             // + ou -
  tipoConta: string;
  contaPagamento: string;
}

export interface GetnetEdiCV {
  tipo: '2';
  ec: string;
  numeroRV: string;
  nsu: string;               // Sem zeros à esquerda
  nsuRaw: string;            // 12 dígitos original
  dataTransacao: string;     // YYYY-MM-DD
  horaTransacao: string;     // HH:MM:SS
  dataHoraTransacao: string; // YYYY-MM-DDTHH:MM:SS
  cartao: string;            // Mascarado
  valorTransacao: number;
  valorSaque: number;
  valorTaxaEmbarque: number;
  totalParcelas: number;
  numeroParcela: number;
  valorParcela: number;
  dataPagamento: string;     // YYYY-MM-DD
  autorizacao: string;       // Sem zeros à esquerda
  autorizacaoRaw: string;
  formaCaptura: string;
  statusTransacao: string;   // C = Confirmada, etc.
  status: string;            // APROVADA, CANCELADA...
  ecCentralizador: string;
  terminal: string;
  moeda: string;
  emissor: string;           // N = Nacional, E = Exterior
  sinal: string;             // + ou -
  carteiraDigital: string;
  valorComissao: number;     // MDR
  bandeira: string;
  modalidade: string;
  idempotencyKey: string;
}

export interface GetnetEdiAjuste {
  tipo: '3';
  ec: string;
  numeroRVAjustado: string;
  dataRV: string;
  dataPagamento: string;
  identificadorAjuste: string;
  sinalAjuste: string;
  valorAjuste: number;
  motivoAjuste: string;
  dataCarta: string;
  cartao: string;
  numeroRVOriginal: string;
  nsuOriginal: string;
  dataTransacaoOriginal: string;
  tipoPagamento: string;
  terminal: string;
  dataPagamentoOriginal: string;
  valorComissao: number;
}

export interface GetnetEdiAntecipacao {
  tipo: '4';
  ec: string;
  dataOperacao: string;
  dataCredito: string;
  numeroOperacao: string;
  valorBruto: number;
  valorTaxa: number;
  valorLiquido: number;
  taxaMensal: number;
  ecCentralizador: string;
  banco: string;
  agencia: string;
  conta: string;
  canal: string;
  tipoPagamento: string;
}

export interface GetnetEdiCessao {
  tipo: '5';
  ec: string;
  dataOperacao: string;
  dataCredito: string;
  numeroOperacao: string;
  tipoOperacao: string;      // CS, GV, CF, PG
  valorBrutoTotal: number;
  valorBrutoAdquirencia: number;
  valorCusto: number;
  valorLiquido: number;
  tipoMovimento: string;     // I, L, A, C
  cnpjParticipante: string;
  banco: string;
  agencia: string;
  conta: string;
}

export interface GetnetEdiUR {
  tipo: '6';
  ec: string;
  dataOperacao: string;
  numeroOperacao: string;
  tipoOperacao: string;
  chaveUR: string;
  codigoProduto: string;
  dataVencimentoUR: string;
  valorBrutoTotal: number;
  valorBrutoAdquirencia: number;
  valorCusto: number;
  valorLiquido: number;
  tipoMovimento: string;     // I, L, A, E
  banco: string;
  agencia: string;
  conta: string;
}

export interface GetnetEdiTrailer {
  tipo: '9';
  totalRegistros: number;
}

export interface GetnetEdiAuditoria {
  totalLinhas: number;
  totalRVs: number;
  totalCVs: number;
  somaBrutoRVs: number;
  somaBrutoCVs: number;
  difBruto: number;
  somaMdrRVs: number;
  somaMdrCVs: number;
  difMdr: number;
  somaLiquidoRVs: number;
  auditoriaBatida: boolean;
  rvsDetalhamento: Array<{
    rv: string;
    brutoRV: number;
    brutoCV: number;
    dif: number;
    status: 'OK' | 'DIVERGENTE';
  }>;
}

export interface GetnetEdiResult {
  file: string;
  gateway: 'GETNET';
  header: GetnetEdiHeader | null;
  trailer: GetnetEdiTrailer | null;
  rvs: GetnetEdiRV[];
  cvs: GetnetEdiCV[];
  ajustes: GetnetEdiAjuste[];
  antecipacoes: GetnetEdiAntecipacao[];
  cessoes: GetnetEdiCessao[];
  urs: GetnetEdiUR[];
  auditoria: GetnetEdiAuditoria;
  vendas: GetnetVenda[];
  recebiveis: GetnetRecebivel[];
}

// ── Tabela de Produtos Getnet ────────────────────────────────────────

interface ProdutoInfo {
  bandeira: string;
  modalidade: string;
  descricao: string;
}

const GETNET_PRODUTOS: Record<string, ProdutoInfo> = {
  'SV': { bandeira: 'VISA',   modalidade: 'CREDITO', descricao: 'Santander Visa Crédito' },
  'SE': { bandeira: 'VISA',   modalidade: 'DEBITO',  descricao: 'Santander Visa Electron / Débito' },
  'PN': { bandeira: 'VISA',   modalidade: 'DEBITO',  descricao: 'Visa Débito' },
  'SM': { bandeira: 'MASTER', modalidade: 'CREDITO', descricao: 'Santander Mastercard Crédito' },
  'SR': { bandeira: 'MASTER', modalidade: 'DEBITO',  descricao: 'Santander Maestro / Redeshop' },
  'EC': { bandeira: 'ELO',    modalidade: 'CREDITO', descricao: 'Elo Crédito' },
  'ED': { bandeira: 'ELO',    modalidade: 'DEBITO',  descricao: 'Elo Débito' },
  'PL': { bandeira: 'ELO',    modalidade: 'CREDITO', descricao: 'Elo Parcelado Lojista' },
  'PC': { bandeira: 'OUTROS', modalidade: 'CREDITO', descricao: 'Parcela Cartão' },
  'PS': { bandeira: 'PIX',    modalidade: 'PIX',     descricao: 'Pix Santander' },
};

export function resolveProdutoGetnet(codigo: string, cartao?: string): ProdutoInfo {
  const code = (codigo || '').trim().toUpperCase();
  if (GETNET_PRODUTOS[code]) {
    return GETNET_PRODUTOS[code]!;
  }
  // Fallback por BIN de cartão
  const digits = (cartao || '').replace(/\D/g, '');
  if (digits.startsWith('4')) {
    return { bandeira: 'VISA', modalidade: 'CREDITO', descricao: `Visa (${code})` };
  }
  if (/^(5[1-5]|2[2-7])/.test(digits)) {
    return { bandeira: 'MASTER', modalidade: 'CREDITO', descricao: `Mastercard (${code})` };
  }
  if (/^(65|506|509|6011)/.test(digits)) {
    return { bandeira: 'ELO', modalidade: 'CREDITO', descricao: `Elo (${code})` };
  }
  return { bandeira: 'OUTROS', modalidade: 'CREDITO', descricao: `Outros (${code || 'IND'})` };
}

// ── Funções Utilitárias Posicionais ──────────────────────────────────

/** Extrai substring usando índices 1-based (conforme documentação oficial Getnet) */
function sub(line: string, ini: number, fim: number): string {
  if (!line || line.length < ini) return '';
  return line.substring(ini - 1, fim);
}

function subTrim(line: string, ini: number, fim: number): string {
  return sub(line, ini, fim).trim();
}

function subInt(line: string, ini: number, fim: number): number {
  const s = subTrim(line, ini, fim);
  if (!s) return 0;
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

/** Formato implícito 2 decimais: "000000008637" -> 86.37 */
function subCur(line: string, ini: number, fim: number): number {
  const s = subTrim(line, ini, fim);
  if (!s) return 0;
  const n = parseInt(s, 10);
  if (isNaN(n)) return 0;
  return Math.round(n) / 100;
}

/** DDMMAAAA -> YYYY-MM-DD */
function parseDateEdi(s: string): string {
  const clean = s.trim();
  if (clean.length === 8 && /^\d{8}$/.test(clean)) {
    const dia = clean.substring(0, 2);
    const mes = clean.substring(2, 4);
    const ano = clean.substring(4, 8);
    return `${ano}-${mes}-${dia}`;
  }
  return '';
}

/** HHMMSS -> HH:MM:SS */
function parseTimeEdi(s: string): string {
  const clean = s.trim();
  if (clean.length === 6 && /^\d{6}$/.test(clean)) {
    const h = clean.substring(0, 2);
    const m = clean.substring(2, 4);
    const sec = clean.substring(4, 6);
    return `${h}:${m}:${sec}`;
  }
  return '00:00:00';
}

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

// ── Parser Principal do Arquivo EDI ───────────────────────────────────

export function parseGetnetEdiFile(content: string, filename = 'extrato_getnet.txt'): GetnetEdiResult {
  const rawLines = content.split(/\r?\n/);
  const lines = rawLines.filter((l) => l.trim().length > 0);

  let header: GetnetEdiHeader | null = null;
  let trailer: GetnetEdiTrailer | null = null;
  const rvs: GetnetEdiRV[] = [];
  const cvs: GetnetEdiCV[] = [];
  const ajustes: GetnetEdiAjuste[] = [];
  const antecipacoes: GetnetEdiAntecipacao[] = [];
  const cessoes: GetnetEdiCessao[] = [];
  const urs: GetnetEdiUR[] = [];

  const rvByNumber = new Map<string, GetnetEdiRV>();

  for (const line of lines) {
    const tipo = line.charAt(0);

    switch (tipo) {
      case '0': {
        header = {
          tipo: '0',
          dataCriacao:      parseDateEdi(sub(line, 2, 9)),
          horaCriacao:      parseTimeEdi(sub(line, 10, 15)),
          dataMovimento:    parseDateEdi(sub(line, 16, 23)),
          arquivoVersao:    subTrim(line, 24, 31),
          ec:               subTrim(line, 32, 46),
          cnpjAdquirente:   subTrim(line, 47, 60),
          nomeAdquirente:   subTrim(line, 61, 80),
          sequencia:        subTrim(line, 81, 89),
          codigoAdquirente: subTrim(line, 90, 91),
          versaoLayout:     subTrim(line, 92, 116),
        };
        break;
      }

      case '1': {
        const codigoProduto = subTrim(line, 17, 18);
        const prodInfo = resolveProdutoGetnet(codigoProduto);
        const numeroRV = subTrim(line, 22, 30);
        const sinal = subTrim(line, 286, 286) || '+';
        let valorLiquido = subCur(line, 97, 108);
        if (sinal === '-') valorLiquido = -valorLiquido;

        const rv: GetnetEdiRV = {
          tipo: '1',
          ec:                subTrim(line, 2, 16),
          codigoProduto,
          bandeira:          prodInfo.bandeira,
          modalidade:        prodInfo.modalidade,
          descricaoProduto:  prodInfo.descricao,
          formaCaptura:      subTrim(line, 19, 21),
          numeroRV,
          dataRV:            parseDateEdi(sub(line, 31, 38)),
          dataPagamento:     parseDateEdi(sub(line, 39, 46)),
          banco:             subTrim(line, 47, 49),
          agencia:           subTrim(line, 50, 55),
          contaCorrente:     subTrim(line, 56, 66),
          cvsAceitos:        subInt(line, 67, 75),
          cvsRejeitados:     subInt(line, 76, 84),
          valorBruto:        subCur(line, 85, 96),
          valorLiquido,
          valorTarifa:       subCur(line, 109, 120),
          valorTaxaDesconto: subCur(line, 121, 132),
          valorRejeitado:    subCur(line, 133, 144),
          valorCredito:      subCur(line, 145, 156),
          valorEncargos:     subCur(line, 157, 168),
          tipoPagamento:     subTrim(line, 169, 170), // PF, LQ, PG, AC...
          parcelaRV:         subInt(line, 171, 172),
          totalParcelasRV:   subInt(line, 173, 174),
          ecCentralizador:   subTrim(line, 175, 189),
          sinal,
          tipoConta:         subTrim(line, 287, 288),
          contaPagamento:    subTrim(line, 289, 308),
        };
        rvs.push(rv);
        rvByNumber.set(numeroRV, rv);
        break;
      }

      case '2': {
        const numeroRV = subTrim(line, 17, 25);
        const parentRV = rvByNumber.get(numeroRV);
        const nsuRaw = subTrim(line, 26, 37);
        const nsu = nsuRaw.replace(/^0+/, '') || nsuRaw;
        const autRaw = subTrim(line, 131, 140);
        const autorizacao = autRaw.replace(/^0+/, '') || autRaw;
        const cartao = subTrim(line, 52, 70);
        const prodInfo = parentRV
          ? { bandeira: parentRV.bandeira, modalidade: parentRV.modalidade }
          : resolveProdutoGetnet('', cartao);

        const dataTx = parseDateEdi(sub(line, 38, 45));
        const horaTx = parseTimeEdi(sub(line, 46, 51));
        const sinal = subTrim(line, 172, 172) || '+';
        let valorTx = subCur(line, 71, 82);
        if (sinal === '-') valorTx = -valorTx;

        const ec = subTrim(line, 2, 16);
        const cv: GetnetEdiCV = {
          tipo: '2',
          ec,
          numeroRV,
          nsu,
          nsuRaw,
          dataTransacao:     dataTx,
          horaTransacao:     horaTx,
          dataHoraTransacao: `${dataTx}T${horaTx}`,
          cartao,
          valorTransacao:    valorTx,
          valorSaque:        subCur(line, 83, 94),
          valorTaxaEmbarque: subCur(line, 95, 106),
          totalParcelas:     subInt(line, 107, 108) || 1,
          numeroParcela:     subInt(line, 109, 110) || 1,
          valorParcela:      subCur(line, 111, 122),
          dataPagamento:     parseDateEdi(sub(line, 123, 130)),
          autorizacao,
          autorizacaoRaw:    autRaw,
          formaCaptura:      subTrim(line, 141, 143) || (parentRV?.formaCaptura ?? 'TEF'),
          statusTransacao:   subTrim(line, 144, 144),
          status:            subTrim(line, 144, 144) === 'C' ? 'APROVADA' : 'OUTRO',
          ecCentralizador:   subTrim(line, 145, 159),
          terminal:          subTrim(line, 160, 167),
          moeda:             subTrim(line, 168, 170) || '986',
          emissor:           subTrim(line, 171, 171),
          sinal,
          carteiraDigital:   subTrim(line, 173, 175),
          valorComissao:     subCur(line, 176, 187), // MDR
          bandeira:          prodInfo.bandeira,
          modalidade:        prodInfo.modalidade,
          idempotencyKey:    `GETNET::${ec}::${nsu}`,
        };
        cvs.push(cv);
        break;
      }

      case '3': {
        ajustes.push({
          tipo: '3',
          ec:                     subTrim(line, 2, 16),
          numeroRVAjustado:       subTrim(line, 17, 25),
          dataRV:                 parseDateEdi(sub(line, 26, 33)),
          dataPagamento:          parseDateEdi(sub(line, 34, 41)),
          identificadorAjuste:    subTrim(line, 42, 61),
          sinalAjuste:            subTrim(line, 63, 63) || '+',
          valorAjuste:            subCur(line, 64, 75),
          motivoAjuste:           subTrim(line, 76, 77),
          dataCarta:              parseDateEdi(sub(line, 78, 85)),
          cartao:                 subTrim(line, 86, 104),
          numeroRVOriginal:       subTrim(line, 105, 113),
          nsuOriginal:            subTrim(line, 114, 125),
          dataTransacaoOriginal:  parseDateEdi(sub(line, 126, 133)),
          tipoPagamento:          subTrim(line, 134, 135),
          terminal:               subTrim(line, 136, 143),
          dataPagamentoOriginal:  parseDateEdi(sub(line, 144, 151)),
          valorComissao:          subCur(line, 155, 166),
        });
        break;
      }

      case '4': {
        antecipacoes.push({
          tipo: '4',
          ec:              subTrim(line, 2, 16),
          dataOperacao:    parseDateEdi(sub(line, 17, 24)),
          dataCredito:     parseDateEdi(sub(line, 25, 32)),
          numeroOperacao:  subTrim(line, 33, 47),
          valorBruto:      subCur(line, 48, 59),
          valorTaxa:       subCur(line, 60, 71),
          valorLiquido:    subCur(line, 72, 83),
          taxaMensal:      subCur(line, 84, 94),
          ecCentralizador: subTrim(line, 95, 109),
          banco:           subTrim(line, 110, 112),
          agencia:         subTrim(line, 113, 118),
          conta:           subTrim(line, 119, 129),
          canal:           subTrim(line, 130, 132),
          tipoPagamento:   subTrim(line, 133, 134),
        });
        break;
      }

      case '5': {
        cessoes.push({
          tipo: '5',
          ec:                    subTrim(line, 2, 16),
          dataOperacao:          parseDateEdi(sub(line, 17, 24)),
          dataCredito:           parseDateEdi(sub(line, 25, 32)),
          numeroOperacao:        subTrim(line, 33, 52),
          tipoOperacao:          subTrim(line, 53, 54),
          valorBrutoTotal:       subCur(line, 55, 66),
          valorBrutoAdquirencia: subCur(line, 67, 78),
          valorCusto:            subCur(line, 79, 90),
          valorLiquido:          subCur(line, 91, 102),
          tipoMovimento:         subTrim(line, 148, 148),
          cnpjParticipante:      subTrim(line, 171, 184),
          banco:                 subTrim(line, 187, 189),
          agencia:               subTrim(line, 190, 195),
          conta:                 subTrim(line, 196, 215),
        });
        break;
      }

      case '6': {
        urs.push({
          tipo: '6',
          ec:                    subTrim(line, 2, 16),
          dataOperacao:          parseDateEdi(sub(line, 17, 24)),
          numeroOperacao:        subTrim(line, 25, 44),
          tipoOperacao:          subTrim(line, 45, 46),
          chaveUR:               subTrim(line, 47, 64),
          codigoProduto:         subTrim(line, 65, 66),
          dataVencimentoUR:      parseDateEdi(sub(line, 67, 74)),
          valorBrutoTotal:       subCur(line, 75, 86),
          valorBrutoAdquirencia: subCur(line, 87, 98),
          valorCusto:            subCur(line, 99, 110),
          valorLiquido:          subCur(line, 111, 122),
          tipoMovimento:         subTrim(line, 154, 154),
          banco:                 subTrim(line, 190, 192),
          agencia:               subTrim(line, 193, 198),
          conta:                 subTrim(line, 199, 218),
        });
        break;
      }

      case '9': {
        trailer = {
          tipo: '9',
          totalRegistros: subInt(line, 2, 10),
        };
        break;
      }
    }
  }

  // ── Auditoria Matemática RV × CV ───────────────────────────────────

  let somaBrutoRVs = 0;
  let somaMdrRVs = 0;
  let somaLiquidoRVs = 0;

  for (const rv of rvs) {
    somaBrutoRVs += rv.valorBruto;
    somaMdrRVs += rv.valorTaxaDesconto;
    somaLiquidoRVs += rv.valorLiquido;
  }

  let somaBrutoCVs = 0;
  let somaMdrCVs = 0;
  const cvsPorRV = new Map<string, number>();

  for (const cv of cvs) {
    somaBrutoCVs += cv.valorTransacao;
    somaMdrCVs += cv.valorComissao;
    const prev = cvsPorRV.get(cv.numeroRV) ?? 0;
    cvsPorRV.set(cv.numeroRV, round2(prev + cv.valorTransacao));
  }

  somaBrutoRVs = round2(somaBrutoRVs);
  somaMdrRVs = round2(somaMdrRVs);
  somaLiquidoRVs = round2(somaLiquidoRVs);
  somaBrutoCVs = round2(somaBrutoCVs);
  somaMdrCVs = round2(somaMdrCVs);

  const difBruto = round2(somaBrutoRVs - somaBrutoCVs);
  const difMdr = round2(somaMdrRVs - somaMdrCVs);

  const rvsDetalhamento = rvs.map((rv) => {
    const brutoCV = cvsPorRV.get(rv.numeroRV) ?? 0;
    const dif = round2(rv.valorBruto - brutoCV);
    return {
      rv: rv.numeroRV,
      brutoRV: rv.valorBruto,
      brutoCV,
      dif,
      status: Math.abs(dif) <= 0.01 ? ('OK' as const) : ('DIVERGENTE' as const),
    };
  });

  const auditoria: GetnetEdiAuditoria = {
    totalLinhas: lines.length,
    totalRVs: rvs.length,
    totalCVs: cvs.length,
    somaBrutoRVs,
    somaBrutoCVs,
    difBruto,
    somaMdrRVs,
    somaMdrCVs,
    difMdr,
    somaLiquidoRVs,
    auditoriaBatida: Math.abs(difBruto) <= 0.01 && Math.abs(difMdr) <= 0.01,
    rvsDetalhamento,
  };

  // ── Mapeamento para GetnetVenda (Formato padrão ThemisFlow) ─────────

  const vendas: GetnetVenda[] = cvs.map((cv) => {
    const parentRV = rvByNumber.get(cv.numeroRV);
    const taxaNegativa = cv.valorComissao > 0 ? -cv.valorComissao : 0;
    const liq = round2(cv.valorTransacao + taxaNegativa);

    return {
      idempotencyKey:   cv.idempotencyKey,
      gateway:          'GETNET',
      ec:               cv.ec,
      cnpj:             header?.cnpjAdquirente ?? '',
      bandeira:         cv.bandeira,
      bandeiraBruta:    parentRV?.descricaoProduto ?? cv.bandeira,
      modalidade:       cv.modalidade,
      formaPagamento:   parentRV?.descricaoProduto ?? cv.formaCaptura,
      dataHoraVenda:    cv.dataHoraTransacao,
      status:           cv.status,
      parcelas:         cv.totalParcelas,
      dataPrimeiroPgto: cv.dataPagamento || null,
      cartaoMascarado:  cv.cartao,
      autorizacao:      cv.autorizacao,
      nsu:              cv.nsu,
      terminal:         cv.terminal,
      meioCaptura:      cv.formaCaptura,
      valorBruto:       cv.valorTransacao,
      valorTaxa:        taxaNegativa,
      valorLiquido:     liq,
    };
  });

  // ── Mapeamento para GetnetRecebivel (Liquidação / Pagamento Efetivo) ─

  const recebiveis: GetnetRecebivel[] = [];

  for (const rv of rvs) {
    // RVs liquidados (LQ / PG) ou com previsão (PF)
    const isLiquidado = rv.tipoPagamento === 'LQ' || rv.tipoPagamento === 'PG';
    const tipoLancamento = isLiquidado ? 'PAGAMENTO_REALIZADO' : 'PREVISAO';
    const chaveIdemp = `GETNET::${rv.ec}::${rv.numeroRV}::${rv.dataPagamento}::${rv.codigoProduto}`;

    recebiveis.push({
      idempotencyKey:  chaveIdemp,
      gateway:         'GETNET',
      ec:              rv.ec,
      ecCentralizador: rv.ecCentralizador || rv.ec,
      cnpj:            header?.cnpjAdquirente ?? '',
      dataVencimento:  rv.dataPagamento,
      bandeira:        rv.bandeira,
      modalidade:      rv.modalidade,
      tipoLancamento,
      lancamento:      `${rv.descricaoProduto} (${rv.tipoPagamento}) - Banco ${rv.banco} Ag ${rv.agencia} CC ${rv.contaCorrente}`,
      valorLiquido:    rv.valorLiquido,
      valorLiquidado:  isLiquidado ? rv.valorLiquido : 0,
      cartaoMascarado: null,
      autorizacao:     null,
      nsu:             null,
      terminal:        null,
      dataVenda:       rv.dataRV,
      horaVenda:       null,
      valorVenda:      rv.valorBruto,
      descontos:       rv.valorTaxaDesconto > 0 ? -rv.valorTaxaDesconto : 0,
      parcelasInfo:    `${rv.parcelaRV}/${rv.totalParcelasRV}`,
    });
  }

  return {
    file: filename,
    gateway: 'GETNET',
    header,
    trailer,
    rvs,
    cvs,
    ajustes,
    antecipacoes,
    cessoes,
    urs,
    auditoria,
    vendas,
    recebiveis,
  };
}
