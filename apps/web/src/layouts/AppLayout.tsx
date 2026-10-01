import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { TopNav } from '../features/nav/TopNav';
import { VersionModal } from '../components/VersionModal';
import versionData from '../version.json';

export function AppLayout() {
  const [showVersionModal, setShowVersionModal] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      <TopNav onOpenVersion={() => setShowVersionModal(true)} />
      <main style={{ flex: 1, padding: 'var(--sp-6)', overflowY: 'auto' }}>
        <Outlet />
      </main>
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '8px 24px',
        fontSize: '0.65rem',
        color: 'var(--muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>ThemisFlow — ITMIZER</span>
          <button
            onClick={() => setShowVersionModal(true)}
            style={{
              background: 'var(--panel-alt)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-soft)',
              padding: '2px 8px',
              fontSize: '0.65rem',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              transition: 'var(--transition)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--teal)';
              e.currentTarget.style.color = 'var(--teal)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.color = 'var(--text-soft)';
            }}
            title="Clique para ver detalhes da versão, diagnóstico e releases"
          >
            <span style={{ color: 'var(--teal)', fontSize: '0.6rem' }}>●</span>
            v{versionData.version} ({versionData.git.commit})
          </button>
        </div>
        <span>Dados processados localmente · Sem telemetria (R21)</span>
      </footer>

      {showVersionModal && <VersionModal onClose={() => setShowVersionModal(false)} />}
    </div>
  );
}
