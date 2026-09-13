import { useEffect, useState } from 'react';
import {
  useOfxPadroesStore,
  TIPOS_OFX, BANDEIRAS, BANCOS,
  LABEL_TIPO, COR_TIPO,
  type OfxPadrao, type OfxPadraoInput, type TipoOfx,
} from '../../stores/ofxPadroesStore';
import { Modal, inputStyle, labelStyle, fieldStyle } from '../../components/Modal';

// ── Helpers ────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  ...inputStyle as React.CSSProperties,
  cursor: 'pointer',
};

function TipoBadge({ tipo }: { tipo: TipoOfx }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: '0.7rem',
      fontWeight: 700,
      letterSpacing: '.04em',
      background: `color-mix(in srgb, ${COR_TIPO[tipo]} 15%, transparent)`,
      color: COR_TIPO[tipo],
      border: `1px solid color-mix(in srgb, ${COR_TIPO[tipo]} 30%, transparent)`,
    }}>
      {LABEL_TIPO[tipo]}
    </span>
  );
}

function OrigemBadge({ origem }: { origem: 'MANUAL' | 'APRENDIDO' }) {
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 600, letterSpacing: '.05em',
      color: origem === 'APRENDIDO' ? 'var(--teal)' : 'var(--muted)',
    }}>
      {origem === 'APRENDIDO' ? 'APRENDIDO' : 'MANUAL'}
    </span>
  );
}

// ── Modal de criação / edição ──────────────────────────────────────

interface PadraoModalProps {
  padrao?: OfxPadrao;
  onClose: () => void;
}

const FORM_VAZIO: OfxPadraoInput = {
  texto: '', tipo: 'PIX', bandeira: null, banco: null,
  prioridade: 0, ativo: true, origem: 'MANUAL',
};

function PadraoModal({ padrao, onClose }: PadraoModalProps) {
  const { createPadrao, updatePadrao } = useOfxPadroesStore();
  const [form, setForm] = useState<OfxPadraoInput>(
    padrao
      ? { texto: padrao.texto, tipo: padrao.tipo, bandeira: padrao.bandeira, banco: padrao.banco,
          prioridade: padrao.prioridade, ativo: padrao.ativo, origem: padrao.origem }
      : FORM_VAZIO,
  );
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const f = (k: keyof OfxPadraoInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const val = e.target.value;
      setForm(s => ({
        ...s,
        [k]: val === '' || val === 'null' ? null : val,
      }));
    };

  async function handleSave() {
    if (!form.texto.trim()) { setErr('Texto é obrigatório.'); return; }
    setSaving(true);
    try {
      if (padrao) {
        await updatePadrao(padrao.id, form);
      } else {
        await createPadrao({ ...form, texto: form.texto.trim().toUpperCase() });
      }
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setErr(msg ?? (e as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal title={padrao ? 'Editar Padrão' : 'Novo Padrão OFX'} onClose={onClose} width={480}>
      {err && (
        <div className="alert alert-error" style={{ marginBottom: 14 }}>{err}</div>
      )}

      <div style={fieldStyle}>
        <label style={labelStyle}>Texto a identificar *</label>
        <input
          style={inputStyle}
          placeholder="Ex: PIX RECEBIDO, GETNET MASTER, TARIFA..."
          value={form.texto}
          onChange={e => setForm(s => ({ ...s, texto: e.target.value }))}
          onBlur={e => setForm(s => ({ ...s, texto: e.target.value.trim().toUpperCase() }))}
        />
        <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 4 }}>
          Busca case-insensitive no MEMO e NAME do lançamento OFX.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Tipo *</label>
          <select style={selectStyle} value={form.tipo} onChange={f('tipo')}>
            {TIPOS_OFX.map(t => <option key={t} value={t}>{LABEL_TIPO[t]}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Bandeira (Cartão)</label>
          <select style={selectStyle} value={form.bandeira ?? 'null'} onChange={f('bandeira')}>
            <option value="null">Nenhuma / Qualquer</option>
            {BANDEIRAS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Banco</label>
          <select style={selectStyle} value={form.banco ?? 'null'} onChange={f('banco')}>
            <option value="null">Todos os bancos</option>
            {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Prioridade</label>
          <input
            type="number" min={0} max={999}
            style={inputStyle}
            value={form.prioridade}
            onChange={e => setForm(s => ({ ...s, prioridade: Number(e.target.value) }))}
          />
          <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 4 }}>
            Maior = avaliado primeiro.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <input
          type="checkbox"
          id="ativo-check"
          checked={form.ativo}
          onChange={e => setForm(s => ({ ...s, ativo: e.target.checked }))}
        />
        <label htmlFor="ativo-check" style={{ fontSize: '0.8rem', color: 'var(--text-soft)', cursor: 'pointer' }}>
          Padrão ativo
        </label>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Modal>
  );
}

// ── Página principal ──────────────────────────────────────────────

export function OfxPadroesPage() {
  const { padroes, loading, error, fetchPadroes, deletePadrao } = useOfxPadroesStore();
  const classificar = useOfxPadroesStore(s => s.classificar);

  const [modalAberto, setModalAberto]   = useState(false);
  const [editando,    setEditando]      = useState<OfxPadrao | undefined>();
  const [excluindo,   setExcluindo]     = useState<number | null>(null);

  // Filtros
  const [filtroTipo,  setFiltroTipo]   = useState('');
  const [filtroBanco, setFiltroBanco]  = useState('');
  const [filtroAtivo, setFiltroAtivo]  = useState('true');

  // Testar texto
  const [textoTeste,   setTextoTeste]  = useState('');
  const [bancoTeste,   setBancoTeste]  = useState('');
  const [resultTeste,  setResultTeste] = useState<OfxPadrao | null | undefined>(undefined);
  const [testando,     setTestando]    = useState(false);

  useEffect(() => { void fetchPadroes(); }, [fetchPadroes]);

  const padroesVisiveis = padroes.filter(p => {
    if (filtroTipo  && p.tipo !== filtroTipo)            return false;
    if (filtroBanco && p.banco !== filtroBanco)          return false;
    if (filtroAtivo === 'true'  && !p.ativo)             return false;
    if (filtroAtivo === 'false' && p.ativo)              return false;
    return true;
  });

  async function handleTestar() {
    if (!textoTeste.trim()) return;
    setTestando(true);
    setResultTeste(undefined);
    const match = await classificar(textoTeste.trim(), bancoTeste || undefined);
    setResultTeste(match);
    setTestando(false);
  }

  async function handleDelete(id: number) {
    setExcluindo(id);
    try {
      await deletePadrao(id);
    } finally {
      setExcluindo(null);
    }
  }

  function abrirNovo() { setEditando(undefined); setModalAberto(true); }
  function abrirEditar(p: OfxPadrao) { setEditando(p); setModalAberto(true); }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '1.2rem', margin: 0 }}>
            Padrões OFX
          </h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '4px 0 0' }}>
            Biblioteca de regras para classificar lançamentos do extrato bancário.
          </p>
        </div>
        <button className="btn btn-primary" onClick={abrirNovo}>
          + Novo Padrão
        </button>
      </div>

      {/* Testar texto */}
      <div style={{
        background: 'var(--panel)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 20,
      }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 10 }}>
          Testar classificação
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 220px' }}>
            <label style={labelStyle}>MEMO / descrição do lançamento</label>
            <input
              style={inputStyle}
              placeholder="Cole aqui o texto do lançamento OFX..."
              value={textoTeste}
              onChange={e => { setTextoTeste(e.target.value); setResultTeste(undefined); }}
              onKeyDown={e => { if (e.key === 'Enter') void handleTestar(); }}
            />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={labelStyle}>Banco (opcional)</label>
            <select style={selectStyle} value={bancoTeste} onChange={e => setBancoTeste(e.target.value)}>
              <option value="">Qualquer banco</option>
              {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => void handleTestar()}
            disabled={testando || !textoTeste.trim()}
            style={{ flexShrink: 0 }}
          >
            {testando ? 'Testando…' : 'Testar'}
          </button>
        </div>

        {resultTeste !== undefined && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--panel-alt)', fontSize: '0.8rem' }}>
            {resultTeste === null ? (
              <span style={{ color: 'var(--red)' }}>
                Nenhum padrão encontrado — esse lançamento seria marcado como <strong>Não classificado</strong>.
              </span>
            ) : (
              <span style={{ color: 'var(--teal)' }}>
                Padrão #{resultTeste.id} · <strong>"{resultTeste.texto}"</strong> →{' '}
                <TipoBadge tipo={resultTeste.tipo} />
                {resultTeste.bandeira && <> · <strong>{resultTeste.bandeira}</strong></>}
                {' '}· prioridade {resultTeste.prioridade}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <select style={{ ...selectStyle, width: 'auto', minWidth: 140 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {TIPOS_OFX.map(t => <option key={t} value={t}>{LABEL_TIPO[t]}</option>)}
        </select>
        <select style={{ ...selectStyle, width: 'auto', minWidth: 140 }} value={filtroBanco} onChange={e => setFiltroBanco(e.target.value)}>
          <option value="">Todos os bancos</option>
          {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select style={{ ...selectStyle, width: 'auto', minWidth: 120 }} value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value)}>
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
          <option value="">Todos</option>
        </select>
        <span style={{ fontSize: '0.72rem', color: 'var(--muted)', alignSelf: 'center', marginLeft: 4 }}>
          {padroesVisiveis.length} padrão(ões)
        </span>
      </div>

      {/* Tabela */}
      {loading && <div style={{ color: 'var(--muted)', fontSize: '0.8rem', padding: 20 }}>Carregando…</div>}
      {error  && <div className="alert alert-error">{error}</div>}

      {!loading && (
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--panel-alt)', borderBottom: '1px solid var(--border)' }}>
                {['Texto', 'Tipo', 'Bandeira', 'Banco', 'Prioridade', 'Origem', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {padroesVisiveis.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '32px 14px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.78rem' }}>
                    Nenhum padrão encontrado. Clique em "Novo Padrão" para começar.
                  </td>
                </tr>
              ) : (
                padroesVisiveis.map(p => (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      opacity: p.ativo ? 1 : 0.45,
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--panel-alt)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text)' }}>
                      {p.texto}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <TipoBadge tipo={p.tipo} />
                    </td>
                    <td style={{ padding: '10px 14px', color: p.bandeira ? 'var(--text)' : 'var(--muted)' }}>
                      {p.bandeira ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: p.banco ? 'var(--text)' : 'var(--muted)' }}>
                      {p.banco ?? 'Todos'}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-soft)' }}>
                      {p.prioridade}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <OrigemBadge origem={p.origem} />
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: p.ativo ? 'var(--teal)' : 'var(--muted)' }}>
                        {p.ativo ? 'ATIVO' : 'INATIVO'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                        onClick={() => abrirEditar(p)}
                      >
                        Editar
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '4px 10px', fontSize: '0.72rem', color: 'var(--red)' }}
                        onClick={() => void handleDelete(p.id)}
                        disabled={excluindo === p.id}
                      >
                        {excluindo === p.id ? '…' : 'Excluir'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalAberto && (
        <PadraoModal
          padrao={editando}
          onClose={() => { setModalAberto(false); setEditando(undefined); }}
        />
      )}
    </div>
  );
}
