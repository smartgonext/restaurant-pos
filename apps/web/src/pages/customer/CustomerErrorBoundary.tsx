import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { AlertCircle, ChefHat, RotateCcw } from 'lucide-react';

export default function CustomerErrorBoundary() {
  const error = useRouteError();

  let title = "Oops! Something went wrong.";
  let message = "We encountered a hiccup while loading your menu. Let's try that again.";
  let status = 500;

  if (isRouteErrorResponse(error)) {
    status = error.status;
    if (error.status === 404) {
      title = "Menu Not Found";
      message = "We couldn't find this table or menu. Please scan the QR code on your table again.";
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
      <div className="relative mb-10">
        <div className="absolute inset-0 bg-red-100 blur-3xl rounded-full opacity-50"></div>
        {status === 404 ? (
          <div className="w-32 h-32 rounded-[2rem] bg-white border border-slate-100 flex items-center justify-center relative shadow-xl z-10">
             <ChefHat className="w-12 h-12 text-slate-300 absolute -top-4 -right-4 rotate-12" />
             <span className="text-5xl font-black text-slate-900 tracking-tighter">404</span>
          </div>
        ) : (
          <div className="w-32 h-32 rounded-[2rem] bg-white border border-slate-100 flex items-center justify-center shadow-xl z-10">
             <AlertCircle className="w-16 h-16 text-red-500" />
          </div>
        )}
      </div>

      <h1 className="text-3xl font-bold text-slate-900 mb-4 tracking-tight">{title}</h1>
      <p className="text-lg text-slate-500 max-w-sm mb-10 leading-relaxed">{message}</p>

      <button 
        className="w-full max-w-xs py-4 bg-slate-900 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 active:scale-95 transition-transform"
        onClick={() => window.location.reload()}
      >
        <RotateCcw size={20} />
        Refresh Page
      </button>

      {status !== 404 && (
        <div className="mt-12 p-4 bg-white rounded-2xl border border-slate-200 max-w-sm w-full text-left font-mono text-xs text-slate-400 overflow-auto shadow-sm">
           <p className="font-bold text-red-500 mb-2">Error Details:</p>
           {error instanceof Error ? error.message : JSON.stringify(error)}
        </div>
      )}
    </div>
  );
}