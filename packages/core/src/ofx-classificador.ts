/**
 * Motor de classificação de lançamentos OFX usando a biblioteca de padrões.
 * Roda no browser e no servidor — zero dependências externas.
 */

export type TipoOfx = 'PIX' | 'CARTAO' | 'TARIFA' | 'TRANSFERENCIA' | 'OUTRO' | 'IGNORAR'

export interface OfxPadraoLike {
  id: number
  texto: string
  tipo: string
  bandeira: string | null
  banco: string | null
  prioridade: number
}

export interface EntradaOFX {
  fitid: string
  date: string
  amount: number
  memo: string
  name?: string
}

export interface EntradaClassificada extends EntradaOFX {
  tipo: TipoOfx | null
  bandeira: string | null
  padraoId: number | null
  classificado: boolean
}

/**
 * Classifica uma lista de entradas OFX usando os padrões fornecidos.
 *
 * Ordem de avaliação por prioridade (maior = primeiro):
 *  1. Padrões específicos do banco (banco === bancoId) + prioridade desc
 *  2. Padrões universais (banco === null) + prioridade desc
 *
 * Match: case-insensitive, substring no campo memo + name concatenados.
 */
export function classificarEntradas(
  entradas: EntradaOFX[],
  padroes: OfxPadraoLike[],
  bancoId?: string,
): EntradaClassificada[] {
  const ativos = padroes
    .filter(p => p.banco === null || p.banco === (bancoId ?? null))
    .sort((a, b) => {
      // Padrões específicos do banco ganham 1000 de bônus implícito
      const aBonus = a.banco !== null ? 1000 : 0
      const bBonus = b.banco !== null ? 1000 : 0
      return (b.prioridade + bBonus) - (a.prioridade + aBonus)
    })

  return entradas.map(entrada => {
    const haystack = `${entrada.memo} ${entrada.name ?? ''}`.toLowerCase()
    const match = ativos.find(p => haystack.includes(p.texto.toLowerCase()))

    if (!match) {
      return { ...entrada, tipo: null, bandeira: null, padraoId: null, classificado: false }
    }

    return {
      ...entrada,
      tipo: match.tipo as TipoOfx,
      bandeira: match.bandeira,
      padraoId: match.id,
      classificado: true,
    }
  })
}

/**
 * Testa um único texto e retorna o primeiro padrão que casaria.
 * Útil para o campo "Testar texto" da UI.
 */
export function testarTexto(
  texto: string,
  padroes: OfxPadraoLike[],
  bancoId?: string,
): OfxPadraoLike | null {
  const resultado = classificarEntradas(
    [{ fitid: '__test__', date: '', amount: 0, memo: texto }],
    padroes,
    bancoId,
  )
  if (!resultado[0].classificado) return null
  return padroes.find(p => p.id === resultado[0].padraoId) ?? null
}
