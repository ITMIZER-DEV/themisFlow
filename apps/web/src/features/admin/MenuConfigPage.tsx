import { useEffect, useState } from 'react';
import { api } from '../../services/api';

interface MenuAdminItem {
  id: string;
  chave: string;
  rotulo: string;
  rota: string;
  ativo: boolean;
  ordem: number;
  roles: Array<{ role: { slug: string; nome: string } }>;
  filhos: MenuAdminItem[];
}

export function MenuConfigPage() {
  const [items, setItems] = useState<MenuAdminItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get<{ items: MenuAdminItem[] }>('/menu-admin')
      .then(({ data }) => setItems(data.items))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleAtivo = async (id: string, ativo: boolean) => {
    await api.patch(`/menu-admin/${id}`, { ativo: !ativo });
    load();
  };

  const renderItem = (item: MenuAdminItem, depth = 0) => (
    <div key={item.id} style={{ marginLeft: depth * 24 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
        background: 'var(--panel)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)', marginBottom: 6,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--muted)', minWidth: 140 }}>
          {item.chave}
        </span>
        <span style={{ fontWeight: 600, fontSize: '0.82rem', flex: 1 }}>{item.rotulo}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(item.roles ?? []).map(r => (
            <span key={r.role.slug} className="tab-badge"
              style={{ background: 'var(--teal-bg)', color: 'var(--teal)', fontSize: '0.62rem' }}>
              {r.role.nome}
            </span>
          ))}
        </div>
        <button
          onClick={() => void toggleAtivo(item.id, item.ativo)}
          className="btn btn-ghost"
          style={{ fontSize: '0.7rem', padding: '3px 10px', color: item.ativo ? 'var(--teal)' : 'var(--muted)' }}
        >
          {item.ativo ? 'Visível' : 'Oculto'}
        </button>
      </div>
      {(item.filhos ?? []).map(c => renderItem(c, depth + 1))}
    </div>
  );

  return (
    <div className="fade-in-up">
      <div className="section-header" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-title)' }}>Configuração de Menu</h2>
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 16 }}>
        Controle quais itens aparecem no menu para cada papel.
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Carregando…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map(item => renderItem(item))}
        </div>
      )}
    </div>
  );
}
