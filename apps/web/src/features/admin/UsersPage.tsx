import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Modal, inputStyle, labelStyle, fieldStyle } from '../../components/Modal';

interface UserRow {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  criadoEm: string;
  roles: Array<{ role: { slug: string; nome: string } }>;
}

interface RoleOpt { id: string; slug: string; nome: string; }

const emptyForm = { nome: '', email: '', senha: '', roles: [] as string[], ativo: true };

export function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roleOpts, setRoleOpts] = useState<RoleOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([
        api.get<{ users: UserRow[] }>('/users'),
        api.get<{ roles: RoleOpt[] }>('/roles'),
      ]);
      setUsers(u.data.users);
      setRoleOpts(r.data.roles);
    } catch {
      setErro('Erro ao carregar.');
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

  const openEdit = (u: UserRow) => {
    setForm({ nome: u.nome, email: u.email, senha: '', roles: u.roles.map(r => r.role.slug), ativo: u.ativo });
    setEditing(u);
    setModal('edit');
  };

  const closeModal = () => { setModal(null); setErro(''); };

  const toggleRole = (slug: string) =>
    setForm(f => ({
      ...f, roles: f.roles.includes(slug) ? f.roles.filter(r => r !== slug) : [...f.roles, slug],
    }));

  const save = async () => {
    if (!form.nome.trim() || !form.email.trim()) { setErro('Nome e e-mail são obrigatórios.'); return; }
    if (modal === 'create' && form.senha.length < 6) { setErro('Senha precisa ter ao menos 6 caracteres.'); return; }
    if (form.roles.length === 0) { setErro('Selecione ao menos um papel.'); return; }
    setSaving(true);
    setErro('');
    try {
      if (modal === 'create') {
        await api.post('/users', { nome: form.nome, email: form.email, senha: form.senha, roles: form.roles, ativo: form.ativo });
      } else if (editing) {
        const body: Record<string, unknown> = { nome: form.nome, email: form.email, roles: form.roles, ativo: form.ativo };
        if (form.senha) body.senha = form.senha;
        await api.put(`/users/${editing.id}`, body);
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

  const toggleAtivo = async (u: UserRow) => {
    await api.put(`/users/${u.id}`, { ativo: !u.ativo });
    await load();
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

  return (
    <div className="fade-in-up">
      <div className="section-header" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-title)' }}>Usuários</h2>
        <button className="btn btn-teal" onClick={openCreate}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Novo Usuário
        </button>
      </div>

      {erro && !modal && <div className="alert alert-error" style={{ marginBottom: 16 }}>{erro}</div>}

      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Carregando…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="trn-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Papéis</th>
                <th>Desde</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.nome}</td>
                  <td className="mono-cell" style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{u.email}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {u.roles.map(r => (
                        <span key={r.role.slug} className="tab-badge"
                          style={{ background: r.role.slug === 'admin' ? 'rgba(248,113,113,.12)' : 'var(--teal-bg)', color: r.role.slug === 'admin' ? 'var(--red)' : 'var(--teal)' }}>
                          {r.role.nome}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="mono-cell" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{fmtDate(u.criadoEm)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => void toggleAtivo(u)}
                      className="btn btn-ghost"
                      style={{ fontSize: '0.7rem', padding: '3px 10px', color: u.ativo ? 'var(--teal)' : 'var(--muted)' }}
                    >
                      {u.ativo ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => openEdit(u)}
                      className="btn btn-ghost"
                      style={{ fontSize: '0.7rem', padding: '3px 10px' }}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? 'Novo Usuário' : 'Editar Usuário'} onClose={closeModal}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Nome</label>
            <input style={inputStyle} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome completo" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>E-mail</label>
            <input style={inputStyle} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@dominio.com" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>{modal === 'create' ? 'Senha' : 'Nova senha (opcional)'}</label>
            <input style={inputStyle} type="password" value={form.senha} onChange={e => setForm(f => ({ ...f, senha: e.target.value }))} placeholder={modal === 'create' ? 'Mín. 6 caracteres' : 'Deixe em branco para não alterar'} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Papéis</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {roleOpts.map(r => (
                <button
                  key={r.slug}
                  type="button"
                  onClick={() => toggleRole(r.slug)}
                  className="tab-badge"
                  style={{
                    cursor: 'pointer', padding: '5px 10px', fontSize: '0.75rem',
                    background: form.roles.includes(r.slug) ? 'var(--teal-bg)' : 'var(--panel-alt)',
                    color: form.roles.includes(r.slug) ? 'var(--teal)' : 'var(--muted)',
                    border: `1px solid ${form.roles.includes(r.slug) ? 'var(--teal-dim)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  {r.nome}
                </button>
              ))}
            </div>
          </div>
          <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input id="ativo" type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} />
            <label htmlFor="ativo" style={{ fontSize: '0.8rem', color: 'var(--text-soft)', cursor: 'pointer' }}>Usuário ativo</label>
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
