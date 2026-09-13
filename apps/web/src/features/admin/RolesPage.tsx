import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Modal, inputStyle, labelStyle, fieldStyle } from '../../components/Modal';

interface RoleRow {
  id: string;
  nome: string;
  slug: string;
  descricao?: string;
  permissions: Array<{ permission: { chave: string } }>;
  _count: { users: number };
}

interface PermOpt { id: string; chave: string; descricao?: string; }

const emptyForm = { nome: '', slug: '', descricao: '', permissions: [] as string[] };

export function RolesPage() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permOpts, setPermOpts] = useState<PermOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        api.get<{ roles: RoleRow[] }>('/roles'),
        api.get<{ permissions: PermOpt[] }>('/roles/permissions/all'),
      ]);
      setRoles(r.data.roles);
      setPermOpts(p.data.permissions);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setEditing(null);
    setModal('create');
  };

  const openEdit = (r: RoleRow) => {
    setForm({ nome: r.nome, slug: r.slug, descricao: r.descricao ?? '', permissions: r.permissions.map(p => p.permission.chave) });
    setEditing(r);
    setModal('edit');
  };

  const closeModal = () => { setModal(null); setErro(''); };

  const togglePerm = (chave: string) =>
    setForm(f => ({
      ...f, permissions: f.permissions.includes(chave)
        ? f.permissions.filter(p => p !== chave)
        : [...f.permissions, chave],
    }));

  const save = async () => {
    if (!form.nome.trim() || !form.slug.trim()) { setErro('Nome e slug são obrigatórios.'); return; }
    setSaving(true);
    setErro('');
    try {
      if (modal === 'create') {
        await api.post('/roles', { nome: form.nome, slug: form.slug, descricao: form.descricao || undefined, permissions: form.permissions });
      } else if (editing) {
        await api.put(`/roles/${editing.id}`, { nome: form.nome, descricao: form.descricao || undefined, permissions: form.permissions });
      }
      closeModal();
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setErro(msg ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fade-in-up">
      <div className="section-header" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-title)' }}>Papéis e Permissões</h2>
        <button className="btn btn-teal" onClick={openCreate}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Novo Papel
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Carregando…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {roles.map(r => (
            <div key={r.id} style={{
              background: 'var(--panel)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '14px 18px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{r.nome}</span>
                <span className="tab-badge" style={{ background: 'var(--panel-alt)', color: 'var(--muted)' }}>{r.slug}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--muted)', marginRight: 8 }}>
                  {r._count.users} usuário{r._count.users !== 1 ? 's' : ''}
                </span>
                <button className="btn btn-ghost" onClick={() => openEdit(r)} style={{ fontSize: '0.7rem', padding: '3px 10px' }}>
                  Editar
                </button>
              </div>
              {r.descricao && (
                <div style={{ fontSize: '0.73rem', color: 'var(--muted)', marginBottom: 8 }}>{r.descricao}</div>
              )}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {r.permissions.map(p => (
                  <span key={p.permission.chave} className="tab-badge"
                    style={{ background: 'var(--teal-bg)', color: 'var(--teal)', fontSize: '0.62rem', fontFamily: 'var(--font-mono)' }}>
                    {p.permission.chave}
                  </span>
                ))}
                {r.permissions.length === 0 && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontStyle: 'italic' }}>Sem permissões</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? 'Novo Papel' : `Editar: ${editing?.nome}`} onClose={closeModal}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Nome</label>
            <input style={inputStyle} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Supervisor" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Slug</label>
            <input
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', opacity: modal === 'edit' ? 0.6 : 1 }}
              value={form.slug}
              readOnly={modal === 'edit'}
              onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
              placeholder="ex: supervisor"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Descrição</label>
            <input style={inputStyle} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Opcional" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Permissões</label>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {permOpts.map(p => (
                <button
                  key={p.chave}
                  type="button"
                  onClick={() => togglePerm(p.chave)}
                  style={{
                    cursor: 'pointer', padding: '4px 9px', fontSize: '0.65rem',
                    fontFamily: 'var(--font-mono)', borderRadius: 'var(--radius-sm)',
                    background: form.permissions.includes(p.chave) ? 'var(--teal-bg)' : 'var(--panel-alt)',
                    color: form.permissions.includes(p.chave) ? 'var(--teal)' : 'var(--muted)',
                    border: `1px solid ${form.permissions.includes(p.chave) ? 'var(--teal-dim)' : 'var(--border)'}`,
                  }}
                >
                  {p.chave}
                </button>
              ))}
            </div>
          </div>
          {erro && <div className="alert alert-error" style={{ marginBottom: 12 }}>{erro}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={closeModal} disabled={saving}>Cancelar</button>
            <button className="btn btn-teal" onClick={() => void save()} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
