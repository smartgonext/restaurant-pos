import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';
import { useMainposStore } from '@/stores/mainposStore';
import { useSubposStore } from '@/stores/subposStore';
import { API_BASE_URL } from './config';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

function isAuthEndpoint(url?: string) {
  if (!url) return false;
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/superadmin/login') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/logout') ||
    url.includes('/mainpos/login') ||
    url.includes('/subpos/login')
  );
}

function isStandalonePage() {
  if (typeof window === 'undefined') return false;
  const path = (window.location.pathname + window.location.hash + window.location.search).toLowerCase();
  return (
    path.includes('customer-display') ||
    path.includes('order-board') ||
    path.includes('subpos') ||
    path.includes('mainpos') ||
    path.includes('menu') ||
    path.includes('kiosk')
  );
}

function redirectToLogin(target?: 'mainpos' | 'subpos' | 'admin') {
  if (typeof window === 'undefined') return;
  const rawPath = (window.location.pathname + window.location.hash).toLowerCase();
  const isHash = window.location.hash.startsWith('#') || window.location.href.includes('#/');

  const isMainpos = target === 'mainpos' || (!target && rawPath.includes('mainpos'));
  const isSubpos = target === 'subpos' || (!target && rawPath.includes('subpos'));

  if (isMainpos) {
    useMainposStore.getState().logout();
    if (isHash) {
      window.location.hash = '#/mainpos';
    } else {
      window.location.href = '/mainpos';
    }
  } else if (isSubpos) {
    useSubposStore.getState().logout();
    if (isHash) {
      window.location.hash = '#/subpos';
    } else {
      window.location.href = '/subpos';
    }
  } else if (!isStandalonePage()) {
    useAuthStore.getState().logout();
    if (isHash) {
      window.location.hash = '#/login';
    } else {
      window.location.href = '/login';
    }
  }
}

// Request interceptor — attach JWT from active store
api.interceptors.request.use((config) => {
  const path = typeof window !== 'undefined' ? (window.location.pathname + window.location.hash).toLowerCase() : '';
  const adminToken = useAuthStore.getState().token;
  const mainposToken = useMainposStore.getState().token;
  const subposToken = useSubposStore.getState().token;

  let token = adminToken;
  if (path.includes('mainpos') && mainposToken) {
    token = mainposToken;
  } else if (path.includes('subpos') && subposToken) {
    token = subposToken;
  } else {
    token = adminToken || mainposToken || subposToken;
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401, 403, 500
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    const status = error.response?.status;
    const reqUrl = originalRequest?.url || '';

    // Never handle auth endpoints themselves
    if (isAuthEndpoint(reqUrl)) {
      return Promise.reject(error);
    }

    // 401 handling
    if (status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      if (reqUrl.includes('/mainpos/')) {
        redirectToLogin('mainpos');
        return Promise.reject(error);
      }

      if (reqUrl.includes('/subpos/')) {
        redirectToLogin('subpos');
        return Promise.reject(error);
      }

      // Standalone POS pages should not attempt admin token refreshes or redirect to /login
      if (isStandalonePage()) {
        return Promise.reject(error);
      }

      try {
        const { data } = await api.post('/auth/refresh');
        useAuthStore.getState().setToken(data.data.token);
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${data.data.token}`;
        return api(originalRequest);
      } catch {
        redirectToLogin('admin');
      }
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default api;
