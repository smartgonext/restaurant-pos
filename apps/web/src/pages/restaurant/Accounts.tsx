import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Wallet, TrendingUp, AlertCircle, CheckCircle, Clock, DollarSign, CreditCard, Smartphone, Banknote, Plus, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

interface SupplierRow {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  outstandingBalance: number;
  creditLimit: number;
  createdAt: string;
}

interface DashboardData {
  todayRevenue: number;
  openTokensTotal: number;
  totalOutstanding: number;
  cashOnHand: number;
}

const paymentSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  method: z.enum(['cash', 'bank', 'cheque', 'upi']),
  reference: z.string().optional(),
  notes: z.string().optional(),
});
type PaymentForm = z.infer<typeof paymentSchema>;

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string; }) {
  return (
    <div className={`bg-[#1e2235] border border-[#2a2d3e] rounded-2xl p-5 flex items-center gap-4`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-slate-400 text-sm">{label}</p>
        <p className="text-white text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}

function PayNowModal({ supplier, onClose }: { supplier: SupplierRow; onClose: () => void; }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { method: 'cash', amount: Number(supplier.outstandingBalance) },
  });

  const payMut = useMutation({
    mutationFn: async (body: PaymentForm) => {
      const { data } = await api.post('/restaurant/supplier-payments', {
        supplierId: supplier.id,
        ...body,
        paymentDate: new Date().toISOString(),
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers-accounts'] });
      toast.success(`Payment to ${supplier.name} recorded!`);
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Payment failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1e2235] border border-[#2a2d3e] rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-bold text-lg">Pay Supplier: {supplier.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-3 mb-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-red-300 text-sm">Outstanding: ₹{Number(supplier.outstandingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
        <form onSubmit={handleSubmit((d) => payMut.mutate(d))} className="space-y-4">
          <div>
            <label className="text-slate-300 text-sm mb-1 block">Amount (₹)</label>
            <input {...register('amount', { valueAsNumber: true })} type="number" step="0.01" className="w-full px-3 py-2.5 bg-[#0d0f1c] border border-[#2a2d3e] rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-400 text-sm" />
            {errors.amount && <p className="text-red-400 text-xs mt-1">{errors.amount.message}</p>}
          </div>
          <div>
            <label className="text-slate-300 text-sm mb-1 block">Payment Method</label>
            <select {...register('method')} className="w-full px-3 py-2.5 bg-[#0d0f1c] border border-[#2a2d3e] rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-400 text-sm">
              <option value="cash">Cash</option>
              <option value="bank">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="upi">UPI</option>
            </select>
          </div>
          <div>
            <label className="text-slate-300 text-sm mb-1 block">Reference / Cheque No.</label>
            <input {...register('reference')} placeholder="Optional" className="w-full px-3 py-2.5 bg-[#0d0f1c] border border-[#2a2d3e] rounded-xl text-white placeholder-slate-500 focus:outline-none text-sm" />
          </div>
          <div>
            <label className="text-slate-300 text-sm mb-1 block">Notes</label>
            <textarea {...register('notes')} rows={2} className="w-full px-3 py-2.5 bg-[#0d0f1c] border border-[#2a2d3e] rounded-xl text-white placeholder-slate-500 resize-none focus:outline-none text-sm" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-[#2a2d3e] text-slate-300 rounded-xl hover:bg-[#2a2d3e] transition">Cancel</button>
            <button type="submit" disabled={payMut.isPending} className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold rounded-xl transition">
              {payMut.isPending ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Accounts() {
  const [payingSupplier, setPayingSupplier] = useState<SupplierRow | null>(null);

  const { data: suppliers = [] } = useQuery<SupplierRow[]>({
    queryKey: ['suppliers-accounts'],
    queryFn: async () => {
      const { data } = await api.get('/restaurant/inventory/suppliers');
      return data.data;
    },
  });

  const { data: dueReport } = useQuery({
    queryKey: ['accounts-due-payments'],
    queryFn: async () => {
      const { data } = await api.get('/restaurant/reports/due-payments');
      return data.data;
    },
  });

  const { data: dash } = useQuery<{ data: DashboardData }>({
    queryKey: ['accounts-summary'],
    queryFn: async () => {
      const { data } = await api.get('/restaurant/dashboard');
      return data;
    },
  });

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  const todayRevenue = Number(dash?.data?.todayRevenue ?? 0);
  const pendingCollection = Number(dueReport?.summary?.totalDue ?? 0);
  const totalOutstanding = suppliers.reduce((s, sup) => s + Number(sup.outstandingBalance), 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Accounts</h1>
        <p className="text-slate-400 text-sm mt-1">Financial summary, supplier balances, and payments</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Today's Revenue" value={fmt(todayRevenue)} icon={<TrendingUp className="w-6 h-6 text-green-400" />} color="bg-green-500/10" />
        <StatCard label="Pending Collection" value={fmt(pendingCollection)} icon={<Clock className="w-6 h-6 text-amber-400" />} color="bg-amber-500/10" />
        <StatCard label="Due to Suppliers" value={fmt(totalOutstanding)} icon={<AlertCircle className="w-6 h-6 text-red-400" />} color="bg-red-500/10" />
        <StatCard label="Net Position" value={fmt(todayRevenue + pendingCollection - totalOutstanding)} icon={<Wallet className="w-6 h-6 text-blue-400" />} color="bg-blue-500/10" />
      </div>

      {/* Supplier accounts table */}
      <div className="bg-[#1e2235] border border-[#2a2d3e] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#2a2d3e]">
          <h2 className="text-white font-semibold">Supplier Accounts</h2>
          <p className="text-slate-400 text-sm">Outstanding balances and payment history</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2a2d3e]">
                {['Supplier', 'Contact', 'Outstanding', 'Credit Limit', 'Actions'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2d3e]">
              {suppliers.map((sup) => (
                <tr key={sup.id} className="hover:bg-[#2a2d3e]/40 transition">
                  <td className="px-5 py-4">
                    <div className="text-white font-medium">{sup.name}</div>
                  </td>
                  <td className="px-5 py-4 text-slate-400 text-sm">
                    {sup.phone && <div>{sup.phone}</div>}
                    {sup.email && <div className="text-xs">{sup.email}</div>}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`font-semibold ${Number(sup.outstandingBalance) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {fmt(Number(sup.outstandingBalance))}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-300">{fmt(Number(sup.creditLimit))}</td>
                  <td className="px-5 py-4">
                    {Number(sup.outstandingBalance) > 0 && (
                      <button
                        onClick={() => setPayingSupplier(sup)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-medium transition"
                      >
                        <DollarSign className="w-3.5 h-3.5" /> Pay Now
                      </button>
                    )}
                    {Number(sup.outstandingBalance) <= 0 && (
                      <span className="flex items-center gap-1 text-green-400 text-sm"><CheckCircle className="w-3.5 h-3.5" /> Cleared</span>
                    )}
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">No suppliers added yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {payingSupplier && <PayNowModal supplier={payingSupplier} onClose={() => setPayingSupplier(null)} />}
    </div>
  );
}
