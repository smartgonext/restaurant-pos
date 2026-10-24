import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMainposStore } from '@/stores/mainposStore';
import toast from 'react-hot-toast';
import { CreditCard, Zap } from 'lucide-react';
import api from '@/lib/api';

export default function MainPOSLogin() {
  const navigate = useNavigate();
  const login = useMainposStore((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/mainpos/login', { username, password });
      if (data.success) {
        login({ token: data.data.token, terminal: data.data.terminal });
        navigate('/mainpos/terminal');
      } else {
        toast.error(data.error || 'Login failed');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-blue-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-500 rounded-2xl shadow-2xl mb-4">
            <CreditCard className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Main POS</h1>
          <p className="text-indigo-300 mt-1">Billing & Payment Terminal</p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-indigo-200 mb-2">Terminal Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                placeholder="e.g. mainpos1"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-indigo-200 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-indigo-500 hover:bg-indigo-400 disabled:bg-indigo-800 text-white font-bold rounded-xl text-lg transition-all duration-200 shadow-lg flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
              ) : (
                <Zap className="w-5 h-5" />
              )}
              {loading ? 'Connecting...' : 'Open Terminal'}
            </button>
          </form>
        </div>

        <p className="text-center text-indigo-400/60 text-sm mt-6">
          Contact your admin if you cannot login
        </p>
      </div>
    </div>
  );
}
