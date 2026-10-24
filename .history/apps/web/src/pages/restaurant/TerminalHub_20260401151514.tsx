import { useNavigate } from 'react-router-dom';
import { 
  Monitor, 
  CreditCard, 
  UserCircle, 
  LayoutDashboard, 
  LogOut, 
  ArrowRight,
  TrendingUp,
  ChefHat
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Card } from '@/components/ui/Card';

export default function TerminalHub() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const terminals = [
    {
      id: 'subpos',
      title: 'Sub POS',
      description: 'Add items to orders and generate tokens at the counter.',
      icon: <Monitor className="w-8 h-8 text-amber-500" />,
      color: 'amber',
      path: '/subpos/terminal',
      role: ['admin', 'branch_head', 'waiter', 'chef']
    },
    {
      id: 'mainpos',
      title: 'Main POS',
      description: 'Complete billing, process payments, and manage loyalty rewards.',
      icon: <CreditCard className="w-8 h-8 text-indigo-500" />,
      color: 'indigo',
      path: '/mainpos/terminal',
      role: ['admin', 'branch_head']
    },
    {
      id: 'waiter',
      title: 'Waiter Terminal',
      description: 'Manage table orders and send requests directly to the kitchen.',
      icon: <UserCircle className="w-8 h-8 text-emerald-500" />,
      color: 'emerald',
      path: '/waiter',
      role: ['admin', 'branch_head', 'waiter']
    },
    {
      id: 'kitchen',
      title: 'Kitchen Display',
      description: 'View and track all orders in real-time with status updates.',
      icon: <ChefHat className="w-8 h-8 text-rose-500" />,
      color: 'rose',
      path: '/admin/kitchen',
      role: ['admin', 'branch_head', 'chef']
    }
  ];

  const allowedTerminals = terminals.filter(t => t.role.includes(user?.role || ''));

  return (
    <div className="min-h-screen bg-[#0d0f1c] text-white p-6 md:p-12 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/2 pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter mb-2">
              Select Your <span className="text-blue-500 italic">Workstation</span>
            </h1>
            <p className="text-slate-400 font-medium">Welcome, <span className="text-white font-bold">{user?.name}</span>. Choose your terminal to begin work.</p>
          </div>
          
          <div className="flex items-center gap-3">
            {user?.role === 'admin' && (
              <button 
                onClick={() => navigate('/admin')}
                className="flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition group"
              >
                <LayoutDashboard size={18} className="text-blue-400" />
                <span className="font-bold text-sm uppercase">Dashboard</span>
              </button>
            )}
            <button 
              onClick={logout}
              className="flex items-center gap-2 px-5 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded-2xl transition"
            >
              <LogOut size={18} />
              <span className="font-bold text-sm uppercase">Logout</span>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {allowedTerminals.map((t) => (
            <button
              key={t.id}
              onClick={() => navigate(t.path)}
              className="group text-left"
            >
              <Card className="h-full p-8 bg-[#161929] border-[#2a2d3e] hover:border-[#3a3d4e] hover:bg-[#1a1e32] transition-all duration-300 rounded-[32px] relative overflow-hidden">
                <div className="relative z-10">
                  <div className={`w-16 h-16 rounded-2xl bg-${t.color}-500/10 flex items-center justify-center mb-12 group-hover:scale-110 transition-transform duration-500 shadow-glow-sm`}>
                    {t.icon}
                  </div>
                  
                  <h3 className="text-2xl font-bold mb-3 group-hover:text-white transition-colors uppercase italic tracking-tight">{t.title}</h3>
                  <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">{t.description}</p>
                  
                  <div className="flex items-center gap-2 text-sm font-black text-blue-400 group-hover:text-blue-300 transition-colors uppercase tracking-widest">
                    Open Terminal <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>

                {/* Decorative Pattern */}
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <TrendingUp size={80} />
                </div>
              </Card>
            </button>
          ))}
        </div>

        <footer className="mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Systems Online · Version 2.4.0</span>
          </div>
          <div className="text-xs text-slate-600 font-medium">© 2026 TableTrack SaaS · Connected to {user?.restaurantName || 'Cloud'}</div>
        </footer>
      </div>
    </div>
  );
}
