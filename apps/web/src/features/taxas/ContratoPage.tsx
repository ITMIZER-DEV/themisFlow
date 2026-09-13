import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useTaxasStore,
  TIPOS_PAGAMENTO, MODALIDADES, TIPOS_ENCARGO,
  bandeirasPorTipo, LABEL_TIPO, LABEL_MODALIDADE, LABEL_ENCARGO,
  type TaxaItem, type TaxaAluguel, type TaxaEncargo,
} from '../../stores/taxasStore';
import { Modal, inputStyle, labelStyle, fieldStyle } from '../../components/Modal';
import { fmtDate } from '../../lib/date';

// ── Helpers ────────────────────────────────────────────────────────
function pct(v: string | number) {
  return `${parseFloat(String(v)).toFixed(4).replace('.', ',')}%`;
}
function brl(v: string | number) {
  return parseFloat(String(v)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type Tab = 'mdr' | 'alugueis' | 'encargos';

// ── Modal: item MDR ────────────────────────────────────────────────

function ItemModal({ contratoId, item, onClose }: {
  contratoId: string;
  item?: TaxaItem;
  onClose: () => void;
}) {
  const addItem    = useTaxasStore(s => s.addItem);
  const updateItem = useTaxasStore(s => s.updateItem);

  const [form, setForm] = useState({
    tipoPagamento:    item?.tipoPagamento    ?? 'CREDITO',
    bandeira:         item?.bandeira         ?? 'VISA',
    modalidade:       item?.modalidade       ?? 'A_VISTA',
    parcelaMin:       item?.parcelaMin       ?? 1,
    parcelaMax:       item?.parcelaMax       ?? 1,
    taxaMdr:          item ? parseFloat(item.taxaMdr)         : 0,
    taxaAntecipacao:  item ? parseFloat(item.taxaAntecipacao) : 0,
    prazoRecebimento: item?.prazoRecebimento ?? 1,
    taxaFixa:         item ? parseFloat(item.taxaFixa)        : 0,
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const bandeiras = bandeirasPorTipo(form.tipoPagamento);

  // Ajusta modalidade e parcelas ao trocar tipo
  function setTipo(tipo: string) {
    const isSemParcela = ['ALIMENTACAO', 'REFEICAO', 'COMBUSTIVEL', 'VOUCHER', 'PIX'].includes(tipo);
    setForm(s => ({
      ...s, tipoPagamento: tipo,
      modalidade:  isSemParcela ? 'A_VISTA' : s.modalidade,
      parcelaMin:  1,
      parcelaMax:  isSemParcela ? 1 : s.parcelaMax,
      bandeira:    bandeirasPorTipo(tipo)[0]!,
      prazoRecebimento: tipo === 'PIX' ? 0 : s.prazoRecebimento,
    }));
  }

  async function handleSave() {
    if (form.parcelaMin > form.parcelaMax) { setErr('Parcela mínima não pode ser maior que a máxima.'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        taxaMdr: String(form.taxaMdr),
        taxaAntecipacao: String(form.taxaAntecipacao),
        taxaFixa: String(form.taxaFixa),
      };
      if (item) {
        await updateItem(contratoId, item.id, payload);
      } else {
        await addItem(contratoId, payload);
      }
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? (e as Error).message;
      setErr(msg);
      setSaving(false);
    }
  }

  const isBeneficio = ['ALIMENTACAO', 'REFEICAO', 'COMBUSTIVEL', 'VOUCHER', 'PIX'].includes(form.tipoPagamento);
  const isPix = form.tipoPagamento === 'PIX';

  return (
    <Modal title={item ? 'Editar Taxa MDR' : 'Adicionar Taxa MDR'} onClose={onClose} width={520}>
      {err && <div className="alert alert-error" style={{ marginBottom: 12 }}>{err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Tipo de Pagamento</label>
          <select style={inputStyle} value={form.tipoPagamento} onChange={e => setTipo(e.target.value)}>
            {TIPOS_PAGAMENTO.map(t => <option key={t} value={t}>{LABEL_TIPO[t]}</option>)}
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Bandeira</label>
          <select style={inputStyle} value={form.bandeira} onChange={e => setForm(s => ({ ...s, bandeira: e.target.value }))}>
            {bandeiras.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Modalidade</label>
        <select
          style={inputStyle}
          value={form.modalidade}
          disabled={isBeneficio}
          onChange={e => setForm(s => ({ ...s, modalidade: e.target.value as typeof MODALIDADES[number] }))}
        >
          {MODALIDADES.map(m => <option key={m} value={m}>{LABEL_MODALIDADE[m]}</option>)}
        </select>
      </div>

      {!isBeneficio && form.modalidade !== 'A_VISTA' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Parcela Mínima</label>
            <input style={inputStyle} type="number" min={1} max={24}
              value={form.parcelaMin}
              onChange={e => setForm(s => ({ ...s, parcelaMin: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label style={labelStyle}>Parcela Máxima</label>
            <input style={inputStyle} type="number" min={1} max={24}
              value={form.parcelaMax}
              onChange={e => setForm(s => ({ ...s, parcelaMax: Number(e.target.value) }))}
            />
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Taxa MDR (%) *</label>
          <input style={inputStyle} type="number" step="0.0001" min={0}
            value={form.taxaMdr}
            onChange={e => setForm(s => ({ ...s, taxaMdr: Number(e.target.value) }))}
          />
        </div>
        <div>
          <label style={labelStyle}>Prazo Recebimento (D+X)</label>
          <input style={inputStyle} type="number" min={0}
            value={form.prazoRecebimento}
            disabled={isPix}
            onChange={e => setForm(s => ({ ...s, prazoRecebimento: Number(e.target.value) }))}
          />
          {isPix && <span style={{ fontSize: '0.68rem', color: 'var(--teal)', marginTop: 3, display: 'block' }}>PIX é sempre D+0 (instantâneo)</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Taxa Antecipação (% ao mês)</label>
          <input style={inputStyle} type="number" step="0.0001" min={0}
            value={form.taxaAntecipacao}
            onChange={e => setForm(s => ({ ...s, taxaAntecipacao: Number(e.target.value) }))}
          />
        </div>
        <div>
          <label style={labelStyle}>Taxa Fixa (R$ por transação)</label>
          <input style={inputStyle} type="number" step="0.01" min={0}
            value={form.taxaFixa}
            onChange={e => setForm(s => ({ ...s, taxaFixa: Number(e.target.value) }))}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-teal" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : item ? 'Salvar' : 'Adicionar'}
        </button>
      </div>
    </Modal>
  );
}

// ── Tabela MDR ─────────────────────────────────────────────────────

function TabelaMdr({ contratoId, itens }: { contratoId: string; itens: TaxaItem[] }) {
  const deleteItem  = useTaxasStore(s => s.deleteItem);
  const [modal, setModal] = useState<TaxaItem | true | null>(null);

  const sorted = [...itens].sort((a, b) => {
    const tp = a.tipoPagamento.localeCompare(b.tipoPagamento);
    if (tp) return tp;
    const bnd = a.bandeira.localeCompare(b.bandeira);
    if (bnd) return bnd;
    return a.parcelaMin - b.parcelaMin;
  });

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 'var(--sp-3)' }}>
        <span className="section-title">Taxas MDR</span>
        <button className="btn btn-gold" style={{ fontSize: '0.75rem' }} onClick={() => setModal(true)}>
          + Adicionar Taxa
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state" style={{ padding: 'var(--sp-8)' }}>
          <div className="empty-state-title">Nenhuma taxa MDR cadastrada</div>
          <div className="empty-state-sub">Adicione as taxas por tipo de pagamento, bandeira e parcelamento.</div>
        </div>
      ) : (
        <div className="transactions-section" style={{ marginBottom: 'var(--sp-5)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="trn-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Bandeira</th>
                  <th>Modalidade</th>
                  <th>Parcelas</th>
                  <th className="right">MDR%</th>
                  <th className="right">Antecip.%/mês</th>
                  <th className="right">Prazo</th>
                  <th className="right">Taxa Fixa</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(item => (
                  <tr key={item.id}>
                    <td>
                      <span className="tab-badge" style={{ fontSize: '0.62rem', background: 'var(--gold-bg)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }}>
                        {LABEL_TIPO[item.tipoPagamento] ?? item.tipoPagamento}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{item.bandeira}</td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-soft)' }}>{LABEL_MODALIDADE[item.modalidade] ?? item.modalidade}</td>
                    <td className="mono-cell" style={{ textAlign: 'center' }}>
                      {item.parcelaMin === item.parcelaMax
                        ? `${item.parcelaMin}x`
                        : `${item.parcelaMin}–${item.parcelaMax}x`}
                    </td>
                    <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--gold)' }}>{pct(item.taxaMdr)}</td>
                    <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                      {parseFloat(item.taxaAntecipacao) > 0 ? pct(item.taxaAntecipacao) : '—'}
                    </td>
                    <td className="mono-cell" style={{ textAlign: 'right' }}>D+{item.prazoRecebimento}</td>
                    <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                      {parseFloat(item.taxaFixa) > 0 ? brl(item.taxaFixa) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost" style={{ fontSize: '0.65rem', padding: '2px 8px' }}
                          onClick={() => setModal(item)}>Editar</button>
                        <button className="btn btn-ghost" style={{ fontSize: '0.65rem', padding: '2px 8px', color: 'var(--red)' }}
                          onClick={() => { if (confirm('Remover esta taxa?')) void deleteItem(contratoId, item.id); }}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <ItemModal
          contratoId={contratoId}
          item={modal === true ? undefined : modal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ── Modal: Aluguel ─────────────────────────────────────────────────

function AluguelModal({ contratoId, aluguel, onClose }: {
  contratoId: string; aluguel?: TaxaAluguel; onClose: () => void;
}) {
  const addAluguel    = useTaxasStore(s => s.addAluguel);
  const updateAluguel = useTaxasStore(s => s.updateAluguel);

  const [form, setForm] = useState({
    descricao:     aluguel?.descricao    ?? '',
    qtdTerminais:  aluguel?.qtdTerminais ?? 1,
    valorUnitario: aluguel ? parseFloat(aluguel.valorUnitario) : 0,
    ativo:         aluguel?.ativo ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  async function handleSave() {
    if (!form.descricao.trim()) { setErr('Informe a descrição.'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        valorUnitario: String(form.valorUnitario),
      };
      if (aluguel) await updateAluguel(contratoId, aluguel.id, payload);
      else         await addAluguel(contratoId, payload);
      onClose();
    } catch (e: unknown) {
      setErr((e as Error).message); setSaving(false);
    }
  }

  return (
    <Modal title={aluguel ? 'Editar Aluguel' : 'Adicionar Aluguel de Terminal'} onClose={onClose}>
      {err && <div className="alert alert-error" style={{ marginBottom: 12 }}>{err}</div>}

      <div style={fieldStyle}>
        <label style={labelStyle}>Descrição *</label>
        <input style={inputStyle} placeholder="Ex: POS Loja Centro, Pinpad PDV 3..."
          value={form.descricao} onChange={e => setForm(s => ({ ...s, descricao: e.target.value }))} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Qtd. Terminais</label>
          <input style={inputStyle} type="number" min={1}
            value={form.qtdTerminais} onChange={e => setForm(s => ({ ...s, qtdTerminais: Number(e.target.value) }))} />
        </div>
        <div>
          <label style={labelStyle}>Valor Unitário (R$/mês)</label>
          <input style={inputStyle} type="number" step="0.01" min={0}
            value={form.valorUnitario} onChange={e => setForm(s => ({ ...s, valorUnitario: Number(e.target.value) }))} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-teal" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : aluguel ? 'Salvar' : 'Adicionar'}
        </button>
      </div>
    </Modal>
  );
}

// ── Tabela Aluguéis ────────────────────────────────────────────────

function TabelaAlugueis({ contratoId, alugueis }: { contratoId: string; alugueis: TaxaAluguel[] }) {
  const deleteAluguel = useTaxasStore(s => s.deleteAluguel);
  const [modal, setModal] = useState<TaxaAluguel | true | null>(null);

  const totalMensal = alugueis
    .filter(a => a.ativo)
    .reduce((sum, a) => sum + a.qtdTerminais * parseFloat(a.valorUnitario), 0);

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 'var(--sp-3)' }}>
        <span className="section-title">Aluguéis de Terminal</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {totalMensal > 0 && (
            <span className="saldo-pill" style={{ fontSize: '0.7rem' }}>
              Total mensal: {brl(totalMensal)}
            </span>
          )}
          <button className="btn btn-gold" style={{ fontSize: '0.75rem' }} onClick={() => setModal(true)}>
            + Adicionar
          </button>
        </div>
      </div>

      {alugueis.length === 0 ? (
        <div className="empty-state" style={{ padding: 'var(--sp-6)' }}>
          <div className="empty-state-sub">Nenhum aluguel de terminal cadastrado.</div>
        </div>
      ) : (
        <div className="transactions-section" style={{ marginBottom: 'var(--sp-5)' }}>
          <table className="trn-table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th className="right">Qtd</th>
                <th className="right">Unit/mês</th>
                <th className="right">Total/mês</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {alugueis.map(a => (
                <tr key={a.id}>
                  <td style={{ color: 'var(--text-soft)' }}>{a.descricao}</td>
                  <td className="mono-cell" style={{ textAlign: 'right' }}>{a.qtdTerminais}</td>
                  <td className="mono-cell" style={{ textAlign: 'right' }}>{brl(a.valorUnitario)}</td>
                  <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--gold)' }}>
                    {brl(a.qtdTerminais * parseFloat(a.valorUnitario))}
                  </td>
                  <td>
                    {a.ativo
                      ? <span className="tab-badge tab-badge-teal" style={{ fontSize: '0.62rem' }}>Ativo</span>
                      : <span className="tab-badge" style={{ fontSize: '0.62rem', background: 'var(--panel-alt)', color: 'var(--muted)' }}>Inativo</span>
                    }
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost" style={{ fontSize: '0.65rem', padding: '2px 8px' }}
                        onClick={() => setModal(a)}>Editar</button>
                      <button className="btn btn-ghost" style={{ fontSize: '0.65rem', padding: '2px 8px', color: 'var(--red)' }}
                        onClick={() => { if (confirm('Remover?')) void deleteAluguel(contratoId, a.id); }}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <AluguelModal
          contratoId={contratoId}
          aluguel={modal === true ? undefined : modal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ── Modal: Encargo ─────────────────────────────────────────────────

function EncargoModal({ contratoId, encargo, onClose }: {
  contratoId: string; encargo?: TaxaEncargo; onClose: () => void;
}) {
  const addEncargo    = useTaxasStore(s => s.addEncargo);
  const updateEncargo = useTaxasStore(s => s.updateEncargo);

  const [form, setForm] = useState({
    descricao: encargo?.descricao ?? '',
    tipo:      encargo?.tipo      ?? 'MENSAL',
    valor:     encargo ? parseFloat(encargo.valor) : 0,
    ativo:     encargo?.ativo ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  async function handleSave() {
    if (!form.descricao.trim()) { setErr('Informe a descrição.'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        valor: String(form.valor),
      };
      if (encargo) await updateEncargo(contratoId, encargo.id, payload);
      else         await addEncargo(contratoId, payload);
      onClose();
    } catch (e: unknown) { setErr((e as Error).message); setSaving(false); }
  }

  const isPercent = form.tipo === 'PERCENTUAL_VENDA';

  return (
    <Modal title={encargo ? 'Editar Encargo' : 'Adicionar Encargo'} onClose={onClose}>
      {err && <div className="alert alert-error" style={{ marginBottom: 12 }}>{err}</div>}

      <div style={fieldStyle}>
        <label style={labelStyle}>Descrição *</label>
        <input style={inputStyle} placeholder="Ex: PCI DSS, Chargeback, Taxa de adesão..."
          value={form.descricao} onChange={e => setForm(s => ({ ...s, descricao: e.target.value }))} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Tipo de Cobrança</label>
          <select style={inputStyle} value={form.tipo}
            onChange={e => setForm(s => ({ ...s, tipo: e.target.value }))}>
            {TIPOS_ENCARGO.map(t => <option key={t} value={t}>{LABEL_ENCARGO[t]}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Valor ({isPercent ? '%' : 'R$'})</label>
          <input style={inputStyle} type="number" step={isPercent ? '0.0001' : '0.01'} min={0}
            value={form.valor} onChange={e => setForm(s => ({ ...s, valor: Number(e.target.value) }))} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-teal" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : encargo ? 'Salvar' : 'Adicionar'}
        </button>
      </div>
    </Modal>
  );
}

// ── Tabela Encargos ────────────────────────────────────────────────

function TabelaEncargos({ contratoId, encargos }: { contratoId: string; encargos: TaxaEncargo[] }) {
  const deleteEncargo = useTaxasStore(s => s.deleteEncargo);
  const [modal, setModal] = useState<TaxaEncargo | true | null>(null);

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 'var(--sp-3)' }}>
        <span className="section-title">Outros Encargos</span>
        <button className="btn btn-gold" style={{ fontSize: '0.75rem' }} onClick={() => setModal(true)}>
          + Adicionar
        </button>
      </div>

      {encargos.length === 0 ? (
        <div className="empty-state" style={{ padding: 'var(--sp-6)' }}>
          <div className="empty-state-sub">Nenhum encargo adicional cadastrado (PCI DSS, chargeback, etc.).</div>
        </div>
      ) : (
        <div className="transactions-section" style={{ marginBottom: 'var(--sp-5)' }}>
          <table className="trn-table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Tipo</th>
                <th className="right">Valor</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {encargos.map(e => (
                <tr key={e.id}>
                  <td style={{ color: 'var(--text-soft)' }}>{e.descricao}</td>
                  <td style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{LABEL_ENCARGO[e.tipo] ?? e.tipo}</td>
                  <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--red)' }}>
                    {e.tipo === 'PERCENTUAL_VENDA' ? pct(e.valor) : brl(e.valor)}
                  </td>
                  <td>
                    {e.ativo
                      ? <span className="tab-badge tab-badge-teal" style={{ fontSize: '0.62rem' }}>Ativo</span>
                      : <span className="tab-badge" style={{ fontSize: '0.62rem', background: 'var(--panel-alt)', color: 'var(--muted)' }}>Inativo</span>
                    }
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost" style={{ fontSize: '0.65rem', padding: '2px 8px' }}
                        onClick={() => setModal(e)}>Editar</button>
                      <button className="btn btn-ghost" style={{ fontSize: '0.65rem', padding: '2px 8px', color: 'var(--red)' }}
                        onClick={() => { if (confirm('Remover?')) void deleteEncargo(contratoId, e.id); }}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <EncargoModal
          contratoId={contratoId}
          encargo={modal === true ? undefined : modal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ── Página de detalhe ──────────────────────────────────────────────

export function ContratoPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const detalhe    = useTaxasStore(s => s.detalhe);
  const loading    = useTaxasStore(s => s.loadingDet);
  const loadDet    = useTaxasStore(s => s.loadDetalhe);
  const updateC    = useTaxasStore(s => s.updateContrato);
  const deleteC    = useTaxasStore(s => s.deleteContrato);

  const [tab,     setTab]     = useState<Tab>('mdr');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ nome: '', ativo: true, observacoes: '' });

  useEffect(() => {
    if (id) void loadDet(id);
  }, [id, loadDet]);

  useEffect(() => {
    if (detalhe) setEditForm({ nome: detalhe.nome, ativo: detalhe.ativo, observacoes: detalhe.observacoes ?? '' });
  }, [detalhe]);

  if (loading) {
    return <div className="tab-content"><div className="empty-state"><span className="text-muted loading-pulse">Carregando contrato...</span></div></div>;
  }

  if (!detalhe) {
    return <div className="tab-content"><div className="empty-state"><div className="empty-state-title">Contrato não encontrado</div></div></div>;
  }

  async function handleUpdate() {
    if (!id) return;
    await updateC(id, { nome: editForm.nome, ativo: editForm.ativo, observacoes: editForm.observacoes || null });
    setEditing(false);
  }

  async function handleDelete() {
    if (!id || !confirm(`Excluir o contrato "${detalhe!.nome}" e todas as suas taxas? Esta ação não pode ser desfeita.`)) return;
    await deleteC(id);
    navigate('/taxas');
  }

  const itens    = detalhe.itens    ?? [];
  const alugueis = detalhe.alugueis ?? [];
  const encargos = detalhe.encargos ?? [];

  return (
    <div className="fade-in-up tab-content" style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--sp-4)', fontSize: '0.75rem', color: 'var(--muted)' }}>
        <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
          onClick={() => navigate('/taxas')}>
          ← Contratos
        </button>
        <span>/</span>
        <span style={{ color: 'var(--text-soft)' }}>{detalhe.nome}</span>
      </div>

      {/* Header */}
      <div style={{
        background: 'var(--panel)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 'var(--sp-5)', marginBottom: 'var(--sp-5)',
      }}>
        {editing ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Nome do Contrato</label>
                <input style={inputStyle} value={editForm.nome} onChange={e => setEditForm(s => ({ ...s, nome: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-soft)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={editForm.ativo} onChange={e => setEditForm(s => ({ ...s, ativo: e.target.checked }))} />
                  Ativo
                </label>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Observações</label>
              <textarea style={{ ...inputStyle, height: 56, resize: 'vertical' }}
                value={editForm.observacoes}
                onChange={e => setEditForm(s => ({ ...s, observacoes: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-teal" onClick={handleUpdate}>Salvar</button>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1.1rem' }}>{detalhe.nome}</h2>
                {detalhe.ativo
                  ? <span className="tab-badge tab-badge-teal" style={{ fontSize: '0.62rem' }}>ATIVO</span>
                  : <span className="tab-badge" style={{ fontSize: '0.62rem', background: 'var(--panel-alt)', color: 'var(--muted)' }}>INATIVO</span>
                }
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: '0.75rem', color: 'var(--muted)' }}>
                <span><span style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{detalhe.rede}</span></span>
                <span>{fmtDate(detalhe.dataInicio)} {detalhe.dataFim ? `→ ${fmtDate(detalhe.dataFim)}` : '→ vigente'}</span>
                {detalhe.criador && <span>Criado por {detalhe.criador.nome}</span>}
              </div>
              {detalhe.observacoes && (
                <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-soft)', fontStyle: 'italic' }}>
                  {detalhe.observacoes}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={() => setEditing(true)}>Editar</button>
              <button className="btn btn-ghost" style={{ fontSize: '0.75rem', color: 'var(--red)' }} onClick={handleDelete}>Excluir</button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: 'var(--sp-5)' }}>
        {([
          { key: 'mdr',      label: `Taxas MDR (${itens.length})` },
          { key: 'alugueis', label: `Aluguéis (${alugueis.length})` },
          { key: 'encargos', label: `Encargos (${encargos.length})` },
        ] as const).map(t => (
          <button
            key={t.key}
            className={`tab-btn${tab === t.key ? ' active-system' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'mdr'      && <TabelaMdr      contratoId={detalhe.id} itens={itens} />}
      {tab === 'alugueis' && <TabelaAlugueis contratoId={detalhe.id} alugueis={alugueis} />}
      {tab === 'encargos' && <TabelaEncargos contratoId={detalhe.id} encargos={encargos} />}
    </div>
  );
}
