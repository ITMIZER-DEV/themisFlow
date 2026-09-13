import { useState, useEffect } from 'react';
import { api } from '../../services/api';

interface SftpConfigData {
  id: string;
  provedor: string;
  host: string;
  porta: number;
  usuario: string;
  hasSenha: boolean;
  pastaRemota: string;
  pastaLocal: string;
  horarioExecucao: string;
  ativo: boolean;
  autoProcessar: boolean;
  ultimoStatus: string | null;
  ultimoDownload: string | null;
  ultimaMensagem: string | null;
}

interface SftpLogItem {
  id: string;
  iniciadoEm: string;
  finalizadoEm: string | null;
  tipo: string;
  status: string;
  arquivosEncontrados: number;
  arquivosBaixados: number;
  arquivosProcessados: number;
  mensagem: string | null;
  detalhes?: { lotesCriados?: string[] };
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

export function SftpConfigPage() {
  const [config, setConfig] = useState<SftpConfigData>({
    id: 'getnet',
    provedor: 'GETNET',
    host: '',
    porta: 22,
    usuario: '',
    hasSenha: false,
    pastaRemota: '/',
    pastaLocal: 'storage/sftp/getnet',
    horarioExecucao: '05:00',
    ativo: false,
    autoProcessar: true,
    ultimoStatus: null,
    ultimoDownload: null,
    ultimaMensagem: null,
  });

  const [senhaInput, setSenhaInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    filesFound?: number;
  } | null>(null);
  const [logs, setLogs] = useState<SftpLogItem[]>([]);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 5000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [confRes, logsRes] = await Promise.all([
        api.get<{ success: boolean; data: SftpConfigData }>('/sftp/config'),
        api.get<{ success: boolean; logs: SftpLogItem[] }>('/sftp/logs?limit=15'),
      ]);

      if (confRes.data.success && confRes.data.data) {
        setConfig(confRes.data.data);
      }
      if (logsRes.data.success && logsRes.data.logs) {
        setLogs(logsRes.data.logs);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar configurações';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        host: config.host,
        porta: config.porta,
        usuario: config.usuario,
        pastaRemota: config.pastaRemota,
        pastaLocal: config.pastaLocal,
        horarioExecucao: config.horarioExecucao,
        ativo: config.ativo,
        autoProcessar: config.autoProcessar,
      };

      if (senhaInput.trim().length > 0) {
        payload.senha = senhaInput.trim();
      }

      const res = await api.put<{ success: boolean; message: string; data: SftpConfigData }>('/sftp/config', payload);
      if (res.data.success) {
        showToast(res.data.message || 'Configurações salvas e agendador atualizado!', 'success');
        setConfig(res.data.data);
        setSenhaInput('');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar';
      showToast(`Falha ao salvar: ${msg}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const payload: Record<string, unknown> = {
        host: config.host,
        porta: config.porta,
        usuario: config.usuario,
        pastaRemota: config.pastaRemota,
      };
      if (senhaInput.trim().length > 0) {
        payload.senha = senhaInput.trim();
      }

      const res = await api.post<{
        success: boolean;
        message: string;
        latencyMs?: number;
        filesFound?: number;
      }>('/sftp/test', payload);

      setTestResult(res.data);
      if (res.data.success) {
        showToast('Conexão SFTP testada com sucesso!', 'success');
      } else {
        showToast(res.data.message, 'error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na conexão SFTP';
      setTestResult({ success: false, message: msg });
      showToast(msg, 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await api.post<{
        success: boolean;
        arquivosBaixados: number;
        arquivosProcessados: number;
        mensagem: string;
      }>('/sftp/sync-now');

      if (res.data.success) {
        showToast(res.data.mensagem, 'success');
        await loadData();
      } else {
        showToast('Erro ao sincronizar arquivos.', 'error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro na sincronização';
      showToast(`Falha: ${msg}`, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '8px 12px',
    color: 'var(--text)',
    fontSize: '0.82rem',
    fontFamily: 'var(--font-ui)',
    marginTop: 4,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--muted)',
    display: 'block',
    marginTop: 12,
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', color: 'var(--text)' }}>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: 8,
            fontSize: '0.85rem',
            fontWeight: 600,
            background: toast.type === 'error' ? 'var(--red)' : toast.type === 'info' ? 'var(--gold)' : 'var(--teal)',
            color: '#0b1220',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {toast.text}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--muted)', fontSize: '0.8rem' }}>
          Carregando dados da integração SFTP...
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontFamily: 'var(--font-title)', fontSize: '1.4rem', margin: 0 }}>
              Integração SFTP Getnet & Agendador
            </h1>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 4,
                background: config.ativo ? 'rgba(0, 201, 177, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                color: config.ativo ? 'var(--teal)' : 'var(--muted)',
                border: `1px solid ${config.ativo ? 'var(--teal)' : 'var(--border)'}`,
              }}
            >
              {config.ativo ? '● AGENDAMENTO DIÁRIO ATIVO' : 'PAUSADO'}
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
            Configuração de credenciais SFTP, diretório de recebimento do extrato eletrônico e agendamento automático diário.
          </p>
        </div>

        <button
          onClick={handleSyncNow}
          disabled={syncing || !config.host}
          style={{
            padding: '10px 18px',
            fontSize: '0.8rem',
            fontWeight: 700,
            borderRadius: 6,
            background: 'var(--teal)',
            border: 'none',
            color: '#0b1220',
            cursor: syncing || !config.host ? 'default' : 'pointer',
            opacity: syncing || !config.host ? 0.6 : 1,
            boxShadow: '0 4px 14px rgba(0,201,177,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>🔄</span> {syncing ? 'Sincronizando...' : 'Baixar e Processar Agora'}
        </button>
      </div>

      {/* Status Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Status da Conexão
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: config.ultimoStatus === 'CONECTADO' || config.ultimoStatus === 'SUCESSO' ? 'var(--teal)' : config.ultimoStatus === 'ERRO' ? 'var(--red)' : 'var(--gold)',
              }}
            />
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
              {config.ultimoStatus || 'PENDENTE'}
            </span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {config.ultimaMensagem || 'Nenhum teste efetuado ainda.'}
          </div>
        </div>

        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Último Download Concluído
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)', marginTop: 6 }}>
            {config.ultimoDownload ? fmtDateTime(config.ultimoDownload) : 'Nenhum'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 4 }}>
            Local: <span style={{ fontFamily: 'var(--font-mono)' }}>{config.pastaLocal}</span>
          </div>
        </div>

        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Rotina Automática Diária
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: config.ativo ? 'var(--teal)' : 'var(--muted)', marginTop: 6 }}>
            {config.ativo ? `Todos os dias às ${config.horarioExecucao}` : 'Desativado'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 4 }}>
            {config.autoProcessar ? 'Auto-processa EDI V10 no ThemisFlow' : 'Somente download dos arquivos'}
          </div>
        </div>
      </div>

      {/* Formulário de Configuração */}
      <form onSubmit={handleSave} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
          Credenciais SFTP & Diretórios
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div>
            <label style={labelStyle}>Host / Endereço SFTP</label>
            <input
              type="text"
              placeholder="ex: sftp.getnet.com.br ou ip"
              value={config.host}
              onChange={(e) => setConfig({ ...config, host: e.target.value })}
              style={inputStyle}
              required
            />
          </div>

          <div>
            <label style={labelStyle}>Porta</label>
            <input
              type="number"
              value={config.porta}
              onChange={(e) => setConfig({ ...config, porta: parseInt(e.target.value, 10) || 22 })}
              style={inputStyle}
              required
            />
          </div>

          <div>
            <label style={labelStyle}>Usuário / Login SFTP</label>
            <input
              type="text"
              placeholder="ex: 14961495"
              value={config.usuario}
              onChange={(e) => setConfig({ ...config, usuario: e.target.value })}
              style={inputStyle}
              required
            />
          </div>

          <div>
            <label style={labelStyle}>
              Senha SFTP {config.hasSenha && <span style={{ color: 'var(--teal)', fontWeight: 400 }}>(Já cadastrada)</span>}
            </label>
            <input
              type="password"
              placeholder={config.hasSenha ? '•••••••••••• (deixe vazio para manter)' : 'Digite a senha SFTP'}
              value={senhaInput}
              onChange={(e) => setSenhaInput(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Pasta Remota (Servidor SFTP)</label>
            <input
              type="text"
              placeholder="/"
              value={config.pastaRemota}
              onChange={(e) => setConfig({ ...config, pastaRemota: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Pasta Local de Armazenamento</label>
            <input
              type="text"
              placeholder="storage/sftp/getnet"
              value={config.pastaLocal}
              onChange={(e) => setConfig({ ...config, pastaLocal: e.target.value })}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Seção de Agendamento Diário */}
        <h3 style={{ margin: '24px 0 16px 0', fontSize: '0.95rem', color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
          Agendamento Diário & Automação
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, alignItems: 'center' }}>
          <div>
            <label style={labelStyle}>Horário Diário de Execução (HH:MM)</label>
            <input
              type="time"
              value={config.horarioExecucao}
              onChange={(e) => setConfig({ ...config, horarioExecucao: e.target.value })}
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem' }}>
              <input
                type="checkbox"
                checked={config.ativo}
                onChange={(e) => setConfig({ ...config, ativo: e.target.checked })}
                style={{ accentColor: 'var(--teal)', width: 16, height: 16 }}
              />
              <span>Ativar Agendador Diário em Background</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem' }}>
              <input
                type="checkbox"
                checked={config.autoProcessar}
                onChange={(e) => setConfig({ ...config, autoProcessar: e.target.checked })}
                style={{ accentColor: 'var(--teal)', width: 16, height: 16 }}
              />
              <span>Processar e Ingerir no Sistema Automaticamente após Download</span>
            </label>
          </div>
        </div>

        {/* Resultado do Teste */}
        {testResult && (
          <div
            style={{
              marginTop: 20,
              padding: '12px 16px',
              borderRadius: 8,
              fontSize: '0.82rem',
              background: testResult.success ? 'rgba(0, 201, 177, 0.12)' : 'rgba(255, 93, 108, 0.12)',
              border: `1px solid ${testResult.success ? 'var(--teal)' : 'var(--red)'}`,
              color: 'var(--text)',
            }}
          >
            <strong>{testResult.success ? '✓ Sucesso:' : '✕ Falha:'}</strong> {testResult.message}
          </div>
        )}

        {/* Botões do Formulário */}
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '9px 20px',
              fontSize: '0.82rem',
              fontWeight: 700,
              borderRadius: 6,
              background: 'var(--teal)',
              border: 'none',
              color: '#0b1220',
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>

          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || !config.host}
            style={{
              padding: '9px 18px',
              fontSize: '0.82rem',
              fontWeight: 600,
              borderRadius: 6,
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              cursor: testing || !config.host ? 'default' : 'pointer',
            }}
          >
            {testing ? 'Testando Conexão...' : '🔍 Testar Conexão SFTP'}
          </button>
        </div>
      </form>

      {/* Histórico de Execuções */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text)' }}>
            Histórico de Execuções e Downloads
          </h3>
          <button
            onClick={loadData}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            Atualizar logs ⟳
          </button>
        </div>

        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
            Nenhum registro de download realizado até o momento.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', textAlign: 'left' }}>
                <th style={{ padding: '8px 6px' }}>Data / Hora</th>
                <th style={{ padding: '8px 6px' }}>Tipo</th>
                <th style={{ padding: '8px 6px' }}>Status</th>
                <th style={{ padding: '8px 6px', textAlign: 'center' }}>Arquivos Baixados</th>
                <th style={{ padding: '8px 6px', textAlign: 'center' }}>Processados</th>
                <th style={{ padding: '8px 6px' }}>Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid rgba(35, 58, 92, 0.4)' }}>
                  <td style={{ padding: '7px 6px', fontFamily: 'var(--font-mono)' }}>{fmtDateTime(log.iniciadoEm)}</td>
                  <td style={{ padding: '7px 6px' }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        background: 'rgba(255, 255, 255, 0.06)',
                      }}
                    >
                      {log.tipo}
                    </span>
                  </td>
                  <td style={{ padding: '7px 6px' }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        background: log.status === 'SUCESSO' ? 'rgba(0, 201, 177, 0.15)' : log.status === 'ERRO' ? 'rgba(255, 93, 108, 0.15)' : 'rgba(240, 165, 0, 0.15)',
                        color: log.status === 'SUCESSO' ? 'var(--teal)' : log.status === 'ERRO' ? 'var(--red)' : 'var(--gold)',
                      }}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td style={{ padding: '7px 6px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{log.arquivosBaixados}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{log.arquivosProcessados}</td>
                  <td style={{ padding: '7px 6px', color: 'var(--text-soft)' }}>{log.mensagem || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
