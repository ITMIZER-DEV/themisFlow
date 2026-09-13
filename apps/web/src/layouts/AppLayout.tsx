import { Outlet } from 'react-router-dom';
import { TopNav } from '../features/nav/TopNav';

export function AppLayout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      <TopNav />
      <main style={{ flex: 1, padding: 'var(--sp-6)', overflowY: 'auto' }}>
        <Outlet />
      </main>
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '8px 24px',
        fontSize: '0.65rem',
        color: 'var(--muted)',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>ThemisFlow — ITMIZER</span>
        <span>Dados processados localmente · Sem telemetria (R21)</span>
      </footer>
    </div>
  );
}
