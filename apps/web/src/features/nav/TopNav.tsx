import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useMenuStore, type MenuItemData } from '../../stores/menuStore';
import { useThemeStore } from '../../stores/themeStore';
import { ThemisLogo } from '../../design/ThemisLogo';
import { api } from '../../services/api';

function DropdownMenu({ items, onClose }: { items: MenuItemData[]; onClose: () => void }) {
  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, minWidth: 180, zIndex: 100,
      background: 'var(--panel)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)', boxShadow: '0 8px 24px rgba(0,0,0,.4)',
      marginTop: 4, overflow: 'hidden',
    }}>
      {items.map(child => (
        <NavLink
          key={child.chave}
          to={child.rota}
          onClick={onClose}
          style={({ isActive }) => ({
            display: 'block', padding: '9px 16px',
            fontSize: '0.78rem', color: isActive ? 'var(--teal)' : 'var(--text)',
            textDecoration: 'none', background: isActive ? 'var(--teal-bg)' : 'transparent',
            transition: 'background .12s',
          })}
          onMouseEnter={e => { if (!(e.currentTarget as HTMLElement).style.color.includes('teal')) (e.currentTarget as HTMLElement).style.background = 'var(--panel-alt)'; }}
          onMouseLeave={e => { if (!(e.currentTarget as HTMLElement).style.color.includes('teal')) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          {child.rotulo}
        </NavLink>
      ))}
    </div>
  );
}

function NavItem({ item }: { item: MenuItemData }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (item.filhos.length === 0) {
    return (
      <NavLink
        to={item.rota}
        style={({ isActive }) => ({
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '0 14px', height: '100%',
          fontSize: '0.8rem', fontWeight: 600,
          color: isActive ? 'var(--teal)' : 'var(--text-soft)',
          textDecoration: 'none',
          borderBottom: isActive ? '2px solid var(--teal)' : '2px solid transparent',
          transition: 'color .12s, border-color .12s',
        })}
      >
        {item.rotulo}
      </NavLink>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '0 14px', height: '100%',
          fontSize: '0.8rem', fontWeight: 600,
          color: open ? 'var(--teal)' : 'var(--text-soft)',
          background: 'none', border: 'none',
          borderBottom: open ? '2px solid var(--teal)' : '2px solid transparent',
          cursor: 'pointer', transition: 'color .12s',
        }}
      >
        {item.rotulo}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <DropdownMenu items={item.filhos} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function TopNav() {
  const { user, logout } = useAuthStore();
  const { items } = useMenuStore();
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useThemeStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [empresa, setEmpresa] = useState<{ nomeFantasia: string; logomarca: string | null } | null>(null);

  useEffect(() => {
    api.get<{ success: boolean; empresa: { nomeFantasia: string; logomarca: string | null } }>('/empresa/public')
      .then(res => {
        if (res.data.empresa) setEmpresa(res.data.empresa);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => { if (!userMenuRef.current?.contains(e.target as Node)) setUserMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const roleLabel = user?.roles.includes('admin') ? 'admin'
    : user?.roles.includes('supervisor') ? 'supervisor'
    : 'operador';

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 200,
      height: 'var(--nav-h)',
      background: 'var(--panel)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'stretch',
      padding: '0 20px',
    }}>
      {/* Logo ThemisFlow */}
      <NavLink to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', marginRight: 12 }}>
        <ThemisLogo size={24} />
        <span style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '0.9rem', letterSpacing: '.04em', color: 'var(--text)' }}>
          ThemisFlow
        </span>
      </NavLink>

      {/* Logomarca ou Nome da Empresa */}
      {empresa?.logomarca ? (
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 10, borderLeft: '1px solid var(--border)', marginRight: 12 }}>
          <img src={empresa.logomarca} alt={empresa.nomeFantasia} style={{ maxHeight: 22, maxWidth: 90, objectFit: 'contain' }} />
        </div>
      ) : empresa?.nomeFantasia ? (
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 10, borderLeft: '1px solid var(--border)', marginRight: 12 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {empresa.nomeFantasia}
          </span>
        </div>
      ) : null}

      {/* Separador */}
      <div style={{ width: 1, background: 'var(--border)', margin: '10px 8px' }} />

      {/* Menu items */}
      <nav style={{ display: 'flex', alignItems: 'stretch', flex: 1, gap: 2 }}>
        {items.map(item => <NavItem key={item.chave} item={item} />)}
      </nav>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 'var(--radius-sm)',
          background: 'none', border: '1px solid var(--border)',
          cursor: 'pointer', color: 'var(--muted)',
          transition: 'color var(--transition), border-color var(--transition)',
          marginRight: 8,
        }}
      >
        {theme === 'dark' ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        )}
      </button>

      {/* User dropdown */}
      <div ref={userMenuRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <button
          onClick={() => setUserMenuOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 10px', borderRadius: 'var(--radius-sm)',
            background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--teal-bg)', border: '1px solid var(--teal)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.7rem', fontWeight: 700, color: 'var(--teal)',
          }}>
            {user?.nome.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>
              {user?.nome.split(' ')[0]}
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', lineHeight: 1 }}>
              {roleLabel}
            </div>
          </div>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            style={{ color: 'var(--muted)', transition: 'transform .15s', transform: userMenuOpen ? 'rotate(180deg)' : 'none' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {userMenuOpen && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, minWidth: 160, zIndex: 100,
            background: 'var(--panel)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', boxShadow: '0 8px 24px rgba(0,0,0,.4)',
            marginTop: 4, overflow: 'hidden',
          }}>
            <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{user?.email}</div>
            </div>
            <button
              onClick={() => void handleLogout()}
              style={{
                width: '100%', padding: '9px 14px', textAlign: 'left',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.78rem', color: 'var(--red)',
                display: 'flex', alignItems: 'center', gap: 7,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sair
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
