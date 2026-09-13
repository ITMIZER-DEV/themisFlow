import { create } from 'zustand';

type Theme = 'dark' | 'light';

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

const stored = (localStorage.getItem('tf-theme') as Theme | null) ?? 'dark';
applyTheme(stored);

type ThemeState = {
  theme: Theme;
  toggle: () => void;
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: stored,
  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('tf-theme', next);
    applyTheme(next);
    set({ theme: next });
  },
}));
