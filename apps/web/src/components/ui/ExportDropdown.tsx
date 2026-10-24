import { useState, useRef, useEffect } from 'react';
import { Download, FileText, Sheet, Printer, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { exportData, ExportFormat } from '@/lib/exportData';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';

interface ExportDropdownProps {
  data: any[];
  filename: string;
  title?: string;
  subtitle?: string;
  restaurantName?: string;
  className?: string;
  size?: 'sm' | 'md';
}

const FORMATS: { format: ExportFormat; label: string; icon: string; color: string }[] = [
  { format: 'pdf',   label: 'PDF',          icon: '📄', color: 'text-red-400' },
  { format: 'excel', label: 'Excel (.xlsx)', icon: '📊', color: 'text-green-400' },
  { format: 'csv',   label: 'CSV',          icon: '📋', color: 'text-blue-400' },
  { format: 'print', label: 'Print',        icon: '🖨️', color: 'text-text-secondary' },
];

export function ExportDropdown({
  data, filename, title, subtitle, restaurantName, className, size = 'sm'
}: ExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<ExportFormat | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const authRestaurantName = useAuthStore((s) => s.user?.restaurant?.name);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleExport = async (format: ExportFormat) => {
    setOpen(false);
    if (!data || data.length === 0) {
      toast.error('No data available to export.');
      return;
    }
    setLoading(format);
    toast.loading(`Generating ${format.toUpperCase()} file...`, { id: 'export' });
    try {
      // Small delay to let toast render before heavy PDF computation
      await new Promise(r => setTimeout(r, 100));
      exportData(format, data, { filename, title: title || filename, subtitle, restaurantName: restaurantName ?? authRestaurantName });
      toast.success('File downloaded successfully!', { id: 'export' });
    } catch (err) {
      toast.error('Export failed. Please try again.', { id: 'export' });
    } finally {
      setLoading(null);
    }
  };

  const btnClass = size === 'sm'
    ? 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-bg-secondary hover:bg-bg-hover transition-colors text-text-secondary hover:text-text-primary'
    : 'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border bg-bg-secondary hover:bg-bg-hover transition-colors text-text-secondary hover:text-text-primary';

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={!!loading}
        className={btnClass}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Download className="w-3.5 h-3.5" />
        )}
        Export
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-bg-secondary border border-border rounded-xl shadow-2xl shadow-black/30 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          {FORMATS.map(({ format, label, icon, color }) => (
            <button
              key={format}
              onClick={() => handleExport(format)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-bg-hover transition-colors text-left"
            >
              <span className="text-base">{icon}</span>
              <span className={cn('font-medium', color)}>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
