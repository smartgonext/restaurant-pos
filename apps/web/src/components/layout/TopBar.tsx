import {
  Sun, Moon, Bell, Search, Globe, User, LogOut, ChevronDown, Monitor,
  Layout, MonitorCheck, Building2, Landmark, Check, ShoppingBag, Utensils,
  AlertTriangle, Trash2, CheckCheck, X
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useNotificationStore, NotificationItem } from '@/stores/notificationStore';
import { cn, getInitials, formatCurrency } from '@/lib/utils';
import api from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { CashRegisterModal } from './CashRegisterModal';
import { NetworkPeerStatusBadge } from '../NetworkPeerStatusBadge';
import { SoftwareUpdateBadge } from '../SoftwareUpdateBadge';

const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸' },
  { code: 'hi', name: 'Hindi', native: 'हिंदी', flag: '🇮🇳' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', flag: '🇮🇳' },
  { code: 'fr', name: 'French', native: 'Français', flag: '🇫🇷' },
  { code: 'ar', name: 'Arabic', native: 'العربية', flag: '🇸🇦' }
];

export function TopBar() {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const { i18n } = useTranslation();
  const navigate = useNavigate();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [showNotificationsMenu, setShowNotificationsMenu] = useState(false);
  const [activeNotifTab, setActiveNotifTab] = useState<'all' | 'order' | 'waiter' | 'kitchen' | 'system'>('all');
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  const isSuperAdmin = user?.role === 'superadmin' || user?.role === 'support';

  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const langRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  // Initial sync: fetch pending waiter requests to populate notification store
  useEffect(() => {
    if (isSuperAdmin) return;
    api.get('/restaurant/waiter-requests')
      .then(res => {
        if (res.data.success && Array.isArray(res.data.data)) {
          res.data.data.forEach((req: any) => {
            addNotification({
              id: `waiter-req-${req.id}`,
              title: `Waiter Request - Table ${req.table?.name || req.tableId || ''}`,
              message: `Table ${req.table?.name || req.tableId || ''} requested waiter assistance`,
              type: 'waiter',
              timestamp: req.createdAt,
              link: '/admin/waiter-requests'
            });
          });
        }
      })
      .catch(() => {});
  }, [addNotification, isSuperAdmin]);

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setShowLanguageMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotificationsMenu(false);
      }
      if (userRef.current && !userRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Query Cash Register Session status
  const { data: sessionData } = useQuery({
    queryKey: ['cash-register-session'],
    queryFn: () => api.get('/restaurant/cash-register/session').then(r => r.data.data),
    enabled: !isSuperAdmin,
    refetchInterval: 30000,
  });

  const isRegisterOpen = Boolean(sessionData && sessionData.status === 'open');

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore API logout errors and clear local state anyway.
    } finally {
      logout();
      navigate('/login');
    }
  };

  const handleLanguageChange = (code: string, name: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('i18nextLng', code);
    setShowLanguageMenu(false);
    toast.success(`Language set to ${name}`);
  };

  const handleNotificationClick = (item: NotificationItem) => {
    markAsRead(item.id);
    setShowNotificationsMenu(false);
    if (item.link) {
      navigate(item.link);
    } else if (item.type === 'waiter') {
      navigate('/admin/waiter-requests');
    } else if (item.type === 'order') {
      navigate('/admin/orders');
    } else if (item.type === 'kitchen') {
      navigate('/admin/kitchen');
    } else if (item.type === 'low_stock') {
      navigate('/admin/inventory');
    }
  };

  const formatRelativeTime = (ts: Date | string | number) => {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return 'Recently';
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 30) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const filteredNotifications = notifications.filter(n => {
    if (activeNotifTab === 'all') return true;
    if (activeNotifTab === 'system') return n.type === 'system' || n.type === 'low_stock';
    return n.type === activeNotifTab;
  });

  const currentLang = LANGUAGES.find(l => l.code === (i18n.language || 'en')) || LANGUAGES[0];

  return (
    <>
      <header className="h-[var(--topbar-height)] bg-bg-secondary/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-6 sticky top-0 z-30">
        {/* Search */}
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search anything..."
            className="glass-input w-full pl-10 text-xs h-8"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded border border-border">
            ⌘K
          </kbd>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* LAN Cluster Status Badge */}
          <NetworkPeerStatusBadge />

          {/* Software Auto-Update Badge */}
          <SoftwareUpdateBadge />

          {/* Branch */}
          {!user?.role.includes('superadmin') && (
            <button className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border/50 bg-bg-tertiary/50 hover:bg-bg-hover transition-all group">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] font-black uppercase tracking-widest text-text-secondary group-hover:text-text-primary">Main Branch</span>
              <ChevronDown className="w-3 h-3 text-text-muted" />
            </button>
          )}

          {/* Cash Register Status Button */}
          {!isSuperAdmin && (
            <button
              onClick={() => setIsRegisterModalOpen(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all ${
                isRegisterOpen
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
              }`}
            >
              <Landmark className="w-3.5 h-3.5" />
              <span>
                {isRegisterOpen
                  ? `Register Open (${formatCurrency(sessionData?.openingBalance || 0)})`
                  : 'Open Register'}
              </span>
              <span className={`w-2 h-2 rounded-full ${isRegisterOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            </button>
          )}

          {/* Language Menu Dropdown (World Icon) */}
          <div className="relative" ref={langRef}>
            <button
              onClick={() => {
                setShowLanguageMenu(!showLanguageMenu);
                setShowNotificationsMenu(false);
                setShowUserMenu(false);
              }}
              title="Change Language"
              className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-bg-hover transition-colors text-text-secondary hover:text-text-primary"
            >
              <Globe className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider hidden md:inline-block">{currentLang.code}</span>
            </button>

            {showLanguageMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-bg-secondary border border-border rounded-xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-1.5 border-b border-border/50 text-[11px] font-bold uppercase tracking-wider text-text-muted">
                  Select Language
                </div>
                <div className="max-h-64 overflow-y-auto custom-scrollbar py-1">
                  {LANGUAGES.map((lang) => {
                    const isSelected = (i18n.language || 'en') === lang.code;
                    return (
                      <button
                        key={lang.code}
                        onClick={() => handleLanguageChange(lang.code, lang.name)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 text-xs transition-colors hover:bg-bg-hover text-left",
                          isSelected ? "bg-primary/10 text-primary font-bold" : "text-text-secondary"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">{lang.flag}</span>
                          <div>
                            <p className="leading-tight">{lang.name}</p>
                            <p className="text-[10px] text-text-muted">{lang.native}</p>
                          </div>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Theme Toggle */}
          <button onClick={toggleTheme} title="Toggle Theme" className="p-2 rounded-lg hover:bg-bg-hover transition-colors">
            {theme === 'dark' ? <Sun className="w-4 h-4 text-text-secondary" /> : <Moon className="w-4 h-4 text-text-secondary" />}
          </button>

          {/* Notifications Dropdown (Bell Icon) */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => {
                setShowNotificationsMenu(!showNotificationsMenu);
                setShowLanguageMenu(false);
                setShowUserMenu(false);
              }}
              title="Notifications"
              className="relative p-2 rounded-lg hover:bg-bg-hover transition-colors text-text-secondary hover:text-text-primary"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 ? (
                <span className="absolute top-1 right-1 px-1.5 py-0.2 min-w-[18px] h-[18px] bg-rose-500 text-white font-extrabold text-[10px] rounded-full flex items-center justify-center border-2 border-bg-secondary animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              ) : notifications.length > 0 ? (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full" />
              ) : null}
            </button>

            {showNotificationsMenu && (
              <div className="absolute right-0 top-full mt-2 w-80 md:w-96 bg-bg-secondary border border-border rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Notification Header */}
                <div className="p-3 bg-bg-tertiary/40 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-text-primary">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 text-[10px] font-extrabold bg-rose-500/20 text-rose-400 rounded-full border border-rose-500/30">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        title="Mark all as read"
                        className="p-1 rounded-md text-[11px] text-primary hover:bg-primary/10 flex items-center gap-1 font-semibold transition-colors"
                      >
                        <CheckCheck className="w-3.5 h-3.5" /> Read All
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button
                        onClick={clearAll}
                        title="Clear all notifications"
                        className="p-1.5 rounded-md text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Notification Category Tabs */}
                <div className="flex items-center gap-1 px-3 py-2 bg-bg-secondary border-b border-border/60 overflow-x-auto custom-scrollbar text-[11px] font-semibold">
                  {(['all', 'order', 'waiter', 'kitchen', 'system'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveNotifTab(tab)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg capitalize whitespace-nowrap transition-colors",
                        activeNotifTab === tab
                          ? "bg-primary text-white font-bold shadow-sm"
                          : "text-text-muted hover:text-text-primary hover:bg-bg-hover"
                      )}
                    >
                      {tab === 'system' ? 'Alerts' : tab}
                    </button>
                  ))}
                </div>

                {/* Notifications List */}
                <div className="max-h-80 overflow-y-auto custom-scrollbar divide-y divide-border/40">
                  {filteredNotifications.length === 0 ? (
                    <div className="p-8 text-center text-text-muted flex flex-col items-center justify-center">
                      <Bell className="w-8 h-8 opacity-20 mb-2" />
                      <p className="text-xs font-medium">No notifications in this section</p>
                    </div>
                  ) : (
                    filteredNotifications.map((item) => {
                      const isUnread = !item.read;
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleNotificationClick(item)}
                          className={cn(
                            "p-3.5 flex items-start gap-3 transition-colors cursor-pointer hover:bg-bg-hover relative group",
                            isUnread ? "bg-primary/5" : "opacity-80"
                          )}
                        >
                          {/* Icon badge */}
                          <div className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                            item.type === 'waiter' ? "bg-amber-500/15 text-amber-400" :
                            item.type === 'order' ? "bg-blue-500/15 text-blue-400" :
                            item.type === 'kitchen' ? "bg-emerald-500/15 text-emerald-400" :
                            item.type === 'low_stock' ? "bg-rose-500/15 text-rose-400" :
                            "bg-purple-500/15 text-purple-400"
                          )}>
                            {item.type === 'waiter' ? <Bell className="w-4 h-4 animate-bounce" /> :
                             item.type === 'order' ? <ShoppingBag className="w-4 h-4" /> :
                             item.type === 'kitchen' ? <Utensils className="w-4 h-4" /> :
                             <AlertTriangle className="w-4 h-4" />}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <h4 className={cn("text-xs leading-tight truncate", isUnread ? "font-bold text-text-primary" : "font-medium text-text-secondary")}>
                                {item.title || (item.type === 'waiter' ? 'Waiter Call' : item.type === 'order' ? 'Order Update' : item.type === 'kitchen' ? 'KOT Alert' : 'System Alert')}
                              </h4>
                              <span className="text-[10px] text-text-muted shrink-0">
                                {formatRelativeTime(item.timestamp)}
                              </span>
                            </div>
                            <p className="text-xs text-text-secondary line-clamp-2 leading-snug">
                              {item.message}
                            </p>
                          </div>

                          {/* Unread indicator dot */}
                          {isUnread && (
                            <span className="w-2 h-2 rounded-full bg-primary shrink-0 self-center" />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer */}
                {notifications.length > 0 && (
                  <div className="p-2 bg-bg-tertiary/40 border-t border-border text-center">
                    <button
                      onClick={() => {
                        setShowNotificationsMenu(false);
                        navigate('/admin/waiter-requests');
                      }}
                      className="text-xs text-primary font-bold hover:underline py-1 px-2 inline-block"
                    >
                      View Waiter Requests →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User Menu */}
          <div className="relative ml-2" ref={userRef}>
            <button
              onClick={() => {
                setShowUserMenu(!showUserMenu);
                setShowLanguageMenu(false);
                setShowNotificationsMenu(false);
              }}
              className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg hover:bg-bg-hover transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center text-white text-xs font-bold">
                {getInitials(user?.name || 'U')}
              </div>
              {user && (
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium text-text-primary leading-none">{user.name}</p>
                  <p className="text-[11px] text-text-muted capitalize">{user.role}</p>
                </div>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-bg-secondary border border-border rounded-xl shadow-card py-1 z-50 animate-fade-in">
                {!isSuperAdmin && (
                  <>
                    <button onClick={() => { navigate('/admin/kiosk'); setShowUserMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover transition-colors">
                      <Monitor className="w-4 h-4" /> Kiosk Mode
                    </button>
                    <button onClick={() => { navigate('/admin/customer-display'); setShowUserMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover transition-colors">
                      <Layout className="w-4 h-4" /> Customer Display
                    </button>
                    <button onClick={() => { navigate('/admin/order-board'); setShowUserMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover transition-colors">
                      <MonitorCheck className="w-4 h-4" /> Order Board
                    </button>
                    <hr className="border-border my-1" />
                  </>
                )}
                <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover transition-colors">
                  <User className="w-4 h-4" /> Profile
                </button>
                <hr className="border-border my-1" />
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-danger hover:bg-danger/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <CashRegisterModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
      />
    </>
  );
}

