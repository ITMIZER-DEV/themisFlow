import { useState } from 'react';
import { useConcOFXStore, type NaoClassificado } from '../../stores/concOFXStore';
import { TIPOS_OFX, BANDEIRAS, LABEL_TIPO } from '../../stores/ofxPadroesStore';

const fmtVal  = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (s: string) => s.slice(8, 10) + '/' + s.slice(5, 7);

// ── Linha com ação de classificar ─────────────────────────────────

interface RowProps { entry: NaoClassificado }

function NaoClassRow({ entry }: RowProps) {
  const { classificarLocal, salvarPadrao } = useConcOFXStore();
  const [aberto,      setAberto]      = useState(false);
  const [tipo,        setTipo]        = useState('OUTRO');
  const [bandeira,    setBandeira]    = useState('');
  const [salvar,      setSalvar]      = useState(true);
  const [textoRegra,  setTextoRegra]  = useState(entry.memo.trim().toUpperCase());
  const [salvando,    setSalvando]    = useState(false);
  const [erro,        setErro]        = useState('');

  async function confirmar() {
    setSalvando(true);
    setErro('');
    try {
      if (salvar && textoRegra) {
        await salvarPadrao(textoRegra, tipo, bandeira || null);
      }
      classificarLocal(entry.fitid, tipo, bandeira || null);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setErro(msg ?? (e as Error).message);
      setSalvando(false);
    }
  }

  return (
    <>
      <tr
        style={{ borderBottom: aberto ? 'none' : '1px solid var(--border)' }}
        onMouseEnter={e => { if (!aberto) e.currentTarget.style.background = 'var(--panel-alt)'; }}
        onMouseLeave={e => { if (!aberto) e.currentTarget.style.background = 'transparent'; }}
      >
        <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-soft)' }}>
          {fmtDate(entry.date)}
        </td>
        <td style={{ padding: '10px 14px', color: 'var(--text)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.memo}
        </td>
        <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: entry.amount >= 0 ? 'var(--teal)' : 'var(--red)' }}>
          {fmtVal(entry.amount)}
        </td>
        <td style={{ padding: '10px 14px' }}>
          <button
            className={`btn ${aberto ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '4px 12px', fontSize: '0.72rem' }}
            onClick={() => setAberto(o => !o)}
          >
            {aberto ? 'Fechar' : 'Classificar'}
          </button>
        </td>
      </tr>

      {aberto && (
        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--panel-alt)' }}>
          <td colSpan={4} style={{ padding: '12px 14px 16px' }}>
            {erro && <div className="alert alert-error" style={{ marginBottom: 10, fontSize: '0.75rem' }}>{erro}</div>}

            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 4 }}>Tipo</div>
                <select
                  value={tipo}
                  onChange={e => setTipo(e.target.value)}
                  style={{ padding: '6px 10px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  {TIPOS_OFX.map(t => <option key={t} value={t}>{LABEL_TIPO[t]}</option>)}
                </select>
              </div>

              {tipo === 'CARTAO' && (
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 4 }}>Bandeira</div>
                  <select
                    value={bandeira}
                    onChange={e => setBandeira(e.target.value)}
                    style={{ padding: '6px 10px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    <option value="">Nenhuma / Qualquer</option>
                    {BANDEIRAS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}

              <button
                className="btn btn-primary"
                style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                onClick={() => void confirmar()}
                disabled={salvando}
              >
                {salvando ? 'Salvando…' : 'Confirmar'}
              </button>
            </div>

            {/* Aprendizado */}
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: salvar ? 8 : 0 }}>
                <input
                  type="checkbox"
                  id={`salvar-${entry.fitid}`}
                  checked={salvar}
                  onChange={e => setSalvar(e.target.checked)}
                />
                <label htmlFor={`salvar-${entry.fitid}`} style={{ fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-soft)' }}>
                  Salvar como padrão — próximos lançamentos com esse texto serão classificados automaticamente
                </label>
              </div>
              {salvar && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Texto da regra:</span>
                  <input
                    value={textoRegra}
                    onChange={e => setTextoRegra(e.target.value.toUpperCase())}
                    style={{ padding: '4px 10px', background: 'var(--panel-alt)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', flex: 1 }}
                  />
                  <span style={{ fontSize: '0.68rem', color: 'var(--teal)', fontWeight: 600 }}>APRENDIDO</span>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Aba principal ──────────────────────────────────────────────────

interface Props { entries: NaoClassificado[] }

export function NaoClassificadoTab({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--teal)', fontSize: '0.8rem' }}>
        Todos os lançamentos foram classificados.
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 14, padding: '10px 14px', background: 'color-mix(in srgb, var(--gold) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--gold) 30%, transparent)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: 'var(--gold)' }}>
        {entries.length} lançamento(s) sem classificação. Identifique cada um para completar a conciliação — o sistema aprende as regras que você definir.
      </div>

      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ background: 'var(--panel-alt)', borderBottom: '1px solid var(--border)' }}>
              {['Data', 'MEMO / Descrição', 'Valor', 'Ação'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '.05em', textTransform: 'uppercase' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map(e => <NaoClassRow key={e.fitid} entry={e} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
