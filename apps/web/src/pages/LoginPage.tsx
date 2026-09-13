import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useMenuStore } from '../stores/menuStore';
import { ThemisLogo } from '../design/ThemisLogo';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const { login, loading } = useAuthStore();
  const loadMenu = useMenuStore(s => s.loadMenu);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    try {
      await login(email, senha);
      await loadMenu();
      navigate('/', { replace: true });
    } catch {
      setErro('Email ou senha incorretos.');
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg)', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 380,
        background: 'var(--panel)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '36px 32px',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <ThemisLogo size={32} />
          <div>
            <div style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '.04em' }}>
              ThemisFlow
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 1 }}>
              Sistema Financeiro ITMIZER
            </div>
          </div>
        </div>

        <form onSubmit={e => void handleSubmit(e)}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-soft)', marginBottom: 5 }}>
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                width: '100%', padding: '9px 12px',
                background: 'var(--panel-alt)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--text)',
                fontFamily: 'var(--font-mono)', fontSize: '0.82rem',
                outline: 'none',
              }}
              placeholder="usuario@empresa.com"
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-soft)', marginBottom: 5 }}>
              Senha
            </label>
            <input
              type="password"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: '100%', padding: '9px 12px',
                background: 'var(--panel-alt)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--text)',
                fontFamily: 'var(--font-mono)', fontSize: '0.82rem',
                outline: 'none',
              }}
              placeholder="••••••••"
            />
          </div>

          {erro && (
            <div className="alert alert-error" style={{ marginBottom: 14, fontSize: '0.78rem' }}>
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-teal"
            style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: '0.85rem' }}
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>

      <div style={{ marginTop: 20, fontSize: '0.68rem', color: 'var(--muted)' }}>
        Dados processados localmente — R21 ITMIZER
      </div>
    </div>
  );
}
