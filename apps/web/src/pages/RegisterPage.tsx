// Página de auto-cadastro público — remover quando não for mais necessário
import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { VectysLogo } from '../design/VectysLogo';

export function RegisterPage() {
  const navigate = useNavigate();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');

    if (senha !== confirma) {
      setErro('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/register', { nome, email, senha });
      setOk(true);
    } catch (err: any) {
      const msg = err?.response?.data?.error;
      setErro(msg || 'Erro ao criar conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const fieldStyle = {
    width: '100%',
    padding: '9px 12px',
    background: 'var(--panel-alt)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text)',
    fontSize: '0.82rem',
    outline: 'none',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg)', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: 'var(--panel)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '36px 32px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <VectysLogo size={34} variant="stacked" showSubtitle={true} />
        </div>

        {ok ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✅</div>
            <h3 style={{
              margin: '0 0 8px', fontSize: '1rem', fontWeight: 800,
              fontFamily: 'var(--font-title)', color: 'var(--text)',
            }}>
              Conta criada com sucesso!
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: 24 }}>
              Seu acesso foi cadastrado. Faça login para continuar.
            </p>
            <button
              className="btn btn-teal"
              style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: '0.85rem' }}
              onClick={() => navigate('/login')}
            >
              Ir para o Login
            </button>
          </div>
        ) : (
          <>
            <h2 style={{
              margin: '0 0 4px', fontSize: '1rem', fontWeight: 800,
              fontFamily: 'var(--font-title)', color: 'var(--text)', textAlign: 'center',
            }}>
              Criar Conta
            </h2>
            <p style={{ textAlign: 'center', fontSize: '0.74rem', color: 'var(--muted)', marginBottom: 24 }}>
              Preencha os dados para solicitar acesso ao sistema.
            </p>

            <form onSubmit={e => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-soft)', marginBottom: 5 }}>
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  required
                  autoFocus
                  autoComplete="name"
                  placeholder="Seu nome completo"
                  style={fieldStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-soft)', marginBottom: 5 }}>
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="usuario@empresa.com"
                  style={{ ...fieldStyle, fontFamily: 'var(--font-mono)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-soft)', marginBottom: 5 }}>
                  Senha <span style={{ color: 'var(--muted)' }}>(mín. 6 caracteres)</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showSenha ? 'text' : 'password'}
                    value={senha}
                    onChange={e => setSenha(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="••••••••"
                    style={{ ...fieldStyle, paddingRight: 38, fontFamily: 'var(--font-mono)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSenha(v => !v)}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--muted)', fontSize: '0.8rem', padding: 2,
                    }}
                    title={showSenha ? 'Ocultar' : 'Mostrar'}
                  >
                    {showSenha ? '🙈' : '👁'}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-soft)', marginBottom: 5 }}>
                  Confirmar Senha
                </label>
                <input
                  type={showSenha ? 'text' : 'password'}
                  value={confirma}
                  onChange={e => setConfirma(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  style={{ ...fieldStyle, fontFamily: 'var(--font-mono)' }}
                />
              </div>

              {erro && (
                <div className="alert alert-error" style={{ fontSize: '0.78rem' }}>
                  {erro}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn btn-teal"
                style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: '0.85rem', marginTop: 4 }}
              >
                {loading ? 'Criando conta…' : 'Criar Conta'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: 18 }}>
              <Link
                to="/login"
                style={{ fontSize: '0.75rem', color: 'var(--muted)', textDecoration: 'none' }}
              >
                Já tem conta? Fazer login
              </Link>
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 20, fontSize: '0.68rem', color: 'var(--muted)' }}>
        Dados processados localmente — R21 ITMIZER
      </div>
    </div>
  );
}
