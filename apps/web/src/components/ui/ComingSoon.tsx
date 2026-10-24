import { Wrench, ArrowLeft } from 'lucide-react';
import { Button } from './Button';
import { useNavigate } from 'react-router-dom';

export function ComingSoon({ moduleName }: { moduleName: string }) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center h-full animate-in fade-in zoom-in duration-500">
      <div className="relative mb-8 group">
        <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full group-hover:bg-blue-500/30 transition-all duration-500"></div>
        <div className="w-32 h-32 rounded-3xl bg-bg-tertiary border border-border/50 flex items-center justify-center relative shadow-2xl glass">
           <Wrench className="w-16 h-16 text-blue-400 group-hover:rotate-12 transition-transform duration-500" />
        </div>
      </div>

      <h1 className="text-3xl font-black mb-4 tracking-tight text-white drop-shadow-md">
        {moduleName} Config
      </h1>
      
      <p className="text-text-secondary max-w-md mb-8 text-sm leading-relaxed">
        This configuration module is being finalized. <br />
        <span className="font-bold text-blue-400">Advanced settings</span> will be available here soon.
      </p>

      <Button 
        variant="ghost" 
        onClick={() => navigate(-1)}
        icon={<ArrowLeft className="w-4 h-4" />}
        className="text-text-muted hover:text-white"
      >
        Go Back
      </Button>
    </div>
  );
}
