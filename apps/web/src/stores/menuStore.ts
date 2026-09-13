import { create } from 'zustand';
import { api } from '../services/api';

export interface MenuItemData {
  id: string;
  chave: string;
  rotulo: string;
  icone?: string;
  rota: string;
  filhos: MenuItemData[];
}

type MenuState = {
  items: MenuItemData[];
  loaded: boolean;
  loadMenu: () => Promise<void>;
  clearMenu: () => void;
};

export const useMenuStore = create<MenuState>((set) => ({
  items: [],
  loaded: false,

  loadMenu: async () => {
    try {
      const { data } = await api.get<{ items: MenuItemData[] }>('/menu');
      set({ items: data.items, loaded: true });
    } catch {
      set({ items: [], loaded: true });
    }
  },

  clearMenu: () => set({ items: [], loaded: false }),
}));
