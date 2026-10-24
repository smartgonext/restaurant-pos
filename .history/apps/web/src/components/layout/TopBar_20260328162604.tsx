import { Sun, Moon, Bell, Search, Globe, User, LogOut, ChevronDown, Monitor, Layout, MonitorCheck, Building2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { cn, getInitials } from '@/lib/utils';
import toast from 'react-hot-toast';

export function TopBar() {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleExitImpersonation = () => {
    const restored = useAuthStore.getState().restoreSuperadmin();
    if (restored) {
      toast.success('Returned to superadmin session');
      navigate('/superadmin/restaurants');
    } else {
      toast.error('No original superadmin session found');
      logout();
      navigate('/login');
    }
  };

  const hasImpersonation = typeof window !== 'undefined' && !!localStorage.getItem('impersonation-backup');

  return (
    <header className="h-14 bg-bg-secondary/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Search */}
      <div className="relative w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Search anything..."
          className="glass-input w-full pl-10 text-sm h-9"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded border border-border">
          ⌘K
        </kbd>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Branch */}
        {!user?.role.includes('superadmin') && (
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/50 bg-bg-tertiary/50 hover:bg-bg-hover transition-all group">
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] font-black uppercase tracking-widest text-text-secondary group-hover:text-text-primary">Main Branch</span>
            <ChevronDown className="w-3 h-3 text-text-muted" />
          </button>
        )}

        {/* Language */}
        <button className="p-2 rounded-lg hover:bg-bg-hover transition-colors">
          <Globe className="w-4 h-4 text-text-secondary" />
        </button>

        {/* Theme Toggle */}
        <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-bg-hover transition-colors">
          {theme === 'dark' ? <Sun className="w-4 h-4 text-text-secondary" /> : <Moon className="w-4 h-4 text-text-secondary" />}
        </button>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-bg-hover transition-colors">
          <Bell className="w-4 h-4 text-text-secondary" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full animate-pulse-dot" />
        </button>

        {/* User Menu */}
        <div className="relative ml-2">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-hover transition-colors"
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
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-48 bg-bg-secondary border border-border rounded-xl shadow-card py-1 z-50 animate-fade-in">
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
                <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover transition-colors">
                  <User className="w-4 h-4" /> Profile
                </button>
                {hasImpersonation && user?.role !== 'superadmin' && (
                  <>
                    <hr className="border-border my-1" />
                    <button
                      onClick={handleExitImpersonation}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-success hover:bg-success/10 transition-colors"
                    >
                      <Building2 className="w-4 h-4" /> Exit Impersonation
                    </button>
                  </>
                )}
                <hr className="border-border my-1" />
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-danger hover:bg-danger/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
