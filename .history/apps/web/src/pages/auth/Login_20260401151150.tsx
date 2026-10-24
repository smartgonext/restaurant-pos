import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { UtensilsCrossed, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';

function getRedirectByRole(role: string, loginType: string): string {
  // Management/Admin login
  if (loginType === 'management') {
    if (role === 'superadmin' || role === 'support') {
      return '/superadmin';
    }
    return '/admin';
  }
  
  // Personnel login - All staff can access terminal hub
  return '/terminals';
}

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginType, setLoginType] = useState<'personnel' | 'management'>('personnel');
  const [rememberMe, setRememberMe] = useState(false);
  const [inlineError, setInlineError] = useState('');
  const { login, isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors }, setValue } = useForm<{ email: string; password: string }>();

  useEffect(() => {
    if (isAuthenticated && user) {
      const isSuper = user.role === 'superadmin' || user.role === 'support';
      const type = isSuper || user.role === 'admin' ? 'management' : 'personnel';
      navigate(getRedirectByRole(user.role, type), { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  useEffect(() => {
    const remembered = localStorage.getItem('remembered_email');
    if (remembered) {
      setValue('email', remembered);
      setRememberMe(true);
    }
  }, [setValue]);

  const onSubmit = async (data: { email: string; password: string }) => {
    setLoading(true);
    setInlineError('');
    try {
      // First, we decide which endpoint to hit. 
      // If management, we try normal login first, then superadmin login if that fails?
      // Actually, if it's management, let's check for superadmin email or just use the switch logic
      const endpoint = loginType === 'management' && (data.email.includes('admin') || data.email === 'support') 
        ? '/auth/superadmin/login' 
        : '/auth/login';

      let res: any;
      try {
        res = await api.post(endpoint, data);
      } catch (err: any) {
        // Fallback for superadmin if management login failed
        if (loginType === 'management' && endpoint === '/auth/login') {
          res = await api.post('/auth/superadmin/login', data);
        } else {
          throw err;
        }
      }

      const responseData = res.data.data;
      if (rememberMe) localStorage.setItem('remembered_email', data.email);
      else localStorage.removeItem('remembered_email');

      login({ token: responseData.token, user: responseData.user });
      toast.success(`Welcome, ${responseData.user.name}! 🚀`);

      const redirect = getRedirectByRole(responseData.user.role, loginType);
      navigate(redirect, { replace: true });
    } catch (err: any) {
      setInlineError(err.response?.data?.error || 'Access Denied. Check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#060813] relative overflow-hidden">
      {/* Dynamic Aura */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] -translate-y-1/3 translate-x-1/3" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-cyan-600/10 rounded-full blur-[120px] translate-y-1/3 -translate-x-1/3" />

      <div className="relative z-10 w-full max-w-lg px-6">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-glow mb-6">
            <UtensilsCrossed className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter italic">Table<span className="text-blue-500">Track</span></h1>
          <p className="text-slate-400 font-medium mt-2">Professional SaaS Restaurant Engine</p>
        </div>

        {/* Modular Login Type Selector */}
        <div className="grid grid-cols-2 p-1.5 bg-[#161929] border border-[#2a2d3e] rounded-2xl mb-8">
          <button
            onClick={() => { setLoginType('personnel'); setInlineError(''); }}
            className={`flex items-center justify-center gap-2 py-3.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${loginType === 'personnel' ? 'bg-blue-600 text-white shadow-glow-sm' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Loader2 className={`w-3 h-3 ${loginType === 'personnel' ? 'animate-spin' : ''}`} /> Personnel Terminal
          </button>
          <button
            onClick={() => { setLoginType('management'); setInlineError(''); }}
            className={`flex items-center justify-center gap-2 py-3.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${loginType === 'management' ? 'bg-blue-600 text-white shadow-glow-sm' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Lock className="w-3 h-3" /> Management / Admin
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-[#161929]/50 backdrop-blur-3xl border border-[#2a2d3e] p-10 rounded-[32px] space-y-6 shadow-2xl">
          {inlineError && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs px-4 py-3 rounded-xl font-bold uppercase tracking-wide text-center">
              {inlineError}
            </div>
          )}

          <div className="space-y-4">
            <Input
              label="Personnel Account / Email"
              type="text"
              placeholder={loginType === 'personnel' ? "staff@tabletrack.com" : "admin@tabletrack.com"}
              icon={<Mail className="w-4 h-4 text-blue-400" />}
              className="bg-[#0d0f1c] border-[#2a2d3e] text-white"
              error={errors.email?.message}
              {...register('email', { required: 'Identity required' })}
            />
            
            <div className="relative">
              <Input
                label="Secured Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                icon={<Lock className="w-4 h-4 text-blue-400" />}
                className="bg-[#0d0f1c] border-[#2a2d3e] text-white"
                error={errors.password?.message}
                {...register('password', { required: 'Security code required' })}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-[40px] text-slate-500 hover:text-blue-400 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-5 h-5 rounded-md border border-[#2a2d3e] flex items-center justify-center transition-all ${rememberMe ? 'bg-blue-600 border-blue-500' : 'bg-[#0d0f1c]'}`}>
                {rememberMe && <div className="w-2 h-2 bg-white rounded-full" />}
              </div>
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="hidden" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest group-hover:text-slate-300">Save Session</span>
            </label>
            <a href="#" className="text-xs font-bold text-blue-400 uppercase tracking-widest hover:text-blue-300">Identity Recovery?</a>
          </div>

          <Button 
            type="submit" 
            loading={loading} 
            className="w-full py-7 bg-blue-600 hover:bg-blue-500 rounded-2xl text-sm font-black uppercase tracking-[0.2em] shadow-glow"
          >
            {loading ? 'Authenticating...' : 'Enter Platform'}
          </Button>

          <div className="pt-4 text-center">
            <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.1em]">
              Authorized personnel only. All access logs are monitored.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
