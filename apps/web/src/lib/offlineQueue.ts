import api from './api';
import { useAuthStore } from '@/stores/authStore';
import { API_BASE_URL } from './config';

const STORAGE_KEY = 'rs_offline_queue_v1';

type QueueItem = {
  id: string;
  url: string;
  method: 'POST' | 'PUT' | 'DELETE';
  data: any;
  createdAt: string;
  attempts?: number;
};

function readQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueueItem[];
  } catch (e) {
    return [];
  }
}

function writeQueue(items: QueueItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function enqueueRequest(url: string, method: QueueItem['method'], data: any) {
  const id = `offline-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const item: QueueItem = { id, url, method, data, createdAt: new Date().toISOString(), attempts: 0 };
  const q = readQueue();
  q.push(item);
  writeQueue(q);
  return item;
}

export async function processQueue() {
  if (typeof window === 'undefined') return;
  const q = readQueue();
  if (!q.length) return;

  // Use auth token from store if available
  const token = useAuthStore.getState().token;

  for (const item of [...q]) {
    try {
      const urlBase = API_BASE_URL;
      const full = `${urlBase.replace(/\/$/, '')}${item.url}`;
      const headers: Record<string,string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(full, {
        method: item.method,
        headers,
        body: JSON.stringify(item.data),
        credentials: 'include'
      });

      if (!res.ok) throw new Error(`Sync failed: ${res.status}`);

      // remove item from queue on success
      const newQ = readQueue().filter((x) => x.id !== item.id);
      writeQueue(newQ);
    } catch (err) {
      // increment attempts and leave in queue; if too many attempts, skip later
      const cur = readQueue();
      const idx = cur.findIndex((x) => x.id === item.id);
      if (idx !== -1) {
        cur[idx].attempts = (cur[idx].attempts || 0) + 1;
        // if too many attempts, drop it to avoid infinite retry
        if ((cur[idx].attempts || 0) > 10) {
          cur.splice(idx, 1);
        }
        writeQueue(cur);
      }
      // continue with next
      continue;
    }
  }
}

export function startOfflineSync() {
  if (typeof window === 'undefined') return () => {};
  const onOnline = () => {
    // small delay to allow networking to stabilise
    setTimeout(() => processQueue().catch(() => {}), 500);
  };
  window.addEventListener('online', onOnline);

  // Periodic attempt
  const id = window.setInterval(() => {
    if (navigator.onLine) processQueue().catch(() => {});
  }, 30_000);

  // Initial attempt
  if (navigator.onLine) processQueue().catch(() => {});

  return () => {
    window.removeEventListener('online', onOnline);
    window.clearInterval(id);
  };
}

// Convenience: post order for POS terminals (server when online, queue when offline)
export async function postOrder(payload: any) {
  const url = '/restaurant/orders';
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const item = enqueueRequest(url, 'POST', payload);
    // Return a simulated axios-like response so callers can proceed
    return Promise.resolve({ data: { success: true, data: { id: null, tempId: item.id, offline: true, ...payload } } });
  }
  return api.post(url, payload);
}

export async function postCustomerOrder(restaurantSlug: string | undefined, tableToken: string, payload: any) {
  const url = restaurantSlug ? `/customer/${restaurantSlug}/${tableToken}/order` : `/customer/by-table/${tableToken}/order`;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const item = enqueueRequest(url, 'POST', payload);
    return Promise.resolve({ data: { success: true, data: { id: null, tempId: item.id, offline: true, ...payload } } });
  }
  return api.post(url, payload);
}

export function getQueueLength() {
  return readQueue().length;
}

export default {
  enqueueRequest,
  processQueue,
  startOfflineSync,
  postOrder,
  postCustomerOrder,
  getQueueLength,
};
