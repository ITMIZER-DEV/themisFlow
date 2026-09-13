import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTaxasStore } from '../../stores/taxasStore';
import { Modal, inputStyle, labelStyle, fieldStyle } from '../../components/Modal';
import { fmtDate } from '../../lib/date';

// ── Helpers ────────────────────────────────────────────────────────

const REDES_SUGERIDAS = [
  'CIELO', 'REDE', 'GETNET', 'STONE', 'PAGSEGURO', 'SUMUP', 'SAFRAPAY', 'ADYEN', 'BANCOOB',
];

// ── Modal de novo contrato ─────────────────────────────────────────

interface NovoContratoModalProps { onClose: () => void; }

function NovoContratoModal({ onClose }: NovoContratoModalProps) {
  const createContrato = useTaxasStore(s => s.createContrato);
  const navigate       = useNavigate();

  const [form, setForm] = useState({
    nome: '', rede: '', dataInicio: new Date().toISOString().slice(0, 10),
    dataFim: '', observacoes: '', ativo: true,
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(s => ({ ...s, [k]: e.target.value }));

  async function handleSave() {
    if (!form.nome.trim() || !form.rede.trim() || !form.dataInicio) {
      setErr('Preencha nome, rede e data de início.');
      return;
    }
    setSaving(true);
    try {
      const c = await createContrato({
        nome: form.nome.trim(),
        rede: form.rede.trim().toUpperCase(),
        dataInicio: form.dataInicio,
        dataFim: form.dataFim || null,
        observacoes: form.observacoes || null,
        ativo: form.ativo,
      });
      navigate(`/taxas/${c.id}`);
    } catch (e: unknown) {
      setErr((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal title="Novo Contrato de Taxas" onClose={onClose} width={500}>
      {err && <div className="alert alert-error" style={{ marginBottom: 14 }}>{err}</div>}

      <div style={fieldStyle}>
        <label style={labelStyle}>Nome do Contrato *</label>
        <input style={inputStyle} placeholder="Ex: Cielo — Contrato Loja Centro 2025" value={form.nome} onChange={f('nome')} />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Rede / Adquirente *</label>
        <input
          style={inputStyle}
          list="redes-list"
          placeholder="Ex: CIELO, REDE, STONE..."
          value={form.rede}
          onChange={f('rede')}
        />
        <datalist id="redes-list">
          {REDES_SUGERIDAS.map(r => <option key={r} value={r} />)}
        </datalist>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Data de Início *</label>
          <input style={inputStyle} type="date" value={form.dataInicio} onChange={f('dataInicio')} />
        </div>
        <div>
          <label style={labelStyle}>Data de Fim</label>
          <input style={inputStyle} type="date" value={form.dataFim} onChange={f('dataFim')} />
        </div>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Observações</label>
        <textarea
          style={{ ...inputStyle, height: 64, resize: 'vertical' }}
          placeholder="Número do contrato, condições especiais..."
          value={form.observacoes}
          onChange={f('observacoes')}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-teal" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Criar e configurar taxas →'}
        </button>
      </div>
    </Modal>
  );
}

// ── Card de contrato ───────────────────────────────────────────────

function ContratoCard({ c }: { c: ReturnType<typeof useTaxasStore.getState>['contratos'][number] }) {
  const navigate = useNavigate();

  const totalItens    = c._count?.itens    ?? 0;
  const totalAlugueis = c._count?.alugueis ?? 0;
  const totalEncargos = c._count?.encargos ?? 0;
  const isEmpty = totalItens + totalAlugueis + totalEncargos === 0;

  return (
    <div
      onClick={() => navigate(`/taxas/${c.id}`)}
      style={{
        background: 'var(--panel)', border: `1px solid ${c.ativo ? 'var(--border)' : 'var(--border-soft)'}`,
        borderRadius: 'var(--radius)', padding: 'var(--sp-4)',
        cursor: 'pointer', transition: 'border-color var(--transition), box-shadow var(--transition)',
        opacity: c.ativo ? 1 : 0.55,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold-dim)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = c.ativo ? 'var(--border)' : 'var(--border-soft)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text)' }}>{c.nome}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--gold)', marginTop: 2 }}>{c.rede}</div>
        </div>
        {c.ativo
          ? <span className="tab-badge tab-badge-teal" style={{ fontSize: '0.62rem' }}>ATIVO</span>
          : <span className="tab-badge" style={{ fontSize: '0.62rem', background: 'var(--panel-alt)', color: 'var(--muted)' }}>INATIVO</span>
        }
      </div>

      <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 10 }}>
        {fmtDate(c.dataInicio)} {c.dataFim ? `→ ${fmtDate(c.dataFim)}` : '→ vigente'}
        {c.criador && <span style={{ marginLeft: 8 }}>· {c.criador.nome}</span>}
      </div>

      {isEmpty
        ? <div style={{ fontSize: '0.72rem', color: 'var(--red)', fontStyle: 'italic' }}>Sem taxas cadastradas</div>
        : (
          <div style={{ display: 'flex', gap: 8 }}>
            {totalItens > 0 && (
              <span className="tab-badge" style={{ background: 'var(--gold-bg)', color: 'var(--gold)', fontSize: '0.65rem', border: '1px solid var(--gold-dim)' }}>
                {totalItens} MDR
              </span>
            )}
            {totalAlugueis > 0 && (
              <span className="tab-badge" style={{ background: 'var(--panel-alt)', color: 'var(--text-soft)', fontSize: '0.65rem', border: '1px solid var(--border)' }}>
                {totalAlugueis} aluguel
              </span>
            )}
            {totalEncargos > 0 && (
              <span className="tab-badge" style={{ background: 'var(--panel-alt)', color: 'var(--text-soft)', fontSize: '0.65rem', border: '1px solid var(--border)' }}>
                {totalEncargos} encargo
              </span>
            )}
          </div>
        )
      }
    </div>
  );
}

// ── Página ─────────────────────────────────────────────────────────

export function TaxasPage() {
  const contratos      = useTaxasStore(s => s.contratos);
  const loading        = useTaxasStore(s => s.loading);
  const loadContratos  = useTaxasStore(s => s.loadContratos);
  const [showNovo, setShowNovo] = useState(false);

  useEffect(() => { void loadContratos(); }, [loadContratos]);

  const ativos   = contratos.filter(c => c.ativo);
  const inativos = contratos.filter(c => !c.ativo);

  return (
    <div className="fade-in-up tab-content" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="section-header" style={{ marginBottom: 'var(--sp-6)' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1rem', color: 'var(--text-soft)', marginBottom: 4 }}>
            Contratos de Taxas de Cartão
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            MDR, aluguéis de terminal e encargos por adquirente para apuração de custos.
          </p>
        </div>
        <button className="btn btn-gold" onClick={() => setShowNovo(true)}>
          + Novo Contrato
        </button>
      </div>

      {loading && contratos.length === 0 && (
        <div className="empty-state"><span className="text-muted loading-pulse">Carregando contratos...</span></div>
      )}

      {!loading && contratos.length === 0 && (
        <div className="empty-state">
          <svg className="empty-state-icon" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5">
            <rect x="2" y="5" width="20" height="14" rx="2"/>
            <line x1="2" y1="10" x2="22" y2="10"/>
            <line x1="6" y1="15" x2="10" y2="15"/>
            <circle cx="17" cy="15" r="2"/>
          </svg>
          <div className="empty-state-title">Nenhum contrato cadastrado</div>
          <div className="empty-state-sub">
            Crie o primeiro contrato de taxas para Cielo, Rede, Stone ou outra adquirente.
          </div>
          <button className="btn btn-gold" style={{ marginTop: 8 }} onClick={() => setShowNovo(true)}>
            + Criar primeiro contrato
          </button>
        </div>
      )}

      {ativos.length > 0 && (
        <>
          <div className="section-header">
            <span className="section-title">Contratos Ativos</span>
            <span className="text-muted" style={{ fontSize: '0.7rem' }}>{ativos.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--sp-3)', marginBottom: 'var(--sp-6)' }}>
            {ativos.map(c => <ContratoCard key={c.id} c={c} />)}
          </div>
        </>
      )}

      {inativos.length > 0 && (
        <>
          <div className="section-header">
            <span className="section-title">Contratos Encerrados</span>
            <span className="text-muted" style={{ fontSize: '0.7rem' }}>{inativos.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--sp-3)' }}>
            {inativos.map(c => <ContratoCard key={c.id} c={c} />)}
          </div>
        </>
      )}

      {showNovo && <NovoContratoModal onClose={() => setShowNovo(false)} />}
    </div>
  );
}
