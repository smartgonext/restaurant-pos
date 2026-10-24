import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Plus, Package, ShoppingCart, ArrowLeftRight, Truck, X, Search } from 'lucide-react';
import api from '@/lib/api';
import { useToast } from './ToastProvider';
import type { InvView } from './InventorySidebar';

interface Props {
  onNavigate: (view: InvView) => void;
  onQuickAction?: (action: string) => void;
}

function useDebounce<T>(value: T, delay: number): T {
  const [d, setD] = useState(value);
  useEffect(() => { const t = setTimeout(() => setD(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return d;
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { notifications, clearNotifications, markAllRead } = useToast();
  useEffect(() => { markAllRead(); }, []);

  const relTime = (ts: number) => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  return (
    <div style={{
      position: 'absolute', top: '110%', right: 0, width: 340,
      background: 'var(--bg-primary)', border: '1px solid var(--border)',
      borderRadius: 12, boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
      zIndex: 100, overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Notifications</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={clearNotifications} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear all</button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={14} /></button>
        </div>
      </div>
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {notifications.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No recent notifications</div>
        ) : notifications.map(n => (
          <div key={n.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{n.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.4 }}>{n.description}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{relTime(n.timestamp)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchDropdown({ query, onClose, onNavigate }: { query: string; onClose: () => void; onNavigate: (v: InvView) => void }) {
  const [results, setResults] = useState<{ items: any[]; suppliers: any[]; pos: any[] }>({ items: [], suppliers: [], pos: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || query.length < 2) { setResults({ items: [], suppliers: [], pos: [] }); return; }
    setLoading(true);
    Promise.all([
      api.get(`/restaurant/inventory/items/search?q=${encodeURIComponent(query)}&limit=4`).then(r => r.data.data || []).catch(() => []),
      api.get(`/restaurant/inventory/suppliers?q=${encodeURIComponent(query)}`).then(r => (r.data.data || []).slice(0, 3)).catch(() => []),
      api.get(`/restaurant/inventory/purchase-orders?q=${encodeURIComponent(query)}`).then(r => (r.data.data || []).slice(0, 3)).catch(() => []),
    ]).then(([items, suppliers, pos]) => { setResults({ items, suppliers, pos }); setLoading(false); });
  }, [query]);

  const hasResults = results.items.length + results.suppliers.length + results.pos.length > 0;
  if (!query || query.length < 2) return null;

  return (
    <div style={{
      position: 'absolute', top: '110%', left: 0, right: 0,
      background: 'var(--bg-primary)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: '0 16px 48px rgba(0,0,0,0.5)', zIndex: 100, overflow: 'hidden',
    }}>
      {loading && <div style={{ padding: '12px 16px', fontSize: 11, color: 'var(--text-muted)' }}>Searching...</div>}
      {!loading && !hasResults && <div style={{ padding: '12px 16px', fontSize: 11, color: 'var(--text-muted)' }}>No results for "{query}"</div>}
      {results.items.length > 0 && (
        <div>
          <div style={{ padding: '8px 16px 4px', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>ITEMS</div>
          {results.items.map((it: any) => (
            <button key={it.id} onClick={() => { onNavigate('raw-materials'); onClose(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', textAlign: 'left' }}>
              <Package size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: 12 }}>{it.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{it.currentStock} {it.unit?.symbol}</span>
            </button>
          ))}
        </div>
      )}
      {results.suppliers.length > 0 && (
        <div>
          <div style={{ padding: '8px 16px 4px', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>SUPPLIERS</div>
          {results.suppliers.map((s: any) => (
            <button key={s.id} onClick={() => { onNavigate('suppliers'); onClose(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', textAlign: 'left' }}>
              <Truck size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: 12 }}>{s.name}</span>
            </button>
          ))}
        </div>
      )}
      {results.pos.length > 0 && (
        <div>
          <div style={{ padding: '8px 16px 4px', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>PURCHASE ORDERS</div>
          {results.pos.map((o: any) => (
            <button key={o.id} onClick={() => { onNavigate('purchase-orders'); onClose(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', textAlign: 'left' }}>
              <ShoppingCart size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: 12 }}>{o.orderNumber}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{o.status}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InventoryTopBar({ onNavigate, onQuickAction }: Props) {
  const { unreadCount } = useToast();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const notifsRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearch(false);
      if (notifsRef.current && !notifsRef.current.contains(e.target as Node)) setShowNotifs(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const QUICK_ACTIONS: { label: string; icon: React.ReactNode; view: InvView; key: string }[] = [
    { label: 'Add Raw Material', icon: <Package size={14} />, view: 'raw-materials', key: 'add-item' },
    { label: 'New Purchase Order', icon: <ShoppingCart size={14} />, view: 'purchase-orders', key: 'new-po' },
    { label: 'Record Stock Movement', icon: <ArrowLeftRight size={14} />, view: 'movements', key: 'add-movement' },
    { label: 'Add Supplier', icon: <Truck size={14} />, view: 'suppliers', key: 'add-supplier' },
  ];

  return (
    <div style={{
      height: 52, background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
      position: 'sticky', top: 0, zIndex: 10, flexShrink: 0,
    }}>
      {/* Global Search */}
      <div ref={searchRef} style={{ position: 'relative', flex: 1, maxWidth: 440 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setShowSearch(true); }}
          onFocus={() => setShowSearch(true)}
          placeholder="Search items, suppliers, POs..."
          style={{
            width: '100%', paddingLeft: 32, paddingRight: 12, height: 34,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--text-primary)', fontSize: 12,
            outline: 'none',
          }}
        />
        {showSearch && debounced && (
          <SearchDropdown query={debounced} onClose={() => { setSearch(''); setShowSearch(false); }} onNavigate={onNavigate} />
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Quick Actions */}
      <div style={{ position: 'relative' }}>
        <button onClick={() => setShowQuick(s => !s)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: '#7c3aed', color: 'var(--text)', border: 'none', borderRadius: 8,
          padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          <Plus size={14} /> New
        </button>
        {showQuick && (
          <div style={{
            position: 'absolute', top: '110%', right: 0, width: 220,
            background: 'var(--bg-primary)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: '0 16px 48px rgba(0,0,0,0.5)', overflow: 'hidden', zIndex: 100,
          }}>
            {QUICK_ACTIONS.map(a => (
              <button key={a.key} onClick={() => { onNavigate(a.view); onQuickAction?.(a.key); setShowQuick(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-primary)', fontSize: 12, textAlign: 'left',
                  transition: 'background 150ms',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <span style={{ color: 'var(--text-muted)' }}>{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Notification Bell */}
      <div ref={notifsRef} style={{ position: 'relative' }}>
        <button onClick={() => setShowNotifs(s => !s)} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', position: 'relative', padding: 6,
        }}>
          <Bell size={18} />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: 2, right: 2, width: 8, height: 8,
              background: '#ef4444', borderRadius: '50%', border: '1.5px solid var(--bg-primary)',
            }} />
          )}
        </button>
        {showNotifs && <NotificationPanel onClose={() => setShowNotifs(false)} />}
      </div>
    </div>
  );
}
