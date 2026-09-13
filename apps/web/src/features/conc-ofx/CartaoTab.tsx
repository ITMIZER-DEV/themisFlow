import type { CartaoMatch } from '../../stores/concOFXStore';

const fmtVal  = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (s: string) => s.slice(8, 10) + '/' + s.slice(5, 7);

const STATUS_LABEL: Record<string, string> = {
  CONCILIADO:  '✓ Conciliado',
  SO_OFX:      'Só no OFX',
  SO_SISTEMA:  'Só no sistema',
  DIVERGENTE:  'Divergente',
};
const STATUS_COR: Record<string, string> = {
  CONCILIADO:  'var(--teal)',
  SO_OFX:      'var(--gold)',
  SO_SISTEMA:  '#7b8fcc',
  DIVERGENTE:  'var(--red)',
};

interface Props { matches: CartaoMatch[] }

export function CartaoTab({ matches }: Props) {
  if (matches.length === 0) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem' }}>
        Nenhum lançamento de cartão no período. Execute a conciliação primeiro.
      </div>
    );
  }

  const conciliados = matches.filter(m => m.status === 'CONCILIADO').length;
  const soOFX       = matches.filter(m => m.status === 'SO_OFX').length;
  const soSistema   = matches.filter(m => m.status === 'SO_SISTEMA').length;
  const divergentes = matches.filter(m => m.status === 'DIVERGENTE').length;

  return (
    <div>
      {/* Resumo */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        {[
          { label: 'Conciliado',    val: conciliados, cor: 'var(--teal)' },
          { label: 'Divergente',    val: divergentes, cor: 'var(--red)'  },
          { label: 'Só no OFX',     val: soOFX,       cor: 'var(--gold)' },
          { label: 'Só no sistema', val: soSistema,   cor: '#7b8fcc'     },
        ].map(({ label, val, cor }) => (
          <div key={label} style={{
            background: 'var(--panel)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '8px 16px', fontSize: '0.75rem',
          }}>
            <span style={{ color: 'var(--muted)' }}>{label}: </span>
            <span style={{ fontWeight: 700, color: cor }}>{val}</span>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ background: 'var(--panel-alt)', borderBottom: '1px solid var(--border)' }}>
              {['Data', 'Bandeira', 'MEMO (OFX)', 'Valor OFX', 'Itens', 'Valor Sistema', 'Diferença', 'Status'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matches.map(m => (
              <tr
                key={m.id}
                style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--panel-alt)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-soft)' }}>
                  {fmtDate(m.data)}
                </td>
                <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text)' }}>
                  {m.bandeira === '?' ? (
                    <span style={{ color: 'var(--muted)' }}>
                      {m.ofxBandeira ?? '—'}
                      <span style={{ fontSize: '0.65rem', marginLeft: 4, color: 'var(--gold)' }}>não ident.</span>
                    </span>
                  ) : m.bandeira}
                </td>
                <td style={{ padding: '10px 14px', color: 'var(--muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.ofx?.memo ?? '—'}
                </td>
                <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--gold)', fontWeight: 600 }}>
                  {m.ofx ? fmtVal(m.ofx.amount) : '—'}
                </td>
                <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-soft)', textAlign: 'center' }}>
                  {m.sistema?.qtdItens ?? '—'}
                </td>
                <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--gold)', fontWeight: 600 }}>
                  {m.sistema ? fmtVal(m.sistema.totalLiquido) : '—'}
                </td>
                <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: m.diferenca > 0 ? 'var(--red)' : 'var(--muted)' }}>
                  {m.diferenca > 0 ? fmtVal(m.diferenca) : '—'}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: STATUS_COR[m.status] }}>
                    {STATUS_LABEL[m.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
