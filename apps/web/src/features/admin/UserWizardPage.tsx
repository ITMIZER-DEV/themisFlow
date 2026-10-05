import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import type { RoleData } from './AclPage';

interface UserDraft {
  nome: string;
  email: string;
  senha: string;
  roleSlug: string;
  lojasAutorizadas: string[];
  ativo: boolean;
}

type Step = 'form' | 'revisao' | 'concluido';

const emptyDraft = (): UserDraft => ({
  nome: '',
  email: '',
  senha: '',
  roleSlug: 'gerente',
  lojasAutorizadas: ['GLOBAL'],
  ativo: true,
});

function getAvatarColor(name: string): { bg: string; color: string } {
  const colors = [
    { bg: 'rgba(240, 165, 0, 0.18)', color: '#f0a500' },
    { bg: 'rgba(0, 201, 177, 0.18)', color: '#00c9b1' },
    { bg: 'rgba(168, 85, 247, 0.18)', color: '#c084fc' },
    { bg: 'rgba(56, 189, 248, 0.18)', color: '#38bdf8' },
    { bg: 'rgba(244, 63, 94, 0.18)', color: '#fb7185' },
    { bg: 'rgba(52, 211, 153, 0.18)', color: '#34d399' },
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length] ?? colors[0]!;
}

export function UserWizardPage() {
  const navigate = useNavigate();
  const nomeRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('form');
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [form, setForm] = useState<UserDraft>(emptyDraft());
  const [isGlobal, setIsGlobal] = useState(true);
  const [showSenha, setShowSenha] = useState(false);
  const [queue, setQueue] = useState<UserDraft[]>([]);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<{ nome: string; ok: boolean; error?: string }[]>([]);

  useEffect(() => {
    api.get<{ roles: any[] }>('/roles')
      .then(r => {
        if (r.data.roles?.length) {
          setRoles(r.data.roles.map((role: any) => ({
            id: role.id,
            nome: role.nome,
            slug: role.slug,
            descricao: role.descricao || '',
            isSystem: role.slug === 'admin',
            userCount: role._count?.users ?? 0,
            permissions: (role.permissions || []).map((p: any) => p.permission?.chave || p.chave || p),
          })));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (step === 'form') setTimeout(() => nomeRef.current?.focus(), 50);
  }, [step]);

  const validate = (): string => {
    if (!form.nome.trim()) return 'Nome completo é obrigatório.';
    if (!form.email.trim() || !form.email.includes('@')) return 'Informe um e-mail válido.';
    if (form.senha.length < 6) return 'A senha deve ter pelo menos 6 caracteres.';
    const duplicate = queue.find(u => u.email.toLowerCase() === form.email.toLowerCase());
    if (duplicate) return `E-mail "${form.email}" já está na fila.`;
    return '';
  };

  const addToQueue = () => {
    const err = validate();
    if (err) { setFormError(err); return; }
    setQueue(q => [...q, { ...form, lojasAutorizadas: isGlobal ? ['GLOBAL'] : form.lojasAutorizadas }]);
    setStep('revisao');
  };

  const addMore = () => {
    setForm(emptyDraft());
    setIsGlobal(true);
    setShowSenha(false);
    setFormError('');
    setStep('form');
  };

  const removeFromQueue = (idx: number) => {
    setQueue(q => q.filter((_, i) => i !== idx));
  };

  const createAll = async () => {
    setSaving(true);
    const res: typeof results = [];
    for (const u of queue) {
      try {
        await api.post('/users', {
          nome: u.nome,
          email: u.email,
          senha: u.senha,
          roles: [u.roleSlug],
          lojasAutorizadas: u.lojasAutorizadas,
          ativo: u.ativo,
        });
        res.push({ nome: u.nome, ok: true });
      } catch (err: any) {
        const msg = err?.response?.data?.error || 'Erro ao criar usuário';
        res.push({ nome: u.nome, ok: false, error: msg });
      }
    }
    setResults(res);
    setSaving(false);
    setStep('concluido');
  };

  const totalOk = results.filter(r => r.ok).length;
  const totalErr = results.filter(r => !r.ok).length;

  const stepNumber = step === 'form' ? 1 : step === 'revisao' ? 2 : 3;

  return (
    <div className="fade-in-up" style={{ maxWidth: 680, margin: '0 auto', padding: '0 4px' }}>

      {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <button
          onClick={() => navigate('/admin/usuarios')}
          style={{
            background: 'none', border: 'none', color: 'var(--muted)',
            fontSize: '0.76rem', cursor: 'pointer', display: 'flex',
            alignItems: 'center', gap: 6, padding: 0, marginBottom: 16,
          }}
        >
          ← Voltar para Usuários
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '1.6rem' }}>👥</span>
          <div>
            <h2 style={{
              margin: 0, fontSize: '1.15rem', fontWeight: 800,
              fontFamily: 'var(--font-title)', color: 'var(--text)',
            }}>
              Cadastro em Lote — Wizard de Usuários
            </h2>
            <div style={{ fontSize: '0.74rem', color: 'var(--muted)', marginTop: 3 }}>
              Adicione um ou mais usuários e confirme todos de uma vez.
            </div>
          </div>
        </div>

        {/* Steps indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20 }}>
          {(['Dados do Usuário', 'Revisão da Fila', 'Concluído'] as const).map((label, i) => {
            const n = i + 1;
            const active = stepNumber === n;
            const done = stepNumber > n;
            return (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.72rem', fontWeight: 800,
                  background: done ? 'var(--teal)' : active ? 'rgba(0,201,177,0.18)' : 'var(--panel-alt)',
                  color: done ? '#0b1220' : active ? 'var(--teal)' : 'var(--muted)',
                  border: `1px solid ${done || active ? 'var(--teal)' : 'var(--border)'}`,
                  flexShrink: 0,
                }}>
                  {done ? '✓' : n}
                </div>
                <span style={{
                  fontSize: '0.74rem', fontWeight: active ? 700 : 400,
                  color: active ? 'var(--text)' : done ? 'var(--teal)' : 'var(--muted)',
                }}>
                  {label}
                </span>
                {i < 2 && (
                  <div style={{
                    width: 32, height: 1,
                    background: done ? 'var(--teal)' : 'var(--border)',
                    flexShrink: 0,
                  }} />
                )}
              </div>
            );
          })}

          {queue.length > 0 && stepNumber < 3 && (
            <span style={{
              marginLeft: 'auto',
              padding: '3px 10px', borderRadius: 20,
              background: 'rgba(0,201,177,0.12)', border: '1px solid rgba(0,201,177,0.3)',
              color: 'var(--teal)', fontSize: '0.72rem', fontWeight: 700,
            }}>
              {queue.length} na fila
            </span>
          )}
        </div>
      </div>

      {/* ── STEP 1: FORMULÁRIO ────────────────────────────────────────── */}
      {step === 'form' && (
        <div style={{
          background: 'var(--panel)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        }}>
          <div style={{
            padding: '16px 22px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ color: 'var(--teal)', fontSize: '0.9rem' }}>+</span>
            <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, fontFamily: 'var(--font-title)' }}>
              {queue.length === 0 ? 'Dados do Primeiro Usuário' : `Usuário #${queue.length + 1}`}
            </h3>
          </div>

          <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Nome */}
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>
                Nome Completo *
              </label>
              <input
                ref={nomeRef}
                type="text"
                value={form.nome}
                onChange={e => { setForm(f => ({ ...f, nome: e.target.value })); setFormError(''); }}
                placeholder="ex: Maria Fernanda Costa"
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontSize: '0.84rem', outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--teal)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              />
            </div>

            {/* E-mail */}
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>
                E-mail *
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setFormError(''); }}
                placeholder="usuario@empresa.com.br"
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontSize: '0.84rem', outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--teal)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              />
            </div>

            {/* Senha */}
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>
                Senha Inicial * <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(mín. 6 caracteres)</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showSenha ? 'text' : 'password'}
                  value={form.senha}
                  onChange={e => { setForm(f => ({ ...f, senha: e.target.value })); setFormError(''); }}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  style={{
                    width: '100%', padding: '9px 40px 9px 12px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    color: 'var(--text)', fontSize: '0.84rem', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--teal)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowSenha(v => !v)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--muted)', fontSize: '0.8rem', padding: 2,
                  }}
                  title={showSenha ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showSenha ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {/* Perfil */}
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>
                Perfil de Acesso (Role) *
              </label>
              <select
                value={form.roleSlug}
                onChange={e => setForm(f => ({ ...f, roleSlug: e.target.value }))}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontSize: '0.84rem', cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
              >
                {roles.length > 0
                  ? roles.map(r => (
                    <option key={r.slug} value={r.slug}>{r.nome}{r.descricao ? ` — ${r.descricao}` : ''}</option>
                  ))
                  : <option value="gerente">Gerente</option>
                }
              </select>
            </div>

            {/* Lojas */}
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                Lojas Autorizadas
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isGlobal}
                  onChange={e => setIsGlobal(e.target.checked)}
                  style={{ accentColor: 'var(--teal)', width: 15, height: 15 }}
                />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--teal)' }}>
                  🏪 Todas as Lojas (Acesso Global)
                </span>
              </label>
            </div>

            {/* Status */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
                style={{ accentColor: 'var(--teal)', width: 15, height: 15 }}
              />
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)' }}>
                Usuário ativo no sistema
              </span>
            </label>

            {/* Erro */}
            {formError && (
              <div style={{
                padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                background: 'rgba(255,93,108,0.1)', border: '1px solid var(--red)',
                fontSize: '0.78rem', color: 'var(--red)',
              }}>
                {formError}
              </div>
            )}
          </div>

          <div style={{
            padding: '14px 22px', borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '0.78rem' }}
              onClick={() => navigate('/admin/usuarios')}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-teal"
              style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={addToQueue}
            >
              Adicionar à Fila →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: REVISÃO DA FILA ───────────────────────────────────── */}
      {step === 'revisao' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Lista */}
          <div style={{
            background: 'var(--panel)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          }}>
            <div style={{
              padding: '16px 22px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#f0a500', fontSize: '1rem' }}>📋</span>
                <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, fontFamily: 'var(--font-title)' }}>
                  Fila de Cadastro
                </h3>
              </div>
              <span style={{
                padding: '3px 10px', borderRadius: 20,
                background: 'rgba(0,201,177,0.12)', border: '1px solid rgba(0,201,177,0.3)',
                color: 'var(--teal)', fontSize: '0.72rem', fontWeight: 700,
              }}>
                {queue.length} usuário{queue.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div style={{ padding: '8px 0' }}>
              {queue.map((u, i) => {
                const av = getAvatarColor(u.nome);
                const roleName = roles.find(r => r.slug === u.roleSlug)?.nome ?? u.roleSlug;
                const lojaLabel = u.lojasAutorizadas.includes('GLOBAL')
                  ? 'Todas as Lojas'
                  : u.lojasAutorizadas.join(', ');

                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 22px',
                      borderBottom: i < queue.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: av.bg, color: av.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '0.9rem', flexShrink: 0,
                    }}>
                      {u.nome.charAt(0).toUpperCase()}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--text)' }}>
                        {u.nome}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>
                        {u.email}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700,
                        background: u.roleSlug === 'admin' ? 'rgba(168,85,247,0.15)' : 'rgba(240,165,0,0.15)',
                        color: u.roleSlug === 'admin' ? '#c084fc' : '#f0a500',
                        border: `1px solid ${u.roleSlug === 'admin' ? 'rgba(168,85,247,0.3)' : 'rgba(240,165,0,0.3)'}`,
                      }}>
                        {roleName}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
                        🏪 {lojaLabel}
                      </span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 800,
                        background: u.ativo ? '#10b981' : '#64748b', color: '#fff',
                        textTransform: 'uppercase',
                      }}>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                      <button
                        type="button"
                        title="Remover da fila"
                        onClick={() => removeFromQueue(i)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--muted)', fontSize: '0.85rem', padding: 4,
                          borderRadius: 4, lineHeight: 1,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}

              {queue.length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.78rem' }}>
                  A fila está vazia. Adicione ao menos um usuário.
                </div>
              )}
            </div>
          </div>

          {/* Ações */}
          <div style={{
            background: 'var(--panel)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: '18px 22px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 12,
          }}>
            <button
              type="button"
              onClick={addMore}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 18px', borderRadius: 'var(--radius-sm)',
                background: 'var(--panel-alt)', border: '1px solid var(--border)',
                color: 'var(--text)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
              }}
            >
              + Adicionar Outro Usuário
            </button>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: '0.78rem' }}
                onClick={() => navigate('/admin/usuarios')}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={queue.length === 0 || saving}
                onClick={() => void createAll()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 20px', borderRadius: 'var(--radius-sm)',
                  background: queue.length === 0 ? 'var(--panel-alt)' : '#ea580c',
                  color: queue.length === 0 ? 'var(--muted)' : '#fff',
                  border: 'none', fontWeight: 700, fontSize: '0.78rem',
                  cursor: queue.length === 0 || saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving
                  ? <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span> Criando…</>
                  : <><span>✓</span> Criar {queue.length} Usuário{queue.length !== 1 ? 's' : ''}</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3: CONCLUÍDO ─────────────────────────────────────────── */}
      {step === 'concluido' && (
        <div style={{
          background: 'var(--panel)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        }}>
          <div style={{ padding: '28px 28px 22px', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>
              {totalErr === 0 ? '🎉' : totalOk > 0 ? '⚠️' : '❌'}
            </div>
            <h3 style={{
              margin: '0 0 6px', fontSize: '1.1rem', fontWeight: 800,
              fontFamily: 'var(--font-title)', color: 'var(--text)',
            }}>
              {totalErr === 0
                ? `${totalOk} usuário${totalOk !== 1 ? 's' : ''} criado${totalOk !== 1 ? 's' : ''} com sucesso!`
                : totalOk > 0
                ? `${totalOk} criado${totalOk !== 1 ? 's' : ''}, ${totalErr} com erro`
                : 'Nenhum usuário criado'}
            </h3>
            <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
              {totalErr === 0
                ? 'Todos os usuários podem acessar o sistema com suas credenciais.'
                : 'Verifique os erros abaixo e tente novamente se necessário.'}
            </div>
          </div>

          <div style={{ padding: '0 22px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map((r, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                  background: r.ok ? 'rgba(0,201,177,0.06)' : 'rgba(255,93,108,0.08)',
                  border: `1px solid ${r.ok ? 'rgba(0,201,177,0.25)' : 'rgba(255,93,108,0.3)'}`,
                }}
              >
                <span style={{ fontSize: '1rem' }}>{r.ok ? '✅' : '❌'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text)' }}>{r.nome}</div>
                  {!r.ok && r.error && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 2 }}>{r.error}</div>
                  )}
                </div>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 800,
                  color: r.ok ? 'var(--teal)' : 'var(--red)',
                }}>
                  {r.ok ? 'CRIADO' : 'ERRO'}
                </span>
              </div>
            ))}
          </div>

          <div style={{
            padding: '16px 22px', borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'flex-end', gap: 10,
          }}>
            {totalErr > 0 && (
              <button
                type="button"
                onClick={() => {
                  const failedNames = results.filter(r => !r.ok).map(r => r.nome);
                  setQueue(queue.filter(u => failedNames.includes(u.nome)));
                  setStep('revisao');
                }}
                style={{
                  padding: '9px 18px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--panel-alt)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
                }}
              >
                Tentar Erros Novamente
              </button>
            )}
            <button
              type="button"
              className="btn btn-teal"
              style={{ fontSize: '0.78rem' }}
              onClick={() => navigate('/admin/usuarios')}
            >
              Ir para Usuários
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
