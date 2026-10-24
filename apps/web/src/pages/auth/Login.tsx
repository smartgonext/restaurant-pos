import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { UtensilsCrossed, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';

import { useEnterKeyNavigation } from '@/hooks/useEnterKeyNavigation';

function getRedirectByRole(role: string, loginType: string): string {
  // Management/Admin login
  if (loginType === 'management') {
    if (role === 'superadmin' || role === 'support') {
      return '/superadmin';
    }
    return '/admin';
  }
  
  // Worker login - all staff (including custom roles) land on terminal selector
  return '/terminals';
}

export default function Login() {
  useEnterKeyNavigation();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginType, setLoginType] = useState<'worker' | 'management'>('worker');
  const [rememberMe, setRememberMe] = useState(false);
  const [inlineError, setInlineError] = useState('');
  const { login, isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors }, setValue } = useForm<{ email: string; password: string }>();

  useEffect(() => {
    if (isAuthenticated && user) {
      const isSuper = user.role === 'superadmin' || user.role === 'support';
      const isAdminRole = isSuper || user.role === 'admin';
      const type = isAdminRole ? 'management' : 'worker';
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
      const primaryEndpoint = '/auth/login';
      const fallbackEndpoint = loginType === 'management' ? '/auth/superadmin/login' : null;

      let res: any;
      try {
        res = await api.post(primaryEndpoint, data);
      } catch (err: any) {
        if (fallbackEndpoint && err.response?.status === 401) {
          res = await api.post(fallbackEndpoint, data);
        } else {
          throw err;
        }
      }

      const responseData = res.data?.data ?? res.data;
      if (!responseData || !responseData.token || !responseData.user) {
        const backendError = res.data?.error || res.data?.message || 'Invalid credentials. Please try again.';
        throw new Error(backendError);
      }
      if (rememberMe) localStorage.setItem('remembered_email', data.email);
      else localStorage.removeItem('remembered_email');

      login({ token: responseData.token, user: responseData.user });
      toast.success(`Welcome, ${responseData.user.name}! 🚀`);

      const redirect = getRedirectByRole(responseData.user.role, loginType);
      navigate(redirect, { replace: true });
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Invalid credentials. Please try again.';
      setInlineError(errorMsg);
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
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter italic">SMART<span className="text-blue-500">GONEXT</span></h1>
          <p className="text-slate-400 font-medium mt-2">Professional SaaS Restaurant Engine</p>
        </div>

        {/* Modular Login Type Selector */}
        <div className="grid grid-cols-2 p-1.5 bg-[#161929] border border-[#2a2d3e] rounded-2xl mb-8" data-testid="login-role-toggle">
          <button
            onClick={() => { setLoginType('worker'); setInlineError(''); }}
            data-testid="login-worker-tab"
            aria-label="Switch to worker login"
            className={`flex items-center justify-center gap-2 py-3.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${loginType === 'worker' ? 'bg-blue-600 text-white shadow-glow-sm' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Loader2 className={`w-3 h-3 ${loginType === 'worker' ? 'animate-spin' : ''}`} /> Worker Login
          </button>
          <button
            onClick={() => { setLoginType('management'); setInlineError(''); }}
            data-testid="login-admin-tab"
            aria-label="Switch to admin login"
            className={`flex items-center justify-center gap-2 py-3.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${loginType === 'management' ? 'bg-blue-600 text-white shadow-glow-sm' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Lock className="w-3 h-3" /> Admin Login
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-[#161929]/50 backdrop-blur-3xl border border-[#2a2d3e] p-10 rounded-[32px] space-y-6 shadow-2xl" data-testid="login-form" aria-label="Login form">
          <div className="min-h-[46px] flex items-center justify-center transition-all duration-300">
            {inlineError ? (
              <div className="w-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs px-4 py-3 rounded-xl font-bold uppercase tracking-wide text-center" data-testid="login-inline-error" role="alert" aria-live="assertive">
                {inlineError}
              </div>
            ) : (
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest opacity-40">Secured Node Portal</span>
            )}
          </div>

          <div className="space-y-4">
            <Input
              label={loginType === 'worker' ? 'Worker Email' : 'Admin Email'}
              type="text"
              placeholder={loginType === 'worker' ? "worker@SMARTGONEXT.com" : "admin@SMARTGONEXT.com"}
              icon={<Mail className="w-4 h-4 text-blue-400" />}
              className="bg-[#0d0f1c] border-[#2a2d3e] text-white"
              error={errors.email?.message}
              {...register('email', { required: 'Email required' })}
            />
            
            <div className="relative">
              <Input
                label="Secured Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                icon={<Lock className="w-4 h-4 text-blue-400" />}
                className="bg-[#0d0f1c] border-[#2a2d3e] text-white"
                error={errors.password?.message}
                {...register('password', { required: 'Password required' })}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                data-testid="toggle-password-visibility"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
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
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="hidden" data-testid="login-remember-me" aria-label="Remember me" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest group-hover:text-slate-300">Save Session</span>
            </label>
            <a href="#" className="text-xs font-bold text-blue-400 uppercase tracking-widest hover:text-blue-300">Identity Recovery?</a>
          </div>

          <Button 
            type="submit" 
            loading={loading} 
            data-testid="login-submit-btn"
            aria-label="Submit login form"
            className="w-full py-7 bg-blue-600 hover:bg-blue-500 rounded-2xl text-sm font-black uppercase tracking-[0.2em] shadow-glow"
          >
            {loading ? 'Authenticating...' : 'Enter Platform'}
          </Button>

          <div className="pt-4 text-center">
            <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.1em]">
              Authorized workers only. All access logs are monitored.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
