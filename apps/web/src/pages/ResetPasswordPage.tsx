import { useState, useEffect, type FormEvent } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { ThemisLogo } from '../design/ThemisLogo';

type PageStatus = 'validating' | 'valid' | 'invalid' | 'success';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [status, setStatus] = useState<PageStatus>('validating');
  const [nome, setNome] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }
    api.get<{ success: boolean; nome?: string }>(`/auth/validate-reset-token/${token}`)
      .then(res => {
        if (res.data.success) {
          setNome(res.data.nome ?? '');
          setStatus('valid');
        } else {
          setStatus('invalid');
        }
      })
      .catch(() => setStatus('invalid'));
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    if (novaSenha.length < 6) {
      setErro('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (novaSenha !== confirma) {
      setErro('As senhas não coincidem.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/reset-password', { token, novaSenha });
      setStatus('success');
      setTimeout(() => navigate('/login', { replace: true }), 3000);
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error;
      setErro(msg || 'Erro ao redefinir senha. O link pode ter expirado.');
    } finally {
      setSaving(false);
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
              Redefinição de Senha
            </div>
          </div>
        </div>

        {status === 'validating' && (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.82rem', padding: '20px 0' }}>
            Validando link de redefinição…
          </div>
        )}

        {status === 'invalid' && (
          <div>
            <div style={{
              background: 'rgba(255, 93, 108, 0.1)', border: '1px solid var(--red)',
              borderRadius: 8, padding: '14px 16px', marginBottom: 20,
              fontSize: '0.82rem', color: 'var(--text)', lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>Link inválido ou expirado</div>
              Este link de redefinição não é mais válido. Os links expiram após 1 hora de uso.
            </div>
            <Link
              to="/forgot-password"
              style={{
                display: 'block', textAlign: 'center', padding: '10px 0',
                background: 'var(--teal)', color: '#0b1220', borderRadius: 'var(--radius-sm)',
                fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none',
              }}
            >
              Solicitar novo link
            </Link>
          </div>
        )}

        {status === 'success' && (
          <div>
            <div style={{
              background: 'rgba(0, 201, 177, 0.1)', border: '1px solid var(--teal)',
              borderRadius: 8, padding: '14px 16px', marginBottom: 20,
              fontSize: '0.82rem', color: 'var(--text)', lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: 700, color: 'var(--teal)', marginBottom: 4 }}>✓ Senha redefinida com sucesso</div>
              Sua senha foi alterada. Redirecionando para o login em instantes…
            </div>
            <Link
              to="/login"
              style={{
                display: 'block', textAlign: 'center', padding: '10px 0',
                background: 'var(--teal)', color: '#0b1220', borderRadius: 'var(--radius-sm)',
                fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none',
              }}
            >
              Ir para o Login
            </Link>
          </div>
        )}

        {status === 'valid' && (
          <form onSubmit={e => void handleSubmit(e)}>
            {nome && (
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 0, marginBottom: 18, lineHeight: 1.5 }}>
                Olá, <strong style={{ color: 'var(--text)' }}>{nome}</strong>. Defina sua nova senha abaixo.
              </p>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-soft)', marginBottom: 5 }}>
                Nova Senha
              </label>
              <input
                type="password"
                value={novaSenha}
                onChange={e => setNovaSenha(e.target.value)}
                required
                autoFocus
                autoComplete="new-password"
                style={inputStyle}
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-soft)', marginBottom: 5 }}>
                Confirmar Nova Senha
              </label>
              <input
                type="password"
                value={confirma}
                onChange={e => setConfirma(e.target.value)}
                required
                autoComplete="new-password"
                style={inputStyle}
                placeholder="Repita a senha"
              />
            </div>

            {erro && (
              <div className="alert alert-error" style={{ marginBottom: 14, fontSize: '0.78rem' }}>
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="btn btn-teal"
              style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: '0.85rem' }}
            >
              {saving ? 'Salvando…' : 'Redefinir Senha'}
            </button>
          </form>
        )}
      </div>

      <div style={{ marginTop: 20, fontSize: '0.68rem', color: 'var(--muted)' }}>
        Dados processados localmente — R21 ITMIZER
      </div>
    </div>
  );
}
