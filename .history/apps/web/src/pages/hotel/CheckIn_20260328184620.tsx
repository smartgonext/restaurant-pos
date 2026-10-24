import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Calendar, Search } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface PendingReservation {
  id: number;
  reservationNumber: string;
  checkInDate: string;
  guest: { name: string };
  rooms?: Array<{ room?: { roomNumber?: string } }>;
}

export default function CheckIn() {
  const [search, setSearch] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hotel-checkin-pending'],
    queryFn: () => api.get('/restaurant/hotel/check-in/pending').then((r) => r.data),
  });

  const items: PendingReservation[] = data?.data || [];

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const text = `${item.reservationNumber} ${item.guest?.name || ''}`.toLowerCase();
        const sameDate = !date || item.checkInDate?.slice(0, 10) === date;
        return text.includes(search.toLowerCase()) && sameDate;
      }),
    [items, search, date]
  );

  const handleCheckIn = async (reservationId: number) => {
    setSubmittingId(reservationId);
    try {
      await api.post(`/restaurant/hotel/check-in/${reservationId}`, {});
      toast.success('Guest checked in successfully');
      refetch();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to check in guest');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-text-primary">Hotel Check-In</h1>
        <Button variant="primary">Check In</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by reservation number or guest name..."
          icon={<Search className="w-4 h-4" />}
          className="min-w-[300px]"
        />
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} icon={<Calendar className="w-4 h-4" />} className="w-[180px]" />
      </div>

      {isLoading ? (
        <div className="text-text-muted">Loading pending check-ins...</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-16 text-center text-text-muted">No reservations ready for check-in.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <div key={item.id} className="glass-card p-4 border border-border/60 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-text-primary">{item.reservationNumber}</h3>
                  <p className="text-sm text-text-secondary mt-1">{item.guest?.name}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-purple-500/15 text-purple-300">{item.rooms?.length || 0} Rooms</span>
              </div>

              <div className="text-xs text-text-muted">{formatDate(item.checkInDate)} • 2:00 PM</div>

              <div className="flex justify-end pt-2 border-t border-border/60">
                <Button
                  size="sm"
                  onClick={() => handleCheckIn(item.id)}
                  loading={submittingId === item.id}
                  disabled={submittingId === item.id}
                >
                  Check In
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
