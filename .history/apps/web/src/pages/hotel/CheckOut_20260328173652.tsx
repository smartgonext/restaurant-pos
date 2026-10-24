import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Search } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface Stay {
  id: number;
  guest?: { name?: string };
  room?: { roomNumber?: string };
  checkOutDatetime?: string;
}

export default function CheckOut() {
  const [search, setSearch] = useState('');
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hotel-checkout-pending'],
    queryFn: () => api.get('/restaurant/hotel/check-out/pending').then((r) => r.data),
  });

  const items: Stay[] = data?.data || [];
  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const text = `${item.id} ${item.guest?.name || ''} ${item.room?.roomNumber || ''}`.toLowerCase();
        return text.includes(search.toLowerCase());
      }),
    [items, search]
  );

  const handleCheckOut = async (stayId: number) => {
    setSubmittingId(stayId);
    try {
      await api.post(`/restaurant/hotel/check-out/${stayId}`, {});
      toast.success('Guest checked out successfully');
      refetch();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to check out guest');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-text-primary">Hotel Check-Out</h1>
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by stay number, guest name, or room..."
        icon={<Search className="w-4 h-4" />}
        className="max-w-[420px]"
      />

      {isLoading ? (
        <div className="text-text-muted">Loading check-out list...</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-16 text-center text-text-muted">No stays ready for check-out</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div key={item.id} className="glass-card p-4 border border-border/60 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-text-primary">STAY-{item.id}</p>
                <p className="text-sm text-text-secondary">{item.guest?.name || '-'} • Room {item.room?.roomNumber || '-'}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCheckOut(item.id)}
                loading={submittingId === item.id}
                disabled={submittingId === item.id}
              >
                Check Out
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
