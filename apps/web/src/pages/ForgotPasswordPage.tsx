import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { ThemisLogo } from '../design/ThemisLogo';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [erro, setErro] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch {
      setErro('Erro ao processar a solicitação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    background: 'var(--panel-alt)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text)',
    fontFamily: 'var(--font-mono)', fontSize: '0.82rem', outline: 'none',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <ThemisLogo size={32} />
          <div>
            <div style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '.04em' }}>
              ThemisFlow
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 1 }}>
              Recuperação de Senha
            </div>
          </div>
        </div>

        {sent ? (
          <div>
            <div style={{
              background: 'rgba(0, 201, 177, 0.1)', border: '1px solid var(--teal)',
              borderRadius: 8, padding: '14px 16px', marginBottom: 20,
              fontSize: '0.82rem', color: 'var(--text)', lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: 700, color: 'var(--teal)', marginBottom: 4 }}>✓ Solicitação enviada</div>
              Se o endereço <strong>{email}</strong> estiver cadastrado, você receberá um link de redefinição em instantes.
              <br /><br />
              <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                Caso não apareça na caixa de entrada, verifique o spam.
              </span>
            </div>
            <Link
              to="/login"
              style={{
                display: 'block', textAlign: 'center', padding: '10px 0',
                background: 'var(--teal)', color: '#0b1220', borderRadius: 'var(--radius-sm)',
                fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none',
              }}
            >
              Voltar para o Login
            </Link>
          </div>
        ) : (
          <form onSubmit={e => void handleSubmit(e)}>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 0, marginBottom: 18, lineHeight: 1.5 }}>
              Informe o e-mail da sua conta. Se ele estiver cadastrado, enviaremos um link para redefinir sua senha.
            </p>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-soft)', marginBottom: 5 }}>
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                style={inputStyle}
                placeholder="usuario@empresa.com"
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
              {loading ? 'Enviando…' : 'Enviar Link de Redefinição'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Link to="/login" style={{ fontSize: '0.75rem', color: 'var(--muted)', textDecoration: 'none' }}>
                ← Voltar para o Login
              </Link>
            </div>
          </form>
        )}
      </div>

      <div style={{ marginTop: 20, fontSize: '0.68rem', color: 'var(--muted)' }}>
        Dados processados localmente — R21 ITMIZER
      </div>
    </div>
  );
}
