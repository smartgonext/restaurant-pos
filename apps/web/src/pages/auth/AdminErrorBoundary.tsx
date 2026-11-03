import { isRouteErrorResponse, useRouteError, useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCcw, ArrowLeft, LayoutDashboard, Terminal } from 'lucide-react';

export default function AdminErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  let status = 500;
  let title = 'Something went wrong';
  let message = 'An error occurred during this operation. Your session has been preserved.';

  if (isRouteErrorResponse(error)) {
    status = error.status;
    if (error.status === 404) {
      title = 'Page Not Found';
      message = "The page you're looking for doesn't exist or has been moved.";
    } else if (error.status === 403) {
      title = 'Access Denied';
      message = "You don't have permission to perform this action.";
    } else if (error.status === 401) {
      title = 'Session Issue';
      message = "Your credentials might need to be refreshed.";
    } else if (error.status === 500) {
      title = 'Server Error';
      message = (error.data as any)?.error || error.statusText || 'The server encountered an error processing your request.';
    }
  } else if (error instanceof Error) {
    message = error.message;
  }

  const errorMessage = error instanceof Error ? error.message : (error as any)?.data?.error || (error as any)?.statusText || JSON.stringify(error);
  const errorStack = error instanceof Error ? error.stack : null;

  return (
    <div className="min-h-screen bg-[#0f1014] text-white flex items-center justify-center p-6">
      <div className="max-w-lg w-full text-center animate-in fade-in zoom-in duration-300">
        {/* Icon */}
        <div className="relative inline-flex mb-6">
          <div className="absolute inset-0 bg-amber-500/20 blur-3xl rounded-full" />
          <div className="relative w-24 h-24 rounded-3xl bg-[#161822] border border-amber-500/40 flex items-center justify-center shadow-2xl">
            <AlertTriangle className="w-12 h-12 text-amber-400" />
          </div>
        </div>

        {/* Status code */}
        <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-red-400 mb-2">
          {status}
        </div>

        <h1 className="text-xl font-black uppercase tracking-wider text-white mb-2">{title}</h1>
        <p className="text-gray-400 text-sm leading-relaxed mb-6 max-w-md mx-auto">{message}</p>

        {/* Error Reason Banner */}
        <div className="mb-6 p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-left">
          <div className="text-[10px] font-black uppercase text-red-400 tracking-wider mb-1">Reason:</div>
          <div className="text-xs font-mono text-red-200 break-words">{errorMessage}</div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2.5 justify-center mb-6">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-purple-600/30 transition-all active:scale-95"
          >
            <RefreshCcw className="w-4 h-4" />
            Reload Page
          </button>
          <button
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                navigate('/mainpos/terminal');
              }
            }}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 font-bold text-xs uppercase tracking-wider transition-all active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
          <button
            onClick={() => navigate('/mainpos/terminal')}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-all active:scale-95"
          >
            <Terminal className="w-4 h-4" />
            Main POS
          </button>
          <button
            onClick={() => navigate('/subpos/terminal')}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition-all active:scale-95"
          >
            <Terminal className="w-4 h-4" />
            Sub POS
          </button>
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 font-bold text-xs uppercase tracking-wider transition-all active:scale-95"
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </button>
        </div>

        {/* Technical details toggle */}
        {errorStack && (
          <details className="text-left bg-[#14161f] border border-gray-800 rounded-xl p-3">
            <summary className="text-[11px] font-bold text-gray-400 cursor-pointer hover:text-gray-200 transition-colors uppercase tracking-wider">
              Technical Details / Stack Trace
            </summary>
            <pre className="mt-2 text-[10px] font-mono text-gray-400 overflow-x-auto whitespace-pre-wrap max-h-48">
              {errorStack}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
