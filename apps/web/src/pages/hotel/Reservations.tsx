import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import {
  Plus, Search, Pencil, Trash2, Calendar, User, CreditCard,
  Eye, XCircle, BedDouble, ArrowRight, CheckCircle2, Info,
} from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils';
import api from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RoomSelection {
  roomTypeId: number;
  roomTypeName: string;
  available: number;
  qty: number;
  rate: number;
}

interface Reservation {
  id: number;
  reservationNumber: string;
  guestId: number;
  guest?: { id: number; name: string; email?: string; phone?: string };
  checkInDate: string;
  checkOutDate: string;
  checkInTime?: string;
  checkOutTime?: string;
  numberOfGuests?: number;
  totalAmount?: number | string;
  advancePayment?: number | string;
  status: string;
  specialRequests?: string;
  ratePlan?: { id: number; name: string; planType: string } | null;
  rooms?: Array<{ id: number; roomId: number; room?: { roomNumber: string; roomType?: { name: string } } }>;
  createdAt: string;
}

interface Guest {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  idType?: string;
  idNumber?: string;
}

interface RatePlan {
  id: number;
  name: string;
  planType: string;
  status: string;
}

interface RoomType {
  id: number;
  name: string;
  basePricePerNight: number;
  maxOccupancy: number;
}

// ─── Status Config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  tentative:   { label: 'Tentative',   cls: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  confirmed:   { label: 'Confirmed',   cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  checked_in:  { label: 'Checked In',  cls: 'bg-green-500/10 text-green-400 border-green-500/30' },
  checked_out: { label: 'Checked Out', cls: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30' },
  cancelled:   { label: 'Cancelled',   cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
  no_show:     { label: 'No Show',     cls: 'bg-red-900/20 text-red-700 border-red-900/30' },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] || { label: status, cls: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest ${c.cls}`}>
      {c.label}
    </span>
  );
}

// ─── Guest Avatar ─────────────────────────────────────────────────────────────

function GuestAvatar({ name }: { name: string }) {
  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-amber-500', 'bg-red-500', 'bg-pink-500'];
  const color = colors[(name?.charCodeAt(0) || 0) % colors.length];
  return (
    <div className={`w-7 h-7 rounded-full ${color} flex items-center justify-center text-white text-[10px] font-black shrink-0`}>
      {(name || 'G')[0].toUpperCase()}
    </div>
  );
}

// ─── View Reservation Panel ───────────────────────────────────────────────────

function ViewPanel({ res, onClose, onCheckIn }: { res: Reservation; onClose: () => void; onCheckIn: () => void }) {
  const navigate = useNavigate();
  const nights = Math.max(
    1, Math.ceil((new Date(res.checkOutDate).getTime() - new Date(res.checkInDate).getTime()) / 86400000)
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-[420px] bg-bg-card border-l border-border flex flex-col shadow-2xl animate-in slide-in-from-right-full duration-300">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <p className="text-[10px] font-mono font-bold text-blue-400 tracking-widest uppercase mb-1">Reservation Details</p>
            <h2 className="text-xl font-black text-text-primary">{res.reservationNumber}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-bg-dark flex items-center justify-center text-text-muted hover:text-text-primary">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Guest */}
          <div className="bg-bg-dark/50 border border-border/40 rounded-xl p-4 flex items-center gap-3">
            <GuestAvatar name={res.guest?.name || 'G'} />
            <div>
              <p className="font-black text-text-primary">{res.guest?.name}</p>
              <p className="text-xs text-text-muted">{res.guest?.phone}</p>
            </div>
          </div>
          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-bg-dark/50 border border-border/40 rounded-xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Check-In</p>
              <p className="font-black text-text-primary text-sm">{formatDate(res.checkInDate)}</p>
              <p className="text-xs text-text-muted">{res.checkInTime || '14:00'}</p>
            </div>
            <div className="bg-bg-dark/50 border border-border/40 rounded-xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Check-Out</p>
              <p className="font-black text-text-primary text-sm">{formatDate(res.checkOutDate)}</p>
              <p className="text-xs text-text-muted">{res.checkOutTime || '11:00'}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-bg-dark/50 border border-border/40 rounded-xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Nights</p>
              <p className="font-black text-text-primary">{nights}</p>
            </div>
            <div className="bg-bg-dark/50 border border-border/40 rounded-xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Rooms</p>
              <p className="font-black text-text-primary">{res.rooms?.length || 0}</p>
            </div>
            <div className="bg-bg-dark/50 border border-border/40 rounded-xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Guests</p>
              <p className="font-black text-text-primary">{res.numberOfGuests || 1}</p>
            </div>
          </div>
          {res.ratePlan && (
            <div className="bg-bg-dark/50 border border-border/40 rounded-xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Rate Plan</p>
              <p className="font-bold text-text-primary">{res.ratePlan.name} ({res.ratePlan.planType})</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-bg-dark/50 border border-border/40 rounded-xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Total Amount</p>
              <p className="font-black text-text-primary">{formatCurrency(Number(res.totalAmount || 0))}</p>
            </div>
            <div className="bg-bg-dark/50 border border-border/40 rounded-xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Advance Paid</p>
              <p className="font-black text-green-400">{formatCurrency(Number(res.advancePayment || 0))}</p>
            </div>
          </div>
          {res.specialRequests && (
            <div className="bg-bg-dark/50 border border-border/40 rounded-xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Special Requests</p>
              <p className="text-sm text-text-secondary">{res.specialRequests}</p>
            </div>
          )}
          <div className="flex items-center justify-between p-3 bg-bg-dark/50 border border-border/40 rounded-xl">
            <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">Status</span>
            <StatusBadge status={res.status} />
          </div>
        </div>
        <div className="p-6 border-t border-border flex gap-3">
          {['tentative', 'confirmed'].includes(res.status) && (
            <Button onClick={() => { onClose(); navigate('/admin/hotel/check-in'); }} variant="primary" className="flex-1 font-black text-[10px] uppercase tracking-widest">
              <CheckCircle2 className="w-4 h-4 mr-2" /> Check In
            </Button>
          )}
          <Button onClick={onClose} variant="outline" className="flex-1 font-black text-[10px] uppercase tracking-widest">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── New / Edit Reservation Panel ────────────────────────────────────────────

function ReservationPanel({
  editingItem,
  onClose,
  onSuccess,
}: {
  editingItem: Reservation | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const [guestId, setGuestId] = useState(editingItem?.guestId?.toString() || '');
  const [checkInDate, setCheckInDate] = useState(editingItem?.checkInDate?.split('T')[0] || today);
  const [checkOutDate, setCheckOutDate] = useState(editingItem?.checkOutDate?.split('T')[0] || tomorrow);
  const [checkInTime, setCheckInTime] = useState(editingItem?.checkInTime || '14:00');
  const [checkOutTime, setCheckOutTime] = useState(editingItem?.checkOutTime || '11:00');
  const [adults, setAdults] = useState('1');
  const [children, setChildren] = useState('0');
  const [ratePlanId, setRatePlanId] = useState(editingItem?.ratePlan?.id?.toString() || '');
  const [status, setStatus] = useState(editingItem?.status || 'tentative');
  const [advancePaid, setAdvancePaid] = useState(editingItem?.advancePayment?.toString() || '0');
  const [specialRequests, setSpecialRequests] = useState(editingItem?.specialRequests || '');
  const [roomSelections, setRoomSelections] = useState<RoomSelection[]>([]);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [guestSearch, setGuestSearch] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { data: guestsRes } = useQuery({
    queryKey: ['hotel', 'guests', guestSearch],
    queryFn: () => api.get('/restaurant/hotel/guests', { params: { search: guestSearch || undefined } }).then((r) => r.data),
  });

  const { data: ratePlansRes } = useQuery({
    queryKey: ['hotel', 'rate-plans'],
    queryFn: () => api.get('/restaurant/hotel/rate-plans', { params: { status: 'active' } }).then((r) => r.data),
  });

  const { data: roomTypesRes } = useQuery({
    queryKey: ['hotel', 'room-types'],
    queryFn: () => api.get('/restaurant/hotel/room-types', { params: { status: 'active' } }).then((r) => r.data),
  });

  const { data: availabilityRes } = useQuery({
    queryKey: ['hotel', 'availability', checkInDate, checkOutDate],
    queryFn: () =>
      api.get('/restaurant/hotel/rooms/availability', {
        params: { checkInDate, checkOutDate },
      }).then((r) => r.data),
    enabled: !!checkInDate && !!checkOutDate && checkOutDate > checkInDate,
  });

  // Build room selection table from room types + availability
  const roomTypes: RoomType[] = roomTypesRes?.data || [];
  const availableRooms: any[] = availabilityRes?.data || [];

  const buildRoomSelections = () => {
    if (roomsLoaded) return;
    const selections: RoomSelection[] = roomTypes.map((rt) => ({
      roomTypeId: rt.id,
      roomTypeName: rt.name,
      available: availableRooms.filter((r) => r.roomTypeId === rt.id).length,
      qty: 0,
      rate: Number(rt.basePricePerNight) || 0,
    }));
    setRoomSelections(selections);
    setRoomsLoaded(true);
  };

  if (roomTypes.length > 0 && !roomsLoaded && availabilityRes) {
    buildRoomSelections();
  }

  const nights = Math.max(
    0, Math.ceil((new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) / 86400000)
  );

  const totalAmount = roomSelections.reduce((s, r) => s + r.qty * r.rate * nights, 0);

  const guests: Guest[] = guestsRes?.data || [];
  const ratePlans: RatePlan[] = ratePlansRes?.data || [];

  const mutation = useMutation({
    mutationFn: (payload: any) =>
      editingItem
        ? api.put(`/restaurant/hotel/reservations/${editingItem.id}`, payload)
        : api.post('/restaurant/hotel/reservations', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel'] });
      toast({ title: `Reservation ${editingItem ? 'updated' : 'created'} successfully` });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err?.response?.data?.error || 'Something went wrong', variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestId) { toast({ title: 'Please select a guest', variant: 'destructive' }); return; }
    const validSelections = roomSelections.filter((r) => r.qty > 0).map((r) => ({
      roomTypeId: r.roomTypeId,
      qty: r.qty,
      rate: r.rate,
    }));

    mutation.mutate({
      guestId: Number(guestId),
      checkInDate,
      checkOutDate,
      // Do not send checkInTime/checkOutTime or totalAmount — backend computes/stores these elsewhere
      adults: Number(adults),
      children: Number(children),
      numberOfGuests: Number(adults) + Number(children),
      ratePlanId: ratePlanId ? Number(ratePlanId) : null,
      roomSelections: validSelections,
      status,
      advancePaid: Number(advancePaid),
      specialRequests,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-[420px] bg-bg-card border-l border-border flex flex-col shadow-2xl animate-in slide-in-from-right-full duration-300">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-black text-text-primary">
            {editingItem ? 'Edit Reservation' : 'New Reservation'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-bg-dark flex items-center justify-center text-text-muted hover:text-text-primary">
            <XCircle className="w-4 h-4" />
          </button>
        </div>

        <form id="reservation-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Guest */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1.5 block">Guest *</label>
            <input
              className="w-full bg-bg-dark border border-border rounded-xl px-4 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50 mb-1"
              placeholder="Search guest..."
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
            />
            <select
              className="w-full bg-bg-dark border border-border rounded-xl px-4 h-10 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50"
              value={guestId}
              onChange={(e) => setGuestId(e.target.value)}
              required
            >
              <option value="">Select Guest</option>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>{g.name} {g.phone ? `· ${g.phone}` : ''}</option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1.5 block">Check-In Date *</label>
              <input type="date" value={checkInDate} onChange={(e) => { setCheckInDate(e.target.value); setRoomsLoaded(false); }}
                className="w-full bg-bg-dark border border-border rounded-xl px-3 h-10 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50" required />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1.5 block">Check-Out Date *</label>
              <input type="date" value={checkOutDate} onChange={(e) => { setCheckOutDate(e.target.value); setRoomsLoaded(false); }}
                className="w-full bg-bg-dark border border-border rounded-xl px-3 h-10 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1.5 block">Check-In Time</label>
              <input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)}
                className="w-full bg-bg-dark border border-border rounded-xl px-3 h-10 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1.5 block">Check-Out Time</label>
              <input type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)}
                className="w-full bg-bg-dark border border-border rounded-xl px-3 h-10 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
          </div>
          {nights > 0 && (
            <p className="text-xs text-blue-400 font-bold">
              {nights} night{nights !== 1 ? 's' : ''}
            </p>
          )}

          {/* Guests count */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1.5 block">Adults *</label>
              <input type="number" min="1" value={adults} onChange={(e) => setAdults(e.target.value)}
                className="w-full bg-bg-dark border border-border rounded-xl px-3 h-10 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1.5 block">Children</label>
              <input type="number" min="0" value={children} onChange={(e) => setChildren(e.target.value)}
                className="w-full bg-bg-dark border border-border rounded-xl px-3 h-10 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
          </div>

          {/* Rate Plan */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1.5 block">Rate Plan</label>
            <select
              className="w-full bg-bg-dark border border-border rounded-xl px-4 h-10 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50"
              value={ratePlanId}
              onChange={(e) => setRatePlanId(e.target.value)}
            >
              <option value="">Select Rate Plan</option>
              {ratePlans.map((rp) => (
                <option key={rp.id} value={rp.id}>{rp.name} ({rp.planType})</option>
              ))}
            </select>
          </div>

          {/* Room Selection */}
          {!editingItem && (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2 block">
                Select Rooms
              </label>
              {roomSelections.length === 0 ? (
                <p className="text-xs text-text-muted italic">Select dates first to see available rooms</p>
              ) : (
                <div className="border border-border/40 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-bg-dark/50 text-[9px] font-black uppercase tracking-widest text-text-muted">
                        <th className="text-left py-2 px-3">Room Type</th>
                        <th className="text-center py-2 px-2">Avail</th>
                        <th className="text-center py-2 px-2">Qty</th>
                        <th className="text-right py-2 px-3">Rate/Night</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {roomSelections.map((rs, i) => (
                        <tr key={rs.roomTypeId}>
                          <td className="py-2 px-3 font-bold text-text-primary">{rs.roomTypeName}</td>
                          <td className="py-2 px-2 text-center text-text-muted">{rs.available}</td>
                          <td className="py-2 px-2 text-center">
                            <input
                              type="number" min="0" max={rs.available}
                              value={rs.qty}
                              onChange={(e) => {
                                const updated = [...roomSelections];
                                updated[i] = { ...rs, qty: Math.min(Number(e.target.value), rs.available) };
                                setRoomSelections(updated);
                              }}
                              className="w-14 bg-bg-dark border border-border rounded-lg px-2 py-1 text-center font-bold text-text-primary outline-none focus:ring-1 focus:ring-blue-500/50"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number" min="0"
                              value={rs.rate}
                              onChange={(e) => {
                                const updated = [...roomSelections];
                                updated[i] = { ...rs, rate: Number(e.target.value) };
                                setRoomSelections(updated);
                              }}
                              className="w-24 bg-bg-dark border border-border rounded-lg px-2 py-1 text-right font-bold text-text-primary outline-none focus:ring-1 focus:ring-blue-500/50"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {totalAmount > 0 && (
                <div className="mt-2 flex justify-between items-center bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Estimated Total</span>
                  <span className="font-black text-blue-400 text-lg">{formatCurrency(totalAmount)}</span>
                </div>
              )}
            </div>
          )}

          {/* Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1.5 block">Status</label>
              <select
                className="w-full bg-bg-dark border border-border rounded-xl px-3 h-10 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="tentative">Tentative</option>
                <option value="confirmed">Confirmed</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1.5 block">Advance Paid ($)</label>
              <input
                type="number" min="0" value={advancePaid}
                onChange={(e) => setAdvancePaid(e.target.value)}
                className="w-full bg-bg-dark border border-border rounded-xl px-3 h-10 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          </div>

          {/* Special Requests */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1.5 block">Special Requests</label>
            <textarea
              rows={3} value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)}
              className="w-full bg-bg-dark border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
              placeholder="Any special requests..."
            />
          </div>
        </form>

        <div className="p-6 border-t border-border flex gap-3">
          <Button type="button" variant="outline" onClick={onClose} className="font-black text-[10px] uppercase tracking-widest">
            Cancel
          </Button>
          <Button
            variant="primary"
            isLoading={mutation.isPending}
            onClick={(e: any) => { e.preventDefault(); const form = e.target.closest('.flex.flex-col').querySelector('form'); if (form) form.requestSubmit(); else { /* submit manually */} handleSubmit(new Event('submit') as any); }}
            className="flex-1 font-black text-[10px] uppercase tracking-widest shadow-lg shadow-purple-500/20"
          >
            {editingItem ? 'Update Reservation' : 'Create Reservation'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Reservations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Reservation | null>(null);
  const [viewingItem, setViewingItem] = useState<Reservation | null>(null);

  const { data: reservationsRes, isLoading } = useQuery({
    queryKey: ['hotel', 'reservations', statusFilter, dateFilter, search],
    queryFn: () =>
      api.get('/restaurant/hotel/reservations', {
        params: {
          status: statusFilter !== 'all' ? statusFilter : undefined,
          search: search || undefined,
          dateFrom: dateFilter || undefined,
          dateTo: dateFilter || undefined,
        },
      }).then((r) => r.data),
    refetchInterval: 60_000,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/restaurant/hotel/reservations/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel'] });
      toast({ title: 'Reservation cancelled' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err?.response?.data?.error || 'Cannot cancel', variant: 'destructive' });
    },
  });

  const reservations: Reservation[] = reservationsRes?.data || [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return reservations.filter((r) => {
      if (search && ![r.reservationNumber, r.guest?.name, r.guest?.phone].join(' ').toLowerCase().includes(q)) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    });
  }, [reservations, search, statusFilter]);

  const openNew = () => { setEditingItem(null); setPanelOpen(true); };
  const openEdit = (r: Reservation) => { setEditingItem(r); setPanelOpen(true); };

  const handleCancel = (res: Reservation) => {
    if (!window.confirm(`Cancel reservation ${res.reservationNumber}?`)) return;
    cancelMutation.mutate(res.id);
  };

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10">
        <div>
          <h1 className="text-2xl font-black text-text-primary tracking-tight">Hotel Reservations</h1>
          <p className="text-sm text-text-muted mt-1 font-medium italic">
            Manage hotel room bookings · {filtered.length} reservation{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              className="bg-bg-dark border border-border rounded-xl pl-10 pr-4 py-2 text-sm text-text-primary focus:ring-2 focus:ring-blue-500/50 outline-none transition-all w-full md:w-56"
              placeholder="Search reservation, guest..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-bg-dark border border-border rounded-xl px-3 py-2 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50"
          />
          <select
            className="bg-bg-dark border border-border rounded-xl px-3 py-2 text-xs font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([val, { label }]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <Button onClick={openNew} variant="primary" className="shadow-lg shadow-purple-500/20 font-black text-[10px] uppercase tracking-widest h-10 px-5 shrink-0">
            <Plus className="w-4 h-4 mr-2" /> New Reservation
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card padding={false} className="overflow-hidden border-border/40 rounded-2xl shadow-xl bg-bg-card/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-dark/50 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted">
                <th className="text-left py-4 px-5">Reservation #</th>
                <th className="text-left py-4 px-5">Guest</th>
                <th className="text-left py-4 px-5">Check-In</th>
                <th className="text-left py-4 px-5">Check-Out</th>
                <th className="text-center py-4 px-5">Rooms</th>
                <th className="text-left py-4 px-5">Amount</th>
                <th className="text-left py-4 px-5">Status</th>
                <th className="text-right py-4 px-5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={8} className="p-4"><Skeleton className="h-10 w-full rounded-lg" /></td></tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-20 text-center">
                    <div className="w-14 h-14 bg-bg-dark rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border/60">
                      <Calendar className="w-7 h-7 text-text-muted/50" />
                    </div>
                    <p className="text-text-muted font-bold italic text-sm">No reservations found.</p>
                    <p className="text-text-muted text-xs mt-1">Create a new reservation to get started.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((res) => {
                  const nights = Math.max(
                    1, Math.ceil((new Date(res.checkOutDate).getTime() - new Date(res.checkInDate).getTime()) / 86400000)
                  );
                  return (
                    <tr key={res.id} className="group hover:bg-blue-500/[0.02] transition-colors">
                      {/* Reservation # */}
                      <td className="py-4 px-5">
                        <button
                          onClick={() => setViewingItem(res)}
                          className="text-[10px] font-mono font-bold text-blue-400 hover:text-blue-300 tracking-widest uppercase hover:underline"
                        >
                          {res.reservationNumber}
                        </button>
                      </td>
                      {/* Guest */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-2">
                          <GuestAvatar name={res.guest?.name || 'G'} />
                          <span className="font-bold text-text-primary">{res.guest?.name}</span>
                        </div>
                      </td>
                      {/* Check-In */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-1.5 text-text-secondary font-bold text-xs">
                          <Calendar className="w-3.5 h-3.5 text-blue-400/50" />
                          {formatDate(res.checkInDate)}
                        </div>
                      </td>
                      {/* Check-Out */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-1.5 text-text-secondary font-bold text-xs">
                          <Calendar className="w-3.5 h-3.5 text-red-400/50" />
                          {formatDate(res.checkOutDate)}
                          <span className="text-text-muted font-medium">·{nights}n</span>
                        </div>
                      </td>
                      {/* Rooms */}
                      <td className="py-4 px-5 text-center">
                        <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[10px] font-black inline-flex items-center justify-center">
                          {res.rooms?.length || 0}
                        </span>
                      </td>
                      {/* Amount */}
                      <td className="py-4 px-5 font-black text-text-primary">
                        {formatCurrency(Number(res.totalAmount || 0))}
                      </td>
                      {/* Status */}
                      <td className="py-4 px-5">
                        <StatusBadge status={res.status} />
                      </td>
                      {/* Actions */}
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                          <Button
                            size="icon" variant="ghost"
                            className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-400"
                            onClick={() => setViewingItem(res)}
                            title="View"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {['tentative', 'confirmed'].includes(res.status) && (
                            <>
                              <Button
                                size="icon" variant="ghost"
                                className="h-8 w-8 hover:bg-amber-500/10 hover:text-amber-400"
                                onClick={() => openEdit(res)}
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon" variant="ghost"
                                className="h-8 w-8 hover:bg-green-500/10 hover:text-green-400"
                                onClick={() => navigate('/admin/hotel/check-in')}
                                title="Check In"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon" variant="ghost"
                                className="h-8 w-8 hover:bg-red-500/10 hover:text-red-400"
                                onClick={() => handleCancel(res)}
                                title="Cancel"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
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

      {/* Panels */}
      {panelOpen && (
        <ReservationPanel
          editingItem={editingItem}
          onClose={() => setPanelOpen(false)}
          onSuccess={() => setPanelOpen(false)}
        />
      )}
      {viewingItem && (
        <ViewPanel
          res={viewingItem}
          onClose={() => setViewingItem(null)}
          onCheckIn={() => { setViewingItem(null); navigate('/admin/hotel/check-in'); }}
        />
      )}
    </div>
  );
}