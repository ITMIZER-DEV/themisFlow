/**
 * @themisflow/core — Exports públicos
 * Núcleo de negócio da conciliação bancária.
 * Zero dependências de DOM, IndexedDB ou Node.js — importável no browser e no servidor.
 */

// OFX Parser (R1–R6)
export {
  r2,
  decodeBuffer,
  parseDt,
  parseAmt,
  trnId,
  parseOFX,
} from './ofx-parser.js';
export type { OFXTransaction, OFXStatement } from './ofx-parser.js';

// Balance Engine (R7–R9)
export {
  computeDays,
  balanceAt,
  balanceBefore,
} from './balance-engine.js';
export type { DayItem, DayRow, DayComputed, AccInput } from './balance-engine.js';

// System XLS Parser (R10–R14)
export {
  parseSystemRows,
  dayIntegrity,
} from './system-xls-parser.js';
export type {
  SystemItem,
  SystemDay,
  SystemStatement,
  IntegrityResult,
} from './system-xls-parser.js';

// Match Engine (R15–R19)
export {
  dayDiffISO,
  matchEngine,
  groupEngine,
} from './match-engine.js';
export type { MatchPair, MatchGroup, MatchResult } from './match-engine.js';

// SITEF Parser (R22–R24)
export { parseSitefRows } from './sitef-parser.js';
export type {
  SitefTransacao,
  SitefResult,
  SitefEstado,
  SitefTipoProduto,
} from './sitef-parser.js';

// Getnet — Vendas_Detalhado
export { parseGetnetVendasRows } from './getnet-vendas-parser.js';
export type { GetnetVenda, GetnetVendasResult } from './getnet-vendas-parser.js';

// Getnet — Recebivel_Completos
export { parseGetnetRecebiveisRows } from './getnet-recebiveis-parser.js';
export type { GetnetRecebivel, GetnetRecebiveisResult } from './getnet-recebiveis-parser.js';

// Getnet — Extrato Eletrônico EDI V.10 (400 bytes)
export {
  parseGetnetEdiFile,
  resolveProdutoGetnet,
} from './getnet-edi-parser.js';
export type {
  GetnetEdiHeader,
  GetnetEdiRV,
  GetnetEdiCV,
  GetnetEdiAjuste,
  GetnetEdiAntecipacao,
  GetnetEdiCessao,
  GetnetEdiUR,
  GetnetEdiTrailer,
  GetnetEdiAuditoria,
  GetnetEdiResult,
} from './getnet-edi-parser.js';

// Classificador de lançamentos OFX por biblioteca de padrões
export { classificarEntradas, testarTexto } from './ofx-classificador.js';
export type { TipoOfx, OfxPadraoLike, EntradaOFX, EntradaClassificada } from './ofx-classificador.js';

// Conciliação OFX × Adquirente (PIX + Cartão)
export { conciliaPixOfx, conciliaCartaoOfx, TOLERANCIA_PADRAO } from './ofx-adquirente-engine.js';
export type {
  StatusConcOFX,
  OFXCredito,
  SistemaPix,
  LiquidacaoCartao,
  PixMatch,
  CartaoMatch,
} from './ofx-adquirente-engine.js';

// Conciliação Adquirente × SITEF + Rastreio Analítico
export { conciliaAdquirenteComSitef, rastreiaTransacao } from './adquirente-concilia-engine.js';
export type {
  StatusConc,
  MatchVia,
  VendaInput,
  SitefInput,
  ResultVenda,
  ResultSitef,
  ConciliacaoResult,
  TipoDivergencia,
  DivergenciaItem,
  StatusTriplo,
  RastreioVendaInput,
  RastreioSitefInput,
  RastreioRecebivelInput,
  RastreioResult,
} from './adquirente-concilia-engine.js';

// Vouchers / Vales Alimentação e Refeição (Alelo, Sodexo, Ticket, VR)
export {
  parseAleloRows,
  parseSodexoRows,
  parseTicketRows,
  parseVrBeneficiosRows,
  parseSodexoRecebiveisRows,
} from './voucher-parser.js';
export type { VoucherVenda, VoucherResult } from './voucher-parser.js';

