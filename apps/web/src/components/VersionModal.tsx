import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { api } from '../services/api';
import versionData from '../version.json';
import releasesData from '../releases.json';

interface ApiVersionResponse {
  name: string;
  version: string;
  displayVersion: string;
  service: string;
  uptimeSeconds: number;
  timezone: string;
  nodeVersion: string;
  database: {
    status: string;
    client: string;
  };
  duckdb: {
    status: string;
  };
  git: {
    commit: string;
    branch: string;
    commitDateBR?: string;
  };
  buildTimeBR: string;
}

interface VersionModalProps {
  onClose: () => void;
}

export function VersionModal({ onClose }: VersionModalProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'releases'>('info');
  const [apiData, setApiData] = useState<ApiVersionResponse | null>(null);
  const [loadingApi, setLoadingApi] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let unmounted = false;
    api.get<ApiVersionResponse>('/version')
      .then(res => {
        if (!unmounted) {
          setApiData(res.data);
          setLoadingApi(false);
        }
      })
      .catch(() => {
        if (!unmounted) setLoadingApi(false);
      });
    return () => { unmounted = true; };
  }, []);

  function handleCopyDiagnostic() {
    const diagnostic = {
      app: 'ThemisFlow',
      client: {
        version: versionData.version,
        displayVersion: versionData.displayVersion,
        git: versionData.git,
        buildTime: versionData.buildTimeBR,
        userAgent: navigator.userAgent,
      },
      backend: apiData || 'offline/unavailable',
      timestamp: new Date().toISOString(),
    };

    navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <Modal title="Sobre o ThemisFlow" onClose={onClose} width={580}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        marginBottom: 16,
        gap: 16,
      }}>
        <button
          onClick={() => setActiveTab('info')}
          style={{
            background: 'none',
            border: 'none',
            padding: '8px 4px',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            color: activeTab === 'info' ? 'var(--teal)' : 'var(--text-soft)',
            borderBottom: activeTab === 'info' ? '2px solid var(--teal)' : '2px solid transparent',
            transition: 'var(--transition)',
          }}
        >
          Diagnóstico do Sistema
        </button>
        <button
          onClick={() => setActiveTab('releases')}
          style={{
            background: 'none',
            border: 'none',
            padding: '8px 4px',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            color: activeTab === 'releases' ? 'var(--teal)' : 'var(--text-soft)',
            borderBottom: activeTab === 'releases' ? '2px solid var(--teal)' : '2px solid transparent',
            transition: 'var(--transition)',
          }}
        >
          Histórico de Releases ({releasesData.length})
        </button>
      </div>

      {activeTab === 'info' ? (
        <div>
          {/* Header badge */}
          <div style={{
            background: 'var(--panel-alt)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--text)' }}>
                  ThemisFlow
                </span>
                <span style={{
                  background: 'rgba(0, 201, 177, 0.15)',
                  color: 'var(--teal)',
                  border: '1px solid var(--teal)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 8px',
                }}>
                  v{versionData.version}
                </span>
                <span style={{
                  background: 'rgba(240, 165, 0, 0.12)',
                  color: 'var(--gold)',
                  border: '1px solid var(--gold)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 6px',
                }}>
                  git:{versionData.git.commit}
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 4 }}>
                Ferramenta de Conciliação Bancária & Voucher ERP · ITMIZER
              </div>
            </div>

            <button
              onClick={handleCopyDiagnostic}
              className="btn btn-ghost"
              style={{ fontSize: '0.72rem', padding: '6px 12px' }}
            >
              {copied ? '✓ Copiado!' : '📋 Copiar Diagnóstico'}
            </button>
          </div>

          {/* Grid de informações técnicas */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            fontSize: '0.78rem',
            marginBottom: 16,
          }}>
            <div style={{
              background: 'var(--panel-alt)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
            }}>
              <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>
                Frontend (Web SPA)
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div><strong>Versão:</strong> {versionData.displayVersion}</div>
                <div><strong>Branch:</strong> <code style={{ color: 'var(--teal)' }}>{versionData.git.branch}</code></div>
                <div><strong>Compilado em:</strong> {versionData.buildTimeBR}</div>
                <div><strong>Commit Ref:</strong> {versionData.git.commit}</div>
              </div>
            </div>

            <div style={{
              background: 'var(--panel-alt)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
            }}>
              <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>
                Backend (Fastify API)
              </span>
              {loadingApi ? (
                <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Consultando servidor...</div>
              ) : apiData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div><strong>Versão:</strong> v{apiData.version} ({apiData.git?.commit || 'local'})</div>
                  <div>
                    <strong>PostgreSQL:</strong>{' '}
                    <span style={{ color: apiData.database?.status === 'connected' ? 'var(--teal)' : 'var(--red)' }}>
                      {apiData.database?.status === 'connected' ? '● Conectado' : '○ Desconectado'}
                    </span>
                  </div>
                  <div><strong>Node.js:</strong> {apiData.nodeVersion}</div>
                  <div><strong>Fuso Horário:</strong> {apiData.timezone} (GMT-3)</div>
                </div>
              ) : (
                <div style={{ color: 'var(--warn)' }}>API offline ou inacessível</div>
              )}
            </div>
          </div>

          {/* Último commit */}
          <div style={{
            background: 'var(--panel-alt)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 12px',
            fontSize: '0.75rem',
          }}>
            <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 2 }}>
              Último Commit no Repositório
            </span>
            <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-soft)' }}>
              "{versionData.git.commitMessage}"
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 2 }}>
              Data: {versionData.git.commitDateBR} · Total de commits: {versionData.git.commitCount}
            </div>
          </div>
        </div>
      ) : (
        /* Timeline de releases */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '60vh', overflowY: 'auto' }}>
          {releasesData.map((rel, idx) => (
            <div
              key={rel.version}
              style={{
                background: 'var(--panel-alt)',
                border: idx === 0 ? '1px solid var(--teal)' : '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    color: idx === 0 ? 'var(--teal)' : 'var(--text)',
                  }}>
                    {rel.version}
                  </span>
                  {idx === 0 && (
                    <span style={{
                      background: 'var(--teal)',
                      color: '#000',
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      padding: '1px 6px',
                      borderRadius: 'var(--radius-sm)',
                    }}>
                      VERSÃO ATIVA
                    </span>
                  )}
                  <span style={{
                    fontSize: '0.65rem',
                    textTransform: 'uppercase',
                    color: 'var(--muted)',
                    border: '1px solid var(--border)',
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-sm)',
                  }}>
                    {rel.type}
                  </span>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                  {rel.date}
                </span>
              </div>

              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                {rel.title}
              </div>

              <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.75rem', color: 'var(--text-soft)', lineHeight: 1.5 }}>
                {rel.highlights.map((h, hIdx) => (
                  <li key={hIdx}>{h}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
