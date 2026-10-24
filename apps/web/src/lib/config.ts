/**
 * config.ts — Centralized API base URL and Socket base URL resolver.
 *
 * Supports three scenarios:
 *  1. Electron packaged (file:// protocol) — always use http://localhost:{port}
 *  2. Dev mode (http://localhost:5173) — use VITE_API_URL / VITE_SOCKET_URL from .env
 *  3. Served from a public host — derive from window.location.origin
 */

const DEFAULT_PORT = 3001;

function isElectron(): boolean {
  // Electron loads the renderer from a file:// URL
  return typeof window !== 'undefined' && window.location.protocol === 'file:';
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

// ── API base URL ──────────────────────────────────────────────────────────────

function resolveApiBase(): string {
  // Electron packaged — always local backend
  if (isElectron()) {
    return `http://localhost:${DEFAULT_PORT}/api`;
  }

  const envUrl = import.meta.env.VITE_API_URL as string | undefined;

  if (typeof window === 'undefined') {
    return envUrl || `http://localhost:${DEFAULT_PORT}/api`;
  }

  const protocol = window.location.protocol;
  const isHttpPage = protocol === 'http:' || protocol === 'https:';

  if (envUrl) {
    try {
      const resolved = new URL(envUrl, window.location.origin);
      // If the page is served from a non-loopback host (e.g. 26.166.42.176 or 192.168.1.5)
      // but envUrl points to loopback, derive API base from the current hostname on port 3001
      // to avoid Private Network Access (PNA) CORS restriction blocking localhost requests.
      if (isHttpPage && !isLoopback(window.location.hostname) && isLoopback(resolved.hostname)) {
        return `${protocol}//${window.location.hostname}:${resolved.port || DEFAULT_PORT}/api`;
      }
      return resolved.toString().replace(/\/$/, '');
    } catch {
      return envUrl;
    }
  }

  if (isHttpPage && !isLoopback(window.location.hostname)) {
    return `${protocol}//${window.location.hostname}:${DEFAULT_PORT}/api`;
  }

  return `http://localhost:${DEFAULT_PORT}/api`;
}

// ── Socket base URL ───────────────────────────────────────────────────────────

function resolveSocketBase(): string {
  // Electron packaged — always local backend
  if (isElectron()) {
    return `http://localhost:${DEFAULT_PORT}`;
  }

  const envUrl = import.meta.env.VITE_SOCKET_URL as string | undefined;

  if (typeof window === 'undefined') {
    return envUrl || `http://localhost:${DEFAULT_PORT}`;
  }

  const protocol = window.location.protocol;
  const isHttpPage = protocol === 'http:' || protocol === 'https:';

  if (envUrl) {
    try {
      const resolved = new URL(envUrl, window.location.origin);
      if (isHttpPage && !isLoopback(window.location.hostname) && isLoopback(resolved.hostname)) {
        return `${protocol}//${window.location.hostname}:${DEFAULT_PORT}`;
      }
      return resolved.toString().replace(/\/$/, '');
    } catch {
      return envUrl;
    }
  }

  if (isHttpPage && (!isLoopback(window.location.hostname) || window.location.port === '5173')) {
    return `${protocol}//${window.location.hostname}:${DEFAULT_PORT}`;
  }

  return isHttpPage ? window.location.origin : `http://localhost:${DEFAULT_PORT}`;
}

// ── Exports ───────────────────────────────────────────────────────────────────

export const API_BASE_URL = resolveApiBase();
export const SOCKET_BASE_URL = resolveSocketBase();
export const SERVER_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

if (import.meta.env.DEV) {
  console.log('[config] API_BASE_URL =', API_BASE_URL);
  console.log('[config] SOCKET_BASE_URL =', SOCKET_BASE_URL);
  console.log('[config] SERVER_BASE_URL =', SERVER_BASE_URL);
}

