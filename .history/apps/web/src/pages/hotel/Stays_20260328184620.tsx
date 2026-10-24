import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import api from '@/lib/api';

interface Stay {
  id: number;
  status: string;
  checkInDatetime: string;
  checkOutDatetime?: string;
  guest?: { name?: string };
  room?: { roomNumber?: string };
  folioCharges?: Array<{ amount: number | string }>;
  folioPayments?: Array<{ amount: number | string }>;
}

export default function Stays() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['hotel-stays', status],
    queryFn: () =>
      api
        .get('/restaurant/hotel/stays', {
          params: { status: status === 'all' ? undefined : status },
        })
        .then((r) => r.data),
  });

  const stays: Stay[] = data?.data || [];
  const filtered = useMemo(() => {
    const text = search.toLowerCase();
    return stays.filter((stay) => `${stay.id} ${stay.room?.roomNumber || ''} ${stay.guest?.name || ''}`.toLowerCase().includes(text));
  }, [stays, search]);

  const getBalance = (stay: Stay) => {
    const charges = (stay.folioCharges || []).reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const payments = (stay.folioPayments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    return charges - payments;
  };

  return (
    <div className="space-y-6 animate-in">
      <h1 className="text-3xl font-bold text-text-primary">Stay History</h1>

      <div className="flex flex-wrap gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by stay#, room, guest name"
          className="min-w-[280px]"
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-[140px]">
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="checked_out">Checked Out</option>
        </Select>
      </div>

      <div className="glass-card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-tertiary/60 text-text-muted">
            <tr>
              <th className="text-left px-4 py-3">Stay #</th>
              <th className="text-left px-4 py-3">Room</th>
              <th className="text-left px-4 py-3">Primary Guest</th>
              <th className="text-left px-4 py-3">Check-In</th>
              <th className="text-left px-4 py-3">Check-Out</th>
              <th className="text-left px-4 py-3">Balance</th>
              <th className="text-left px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-text-muted">
                  Loading stays...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-text-muted">
                  No stays found.
                </td>
              </tr>
            ) : (
              filtered.map((stay) => (
                <tr key={stay.id} className="border-t border-border/50">
                  <td className="px-4 py-3">STAY-{stay.id}</td>
                  <td className="px-4 py-3">{stay.room?.roomNumber || '-'}</td>
                  <td className="px-4 py-3">{stay.guest?.name || '-'}</td>
                  <td className="px-4 py-3">{formatDateTime(stay.checkInDatetime)}</td>
                  <td className="px-4 py-3">{stay.checkOutDatetime ? formatDateTime(stay.checkOutDatetime) : '-'}</td>
                  <td className="px-4 py-3">{formatCurrency(getBalance(stay))}</td>
                  <td className="px-4 py-3">{stay.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
