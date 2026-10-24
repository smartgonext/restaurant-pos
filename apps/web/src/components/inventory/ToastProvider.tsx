import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

export interface NotifEntry {
  id: string;
  icon: string;
  description: string;
  timestamp: number;
  read: boolean;
}

interface ToastCtx {
  showToast: (type: ToastType, title: string, message?: string) => void;
  notifications: NotifEntry[];
  addNotification: (entry: Omit<NotifEntry, 'id' | 'timestamp' | 'read'>) => void;
  clearNotifications: () => void;
  markAllRead: () => void;
  unreadCount: number;
}

const Ctx = createContext<ToastCtx | null>(null);

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={16} />,
  error:   <XCircle size={16} />,
  warning: <AlertTriangle size={16} />,
  info:    <Info size={16} />,
};

const COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', icon: '#10b981' },
  error:   { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  icon: '#ef4444' },
  warning: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', icon: '#f59e0b' },
  info:    { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', icon: '#3b82f6' },
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const c = COLORS[toast.type];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const t = setTimeout(() => { setVisible(false); setTimeout(onRemove, 300); }, 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 10, padding: '10px 12px', maxWidth: 340,
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      transform: visible ? 'translateX(0)' : 'translateX(100%)',
      opacity: visible ? 1 : 0,
      transition: 'transform 300ms ease, opacity 300ms ease',
    }}>
      <span style={{ color: c.icon, flexShrink: 0, marginTop: 1 }}>{ICONS[toast.type]}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{toast.title}</div>
        {toast.message && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{toast.message}</div>}
      </div>
      <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0, padding: 2 }}>
        <X size={12} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifications, setNotifications] = useState<NotifEntry[]>(() => {
    try { return JSON.parse(sessionStorage.getItem('inv_notifications') || '[]'); } catch { return []; }
  });

  const saveNotifs = (entries: NotifEntry[]) => {
    try { sessionStorage.setItem('inv_notifications', JSON.stringify(entries.slice(0, 50))); } catch { /* */ }
  };

  const showToast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev.slice(-3), { id, type, title, message }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addNotification = useCallback((entry: Omit<NotifEntry, 'id' | 'timestamp' | 'read'>) => {
    const notif: NotifEntry = { ...entry, id: `${Date.now()}-${Math.random()}`, timestamp: Date.now(), read: false };
    setNotifications(prev => {
      const updated = [notif, ...prev].slice(0, 50);
      saveNotifs(updated);
      return updated;
    });
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    try { sessionStorage.removeItem('inv_notifications'); } catch { /* */ }
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => {
      const updated = prev.map(n => ({ ...n, read: true }));
      saveNotifs(updated);
      return updated;
    });
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <Ctx.Provider value={{ showToast, notifications, addNotification, clearNotifications, markAllRead, unreadCount }}>
      {children}
      {/* Toast container */}
      <div style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end',
      }}>
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onRemove={() => removeToast(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}
