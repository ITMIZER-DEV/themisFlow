import React, { useEffect, useState, useRef } from 'react';
import { api } from '../../services/api';
import { inputStyle, labelStyle, fieldStyle } from '../../components/Modal';

interface EmpresaData {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoEstadual: string | null;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  logomarca: string | null;

  erpSoftware: string;
  erpTipoIntegracao: 'BANCO' | 'PLANILHA';
  erpTipo: string;
  erpHost: string | null;
  erpPorta: number;
  erpDatabase: string | null;
  erpUsuario: string | null;
  erpSsl: boolean;
  erpAtivo: boolean;
  hasErpSenha?: boolean;
  erpStatus: string | null;
  erpUltimoTeste: string | null;
  erpMensagem: string | null;
}

export function EmpresaConfigPage() {
  const [form, setForm] = useState<EmpresaData>({
    id: 'default',
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    inscricaoEstadual: '',
    telefone: '',
    email: '',
    cidade: '',
    uf: '',
    logomarca: null,
    erpSoftware: 'VRSOFTWARE',
    erpTipoIntegracao: 'BANCO',
    erpTipo: 'POSTGRESQL',
    erpHost: '',
    erpPorta: 5432,
    erpDatabase: '',
    erpUsuario: '',
    erpSsl: false,
    erpAtivo: false,
    hasErpSenha: false,
    erpStatus: null,
    erpUltimoTeste: null,
    erpMensagem: null,
  });

  const [erpSenhaInput, setErpSenhaInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingDb, setTestingDb] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs?: number; version?: string } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [testingPreview, setTestingPreview] = useState(false);
  const [previewData, setPreviewData] = useState<{ total: number; rows: any[] } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 5000);
  };

  const handleTestPreview = async () => {
    setTestingPreview(true);
    setPreviewError(null);
    try {
      const res = await api.post<{ success: boolean; total?: number; rows?: any[]; error?: string }>('/empresa/erp/preview-vendatef');
      if (res.data.success) {
        setPreviewData({ total: res.data.total || 0, rows: res.data.rows || [] });
        showToast(`Consulta concluída: ${res.data.total} vendas encontradas.`);
      } else {
        setPreviewError(res.data.error || 'Erro na consulta.');
        showToast(res.data.error || 'Falha na consulta', 'error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao buscar dados';
      setPreviewError(msg);
      showToast(msg, 'error');
    } finally {
      setTestingPreview(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ success: boolean; empresa: EmpresaData }>('/empresa');
      if (res.data.empresa) {
        setForm(res.data.empresa);
        if (res.data.empresa.erpMensagem) {
          setTestResult({
            success: res.data.empresa.erpStatus === 'CONECTADO',
            message: res.data.empresa.erpMensagem,
          });
        }
      }
    } catch {
      showToast('Erro ao carregar configurações da empresa.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('A imagem deve ter no máximo 2MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setForm(prev => ({ ...prev, logomarca: base64 }));
      showToast('Logomarca carregada! Lembre-se de clicar em "Salvar".');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setForm(prev => ({ ...prev, logomarca: null }));
    if (fileInputRef.current) fileInputRef.current.value = '';
    showToast('Logomarca removida.');
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        erpPorta: Number(form.erpPorta) || 5432,
      };
      if (erpSenhaInput.trim()) {
        payload.erpSenha = erpSenhaInput.trim();
      }

      const res = await api.put<{ success: boolean; empresa: EmpresaData }>('/empresa', payload);
      if (res.data.success) {
        setForm(res.data.empresa);
        setErpSenhaInput('');
        showToast('Configurações da empresa salvas com sucesso!');
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Erro ao salvar.';
      showToast(errorMsg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingDb(true);
    setTestResult(null);
    try {
      const res = await api.post<{ success: boolean; latencyMs?: number; version?: string; message?: string; error?: string }>('/empresa/testar-conexao', {
        host: form.erpHost,
        port: Number(form.erpPorta) || 5432,
        database: form.erpDatabase,
        user: form.erpUsuario,
        password: erpSenhaInput || undefined,
        ssl: form.erpSsl,
      });

      if (res.data.success) {
        setTestResult({
          success: true,
          message: res.data.message || 'Conexão bem-sucedida!',
          latencyMs: res.data.latencyMs,
          version: res.data.version,
        });
        setForm(prev => ({ ...prev, erpStatus: 'CONECTADO', erpUltimoTeste: new Date().toISOString() }));
        showToast('Conexão com o banco do ERP realizada com sucesso!');
      } else {
        setTestResult({
          success: false,
          message: res.data.error || 'Falha ao conectar.',
        });
        setForm(prev => ({ ...prev, erpStatus: 'ERRO', erpUltimoTeste: new Date().toISOString() }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao testar conexão.';
      setTestResult({
        success: false,
        message: msg,
      });
      setForm(prev => ({ ...prev, erpStatus: 'ERRO', erpUltimoTeste: new Date().toISOString() }));
    } finally {
      setTestingDb(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--muted)', fontSize: '0.85rem' }}>
        Carregando configurações da empresa...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1050, margin: '0 auto', paddingBottom: 60 }}>
      {/* Toast flutuante */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
          padding: '12px 20px', borderRadius: 'var(--radius-sm)',
          background: toast.type === 'success' ? 'var(--teal)' : 'var(--red)',
          color: '#fff', fontSize: '0.82rem', fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,.4)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {toast.type === 'success' ? '✓' : '✖'} {toast.text}
        </div>
      )}

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '1.4rem', color: 'var(--text)', margin: 0 }}>
            Configurações da Empresa & Integrações
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
            Personalize a identidade da empresa cliente piloto e configure a integração direta com o banco de dados do ERP.
          </p>
        </div>

        <button
          onClick={() => void handleSave()}
          disabled={saving}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 22px', borderRadius: 'var(--radius-sm)',
            background: 'var(--teal)', color: '#0b1220', border: 'none',
            fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: '0.82rem',
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
            transition: 'opacity .15s',
          }}
        >
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 24 }}>
        {/* ── CARD 1: IDENTIDADE & DADOS CADASTRAIS ────────────────────── */}
        <div style={{
          background: 'var(--panel)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 24, display: 'flex', flexDirection: 'column', gap: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
            <span style={{ fontSize: '1.1rem' }}>🏢</span>
            <span style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)' }}>
              Identidade & Dados Cadastrais
            </span>
          </div>

          {/* Área da Logomarca */}
          <div style={{
            background: 'var(--panel-alt)', border: '1px dashed var(--border)',
            borderRadius: 'var(--radius-sm)', padding: 16, display: 'flex', alignItems: 'center', gap: 20,
          }}>
            <div style={{
              width: 96, height: 96, borderRadius: 'var(--radius-sm)',
              background: 'var(--bg)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', flexShrink: 0,
            }}>
              {form.logomarca ? (
                <img src={form.logomarca} alt="Logo da Empresa" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.65rem' }}>
                  <div style={{ fontSize: '1.4rem', marginBottom: 2 }}>🖼️</div>
                  Sem Logo
                </div>
              )}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                Logomarca da Empresa
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 12, lineHeight: 1.4 }}>
                Será exibida no cabeçalho do sistema e nos relatórios de conciliação (PNG, JPG ou SVG até 2MB).
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp, image/svg+xml"
                onChange={handleLogoUpload}
                style={{ display: 'none' }}
              />

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--panel)', border: '1px solid var(--teal)',
                    color: 'var(--teal)', fontSize: '0.74rem', fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {form.logomarca ? 'Trocar Logo' : 'Escolher Imagem'}
                </button>

                {form.logomarca && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    style={{
                      padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                      background: 'none', border: '1px solid var(--red)',
                      color: 'var(--red)', fontSize: '0.74rem', fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Remover
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Formulário Cadastral */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Nome Fantasia</label>
              <input
                style={inputStyle}
                placeholder="Ex: Supermercado Modelo"
                value={form.nomeFantasia}
                onChange={e => setForm(f => ({ ...f, nomeFantasia: e.target.value }))}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Razão Social</label>
              <input
                style={inputStyle}
                placeholder="Ex: Supermercado Modelo LTDA"
                value={form.razaoSocial}
                onChange={e => setForm(f => ({ ...f, razaoSocial: e.target.value }))}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>CNPJ</label>
              <input
                style={inputStyle}
                placeholder="00.000.000/0000-00"
                value={form.cnpj}
                onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Inscrição Estadual</label>
              <input
                style={inputStyle}
                placeholder="Opcional"
                value={form.inscricaoEstadual || ''}
                onChange={e => setForm(f => ({ ...f, inscricaoEstadual: e.target.value }))}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Telefone / WhatsApp</label>
              <input
                style={inputStyle}
                placeholder="(00) 00000-0000"
                value={form.telefone || ''}
                onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>E-mail Financeiro</label>
              <input
                style={inputStyle}
                placeholder="financeiro@empresa.com.br"
                value={form.email || ''}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Cidade</label>
              <input
                style={inputStyle}
                placeholder="Ex: Goiânia"
                value={form.cidade || ''}
                onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>UF</label>
              <input
                style={{ ...inputStyle, width: 80, textTransform: 'uppercase' }}
                maxLength={2}
                placeholder="GO"
                value={form.uf || ''}
                onChange={e => setForm(f => ({ ...f, uf: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* ── CARD 2: BANCO DE DADOS DO ERP (VRMASTER) ─────────────────── */}
        <div style={{
          background: 'var(--panel)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 24, display: 'flex', flexDirection: 'column', gap: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.1rem' }}>🗄️</span>
              <span style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)' }}>
                Integração com ERP & Entrada de Dados
              </span>
            </div>

            {/* Badge de Status se for modo banco */}
            {form.erpTipoIntegracao === 'BANCO' ? (
              form.erpStatus === 'CONECTADO' ? (
                <span style={{
                  background: 'rgba(0, 201, 177, 0.15)', border: '1px solid var(--teal)',
                  color: 'var(--teal)', fontSize: '0.7rem', padding: '3px 10px', borderRadius: 20, fontWeight: 700,
                }}>
                  🟢 Banco Conectado
                </span>
              ) : form.erpStatus === 'ERRO' ? (
                <span style={{
                  background: 'rgba(255, 93, 108, 0.15)', border: '1px solid var(--red)',
                  color: 'var(--red)', fontSize: '0.7rem', padding: '3px 10px', borderRadius: 20, fontWeight: 700,
                }}>
                  🔴 Erro no Banco
                </span>
              ) : (
                <span style={{
                  background: 'rgba(100, 116, 139, 0.2)', border: '1px solid var(--muted)',
                  color: 'var(--muted)', fontSize: '0.7rem', padding: '3px 10px', borderRadius: 20,
                }}>
                  ⚪ Não Conectado
                </span>
              )
            ) : (
              <span style={{
                background: 'rgba(240, 165, 0, 0.15)', border: '1px solid var(--gold)',
                color: 'var(--gold)', fontSize: '0.7rem', padding: '3px 10px', borderRadius: 20, fontWeight: 700,
              }}>
                📄 Modo Planilha Manual
              </span>
            )}
          </div>

          {/* 1. Software ERP Utilizado */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Software ERP Utilizado pelo Cliente</label>
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={form.erpSoftware || 'VRSOFTWARE'}
              onChange={e => setForm(f => ({ ...f, erpSoftware: e.target.value }))}
            >
              <option value="VRSOFTWARE">VRSoftware (VRMaster)</option>
              <option value="PROTHEUS">TOTVS Protheus</option>
              <option value="LINX">Linx</option>
              <option value="SANKHYA">Sankhya</option>
              <option value="WINTHOR">TOTVS WinThor</option>
              <option value="SENIOR">Senior Sistemas</option>
              <option value="OUTRO">Outro ERP / Sistema Próprio</option>
            </select>
          </div>

          {/* 2. Tipo de Acesso / Modo de Integração */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Como os dados do ERP serão obtidos?</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
              <div
                onClick={() => setForm(f => ({ ...f, erpTipoIntegracao: 'BANCO' }))}
                style={{
                  padding: '12px 14px', borderRadius: 'var(--radius-sm)',
                  border: `2px solid ${form.erpTipoIntegracao === 'BANCO' ? 'var(--teal)' : 'var(--border)'}`,
                  background: form.erpTipoIntegracao === 'BANCO' ? 'rgba(0, 201, 177, 0.08)' : 'var(--panel-alt)',
                  cursor: 'pointer', transition: 'all .15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.82rem', color: form.erpTipoIntegracao === 'BANCO' ? 'var(--teal)' : 'var(--text)' }}>
                  <input
                    type="radio"
                    name="tipoIntegracao"
                    checked={form.erpTipoIntegracao === 'BANCO'}
                    onChange={() => {}}
                    style={{ accentColor: 'var(--teal)' }}
                  />
                  ⚡ Acesso Direto ao Banco
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 4, lineHeight: 1.3 }}>
                  Conexão read-only segura para puxar vendas e extratos automaticamente com 1 clique.
                </div>
              </div>

              <div
                onClick={() => setForm(f => ({ ...f, erpTipoIntegracao: 'PLANILHA' }))}
                style={{
                  padding: '12px 14px', borderRadius: 'var(--radius-sm)',
                  border: `2px solid ${form.erpTipoIntegracao === 'PLANILHA' ? 'var(--gold)' : 'var(--border)'}`,
                  background: form.erpTipoIntegracao === 'PLANILHA' ? 'rgba(240, 165, 0, 0.08)' : 'var(--panel-alt)',
                  cursor: 'pointer', transition: 'all .15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.82rem', color: form.erpTipoIntegracao === 'PLANILHA' ? 'var(--gold)' : 'var(--text)' }}>
                  <input
                    type="radio"
                    name="tipoIntegracao"
                    checked={form.erpTipoIntegracao === 'PLANILHA'}
                    onChange={() => {}}
                    style={{ accentColor: 'var(--gold)' }}
                  />
                  📄 Planilha Manual (XLS / XLSX)
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 4, lineHeight: 1.3 }}>
                  Não possui acesso ao banco. A conciliação é feita via arrastar e soltar da planilha.
                </div>
              </div>
            </div>
          </div>

          {/* Se Modo Planilha: Exibe aviso e dispensa banco */}
          {form.erpTipoIntegracao === 'PLANILHA' ? (
            <div style={{
              background: 'rgba(240, 165, 0, 0.08)', border: '1px solid rgba(240, 165, 0, 0.3)',
              borderRadius: 'var(--radius-sm)', padding: '14px 16px', fontSize: '0.78rem', color: 'var(--text-soft)', lineHeight: 1.5
            }}>
              <div style={{ fontWeight: 700, color: 'var(--gold)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📁</span> Modo Planilha Manual Selecionado
              </div>
              O cliente não possui ou não deseja conceder acesso direto ao banco de dados do ERP.
              <br />
              A conciliação bancária funcionará normalmente através do envio manual de planilhas de extrato (<strong>.xls</strong> ou <strong>.xlsx</strong>) diretamente na aba <strong>Sistema</strong> da tela principal.
            </div>
          ) : (
            /* Se Modo Banco: Exibe os campos de conexão PostgreSQL */
            <>
              <div style={{
                background: 'rgba(0, 201, 177, 0.05)', border: '1px solid rgba(0, 201, 177, 0.2)',
                borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: '0.72rem', color: 'var(--text-soft)', lineHeight: 1.4
              }}>
                <strong style={{ color: 'var(--teal)' }}>🛡️ Garantia de Leitura Segura:</strong> A conexão ao banco do ERP é estritamente <strong>Read-Only</strong> (apenas <code>SELECT</code>). Nenhuma tabela, dado ou registro é jamais gravado ou alterado no sistema do cliente.
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 0' }}>
                <input
                  type="checkbox"
                  checked={form.erpAtivo}
                  onChange={e => setForm(f => ({ ...f, erpAtivo: e.target.checked }))}
                  style={{ accentColor: 'var(--teal)', width: 16, height: 16 }}
                />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>
                  Habilitar busca automática no banco de dados do ERP
                </span>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Host / Endereço IP do Servidor</label>
                  <input
                    style={inputStyle}
                    placeholder="ex: 192.168.1.100 ou localhost"
                    value={form.erpHost || ''}
                    onChange={e => setForm(f => ({ ...f, erpHost: e.target.value }))}
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Porta</label>
                  <input
                    type="number"
                    style={inputStyle}
                    placeholder="5432"
                    value={form.erpPorta}
                    onChange={e => setForm(f => ({ ...f, erpPorta: Number(e.target.value) || 5432 }))}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Nome do Banco (Database)</label>
                  <input
                    style={inputStyle}
                    placeholder="ex: vrmaster ou themisflow"
                    value={form.erpDatabase || ''}
                    onChange={e => setForm(f => ({ ...f, erpDatabase: e.target.value }))}
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Usuário (Read-Only)</label>
                  <input
                    style={inputStyle}
                    placeholder="ex: vrmaster_leitura"
                    value={form.erpUsuario || ''}
                    onChange={e => setForm(f => ({ ...f, erpUsuario: e.target.value }))}
                  />
                </div>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>
                  Senha do Banco {form.hasErpSenha && <span style={{ color: 'var(--teal)', textTransform: 'none' }}>(Senha já configurada)</span>}
                </label>
                <input
                  type="password"
                  style={inputStyle}
                  placeholder={form.hasErpSenha ? 'Deixe em branco para manter a senha atual' : 'Digite a senha do banco'}
                  value={erpSenhaInput}
                  onChange={e => setErpSenhaInput(e.target.value)}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={form.erpSsl}
                  onChange={e => setForm(f => ({ ...f, erpSsl: e.target.checked }))}
                  style={{ accentColor: 'var(--teal)' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                  Requer conexão segura SSL / TLS
                </span>
              </label>

              {/* Botão de Teste */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <button
                  type="button"
                  onClick={() => void handleTestConnection()}
                  disabled={testingDb || !form.erpHost || !form.erpDatabase || !form.erpUsuario}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--panel-alt)', border: '1px solid var(--teal)',
                    color: 'var(--teal)', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: '0.8rem',
                    cursor: (testingDb || !form.erpHost) ? 'not-allowed' : 'pointer',
                    opacity: (testingDb || !form.erpHost) ? 0.6 : 1,
                    transition: 'all .15s',
                  }}
                >
                  {testingDb ? 'Testando Conexão...' : '⚡ Testar Conexão com o Banco'}
                </button>

                {/* Resultado do Teste */}
                {testResult && (
                  <div style={{
                    marginTop: 12, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                    background: testResult.success ? 'rgba(0, 201, 177, 0.1)' : 'rgba(255, 93, 108, 0.1)',
                    border: `1px solid ${testResult.success ? 'var(--teal)' : 'var(--red)'}`,
                    fontSize: '0.75rem', color: 'var(--text)',
                  }}>
                    <div style={{ fontWeight: 700, color: testResult.success ? 'var(--teal)' : 'var(--red)', marginBottom: 2 }}>
                      {testResult.success ? '✓ Conexão bem-sucedida' : '✖ Falha na conexão'}
                    </div>
                    <div style={{ color: 'var(--text-soft)', wordBreak: 'break-all' }}>
                      {testResult.message}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── CARD 3: Parâmetros de Busca de Dados (Exibido apenas no modo BANCO) ───────── */}
        {form.erpTipoIntegracao === 'BANCO' && (
        <div style={{
          background: 'var(--panel)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 24, display: 'flex', flexDirection: 'column', gap: 18,
          gridColumn: '1 / -1',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.1rem' }}>📊</span>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>
                Parâmetros de Consulta de Vendas (VRSoftware — TEF)
              </h3>
            </div>
            <span style={{
              fontSize: '0.7rem', fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 4,
              background: 'rgba(0, 201, 177, 0.12)', color: 'var(--teal)', border: '1px solid rgba(0, 201, 177, 0.3)'
            }}>
              ESTRITAMENTE READ-ONLY
            </span>
          </div>

          <p style={{ margin: '0 0 16px 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
            O ThemisFlow lê diretamente as transações de cartão TEF da tabela do PDV do cliente para popular a aba <strong>Sistema</strong> da conciliação bancária.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div style={{ padding: '10px 12px', background: 'var(--panel-alt)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Schema Padrão</div>
              <div style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', color: 'var(--teal)', marginTop: 2 }}>pdv</div>
            </div>
            <div style={{ padding: '10px 12px', background: 'var(--panel-alt)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Tabela Alvo</div>
              <div style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', color: 'var(--gold)', marginTop: 2 }}>vendatef</div>
            </div>
            <div style={{ padding: '10px 12px', background: 'var(--panel-alt)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Modo de Operação</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text)', marginTop: 2 }}>Agrupamento diário por valor de venda</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleTestPreview()}
            disabled={testingPreview}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 'var(--radius-sm)',
              background: 'var(--panel-alt)', border: '1px solid var(--border)',
              color: 'var(--text)', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: '0.78rem',
              cursor: testingPreview ? 'not-allowed' : 'pointer',
              transition: 'all .15s',
            }}
          >
            {testingPreview ? 'Consultando...' : '🔍 Testar Consulta de Vendas (Amostra / Preview)'}
          </button>

          {previewError && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
              background: 'rgba(255, 93, 108, 0.1)', border: '1px solid var(--red)',
              fontSize: '0.75rem', color: 'var(--red)'
            }}>
              {previewError}
            </div>
          )}

          {previewData && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                  Total de vendas válidas na base: <strong style={{ color: 'var(--teal)' }}>{previewData.total}</strong> (exibindo amostra das últimas {previewData.rows.length}):
                </span>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--panel-alt)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 10px', color: 'var(--muted)', fontWeight: 700 }}>Data/Hora</th>
                      <th style={{ padding: '8px 10px', color: 'var(--muted)', fontWeight: 700 }}>PDV / Cupom</th>
                      <th style={{ padding: '8px 10px', color: 'var(--muted)', fontWeight: 700 }}>NSU</th>
                      <th style={{ padding: '8px 10px', color: 'var(--muted)', fontWeight: 700 }}>Rede / Bandeira</th>
                      <th style={{ padding: '8px 10px', color: 'var(--muted)', fontWeight: 700 }}>Tipo</th>
                      <th style={{ padding: '8px 10px', color: 'var(--muted)', fontWeight: 700, textAlign: 'right' }}>Valor (R$)</th>
                      <th style={{ padding: '8px 10px', color: 'var(--muted)', fontWeight: 700 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                        <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>{r.data} {r.hora}</td>
                        <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>PDV {r.pdv} · #{r.cupom}</td>
                        <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{r.nsu}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ fontWeight: 600 }}>{r.rede}</span> · <span style={{ color: 'var(--muted)' }}>{r.bandeira}</span>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{
                            padding: '2px 6px', borderRadius: 3, fontSize: '0.65rem', fontWeight: 700,
                            background: r.tipo === 'CREDITO' ? 'rgba(0, 201, 177, 0.15)' : r.tipo === 'DEBITO' ? 'rgba(240, 165, 0, 0.15)' : 'rgba(255,255,255,0.1)',
                            color: r.tipo === 'CREDITO' ? 'var(--teal)' : r.tipo === 'DEBITO' ? 'var(--gold)' : 'var(--text)'
                          }}>
                            {r.tipo}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--teal)' }}>
                          {Number(r.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-soft)' }}>{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
