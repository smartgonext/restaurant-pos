import { isRouteErrorResponse, useRouteError, useNavigate } from 'react-router-dom';
import { AlertTriangle, Home, RefreshCcw } from 'lucide-react';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';

export default function AdminErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  let status = 500;
  let title = 'Something went wrong';
  let message = 'An unexpected error occurred. Our team has been notified.';

  if (isRouteErrorResponse(error)) {
    status = error.status;
    if (error.status === 404) {
      title = 'Page Not Found';
      message = "The page you're looking for doesn't exist or has been moved.";
    } else if (error.status === 403) {
      title = 'Access Denied';
      message = "You don't have permission to view this page.";
    }
  }

  // Auto-redirect to login on auth errors or server errors
  const shouldAutoRedirect = status === 401 || status === 403 || status === 500;

  useEffect(() => {
    if (shouldAutoRedirect) {
      logout();
      navigate('/login', { replace: true });
    }
  }, [shouldAutoRedirect, logout, navigate]);

  if (shouldAutoRedirect) {
    return null;
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center animate-in fade-in zoom-in duration-500">
        {/* Icon */}
        <div className="relative inline-flex mb-8">
          <div className="absolute inset-0 bg-orange-500/20 blur-3xl rounded-full" />
          <div className="relative w-28 h-28 rounded-3xl bg-bg-secondary border border-orange-500/30 flex items-center justify-center shadow-2xl">
            <AlertTriangle className="w-14 h-14 text-orange-400" />
          </div>
        </div>

        {/* Status code */}
        <div className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-orange-400 to-red-500 mb-4">
          {status}
        </div>

        <h1 className="text-2xl font-bold text-white mb-3">{title}</h1>
        <p className="text-text-secondary text-sm leading-relaxed mb-10 max-w-sm mx-auto">{message}</p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-bg-secondary border border-border text-text-secondary hover:text-white hover:border-orange-500/50 transition-all font-medium text-sm"
          >
            <RefreshCcw className="w-4 h-4" />
            Try Again
          </button>
          <button
            onClick={() => navigate('/login')}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-all font-bold text-sm shadow-lg shadow-blue-500/20"
          >
            <Home className="w-4 h-4" />
            Go to Login
          </button>
        </div>

        {/* Error details for developers */}
        {error instanceof Error && (
          <details className="mt-10 text-left">
            <summary className="text-xs text-text-muted cursor-pointer hover:text-text-secondary transition-colors">
              Developer Details
            </summary>
            <div className="mt-3 p-4 bg-bg-secondary/50 rounded-xl border border-border/50 font-mono text-xs text-text-muted overflow-auto max-h-40">
              {error.message}
              {error.stack && <pre className="mt-2 whitespace-pre-wrap opacity-60">{error.stack}</pre>}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
