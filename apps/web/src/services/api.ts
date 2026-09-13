/**
 * Cliente HTTP — axios com interceptor de refresh automático.
 * accessToken armazenado em memória (nunca localStorage).
 */
import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL ?? '/api';

export const api = axios.create({
  baseURL: BASE,
  withCredentials: true,   // envia cookie de refresh
});

let _accessToken: string | null = null;
let _refreshPromise: Promise<string | null> | null = null;

export const setAccessToken = (t: string | null) => { _accessToken = t; };
export const getAccessToken = () => _accessToken;

// Adiciona Bearer em cada request
api.interceptors.request.use(config => {
  if (_accessToken) config.headers.Authorization = `Bearer ${_accessToken}`;
  return config;
});

// Em 401: tenta refresh uma vez, deduplica chamadas simultâneas
api.interceptors.response.use(
  r => r,
  async error => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retry) return Promise.reject(error);
    original._retry = true;

    if (!_refreshPromise) {
      _refreshPromise = axios
        .post<{ accessToken: string }>(`${BASE}/auth/refresh`, {}, { withCredentials: true })
        .then(r => { _accessToken = r.data.accessToken; return _accessToken; })
        .catch(() => { _accessToken = null; return null; })
        .finally(() => { _refreshPromise = null; });
    }

    const newToken = await _refreshPromise;
    if (!newToken) return Promise.reject(error);

    original.headers.Authorization = `Bearer ${newToken}`;
    return api(original);
  },
);
