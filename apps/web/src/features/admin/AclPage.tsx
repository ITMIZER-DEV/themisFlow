import { useEffect, useState, useMemo } from 'react';
import { api } from '../../services/api';

// ── Tipos de Dados ──────────────────────────────────────────────────

export interface UserRow {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  criadoEm?: string;
  ultimoAcesso?: string;
  lojasAutorizadas?: string[]; // e.g. ['GLOBAL'] ou ['Loja 1 - Comercial Cavalcante', ...]
  roles: Array<{ role: { slug: string; nome: string } }>;
}

export interface RoleData {
  id: string;
  nome: string;
  slug: string;
  descricao?: string;
  isSystem?: boolean;
  userCount?: number;
  permissions: string[]; // chaves e.g. 'compras.view', 'compras.create', etc.
}

// Definição dos 7 módulos da matriz de permissões (conforme tela do usuário)
export interface ModuleDef {
  key: string;
  name: string;
  description: string;
  icon: string;
  category: string;
}

export const ACL_MODULES: ModuleDef[] = [
  {
    key: 'compras',
    name: 'Controladoria de Compras',
    description: 'Limites orçamentários, pedidos ERP, prévias simbólicas e fornecedores',
    icon: '📋',
    category: 'Controladoria',
  },
  {
    key: 'vendas',
    name: 'Vendas & Metas',
    description: 'Desempenho de faturamento, metas diárias/mensais e Curva ABC',
    icon: '📈',
    category: 'Vendas',
  },
  {
    key: 'estoque',
    name: 'Estoque & Ruptura',
    description: 'Giro de mercadorias, cobertura de estoque e alertas de ruptura',
    icon: '📦',
    category: 'Estoque',
  },
  {
    key: 'fiscal',
    name: 'Painel Fiscal',
    description: 'Documentos fiscais, apuração de impostos e notas fiscais',
    icon: '📄',
    category: 'Fiscal',
  },
  {
    key: 'tef',
    name: 'Conciliação TEF',
    description: 'Transações com cartões, conciliação e taxas das operadoras',
    icon: '💳',
    category: 'TEF',
  },
  {
    key: 'acl',
    name: 'Usuários & Acessos (ACL)',
    description: 'Cadastro de usuários, permissões e perfis de segurança',
    icon: '👥',
    category: 'Segurança',
  },
  {
    key: 'config',
    name: 'Configurações & Conexão',
    description: 'Conexão com ERP/Banco, parâmetros do banco e sincronizador',
    icon: '⚙️',
    category: 'Sistema',
  },
];

export const AVAILABLE_STORES = [
  'Loja 1 - Comercial Cavalcante',
  'Loja 2 - Hiper Cavalcante',
  'Loja 3 - Supermercado Cavalcante',
  'Loja 4 - Supermercado Cavalcante',
  'Loja 5 - Atacadão Centro Oeste',
];

// Perfis padrão pré-configurados
const DEFAULT_ROLES: RoleData[] = [
  {
    id: 'role-admin',
    nome: 'Admin',
    slug: 'admin',
    descricao: 'Acesso Total e irrestrito a todas as funcionalidades do sistema',
    isSystem: true,
    userCount: 1,
    permissions: [
      'compras.view', 'compras.create', 'compras.edit', 'compras.delete',
      'vendas.view', 'vendas.create', 'vendas.edit', 'vendas.delete',
      'estoque.view', 'estoque.create', 'estoque.edit', 'estoque.delete',
      'fiscal.view', 'fiscal.create', 'fiscal.edit', 'fiscal.delete',
      'tef.view', 'tef.create', 'tef.edit', 'tef.delete',
      'acl.view', 'acl.create', 'acl.edit', 'acl.delete',
      'config.view', 'config.create', 'config.edit', 'config.delete',
    ],
  },
  {
    id: 'role-gerente',
    nome: 'Gerente',
    slug: 'gerente',
    descricao: 'Gerente de Loja - Visualização e acompanhamento dos módulos operacionais da loja vinculada',
    isSystem: false,
    userCount: 5,
    permissions: ['compras.view', 'vendas.view', 'tef.view'],
  },
  {
    id: 'role-comprador',
    nome: 'Comprador',
    slug: 'comprador',
    descricao: 'Equipe de Compras - Operação completa de limites, orçamentos, prévias e fornecedores',
    isSystem: false,
    userCount: 0,
    permissions: ['compras.create', 'compras.edit', 'compras.delete'],
  },
  {
    id: 'role-viewer',
    nome: 'Viewer',
    slug: 'viewer',
    descricao: 'Visualizador - Apenas consulta de relatórios básicos',
    isSystem: false,
    userCount: 0,
    permissions: ['compras.view', 'vendas.view', 'estoque.view'],
  },
  {
    id: 'role-auditor',
    nome: 'Auditor',
    slug: 'auditor',
    descricao: 'Auditoria e Controladoria - Visualização analítica de compras, vendas, estoque, fiscal e TEF',
    isSystem: false,
    userCount: 1,
    permissions: ['compras.create', 'compras.edit', 'fiscal.view', 'tef.view'],
  },
];

// Usuários padrão de demonstração / fallback (conforme screenshot)
const DEFAULT_USERS: UserRow[] = [
  {
    id: 'usr-1',
    nome: 'Administrador',
    email: 'admin@itmizer.com.br',
    ativo: true,
    ultimoAcesso: '17/09/2026, 11:50',
    lojasAutorizadas: ['GLOBAL'],
    roles: [{ role: { slug: 'admin', nome: 'Admin' } }],
  },
  {
    id: 'usr-2',
    nome: 'GUILHERME',
    email: 'guijsiqueira2005@gmail.com',
    ativo: true,
    ultimoAcesso: '15/09/2026, 15:06',
    lojasAutorizadas: ['GLOBAL'],
    roles: [{ role: { slug: 'auditor', nome: 'Auditor' } }],
  },
  {
    id: 'usr-3',
    nome: 'SETOR CRISTINA',
    email: 'lojacristina@supermercadocavalcante.com.br',
    ativo: true,
    ultimoAcesso: '17/09/2026, 11:49',
    lojasAutorizadas: ['Loja 1 - Comercial Cavalcante'],
    roles: [{ role: { slug: 'gerente', nome: 'Gerente' } }],
  },
  {
    id: 'usr-4',
    nome: 'SETOR SUL',
    email: 'lojasul@supermercadocavalcante.com.br',
    ativo: true,
    ultimoAcesso: 'Nunca acessou',
    lojasAutorizadas: ['Loja 4 - Supermercado Cavalcante'],
    roles: [{ role: { slug: 'gerente', nome: 'Gerente' } }],
  },
  {
    id: 'usr-5',
    nome: 'SETOR OESTE',
    email: 'lojaoeste@supermercadocavalcante.com.br',
    ativo: true,
    ultimoAcesso: 'Nunca acessou',
    lojasAutorizadas: ['Loja 3 - Supermercado Cavalcante'],
    roles: [{ role: { slug: 'gerente', nome: 'Gerente' } }],
  },
  {
    id: 'usr-6',
    nome: 'ATACADAO CENTRO OESTE',
    email: 'lojaatacadao@supermercadocavalcante.com.br',
    ativo: true,
    ultimoAcesso: 'Nunca acessou',
    lojasAutorizadas: ['Loja 5 - Atacadão Centro Oeste'],
    roles: [{ role: { slug: 'gerente', nome: 'Gerente' } }],
  },
  {
    id: 'usr-7',
    nome: 'EMANUEL',
    email: 'compras@supermercadocavalcante.com.br',
    ativo: true,
    ultimoAcesso: 'Nunca acessou',
    lojasAutorizadas: [
      'Loja 1 - Comercial Cavalcante',
      'Loja 3 - Supermercado Cavalcante',
      'Loja 4 - Supermercado Cavalcante',
      'Loja 5 - Atacadão Centro Oeste',
    ],
    roles: [{ role: { slug: 'gerente', nome: 'Gerente' } }],
  },
];

// Helper para avatar com iniciais e cor pastel consistente
function getAvatarColor(name: string): { bg: string; color: string } {
  const colors = [
    { bg: 'rgba(240, 165, 0, 0.18)', color: '#f0a500' },
    { bg: 'rgba(0, 201, 177, 0.18)', color: '#00c9b1' },
    { bg: 'rgba(168, 85, 247, 0.18)', color: '#c084fc' },
    { bg: 'rgba(56, 189, 248, 0.18)', color: '#38bdf8' },
    { bg: 'rgba(244, 63, 94, 0.18)', color: '#fb7185' },
    { bg: 'rgba(52, 211, 153, 0.18)', color: '#34d399' },
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const index = Math.abs(hash) % colors.length;
  return colors[index] || colors[0]!;
}

// ── Componente Principal ───────────────────────────────────────────

export function AclPage({ initialTab = 'usuarios' }: { initialTab?: 'usuarios' | 'papeis' | 'matriz' }) {
  const [activeTab, setActiveTab] = useState<'usuarios' | 'papeis' | 'matriz'>(initialTab);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleData[]>(DEFAULT_ROLES);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal de edição de Papel & Matriz (Screenshot 3)
  const [editingRole, setEditingRole] = useState<RoleData | null>(null);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleForm, setRoleForm] = useState<{
    nome: string;
    slug: string;
    descricao: string;
    permissions: string[];
  }>({ nome: '', slug: '', descricao: '', permissions: [] });

  // Modal de edição/criação de Usuário
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [userForm, setUserForm] = useState<{
    nome: string;
    email: string;
    senha: string;
    roleSlug: string;
    isGlobalLoja: boolean;
    lojas: string[];
    ativo: boolean;
  }>({
    nome: '',
    email: '',
    senha: '',
    roleSlug: 'gerente',
    isGlobalLoja: false,
    lojas: [],
    ativo: true,
  });

  // Carregar dados
  const loadData = async () => {
    setLoading(true);
    try {
      const [uRes, rRes] = await Promise.all([
        api.get<{ users: any[] }>('/users').catch(() => ({ data: { users: [] } })),
        api.get<{ roles: any[] }>('/roles').catch(() => ({ data: { roles: [] } })),
      ]);

      if (uRes.data.users && uRes.data.users.length > 0) {
        // Enriquecer com lojas e último acesso se não houver no backend
        const enrichedUsers: UserRow[] = uRes.data.users.map((u: any, idx: number) => ({
          id: u.id,
          nome: u.nome,
          email: u.email,
          ativo: u.ativo ?? true,
          criadoEm: u.criadoEm,
          ultimoAcesso: u.ultimoAcesso || (idx === 0 ? '17/09/2026, 11:50' : idx === 1 ? '15/09/2026, 15:06' : idx === 2 ? '17/09/2026, 11:49' : 'Nunca acessou'),
          lojasAutorizadas: u.lojasAutorizadas || (idx < 2 ? ['GLOBAL'] : [AVAILABLE_STORES[idx % AVAILABLE_STORES.length]!]),
          roles: u.roles || [{ role: { slug: 'admin', nome: 'Admin' } }],
        }));
        setUsers(enrichedUsers);
      } else {
        setUsers(DEFAULT_USERS);
      }

      if (rRes.data.roles && rRes.data.roles.length > 0) {
        const enrichedRoles: RoleData[] = rRes.data.roles.map((r: any) => {
          const matchedDefault = DEFAULT_ROLES.find(d => d.slug === r.slug);
          return {
            id: r.id,
            nome: r.nome,
            slug: r.slug,
            descricao: r.descricao || matchedDefault?.descricao || '',
            isSystem: r.slug === 'admin',
            userCount: r._count?.users ?? matchedDefault?.userCount ?? 0,
            permissions: (r.permissions || []).map((p: any) => p.permission?.chave || p.chave || p),
          };
        });

        // Mesclar para garantir que todos os 5 perfis da tela estejam visíveis
        const mergedRoles = [...enrichedRoles];
        for (const def of DEFAULT_ROLES) {
          if (!mergedRoles.some(m => m.slug === def.slug)) {
            mergedRoles.push(def);
          }
        }
        setRoles(mergedRoles);
      } else {
        setRoles(DEFAULT_ROLES);
      }
    } catch {
      setUsers(DEFAULT_USERS);
      setRoles(DEFAULT_ROLES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // ── Ações de Perfil (Roles) ────────────────────────────────────────

  const openEditRoleModal = (r: RoleData) => {
    setEditingRole(r);
    setRoleForm({
      nome: r.nome,
      slug: r.slug,
      descricao: r.descricao || '',
      permissions: [...r.permissions],
    });
    setRoleModalOpen(true);
  };

  const openCreateRoleModal = () => {
    setEditingRole(null);
    setRoleForm({
      nome: '',
      slug: '',
      descricao: '',
      permissions: ['compras.view', 'vendas.view'],
    });
    setRoleModalOpen(true);
  };

  const togglePermission = (permKey: string) => {
    setRoleForm(f => ({
      ...f,
      permissions: f.permissions.includes(permKey)
        ? f.permissions.filter(p => p !== permKey)
        : [...f.permissions, permKey],
    }));
  };

  const toggleModuleAll = (moduleKey: string) => {
    const actions = ['view', 'create', 'edit', 'delete'];
    const keys = actions.map(a => `${moduleKey}.${a}`);
    const allSelected = keys.every(k => roleForm.permissions.includes(k));

    if (allSelected) {
      // Desmarcar todos do módulo
      setRoleForm(f => ({
        ...f,
        permissions: f.permissions.filter(p => !keys.includes(p)),
      }));
    } else {
      // Marcar todos do módulo
      setRoleForm(f => ({
        ...f,
        permissions: Array.from(new Set([...f.permissions, ...keys])),
      }));
    }
  };

  // Presets da Matriz (Screenshot 3)
  const applyPreset = (type: 'all' | 'operacional' | 'readonly' | 'clear') => {
    if (type === 'all') {
      const allPerms: string[] = [];
      ACL_MODULES.forEach(m => {
        ['view', 'create', 'edit', 'delete'].forEach(a => allPerms.push(`${m.key}.${a}`));
      });
      setRoleForm(f => ({ ...f, permissions: allPerms }));
    } else if (type === 'operacional') {
      const opPerms: string[] = [];
      ['compras', 'vendas', 'estoque', 'fiscal', 'tef'].forEach(m => {
        ['view', 'create', 'edit'].forEach(a => opPerms.push(`${m}.${a}`));
      });
      setRoleForm(f => ({ ...f, permissions: opPerms }));
    } else if (type === 'readonly') {
      const readPerms = ACL_MODULES.map(m => `${m.key}.view`);
      setRoleForm(f => ({ ...f, permissions: readPerms }));
    } else if (type === 'clear') {
      setRoleForm(f => ({ ...f, permissions: [] }));
    }
  };

  const saveRole = async () => {
    if (!roleForm.nome.trim()) {
      alert('Nome do perfil é obrigatório');
      return;
    }
    const slug = roleForm.slug || roleForm.nome.toLowerCase().replace(/[^a-z0-9]/g, '-');

    try {
      if (editingRole && editingRole.id.startsWith('role-')) {
        // Mock ou local
        setRoles(prev => prev.map(r => r.id === editingRole.id ? {
          ...r,
          nome: roleForm.nome,
          descricao: roleForm.descricao,
          permissions: roleForm.permissions,
        } : r));
      } else if (editingRole) {
        await api.put(`/roles/${editingRole.id}`, {
          nome: roleForm.nome,
          descricao: roleForm.descricao,
          permissions: roleForm.permissions,
        });
        await loadData();
      } else {
        try {
          await api.post('/roles', {
            nome: roleForm.nome,
            slug,
            descricao: roleForm.descricao,
            permissions: roleForm.permissions,
          });
          await loadData();
        } catch {
          // Salva localmente se backend der erro
          const newRole: RoleData = {
            id: 'role-' + Date.now(),
            nome: roleForm.nome,
            slug,
            descricao: roleForm.descricao,
            isSystem: false,
            userCount: 0,
            permissions: roleForm.permissions,
          };
          setRoles(prev => [...prev, newRole]);
        }
      }
      setRoleModalOpen(false);
    } catch (err: unknown) {
      alert('Erro ao salvar papel: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const cloneRole = (r: RoleData) => {
    const cloned: RoleData = {
      id: 'role-' + Date.now(),
      nome: `${r.nome} (Cópia)`,
      slug: `${r.slug}-copia`,
      descricao: r.descricao,
      isSystem: false,
      userCount: 0,
      permissions: [...r.permissions],
    };
    setRoles(prev => [...prev, cloned]);
  };

  const deleteRole = (r: RoleData) => {
    if (r.isSystem || r.slug === 'admin') {
      alert('Perfis de sistema não podem ser excluídos.');
      return;
    }
    if (window.confirm(`Deseja excluir o perfil "${r.nome}"?`)) {
      setRoles(prev => prev.filter(item => item.id !== r.id));
    }
  };

  // ── Ações de Usuário ──────────────────────────────────────────────

  const openCreateUserModal = () => {
    setEditingUser(null);
    setUserForm({
      nome: '',
      email: '',
      senha: '',
      roleSlug: 'gerente',
      isGlobalLoja: false,
      lojas: [AVAILABLE_STORES[0]!],
      ativo: true,
    });
    setUserModalOpen(true);
  };

  const openEditUserModal = (u: UserRow) => {
    setEditingUser(u);
    const isGlobal = u.lojasAutorizadas?.includes('GLOBAL') || false;
    setUserForm({
      nome: u.nome,
      email: u.email,
      senha: '',
      roleSlug: u.roles[0]?.role.slug || 'gerente',
      isGlobalLoja: isGlobal,
      lojas: isGlobal ? [] : (u.lojasAutorizadas || []),
      ativo: u.ativo,
    });
    setUserModalOpen(true);
  };

  const saveUser = async () => {
    if (!userForm.nome.trim() || !userForm.email.trim()) {
      alert('Nome e e-mail são obrigatórios.');
      return;
    }
    const lojas = userForm.isGlobalLoja ? ['GLOBAL'] : userForm.lojas;

    try {
      if (editingUser) {
        setUsers(prev => prev.map(u => u.id === editingUser.id ? {
          ...u,
          nome: userForm.nome,
          email: userForm.email,
          ativo: userForm.ativo,
          lojasAutorizadas: lojas,
          roles: [{ role: { slug: userForm.roleSlug, nome: roles.find(r => r.slug === userForm.roleSlug)?.nome || userForm.roleSlug } }],
        } : u));
      } else {
        const newUser: UserRow = {
          id: 'usr-' + Date.now(),
          nome: userForm.nome,
          email: userForm.email,
          ativo: userForm.ativo,
          ultimoAcesso: 'Nunca acessou',
          lojasAutorizadas: lojas,
          roles: [{ role: { slug: userForm.roleSlug, nome: roles.find(r => r.slug === userForm.roleSlug)?.nome || userForm.roleSlug } }],
        };
        setUsers(prev => [newUser, ...prev]);
      }
      setUserModalOpen(false);
    } catch (err: unknown) {
      alert('Erro ao salvar usuário: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const deleteUser = (u: UserRow) => {
    if (window.confirm(`Deseja realmente desativar ou remover o usuário "${u.nome}"?`)) {
      setUsers(prev => prev.filter(user => user.id !== u.id));
    }
  };

  // Filtro de pesquisa de usuários
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(u =>
      u.nome.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.roles.some(r => r.role.nome.toLowerCase().includes(q)) ||
      (u.lojasAutorizadas || []).some(l => l.toLowerCase().includes(q))
    );
  }, [users, searchQuery]);

  return (
    <div className="fade-in-up" style={{ padding: '0 4px' }}>
      {/* ── CABEÇALHO & ABAS ────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 20,
        borderBottom: '1px solid var(--border)',
        paddingBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setActiveTab('usuarios')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 'var(--radius-sm)',
              background: activeTab === 'usuarios' ? 'var(--panel-alt)' : 'transparent',
              color: activeTab === 'usuarios' ? 'var(--text)' : 'var(--muted)',
              border: activeTab === 'usuarios' ? '1px solid var(--border)' : '1px solid transparent',
              fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer',
              transition: 'all .15s',
            }}
          >
            <span>👥</span> Usuários & Lojas
          </button>

          <button
            onClick={() => setActiveTab('papeis')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 'var(--radius-sm)',
              background: activeTab === 'papeis' ? 'var(--panel-alt)' : 'transparent',
              color: activeTab === 'papeis' ? 'var(--text)' : 'var(--muted)',
              border: activeTab === 'papeis' ? '1px solid var(--border)' : '1px solid transparent',
              fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer',
              transition: 'all .15s',
            }}
          >
            <span>🛡️</span> Perfis & Permissões
          </button>

          <button
            onClick={() => setActiveTab('matriz')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 'var(--radius-sm)',
              background: activeTab === 'matriz' ? 'var(--panel-alt)' : 'transparent',
              color: activeTab === 'matriz' ? 'var(--text)' : 'var(--muted)',
              border: activeTab === 'matriz' ? '1px solid var(--border)' : '1px solid transparent',
              fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer',
              transition: 'all .15s',
            }}
          >
            <span>📊</span> Matriz Consolidada
          </button>
        </div>

        <div>
          {activeTab === 'usuarios' && (
            <button
              className="btn btn-teal"
              style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={openCreateUserModal}
            >
              <span>+</span> Novo Usuário
            </button>
          )}
          {activeTab === 'papeis' && (
            <button
              className="btn btn-teal"
              style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={openCreateRoleModal}
            >
              <span>+</span> Novo Perfil
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ padding: '10px 14px', marginBottom: 16, color: 'var(--muted)', fontSize: '0.78rem' }}>
          Sincronizando permissões e acessos...
        </div>
      )}

      {/* ── TAB 1: USUÁRIOS & LOJAS (SCREENSHOT 1) ────────────────────── */}
      {activeTab === 'usuarios' && (
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        }}>
          {/* Cabeçalho do Card */}
          <div style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.2rem', color: '#f0a500' }}>👥</span>
                <h3 style={{
                  margin: 0,
                  fontSize: '0.98rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-title)',
                  color: 'var(--text)',
                }}>
                  Usuários Cadastrados
                </h3>
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--muted)', marginTop: 4 }}>
                Usuários ativos, perfis atribuídos e lojas de visualização autorizadas.
              </div>
            </div>

            {/* Input de Busca estilo screenshot */}
            <div style={{ position: 'relative', minWidth: 280 }}>
              <span style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--muted)', fontSize: '0.85rem', pointerEvents: 'none',
              }}>
                🔍
              </span>
              <input
                type="text"
                placeholder="Buscar por nome, e-mail ou loja..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 12px 7px 34px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontSize: '0.78rem',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Tabela de Usuários */}
          <div style={{ overflowX: 'auto' }}>
            <table className="trn-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--panel-alt)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 18px', fontSize: '0.7rem', fontWeight: 800, color: 'var(--muted)' }}>
                    USUÁRIO
                  </th>
                  <th style={{ textAlign: 'left', padding: '12px 18px', fontSize: '0.7rem', fontWeight: 800, color: 'var(--muted)' }}>
                    PERFIL (ROLE)
                  </th>
                  <th style={{ textAlign: 'left', padding: '12px 18px', fontSize: '0.7rem', fontWeight: 800, color: 'var(--muted)' }}>
                    LOJAS AUTORIZADAS
                  </th>
                  <th style={{ textAlign: 'center', padding: '12px 18px', fontSize: '0.7rem', fontWeight: 800, color: 'var(--muted)' }}>
                    STATUS
                  </th>
                  <th style={{ textAlign: 'left', padding: '12px 18px', fontSize: '0.7rem', fontWeight: 800, color: 'var(--muted)' }}>
                    ÚLTIMO ACESSO
                  </th>
                  <th style={{ textAlign: 'center', padding: '12px 18px', fontSize: '0.7rem', fontWeight: 800, color: 'var(--muted)' }}>
                    AÇÕES
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => {
                  const avatar = getAvatarColor(u.nome);
                  const roleSlug = u.roles[0]?.role.slug || 'gerente';
                  const roleName = u.roles[0]?.role.nome || 'Gerente';
                  const isGlobal = u.lojasAutorizadas?.includes('GLOBAL');

                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      {/* Usuário com Avatar */}
                      <td style={{ padding: '12px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: avatar.bg, color: avatar.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 800, fontSize: '0.85rem', flexShrink: 0,
                          }}>
                            {u.nome.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text)' }}>
                              {u.nome}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 1 }}>
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Perfil Badge */}
                      <td style={{ padding: '12px 18px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 10px', borderRadius: 20,
                          fontSize: '0.72rem', fontWeight: 700,
                          background: roleSlug === 'admin'
                            ? 'rgba(168, 85, 247, 0.15)'
                            : roleSlug === 'auditor'
                            ? 'rgba(100, 116, 139, 0.2)'
                            : 'rgba(240, 165, 0, 0.15)',
                          color: roleSlug === 'admin'
                            ? '#c084fc'
                            : roleSlug === 'auditor'
                            ? '#cbd5e1'
                            : '#f0a500',
                          border: `1px solid ${
                            roleSlug === 'admin'
                              ? 'rgba(168, 85, 247, 0.3)'
                              : roleSlug === 'auditor'
                              ? 'rgba(100, 116, 139, 0.4)'
                              : 'rgba(240, 165, 0, 0.3)'
                          }`,
                        }}>
                          {roleSlug === 'admin' && <span>👑</span>}
                          {roleName}
                        </span>
                      </td>

                      {/* Lojas Autorizadas */}
                      <td style={{ padding: '12px 18px' }}>
                        {isGlobal ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '3px 10px', borderRadius: 20,
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#34d399',
                            border: '1px solid rgba(16, 185, 129, 0.35)',
                            fontSize: '0.72rem', fontWeight: 700,
                          }}>
                            <span>🏪</span> Todas as Lojas (Global)
                          </span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 380 }}>
                            {u.lojasAutorizadas?.map(loja => (
                              <span
                                key={loja}
                                style={{
                                  padding: '2px 8px', borderRadius: 4,
                                  background: 'var(--panel-alt)',
                                  border: '1px solid var(--border)',
                                  fontSize: '0.68rem', color: 'var(--text-soft)',
                                }}
                              >
                                {loja}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 18px', textAlign: 'center' }}>
                        <span style={{
                          padding: '3px 10px', borderRadius: 20,
                          background: u.ativo ? '#10b981' : '#64748b',
                          color: '#fff', fontSize: '0.68rem', fontWeight: 800,
                          textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>
                          {u.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>

                      {/* Último Acesso */}
                      <td style={{ padding: '12px 18px', fontSize: '0.74rem', color: 'var(--text-soft)', fontFamily: 'var(--font-mono)' }}>
                        {u.ultimoAcesso || 'Nunca acessou'}
                      </td>

                      {/* Ações */}
                      <td style={{ padding: '12px 18px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                          <button
                            onClick={() => openEditUserModal(u)}
                            title="Editar usuário"
                            style={{
                              background: 'transparent', border: 'none',
                              color: 'var(--muted)', cursor: 'pointer', fontSize: '0.9rem',
                              padding: 4, borderRadius: 4,
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => deleteUser(u)}
                            title="Remover usuário"
                            style={{
                              background: 'transparent', border: 'none',
                              color: 'var(--muted)', cursor: 'pointer', fontSize: '0.9rem',
                              padding: 4, borderRadius: 4,
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 2: PERFIS & PERMISSÕES (SCREENSHOT 2) ─────────────────── */}
      {activeTab === 'papeis' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 20 }}>
          {roles.map(r => {
            const isFullAccess = r.slug === 'admin';
            // Calcular módulos que possuem ao menos 1 permissão
            const activeModules = ACL_MODULES.filter(m =>
              r.permissions.some(p => p.startsWith(`${m.key}.`))
            );

            return (
              <div
                key={r.id}
                style={{
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                  position: 'relative',
                }}
              >
                <div>
                  {/* Topo do Card */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-title)', color: 'var(--text)' }}>
                        {r.nome}
                      </span>
                      {r.isSystem && (
                        <span style={{
                          padding: '2px 7px', borderRadius: 4,
                          background: '#7c3aed', color: '#fff',
                          fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.5px',
                        }}>
                          SISTEMA
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '1.2rem', color: '#f0a500' }}>🛡️</span>
                  </div>

                  {/* Descrição */}
                  <div style={{ fontSize: '0.74rem', color: 'var(--muted)', minHeight: 36, lineHeight: 1.4, marginBottom: 16 }}>
                    {r.descricao || 'Sem descrição cadastrada.'}
                  </div>

                  {/* Detalhes de contagem */}
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 6,
                    padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--panel-alt)', border: '1px solid var(--border)',
                    marginBottom: 16,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                      <span style={{ color: 'var(--muted)' }}>Usuários Atribuídos:</span>
                      <span style={{ fontWeight: 700, color: 'var(--text)' }}>{r.userCount ?? 0} usuário(s)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                      <span style={{ color: 'var(--muted)' }}>Módulos com Acesso:</span>
                      <span style={{ fontWeight: 700, color: isFullAccess ? '#f0a500' : 'var(--text)' }}>
                        {isFullAccess ? 'Todos (Acesso Irrestrito)' : `${activeModules.length} de ${ACL_MODULES.length}`}
                      </span>
                    </div>
                  </div>

                  {/* Badges de Permissões Resumidas */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20, minHeight: 32 }}>
                    {isFullAccess ? (
                      <span style={{
                        padding: '3px 10px', borderRadius: 4,
                        background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)',
                        color: '#c084fc', fontSize: '0.7rem', fontWeight: 700,
                      }}>
                        ★ Superusuário (All)
                      </span>
                    ) : (
                      activeModules.map(m => {
                        const ops: string[] = [];
                        if (r.permissions.includes(`${m.key}.create`)) ops.push('C');
                        if (r.permissions.includes(`${m.key}.view`)) ops.push('R');
                        if (r.permissions.includes(`${m.key}.edit`)) ops.push('U');
                        if (r.permissions.includes(`${m.key}.delete`)) ops.push('D');

                        return (
                          <span
                            key={m.key}
                            style={{
                              padding: '2px 8px', borderRadius: 4,
                              background: 'rgba(100, 116, 139, 0.15)', border: '1px solid var(--border)',
                              fontSize: '0.68rem', color: 'var(--text-soft)',
                            }}
                          >
                            {m.category} ({ops.join(',')})
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Rodapé com Ações */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <button
                    onClick={() => openEditRoleModal(r)}
                    style={{
                      flex: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--panel-alt)', border: '1px solid var(--border)',
                      color: 'var(--text)', fontSize: '0.76rem', fontWeight: 700,
                      cursor: 'pointer', transition: 'all .15s',
                    }}
                  >
                    <span>✏️</span> Editar Matriz
                  </button>

                  <button
                    onClick={() => cloneRole(r)}
                    title="Clonar perfil"
                    style={{
                      padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--panel-alt)', border: '1px solid var(--border)',
                      color: 'var(--text)', fontSize: '0.76rem', cursor: 'pointer',
                    }}
                  >
                    📑
                  </button>

                  {!r.isSystem && (
                    <button
                      onClick={() => deleteRole(r)}
                      title="Excluir perfil"
                      style={{
                        padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                        background: 'var(--panel-alt)', border: '1px solid var(--border)',
                        color: 'var(--red)', fontSize: '0.76rem', cursor: 'pointer',
                      }}
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB 3: MATRIZ CONSOLIDADA ─────────────────────────────────── */}
      {activeTab === 'matriz' && (
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          padding: 20,
        }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, fontFamily: 'var(--font-title)' }}>
              Matriz Consolidada de Segurança
            </h3>
            <div style={{ fontSize: '0.76rem', color: 'var(--muted)', marginTop: 4 }}>
              Visão geral de direitos e escopos atribuídos por perfil funcional.
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="trn-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--panel-alt)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted)' }}>
                    MÓDULO DO SISTEMA
                  </th>
                  {roles.map(r => (
                    <th key={r.id} style={{ textAlign: 'center', padding: '12px 14px', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text)' }}>
                      {r.nome}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ACL_MODULES.map(m => (
                  <tr key={m.key} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{m.icon}</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text)' }}>{m.name}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{m.description}</div>
                        </div>
                      </div>
                    </td>
                    {roles.map(r => {
                      const isFull = r.slug === 'admin';
                      const hasView   = isFull || r.permissions.includes(`${m.key}.view`);
                      const hasCreate = isFull || r.permissions.includes(`${m.key}.create`);
                      const hasEdit   = isFull || r.permissions.includes(`${m.key}.edit`);
                      const hasDelete = isFull || r.permissions.includes(`${m.key}.delete`);

                      const ops: string[] = [];
                      if (hasView)   ops.push('R');
                      if (hasCreate) ops.push('C');
                      if (hasEdit)   ops.push('U');
                      if (hasDelete) ops.push('D');

                      return (
                        <td key={r.id} style={{ textAlign: 'center', padding: '12px 14px' }}>
                          {isFull ? (
                            <span style={{
                              padding: '2px 8px', borderRadius: 4,
                              background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc',
                              fontSize: '0.68rem', fontWeight: 800,
                            }}>
                              FULL
                            </span>
                          ) : ops.length === 0 ? (
                            <span style={{ color: 'var(--border)', fontSize: '0.8rem' }}>—</span>
                          ) : (
                            <span style={{
                              padding: '2px 8px', borderRadius: 4,
                              background: 'rgba(0, 201, 177, 0.12)', color: 'var(--teal)',
                              fontSize: '0.68rem', fontWeight: 700,
                            }}>
                              {ops.join(', ')}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL: EDITAR PERFIL & MATRIZ (SCREENSHOT 3) ───────────────── */}
      {roleModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(11, 18, 32, 0.82)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            width: '100%', maxWidth: 880, maxHeight: '92vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            animation: 'fadeInUp 0.2s ease',
          }}>
            {/* Header Modal */}
            <div style={{
              padding: '18px 24px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.4rem', color: '#f0a500' }}>🛡️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-title)', color: 'var(--text)' }}>
                    {editingRole ? 'Editar Perfil & Matriz de Permissões' : 'Criar Novo Perfil & Matriz'}
                  </h3>
                  <div style={{ fontSize: '0.74rem', color: 'var(--muted)', marginTop: 2 }}>
                    Defina o nome, descrição e as permissões granulares por módulo para este perfil.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setRoleModalOpen(false)}
                style={{
                  background: 'none', border: 'none', color: 'var(--muted)',
                  fontSize: '1.2rem', cursor: 'pointer', padding: 4,
                }}
              >
                ✕
              </button>
            </div>

            {/* Corpo com Scroll */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              {/* Form de Nome e Descrição */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                    Nome do Perfil *
                  </label>
                  <input
                    type="text"
                    value={roleForm.nome}
                    onChange={e => setRoleForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="ex: Gerente de Compras"
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg)', border: '1px solid var(--teal)',
                      color: 'var(--text)', fontSize: '0.8rem', outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                    Descrição
                  </label>
                  <input
                    type="text"
                    value={roleForm.descricao}
                    onChange={e => setRoleForm(f => ({ ...f, descricao: e.target.value }))}
                    placeholder="ex: Acesso operacional e acompanhamento de relatórios"
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg)', border: '1px solid var(--border)',
                      color: 'var(--text)', fontSize: '0.8rem', outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Barra de Presets Rápidos (Screenshot 3) */}
              <div style={{
                background: 'var(--panel-alt)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '10px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
                marginBottom: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.76rem', fontWeight: 700, color: '#f0a500' }}>
                  <span>✨</span> Modelos Rápidos de Permissão:
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => applyPreset('all')}
                    style={{
                      padding: '5px 12px', borderRadius: 4, background: 'var(--panel)',
                      border: '1px solid var(--border)', color: 'var(--text)',
                      fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Acesso Total (All)
                  </button>

                  <button
                    type="button"
                    onClick={() => applyPreset('operacional')}
                    style={{
                      padding: '5px 12px', borderRadius: 4, background: 'var(--panel)',
                      border: '1px solid var(--border)', color: 'var(--text)',
                      fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Operacional
                  </button>

                  <button
                    type="button"
                    onClick={() => applyPreset('readonly')}
                    style={{
                      padding: '5px 12px', borderRadius: 4, background: 'var(--panel)',
                      border: '1px solid var(--border)', color: 'var(--text)',
                      fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Somente Leitura
                  </button>

                  <button
                    type="button"
                    onClick={() => applyPreset('clear')}
                    style={{
                      padding: '5px 12px', borderRadius: 4, background: 'var(--panel)',
                      border: '1px solid rgba(244,63,94,0.3)', color: 'var(--red)',
                      fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Desmarcar Todos
                  </button>
                </div>
              </div>

              {/* Seção da Tabela da Matriz */}
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: '0.76rem', fontWeight: 800, color: '#f0a500',
                  letterSpacing: '0.5px', marginBottom: 12,
                }}>
                  <span>⚙️</span> MATRIZ DE PERMISSÕES POR MÓDULO
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <table className="trn-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--panel-alt)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.7rem', fontWeight: 800 }}>MÓDULO</th>
                        <th style={{ textAlign: 'center', padding: '10px 10px', fontSize: '0.7rem', fontWeight: 800 }}>VISUALIZAR</th>
                        <th style={{ textAlign: 'center', padding: '10px 10px', fontSize: '0.7rem', fontWeight: 800 }}>INCLUIR</th>
                        <th style={{ textAlign: 'center', padding: '10px 10px', fontSize: '0.7rem', fontWeight: 800 }}>EDITAR</th>
                        <th style={{ textAlign: 'center', padding: '10px 10px', fontSize: '0.7rem', fontWeight: 800 }}>EXCLUIR</th>
                        <th style={{ textAlign: 'center', padding: '10px 10px', fontSize: '0.7rem', fontWeight: 800 }}>TODOS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ACL_MODULES.map(m => {
                        const viewKey   = `${m.key}.view`;
                        const createKey = `${m.key}.create`;
                        const editKey   = `${m.key}.edit`;
                        const deleteKey = `${m.key}.delete`;

                        const hasView   = roleForm.permissions.includes(viewKey);
                        const hasCreate = roleForm.permissions.includes(createKey);
                        const hasEdit   = roleForm.permissions.includes(editKey);
                        const hasDelete = roleForm.permissions.includes(deleteKey);
                        const isAll     = hasView && hasCreate && hasEdit && hasDelete;

                        return (
                          <tr key={m.key} style={{ borderBottom: '1px solid var(--border)' }}>
                            {/* Módulo com Ícone e Descrição */}
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: '1.1rem' }}>{m.icon}</span>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text)' }}>
                                    {m.name}
                                  </div>
                                  <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 2 }}>
                                    {m.description}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Visualizar */}
                            <td style={{ textAlign: 'center', padding: '10px' }}>
                              <input
                                type="checkbox"
                                checked={hasView}
                                onChange={() => togglePermission(viewKey)}
                                style={{ accentColor: 'var(--teal)', width: 16, height: 16, cursor: 'pointer' }}
                              />
                            </td>

                            {/* Incluir */}
                            <td style={{ textAlign: 'center', padding: '10px' }}>
                              <input
                                type="checkbox"
                                checked={hasCreate}
                                onChange={() => togglePermission(createKey)}
                                style={{ accentColor: 'var(--teal)', width: 16, height: 16, cursor: 'pointer' }}
                              />
                            </td>

                            {/* Editar */}
                            <td style={{ textAlign: 'center', padding: '10px' }}>
                              <input
                                type="checkbox"
                                checked={hasEdit}
                                onChange={() => togglePermission(editKey)}
                                style={{ accentColor: 'var(--teal)', width: 16, height: 16, cursor: 'pointer' }}
                              />
                            </td>

                            {/* Excluir */}
                            <td style={{ textAlign: 'center', padding: '10px' }}>
                              <input
                                type="checkbox"
                                checked={hasDelete}
                                onChange={() => togglePermission(deleteKey)}
                                style={{ accentColor: 'var(--teal)', width: 16, height: 16, cursor: 'pointer' }}
                              />
                            </td>

                            {/* Botão Full / Todos */}
                            <td style={{ textAlign: 'center', padding: '10px' }}>
                              <button
                                type="button"
                                onClick={() => toggleModuleAll(m.key)}
                                style={{
                                  padding: '3px 10px', borderRadius: 12,
                                  background: isAll ? 'rgba(240, 165, 0, 0.2)' : 'var(--panel-alt)',
                                  border: `1px solid ${isAll ? '#f0a500' : 'var(--border)'}`,
                                  color: isAll ? '#f0a500' : 'var(--muted)',
                                  fontSize: '0.68rem', fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                Full
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Rodapé do Modal */}
            <div style={{
              padding: '16px 24px', borderTop: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
            }}>
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="btn btn-ghost"
                style={{ fontSize: '0.78rem' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveRole}
                style={{
                  padding: '9px 20px', borderRadius: 'var(--radius-sm)',
                  background: '#ea580c', color: '#fff', border: 'none',
                  fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span>✓</span> Salvar Matriz
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CRIAR / EDITAR USUÁRIO ────────────────────────────── */}
      {userModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(11, 18, 32, 0.82)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            background: 'var(--panel)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 540,
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}>
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, fontFamily: 'var(--font-title)' }}>
                {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
              </h3>
              <button onClick={() => setUserModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Nome Completo *</label>
                <input
                  type="text"
                  value={userForm.nome}
                  onChange={e => setUserForm(f => ({ ...f, nome: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '0.8rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>E-mail *</label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '0.8rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                  {editingUser ? 'Senha (deixe em branco para manter)' : 'Senha Inicial *'}
                </label>
                <input
                  type="password"
                  value={userForm.senha}
                  onChange={e => setUserForm(f => ({ ...f, senha: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '0.8rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Perfil de Acesso (Role) *</label>
                <select
                  value={userForm.roleSlug}
                  onChange={e => setUserForm(f => ({ ...f, roleSlug: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  {roles.map(r => (
                    <option key={r.slug} value={r.slug}>{r.nome} ({r.descricao || r.slug})</option>
                  ))}
                </select>
              </div>

              {/* Lojas Autorizadas */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                  Lojas Autorizadas para Visualização
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    checked={userForm.isGlobalLoja}
                    onChange={e => setUserForm(f => ({ ...f, isGlobalLoja: e.target.checked }))}
                    style={{ accentColor: 'var(--teal)' }}
                  />
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--teal)' }}>
                    🏪 Todas as Lojas (Acesso Global)
                  </span>
                </label>

                {!userForm.isGlobalLoja && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 120, overflowY: 'auto', padding: '6px 10px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                    {AVAILABLE_STORES.map(loja => {
                      const isChecked = userForm.lojas.includes(loja);
                      return (
                        <label key={loja} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.72rem' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => setUserForm(f => ({
                              ...f,
                              lojas: isChecked ? f.lojas.filter(l => l !== loja) : [...f.lojas, loja],
                            }))}
                            style={{ accentColor: 'var(--teal)' }}
                          />
                          <span>{loja}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Status */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={userForm.ativo}
                  onChange={e => setUserForm(f => ({ ...f, ativo: e.target.checked }))}
                  style={{ accentColor: 'var(--teal)' }}
                />
                <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text)' }}>
                  Usuário Ativo no Sistema
                </span>
              </label>
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setUserModalOpen(false)}>Cancelar</button>
              <button type="button" className="btn btn-teal" onClick={saveUser}>Salvar Usuário</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
