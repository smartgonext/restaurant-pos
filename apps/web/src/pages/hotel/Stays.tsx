import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Search, History, BedDouble, User, Receipt, ArrowRight,
  Filter, Clock, CheckCircle2, X, Download, FileText,
  ChevronDown,
} from 'lucide-react';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import api from '@/lib/api';
import { FolioSettlementModal } from './components/FolioSettlementModal';


interface Stay {
  id: number;
  status: string;
  checkInDatetime: string;
  checkOutDatetime: string | null;
  guest?: { name: string; phone?: string };
  room?: { roomNumber: string; roomType?: { name: string } };
  folioCharges?: any[];
  folioPayments?: any[];
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: any }> = {
    active: { label: 'In House', variant: 'info' },
    checked_out: { label: 'Completed', variant: 'success' },
    cancelled: { label: 'Cancelled', variant: 'destructive' },
    no_show: { label: 'No Show', variant: 'secondary' },
  };
  const c = config[status] || { label: status, variant: 'secondary' };
  return (
    <Badge variant={c.variant} className="text-[9px] font-black uppercase tracking-widest rounded-lg px-2">
      {c.label}
    </Badge>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Stays() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedStayId, setSelectedStayId] = useState<number | null>(null);
  const [isFolioOpen, setIsFolioOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['hotel', 'stays', statusFilter],
    queryFn: () =>
      api
        .get('/restaurant/hotel/stays', {
          params: { status: statusFilter === 'all' ? undefined : statusFilter },
        })
        .then((r) => r.data),
  });

  const stays: Stay[] = data?.data || [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return stays.filter((stay) =>
      `STAY-${stay.id} ${stay.room?.roomNumber || ''} ${stay.guest?.name || ''} ${stay.guest?.phone || ''}`.toLowerCase().includes(q)
    );
  }, [stays, search]);

  const getBalance = (stay: Stay): number => {
    const charges = (stay.folioCharges || []).reduce((s, c) => s + Number(c.amount || 0), 0);
    const payments = (stay.folioPayments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    return Math.max(charges - payments, 0);
  };

  const handleExport = (format: string) => {
    setExportOpen(false);
    // TODO: wire to backend export endpoint
    alert(`Exporting as ${format}…`);
  };

  return (
    <>
      <div className="space-y-6 animate-in">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <History className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-text-primary tracking-tight">Stay History</h1>
              <p className="text-sm text-text-muted mt-1 font-medium italic">
                Complete record of guest stays and folio settlements
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                className="bg-bg-dark border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all w-full md:w-64"
                placeholder="Search stay, room or guest..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {/* Export dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="font-black uppercase tracking-widest text-[10px] gap-1.5"
                onClick={() => setExportOpen(!exportOpen)}
              >
                <Download className="w-3.5 h-3.5" /> Export <ChevronDown className="w-3 h-3" />
              </Button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 bg-bg-card border border-border rounded-xl shadow-2xl z-20 overflow-hidden w-40">
                  {['PDF', 'Excel (.xlsx)', 'CSV', 'Print'].map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => handleExport(fmt)}
                      className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-bg-dark text-text-primary transition-colors"
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status Filter tabs */}
        <div className="flex flex-wrap gap-2 items-center bg-bg-card/30 p-4 rounded-xl border border-border/40">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-text-muted">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </div>
          <div className="flex gap-1 bg-bg-dark p-1 rounded-xl border border-border/40">
            {[
              { key: 'all', label: 'All' },
              { key: 'active', label: 'In House' },
              { key: 'checked_out', label: 'Completed' },
              { key: 'cancelled', label: 'Cancelled' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${statusFilter === key
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                    : 'text-text-muted hover:text-text-primary'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[10px] font-black uppercase tracking-widest text-text-muted">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <Card padding={false} className="overflow-hidden border-border/40 rounded-2xl shadow-xl bg-bg-card/50">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-dark/50 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted">
                  <th className="text-left py-4 px-5">Stay</th>
                  <th className="text-left py-4 px-5">Room</th>
                  <th className="text-left py-4 px-5">Guest</th>
                  <th className="text-left py-4 px-5">Check-In / Out</th>
                  <th className="text-left py-4 px-5">Balance</th>
                  <th className="text-left py-4 px-5">Status</th>
                  <th className="text-right py-4 px-5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={7} className="p-4">
                        <Skeleton className="h-10 w-full rounded-lg" />
                      </td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-20 text-center">
                      <div className="w-14 h-14 bg-bg-dark rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border/60">
                        <History className="w-7 h-7 text-text-muted/50" />
                      </div>
                      <p className="text-text-muted font-bold italic text-sm">No stay records found.</p>
                      {search && (
                        <button
                          onClick={() => setSearch('')}
                          className="mt-2 text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300"
                        >
                          Clear search
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filtered.map((stay) => {
                    const balance = getBalance(stay);
                    return (
                      <tr key={stay.id} className="group hover:bg-blue-500/[0.02] transition-colors">
                        {/* Stay ID */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-bg-dark border border-border flex items-center justify-center text-[9px] font-black text-text-muted group-hover:border-blue-500/30 transition-colors">
                              #{stay.id}
                            </div>
                            <span className="text-[10px] font-black text-text-muted font-mono tracking-widest hidden md:block">
                              STAY-{stay.id}
                            </span>
                          </div>
                        </td>

                        {/* Room */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2">
                            <BedDouble className="w-3.5 h-3.5 text-blue-400/50 shrink-0" />
                            <div>
                              <p className="font-black text-text-primary text-sm">
                                {stay.room?.roomNumber || '—'}
                              </p>
                              <p className="text-[10px] text-text-muted font-medium">
                                {stay.room?.roomType?.name}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Guest */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-bg-dark border border-border flex items-center justify-center text-[9px] font-black text-text-muted shrink-0">
                              {(stay.guest?.name || 'G').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-text-primary text-sm">{stay.guest?.name || 'Walk-In'}</p>
                              {stay.guest?.phone && (
                                <p className="text-[10px] text-text-muted">{stay.guest.phone}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Dates */}
                        <td className="py-4 px-5">
                          <div className="flex flex-col gap-1 text-[10px] font-bold text-text-muted">
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="w-3 h-3 text-green-500/50 shrink-0" />
                              {formatDate(stay.checkInDatetime)}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3 h-3 text-amber-500/50 shrink-0" />
                              {stay.checkOutDatetime ? formatDate(stay.checkOutDatetime) : (
                                <span className="text-blue-400 font-black italic">In Progress</span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Balance */}
                        <td className="py-4 px-5">
                          <span className={`text-sm font-black tracking-tight ${balance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                            {balance > 0 ? formatCurrency(balance) : '✓ Settled'}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-4 px-5">
                          <StatusBadge status={stay.status} />
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-5 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-400"
                              onClick={() => { setSelectedStayId(stay.id); setIsFolioOpen(true); }}
                              title="View Folio"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-400"
                              title="Download Invoice"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Folio Settlement Modal (View Mode) */}
      <FolioSettlementModal
        isOpen={isFolioOpen}
        onClose={() => { setIsFolioOpen(false); setSelectedStayId(null); }}
        stayId={selectedStayId}
        mode="view"
      />
    </>
  );
}