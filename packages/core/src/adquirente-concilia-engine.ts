/**
 * Engine de conciliação: AdquirenteVenda × SitefTransacao.
 *
 * Match em cascata (ordem de prioridade):
 *   1. nsu == nsuHost  AND  terminal == terminalLogico          (forte)
 *   2. nsu == nsuHost  AND  autorizacao == autorizacao          (médio)
 *   3. autorizacao == autorizacao  AND  terminal == terminalLogico (fallback A)
 *   4. autorizacao == autorizacao  (sozinho — fallback final)
 *
 * Status de conciliação:
 *   CONCILIADO   — par encontrado, valores iguais (tolerância R$0,05)
 *   DIVERGENTE   — par encontrado, mas valor difere acima da tolerância
 *   SEM_SITEF    — gateway registrou a venda, SITEF não tem
 *   SEM_ADQ      — SITEF tem a transação, gateway não registrou
 */

export type StatusConc = 'PENDENTE' | 'CONCILIADO' | 'DIVERGENTE' | 'SEM_SITEF' | 'SEM_ADQ';

export type MatchVia =
  | 'NSU_TERMINAL'
  | 'NSU_AUTORIZACAO'
  | 'AUTORIZACAO_TERMINAL'
  | 'AUTORIZACAO';

export interface VendaInput {
  idempotencyKey: string;
  nsu:            string;
  autorizacao:    string;
  terminal:       string;
  valorBruto:     number;
  dataHoraVenda:  string;
}

export interface SitefInput {
  idempotencyKey: string;
  nsu:            string;
  nsuHost:        string;
  autorizacao:    string;
  terminalLogico: string;
  valor:          number;
  dataDia:        string;
}

export interface ResultVenda {
  vendaKey:   string;
  sitefKey:   string | null;
  matchVia:   MatchVia | null;
  status:     StatusConc;
  difValor:   number;
}

export interface ResultSitef {
  sitefKey: string;
  vendaKey: string | null;
  status:   StatusConc;
}

export interface ConciliacaoResult {
  vendas:   ResultVenda[];
  sitef:    ResultSitef[];
  resumo: {
    conciliados:  number;
    divergentes:  number;
    semSitef:     number;
    semAdq:       number;
  };
}

/** Tolerância de valor: diferença < R$0,05 é considerada igual */
const TOLERANCIA = 0.05;

function buildSitefIndexes(sitefs: SitefInput[]) {
  const byNsuTerminal    = new Map<string, SitefInput>();
  const byNsuAutorizacao = new Map<string, SitefInput>();
  const byAutTerminal    = new Map<string, SitefInput>();
  const byAutorizacao    = new Map<string, SitefInput>();

  for (const s of sitefs) {
    const kNsuT = `${s.nsuHost}::${s.terminalLogico}`;
    const kNsuA = `${s.nsuHost}::${s.autorizacao}`;
    const kAuT  = `${s.autorizacao}::${s.terminalLogico}`;
    const kAu   = s.autorizacao;

    if (s.nsuHost && s.terminalLogico && !byNsuTerminal.has(kNsuT))
      byNsuTerminal.set(kNsuT, s);
    if (s.nsuHost && s.autorizacao && !byNsuAutorizacao.has(kNsuA))
      byNsuAutorizacao.set(kNsuA, s);
    if (s.autorizacao && s.terminalLogico && !byAutTerminal.has(kAuT))
      byAutTerminal.set(kAuT, s);
    if (s.autorizacao && !byAutorizacao.has(kAu))
      byAutorizacao.set(kAu, s);
  }

  return { byNsuTerminal, byNsuAutorizacao, byAutTerminal, byAutorizacao };
}

export function conciliaAdquirenteComSitef(
  vendas:  VendaInput[],
  sitefs:  SitefInput[],
): ConciliacaoResult {
  const idx = buildSitefIndexes(sitefs);
  const sitefMatchados = new Set<string>();

  const resultVendas: ResultVenda[] = vendas.map(v => {
    let sit: SitefInput | undefined;
    let matchVia: MatchVia | null = null;

    // Cascata de match
    if (!sit && v.nsu && v.terminal) {
      sit = idx.byNsuTerminal.get(`${v.nsu}::${v.terminal}`);
      if (sit) matchVia = 'NSU_TERMINAL';
    }
    if (!sit && v.nsu && v.autorizacao) {
      sit = idx.byNsuAutorizacao.get(`${v.nsu}::${v.autorizacao}`);
      if (sit) matchVia = 'NSU_AUTORIZACAO';
    }
    if (!sit && v.autorizacao && v.terminal) {
      sit = idx.byAutTerminal.get(`${v.autorizacao}::${v.terminal}`);
      if (sit) matchVia = 'AUTORIZACAO_TERMINAL';
    }
    if (!sit && v.autorizacao) {
      sit = idx.byAutorizacao.get(v.autorizacao);
      if (sit) matchVia = 'AUTORIZACAO';
    }

    if (!sit) {
      return { vendaKey: v.idempotencyKey, sitefKey: null, matchVia: null, status: 'SEM_SITEF', difValor: 0 };
    }

    sitefMatchados.add(sit.idempotencyKey);
    const dif    = v.valorBruto - sit.valor;
    const status: StatusConc = Math.abs(dif) <= TOLERANCIA ? 'CONCILIADO' : 'DIVERGENTE';

    return { vendaKey: v.idempotencyKey, sitefKey: sit.idempotencyKey, matchVia, status, difValor: dif };
  });

  const resultSitef: ResultSitef[] = sitefs.map(s => {
    if (sitefMatchados.has(s.idempotencyKey)) {
      const venda = resultVendas.find(rv => rv.sitefKey === s.idempotencyKey);
      return { sitefKey: s.idempotencyKey, vendaKey: venda?.vendaKey ?? null, status: 'CONCILIADO' };
    }
    return { sitefKey: s.idempotencyKey, vendaKey: null, status: 'SEM_ADQ' };
  });

  return {
    vendas: resultVendas,
    sitef:  resultSitef,
    resumo: {
      conciliados: resultVendas.filter(r => r.status === 'CONCILIADO').length,
      divergentes: resultVendas.filter(r => r.status === 'DIVERGENTE').length,
      semSitef:    resultVendas.filter(r => r.status === 'SEM_SITEF').length,
      semAdq:      resultSitef.filter(r => r.status === 'SEM_ADQ').length,
    },
  };
}

// ── Rastreio analítico (Fluxo 2 — triple join) ────────────────────

export type TipoDivergencia =
  | 'VALOR_VENDA_SITEF'
  | 'AUTORIZACAO_MISMATCH'
  | 'TERMINAL_MISMATCH'
  | 'NSU_MISMATCH'
  | 'REC_SOMA_MISMATCH'
  | 'REC_PARCELAS_MISMATCH';

export interface DivergenciaItem {
  tipo:       TipoDivergencia;
  campo:      string;
  esperado:   string;
  encontrado: string;
  dif?:       number;
}

export type StatusTriplo =
  | 'TRIPLO_OK'
  | 'SEM_RECEBIVEL'
  | 'SEM_SITEF'
  | 'PENDENTE'
  | 'DIVERGENTE';

export interface RastreioVendaInput {
  idempotencyKey: string;
  nsu:            string;
  autorizacao:    string;
  terminal:       string;
  valorBruto:     number;
  valorLiquido:   number;
  parcelas:       number;
}

export interface RastreioSitefInput {
  idempotencyKey: string;
  nsu:            string;
  nsuHost:        string;
  autorizacao:    string;
  terminalLogico: string;
  valor:          number;
}

export interface RastreioRecebivelInput {
  idempotencyKey: string;
  nsu:            string | null;
  autorizacao:    string | null;
  valorLiquido:   number;
  parcelasInfo:   string | null;
}

export interface RastreioResult {
  vendaKey:      string;
  statusTriplo:  StatusTriplo;
  matchVia:      MatchVia | null;
  divergencias:  DivergenciaItem[];
  sitefKey:      string | null;
  recebiveisKeys: string[];
}

/**
 * Analisa a qualidade do match entre Venda, SITEF e Recebiveis.
 * Retorna divergências campo a campo para exibição analítica.
 */
export function rastreiaTransacao(
  venda:      RastreioVendaInput,
  sitef:      RastreioSitefInput | null,
  recebiveis: RastreioRecebivelInput[],
): RastreioResult {
  const divs: DivergenciaItem[] = [];
  let matchVia: MatchVia | null = null;

  // ── Análise Venda × SITEF ─────────────────────────────────────
  if (sitef) {
    // Determina via qual campo foi feito o match
    if (venda.nsu === sitef.nsuHost && venda.terminal === sitef.terminalLogico)
      matchVia = 'NSU_TERMINAL';
    else if (venda.nsu === sitef.nsuHost && venda.autorizacao === sitef.autorizacao)
      matchVia = 'NSU_AUTORIZACAO';
    else if (venda.autorizacao === sitef.autorizacao && venda.terminal === sitef.terminalLogico)
      matchVia = 'AUTORIZACAO_TERMINAL';
    else
      matchVia = 'AUTORIZACAO';

    // Valor
    const difValor = Math.abs(venda.valorBruto - sitef.valor);
    if (difValor > 0.05) {
      divs.push({
        tipo: 'VALOR_VENDA_SITEF', campo: 'valorBruto',
        esperado: venda.valorBruto.toFixed(2),
        encontrado: sitef.valor.toFixed(2),
        dif: venda.valorBruto - sitef.valor,
      });
    }

    // Autorizacao
    if (venda.autorizacao && sitef.autorizacao && venda.autorizacao !== sitef.autorizacao) {
      divs.push({
        tipo: 'AUTORIZACAO_MISMATCH', campo: 'autorizacao',
        esperado: venda.autorizacao, encontrado: sitef.autorizacao,
      });
    }

    // Terminal
    if (venda.terminal && sitef.terminalLogico && venda.terminal !== sitef.terminalLogico) {
      divs.push({
        tipo: 'TERMINAL_MISMATCH', campo: 'terminal',
        esperado: venda.terminal, encontrado: sitef.terminalLogico,
      });
    }

    // NSU
    if (venda.nsu && sitef.nsuHost && venda.nsu !== sitef.nsuHost) {
      divs.push({
        tipo: 'NSU_MISMATCH', campo: 'nsuHost',
        esperado: venda.nsu, encontrado: sitef.nsuHost,
      });
    }
  }

  // ── Análise Venda × Recebiveis ────────────────────────────────
  if (recebiveis.length > 0) {
    const somaRec = recebiveis.reduce((a, r) => a + r.valorLiquido, 0);
    const difRec  = Math.abs(somaRec - venda.valorLiquido);
    if (difRec > 0.05) {
      divs.push({
        tipo: 'REC_SOMA_MISMATCH', campo: 'valorLiquido',
        esperado: venda.valorLiquido.toFixed(2),
        encontrado: somaRec.toFixed(2),
        dif: somaRec - venda.valorLiquido,
      });
    }

    // Parcelas esperadas vs encontradas
    const parcelasRec = recebiveis.filter(r =>
      r.parcelasInfo != null && /\d+\s+de\s+\d+/i.test(r.parcelasInfo)
    ).length;
    if (venda.parcelas > 1 && parcelasRec > 0 && parcelasRec !== venda.parcelas) {
      divs.push({
        tipo: 'REC_PARCELAS_MISMATCH', campo: 'parcelas',
        esperado: String(venda.parcelas),
        encontrado: String(parcelasRec),
      });
    }
  }

  // ── Status Triplo ─────────────────────────────────────────────
  const temSitef = sitef !== null;
  const temRec   = recebiveis.length > 0;
  let statusTriplo: StatusTriplo;

  if (!temSitef && !temRec) {
    statusTriplo = 'PENDENTE';
  } else if (!temSitef) {
    statusTriplo = 'SEM_SITEF';
  } else if (!temRec) {
    statusTriplo = 'SEM_RECEBIVEL';
  } else if (divs.length > 0) {
    statusTriplo = 'DIVERGENTE';
  } else {
    statusTriplo = 'TRIPLO_OK';
  }

  return {
    vendaKey:       venda.idempotencyKey,
    statusTriplo,
    matchVia,
    divergencias:   divs,
    sitefKey:       sitef?.idempotencyKey ?? null,
    recebiveisKeys: recebiveis.map(r => r.idempotencyKey),
  };
}
