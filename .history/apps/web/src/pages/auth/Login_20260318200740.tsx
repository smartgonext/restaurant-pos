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
  if (loginType === 'superadmin') return '/superadmin';
  switch (role) {
    case 'chef': return '/admin/kitchens/all-kot';
    case 'waiter': return '/admin/orders';
    case 'branch_head': return '/admin';
    case 'admin': return '/admin';
    default: return '/admin';
  }
}

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginType, setLoginType] = useState<'restaurant' | 'superadmin'>('restaurant');
  const [rememberMe, setRememberMe] = useState(false);
  const [inlineError, setInlineError] = useState('');
  const { login, isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors }, setValue } = useForm<{ email: string; password: string }>();

  // Auto-redirect if already logged in
  useEffect(() => {
    if (isAuthenticated && user) {
      const isSuperAdmin = user.role === 'superadmin' || user.role === 'support';
      navigate(isSuperAdmin ? '/superadmin' : getRedirectByRole(user.role, isSuperAdmin ? 'superadmin' : 'restaurant'), { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // Load remembered email
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
      const endpoint = loginType === 'superadmin' ? '/auth/superadmin/login' : '/auth/login';
      const res = await api.post(endpoint, data);
      const responseData = res.data.data;

      // Remember me
      if (rememberMe) {
        localStorage.setItem('remembered_email', data.email);
      } else {
        localStorage.removeItem('remembered_email');
      }

      login({ token: responseData.token, user: responseData.user });
      toast.success(`Welcome back, ${responseData.user.name}! 🎉`);

      const redirect = getRedirectByRole(userData.user.role, loginType);
      navigate(redirect, { replace: true });
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Login failed. Please try again.';
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-[100px]" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-primary shadow-glow mb-4">
            <UtensilsCrossed className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Restaurant SaaS</h1>
          <p className="text-sm text-text-muted mt-1">Sign in to manage your restaurant</p>
        </div>

        {/* Login Type Toggle */}
        <div className="flex p-1 bg-bg-secondary rounded-xl mb-6 border border-border">
          <button
            onClick={() => { setLoginType('restaurant'); setInlineError(''); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${loginType === 'restaurant' ? 'bg-gradient-primary text-white shadow-glow-sm' : 'text-text-muted hover:text-text-secondary'}`}
          >
            Restaurant
          </button>
          <button
            onClick={() => { setLoginType('superadmin'); setInlineError(''); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${loginType === 'superadmin' ? 'bg-gradient-primary text-white shadow-glow-sm' : 'text-text-muted hover:text-text-secondary'}`}
          >
            SuperAdmin
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="glass-card p-6 space-y-5">
          {/* Inline Error */}
          {inlineError && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-sm px-4 py-2.5 rounded-xl font-medium text-center">
              {inlineError}
            </div>
          )}

          <Input
            label="Email"
            type="email"
            placeholder="you@restaurant.com"
            icon={<Mail className="w-4 h-4" />}
            error={errors.email?.message}
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' },
            })}
          />
          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              icon={<Lock className="w-4 h-4" />}
              error={errors.password?.message}
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 6, message: 'Min 6 characters' },
              })}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-9 text-text-muted hover:text-text-secondary transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-border bg-bg-tertiary accent-blue-500"
              />
              Remember me
            </label>
            <a href="#" className="text-blue-400 hover:text-blue-300 transition-colors">Forgot password?</a>
          </div>

          <Button type="submit" loading={loading} className="w-full" disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</span>
            ) : 'Sign In'}
          </Button>

          <p className="text-center text-xs text-text-muted">
            {loginType === 'restaurant' ? 'Demo: demo@spicekitchen.com / admin123' : 'Demo: admin@restaurant-saas.com / admin123'}
          </p>
        </form>
      </div>
    </div>
  );
}
