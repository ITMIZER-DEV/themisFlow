import { create } from 'zustand';
import { api, setAccessToken } from '../services/api';

export interface AuthUser {
  id: string;
  nome: string;
  email: string;
  roles: string[];
  permissions: string[];
}

type AuthState = {
  user: AuthUser | null;
  loading: boolean;

  login: (email: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
  tryRefresh: () => Promise<boolean>;
  hasPermission: (chave: string) => boolean;
  hasRole: (slug: string) => boolean;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: false,

  login: async (email, senha) => {
    set({ loading: true });
    try {
      const { data } = await api.post<{ accessToken: string; user: AuthUser }>('/auth/login', { email, senha });
      setAccessToken(data.accessToken);
      set({ user: data.user });
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    try { await api.post('/auth/logout'); } catch { /* ignora */ }
    setAccessToken(null);
    set({ user: null });
  },

  tryRefresh: async () => {
    set({ loading: true });
    try {
      const { data } = await api.post<{ accessToken: string; user: AuthUser }>('/auth/refresh');
      setAccessToken(data.accessToken);
      set({ user: data.user });
      return true;
    } catch {
      set({ user: null });
      return false;
    } finally {
      set({ loading: false });
    }
  },

  hasPermission: (chave) => get().user?.permissions.includes(chave) ?? false,
  hasRole: (slug) => get().user?.roles.includes(slug) ?? false,
}));
