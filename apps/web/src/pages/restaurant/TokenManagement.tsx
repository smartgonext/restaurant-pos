import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Hash, ChevronRight, X, CheckCircle, Clock, AlertCircle, Filter, Download } from 'lucide-react';
import { format } from 'date-fns';

interface TokenRow {
  id: number; tokenNumber: number; status: string;
  customerName?: string; customerPhone?: string;
  subtotal: number; sgst: number; cgst: number; igst: number;
  discountApplied: number; total: number;
  createdAt: string; paidAt?: string;
  branchId: number;
  _count?: { items: number };
}

interface TokenDetail {
  id: number; tokenNumber: number; qrCode: string; status: string;
  customerName?: string; customerPhone?: string;
  subtotal: number; sgst: number; cgst: number; igst: number; total: number;
  discountApplied: number; loyaltyPointsEarned: number; loyaltyPointsClaimed: number;
  createdAt: string; paidAt?: string;
  items: { id: number; menuItemName: string; price: number; quantity: number; total: number; isRemoved: boolean; removedBy?: string; removeReason?: string; addedBy: string }[];
  payments: { id: number; method: string; amount: number; paidAt: string }[];
  edits: { id: number; action: string; menuItemName: string; oldValue?: string; reason: string; staffUsername: string; createdAt: string }[];
}

interface Branch { id: number; name: string; }

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-blue-900 text-blue-300',
  partial_paid: 'bg-yellow-900 text-yellow-300',
  paid: 'bg-green-900 text-green-300',
  cancelled: 'bg-red-900 text-red-300',
};

const fmt = (n: number) => `₹${Number(n).toFixed(2)}`;
const fmtDate = (s: string) => format(new Date(s), 'dd/MM/yy HH:mm');

export default function TokenManagement() {
  const [fromDate, setFromDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [statusFilter, setStatusFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [selectedToken, setSelectedToken] = useState<TokenDetail | null>(null);

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => { const { data } = await api.get('/restaurant/branches'); return data.data; },
  });

  const { data: tokens = [], isLoading } = useQuery<TokenRow[]>({
    queryKey: ['tokens', fromDate, toDate, statusFilter, branchFilter],
    queryFn: async () => {
      const params: any = { from: fromDate, to: toDate };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (branchFilter !== 'all') params.branchId = branchFilter;
      const { data } = await api.get('/restaurant/tokens', { params });
      return data.data;
    },
  });

  const { data: tokenDetail } = useQuery<TokenDetail>({
    queryKey: ['token-detail', selectedToken?.id],
    queryFn: async () => {
      const { data } = await api.get(`/restaurant/tokens/${selectedToken!.id}`);
      return data.data;
    },
    enabled: !!selectedToken,
  });

  const totalRevenue = tokens.filter((t) => t.status === 'paid').reduce((s, t) => s + Number(t.total), 0);
  const branchName = (id: number) => branches.find((b) => b.id === id)?.name ?? `Br${id}`;

  const exportCSV = () => {
    const rows = [
      ['Token#', 'Customer', 'Status', 'Subtotal', 'Tax', 'Discount', 'Total', 'Created', 'Paid At'],
      ...tokens.map((t) => [
        t.tokenNumber, t.customerName || '-', t.status,
        t.subtotal, Number(t.sgst) + Number(t.cgst) + Number(t.igst),
        t.discountApplied, t.total,
        fmtDate(t.createdAt), t.paidAt ? fmtDate(t.paidAt) : '-',
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = `tokens_${fromDate}_to_${toDate}.csv`;
    a.click();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Token Management</h1>
          <p className="text-slate-400 text-sm mt-1">{tokens.length} tokens · Revenue: <span className="text-green-400 font-medium">{fmt(totalRevenue)}</span></p>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-[#2a2d3e] hover:bg-[#3a3d4e] text-slate-300 rounded-xl text-sm transition">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-[#1e2235] border border-[#2a2d3e] rounded-2xl px-5 py-4">
        <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <div className="flex items-center gap-2">
          <label className="text-slate-400 text-sm">From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-1.5 bg-[#0d0f1c] border border-[#2a2d3e] rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-slate-400 text-sm">To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-1.5 bg-[#0d0f1c] border border-[#2a2d3e] rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-1.5 bg-[#0d0f1c] border border-[#2a2d3e] rounded-xl text-white text-sm focus:outline-none">
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="partial_paid">Partial Paid</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="px-3 py-1.5 bg-[#0d0f1c] border border-[#2a2d3e] rounded-xl text-white text-sm focus:outline-none">
          <option value="all">All Branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#1e2235] border border-[#2a2d3e] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2a2d3e]">
                {['Token #', 'Customer', 'Branch', 'Status', 'Subtotal', 'Tax', 'Discount', 'Total', 'Created', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2d3e]">
              {isLoading && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">Loading tokens...</td></tr>
              )}
              {!isLoading && tokens.map((t) => (
                <tr key={t.id} className="hover:bg-[#2a2d3e]/50 cursor-pointer transition" onClick={() => setSelectedToken(t as any)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Hash className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-white font-bold">{t.tokenNumber}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-300 text-sm">{t.customerName || <span className="text-slate-600 italic">Guest</span>}</div>
                    {t.customerPhone && <div className="text-slate-500 text-xs">{t.customerPhone}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm">{branchName(t.branchId)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[t.status] ?? 'bg-slate-700 text-slate-300'}`}>
                      {t.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-sm">{fmt(t.subtotal)}</td>
                  <td className="px-4 py-3 text-slate-300 text-sm">{fmt(Number(t.sgst) + Number(t.cgst) + Number(t.igst))}</td>
                  <td className="px-4 py-3 text-green-400 text-sm">{Number(t.discountApplied) > 0 ? `-${fmt(t.discountApplied)}` : '—'}</td>
                  <td className="px-4 py-3 text-white font-semibold">{fmt(t.total)}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-500"><ChevronRight className="w-4 h-4" /></td>
                </tr>
              ))}
              {!isLoading && tokens.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-500">No tokens found for the selected filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Token Detail Panel */}
      {selectedToken && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#1e2235] border border-[#2a2d3e] rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-[#1e2235] border-b border-[#2a2d3e] px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  <Hash className="w-5 h-5 text-indigo-400" /> Token #{selectedToken.tokenNumber}
                </h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[selectedToken.status] ?? ''}`}>{selectedToken.status.replace('_', ' ').toUpperCase()}</span>
              </div>
              <button onClick={() => setSelectedToken(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            {tokenDetail ? (
              <div className="p-6 space-y-5">
                {/* Customer */}
                {tokenDetail.customerName && (
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <span className="font-medium text-white">{tokenDetail.customerName}</span>
                    {tokenDetail.customerPhone && <span className="text-slate-500">· {tokenDetail.customerPhone}</span>}
                    {tokenDetail.loyaltyPointsEarned > 0 && <span className="text-green-400 text-xs">🏆 +{tokenDetail.loyaltyPointsEarned} pts earned</span>}
                  </div>
                )}

                {/* Items */}
                <div>
                  <h4 className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">Items</h4>
                  <div className="space-y-1.5">
                    {tokenDetail.items.map((item) => (
                      <div key={item.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${item.isRemoved ? 'opacity-40 line-through bg-red-900/10' : 'bg-[#2a2d3e]'}`}>
                        <div className="flex-1 text-sm text-white">{item.menuItemName}</div>
                        <div className="text-slate-400 text-sm">×{item.quantity}</div>
                        <div className="text-slate-300 text-sm font-medium w-16 text-right">{fmt(item.total)}</div>
                        <div className="text-xs text-slate-500">{item.addedBy}</div>
                        {item.isRemoved && <span className="text-red-400 text-xs">{item.removeReason}</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="bg-[#2a2d3e] rounded-xl p-4 space-y-1 text-sm">
                  <div className="flex justify-between text-slate-400"><span>Subtotal</span><span>{fmt(tokenDetail.subtotal)}</span></div>
                  {Number(tokenDetail.sgst) > 0 && <><div className="flex justify-between text-slate-400"><span>SGST</span><span>{fmt(tokenDetail.sgst)}</span></div><div className="flex justify-between text-slate-400"><span>CGST</span><span>{fmt(tokenDetail.cgst)}</span></div></>}
                  {Number(tokenDetail.igst) > 0 && <div className="flex justify-between text-slate-400"><span>IGST</span><span>{fmt(tokenDetail.igst)}</span></div>}
                  {Number(tokenDetail.discountApplied) > 0 && <div className="flex justify-between text-green-400"><span>Discount</span><span>-{fmt(tokenDetail.discountApplied)}</span></div>}
                  <div className="flex justify-between text-white font-bold text-base border-t border-[#3a3d4e] pt-1"><span>TOTAL</span><span>{fmt(tokenDetail.total)}</span></div>
                </div>

                {/* Payments */}
                {tokenDetail.payments.length > 0 && (
                  <div>
                    <h4 className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">Payments</h4>
                    <div className="space-y-1.5">
                      {tokenDetail.payments.map((p) => (
                        <div key={p.id} className="flex items-center gap-3 bg-[#2a2d3e] rounded-xl px-3 py-2">
                          <span className="text-white font-medium text-sm uppercase">{p.method}</span>
                          <span className="text-green-400 font-semibold ml-auto">{fmt(Number(p.amount))}</span>
                          <span className="text-slate-500 text-xs">{fmtDate(p.paidAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Edit log */}
                {tokenDetail.edits.length > 0 && (
                  <div>
                    <h4 className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">Edit Log</h4>
                    <div className="space-y-1.5">
                      {tokenDetail.edits.map((e) => (
                        <div key={e.id} className="bg-red-900/10 border border-red-900/30 rounded-xl px-3 py-2 text-xs">
                          <span className="text-red-300 font-medium">{e.action.replace('_', ' ').toUpperCase()}</span>
                          <span className="text-slate-400 mx-2">·</span>
                          <span className="text-white">{e.menuItemName}</span>
                          <span className="text-slate-400 mx-2">·</span>
                          <span className="text-slate-300">Reason: {e.reason}</span>
                          <span className="text-slate-500 ml-2">by {e.staffUsername}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-slate-400">Loading token details...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
