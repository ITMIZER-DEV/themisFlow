/**
 * Motor de conciliação OFX × Adquirente (Getnet).
 * Dois cruzamentos independentes:
 *   1. PIX:   créditos OFX tipo=PIX  × AdquirenteVenda modalidade=PIX
 *   2. Cartão: créditos OFX tipo=CARTAO × liquidações agrupadas (PAGAMENTO_REALIZADO)
 */

export const TOLERANCIA_PADRAO = 0.05

export type StatusConcOFX = 'CONCILIADO' | 'DIVERGENTE' | 'SO_OFX' | 'SO_SISTEMA'

// ── Tipos de entrada ───────────────────────────────────────────────

export interface OFXCredito {
  fitid:    string
  date:     string    // YYYY-MM-DD
  amount:   number    // sempre positivo (já filtrado antes de chamar o engine)
  memo:     string
  bandeira: string | null  // identificada pelo classificador; null = indefinida
  padraoId: number | null
}

export interface SistemaPix {
  idempotencyKey: string
  data:           string  // YYYY-MM-DD (date part of dataHoraVenda)
  valorLiquido:   number
  nsu:            string
  autorizacao:    string
}

export interface LiquidacaoCartao {
  data:         string   // YYYY-MM-DD (dataVencimento)
  bandeira:     string
  totalLiquido: number
  qtdItens:     number
}

// ── Tipos de resultado ─────────────────────────────────────────────

export interface PixMatch {
  id:       string
  data:     string
  ofx:      OFXCredito | null
  sistema:  SistemaPix | null
  status:   StatusConcOFX
  diferenca: number
}

export interface CartaoMatch {
  id:          string
  data:        string
  bandeira:    string          // bandeira do sistema (ou '?' se SO_OFX sem identificação)
  ofxBandeira: string | null   // bandeira identificada no padrão OFX
  ofx:         OFXCredito | null
  sistema:     LiquidacaoCartao | null
  status:      StatusConcOFX
  diferenca:   number
}

// ── conciliaPixOfx ─────────────────────────────────────────────────

/**
 * Cruza créditos OFX classificados como PIX com vendas PIX do Getnet.
 * Match: mesma data + valor dentro da tolerância (greedy 1:1).
 */
export function conciliaPixOfx(
  ofxCreditos: OFXCredito[],
  vendas: SistemaPix[],
  tolerancia = TOLERANCIA_PADRAO,
): PixMatch[] {
  const result: PixMatch[] = []
  const pool = [...vendas]

  for (const ofx of ofxCreditos) {
    const idx = pool.findIndex(
      v => v.data === ofx.date && Math.abs(v.valorLiquido - ofx.amount) <= tolerancia,
    )
    if (idx !== -1) {
      const v = pool.splice(idx, 1)[0]
      result.push({
        id: `ofx-${ofx.fitid}`,
        data: ofx.date,
        ofx,
        sistema: v,
        status: 'CONCILIADO',
        diferenca: 0,
      })
    } else {
      result.push({
        id: `ofx-${ofx.fitid}`,
        data: ofx.date,
        ofx,
        sistema: null,
        status: 'SO_OFX',
        diferenca: round2(ofx.amount),
      })
    }
  }

  for (const v of pool) {
    result.push({
      id: `sis-${v.idempotencyKey}`,
      data: v.data,
      ofx: null,
      sistema: v,
      status: 'SO_SISTEMA',
      diferenca: round2(v.valorLiquido),
    })
  }

  return result.sort((a, b) => a.data.localeCompare(b.data))
}

// ── conciliaCartaoOfx ──────────────────────────────────────────────

/**
 * Cruza créditos OFX classificados como CARTAO com liquidações do Getnet.
 * Match: mesma data + bandeira (se identificada no OFX) + valor dentro da tolerância.
 * Se o OFX não identificou bandeira, aceita qualquer liquidação na mesma data.
 */
export function conciliaCartaoOfx(
  ofxCreditos: OFXCredito[],
  liquidacoes: LiquidacaoCartao[],
  tolerancia = TOLERANCIA_PADRAO,
): CartaoMatch[] {
  const result: CartaoMatch[] = []
  const pool = [...liquidacoes]

  for (const ofx of ofxCreditos) {
    // Busca: mesma data, bandeira compatível (exata se conhecida, qualquer se null)
    const idx = pool.findIndex(l => {
      if (l.data !== ofx.date) return false
      if (ofx.bandeira && l.bandeira !== ofx.bandeira) return false
      return true
    })

    if (idx !== -1) {
      const l = pool.splice(idx, 1)[0]
      const dif = round2(Math.abs(l.totalLiquido - ofx.amount))
      result.push({
        id:          `ofx-${ofx.fitid}`,
        data:        ofx.date,
        bandeira:    l.bandeira,
        ofxBandeira: ofx.bandeira,
        ofx,
        sistema:     l,
        status:      dif <= tolerancia ? 'CONCILIADO' : 'DIVERGENTE',
        diferenca:   dif,
      })
    } else {
      result.push({
        id:          `ofx-${ofx.fitid}`,
        data:        ofx.date,
        bandeira:    ofx.bandeira ?? '?',
        ofxBandeira: ofx.bandeira,
        ofx,
        sistema:     null,
        status:      'SO_OFX',
        diferenca:   round2(ofx.amount),
      })
    }
  }

  for (const l of pool) {
    result.push({
      id:          `sis-${l.data}-${l.bandeira}`,
      data:        l.data,
      bandeira:    l.bandeira,
      ofxBandeira: null,
      ofx:         null,
      sistema:     l,
      status:      'SO_SISTEMA',
      diferenca:   round2(l.totalLiquido),
    })
  }

  return result.sort((a, b) => a.data.localeCompare(b.data) || a.bandeira.localeCompare(b.bandeira))
}

function round2(n: number) { return Math.round(n * 100) / 100 }
