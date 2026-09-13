import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useMenuStore } from '../../stores/menuStore';

interface Props {
  requireAdmin?: boolean;
}

export function ProtectedRoute({ requireAdmin = false }: Props) {
  const { user, loading, tryRefresh, hasRole } = useAuthStore();
  const loadMenu = useMenuStore(s => s.loadMenu);
  const menuLoaded = useMenuStore(s => s.loaded);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (user) {
      if (!menuLoaded) void loadMenu();
      setChecked(true);
      return;
    }
    void tryRefresh().then(ok => {
      if (ok && !menuLoaded) void loadMenu();
      setChecked(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!checked || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--teal)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && !hasRole('admin')) return <Navigate to="/" replace />;

  return <Outlet />;
}
