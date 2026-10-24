import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Calendar, Search, LogIn, User, BedDouble, ArrowRight,
  Clock, ShieldCheck, X, ChevronDown, ChevronUp, Users,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import api from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RoomInReservation {
  id: number;
  roomId: number;
  room?: {
    id: number;
    roomNumber: string;
    status: string;
    roomType?: { id: number; name: string; basePricePerNight?: number };
  };
}

interface Reservation {
  id: number;
  reservationNumber: string;
  checkInDate: string;
  checkOutDate: string;
  checkInTime?: string;
  numberOfGuests: number;
  status: string;
  specialRequests?: string;
  advancePayment?: number;
  paymentMethod?: string;
  guest: { id: number; name: string; phone?: string; idType?: string; idNumber?: string };
  rooms: RoomInReservation[];
  ratePlan?: { name: string; planType: string } | null;
}

interface AvailableRoom {
  id: number;
  roomNumber: string;
  floor: number | null;
  status: string;
  roomType: { id: number; name: string };
}

// ─── Check-In Panel ───────────────────────────────────────────────────────────

function CheckInPanel({
  reservation,
  onClose,
  onSuccess,
}: {
  reservation: Reservation;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(
    reservation.rooms[0]?.roomId || null
  );
  const [notes, setNotes] = useState('');
  const [guestExpanded, setGuestExpanded] = useState(true);
  const [roomExpanded, setRoomExpanded] = useState(true);

  const nights = useMemo(() => {
    const d1 = new Date(reservation.checkInDate);
    const d2 = new Date(reservation.checkOutDate);
    return Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
  }, [reservation]);

  // Fetch available rooms matching the first booked room type
  const roomTypeId = reservation.rooms[0]?.room?.roomType?.id;
  const { data: availData } = useQuery({
    queryKey: ['hotel', 'rooms-avail', reservation.checkInDate, reservation.checkOutDate, roomTypeId],
    queryFn: () =>
      api
        .get('/restaurant/hotel/rooms/availability', {
          params: {
            checkInDate: reservation.checkInDate,
            checkOutDate: reservation.checkOutDate,
            roomTypeId,
          },
        })
        .then((r) => r.data),
    enabled: !!reservation.checkInDate,
  });

  const availableRooms: AvailableRoom[] = useMemo(() => {
    const rooms: AvailableRoom[] = availData?.data || [];
    // Pre-assigned room should always appear even if occupied currently
    const preAssigned = reservation.rooms[0]?.room;
    if (preAssigned && !rooms.find((r) => r.id === preAssigned.id)) {
      rooms.unshift(preAssigned as AvailableRoom);
    }
    return rooms;
  }, [availData, reservation.rooms]);

  const checkInMutation = useMutation({
    mutationFn: () =>
      api.post(`/restaurant/hotel/check-in/${reservation.id}`, {
        roomId: selectedRoomId,
        notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel'] });
      toast({ title: 'Guest checked in successfully', description: `Room status updated to Occupied.` });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: 'Check-In Failed',
        description: err.response?.data?.error || 'Could not complete check-in.',
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-[480px] bg-bg-card border-l border-border flex flex-col shadow-2xl animate-in slide-in-from-right-full duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <p className="text-[10px] font-mono font-bold text-blue-400 tracking-widest uppercase mb-1">
              Check-In Processing
            </p>
            <h2 className="text-xl font-black text-text-primary tracking-tight">
              {reservation.reservationNumber}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-bg-dark flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Reservation summary card */}
          <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-black text-text-primary">{reservation.guest.name}</p>
                <p className="text-[10px] text-text-muted font-medium">{reservation.guest.phone}</p>
              </div>
              <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-blue-500/30 text-blue-400">
                {reservation.rooms.length} Room{reservation.rooms.length > 1 ? 's' : ''}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-0.5">Check-In</p>
                <p className="font-black text-text-primary">{formatDate(reservation.checkInDate)}</p>
                <p className="text-text-muted text-[10px]">{reservation.checkInTime || '2:00 PM'}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-0.5">Check-Out</p>
                <p className="font-black text-text-primary">{formatDate(reservation.checkOutDate)}</p>
                <p className="text-text-muted text-[10px]">11:00 AM · {nights} Night{nights > 1 ? 's' : ''}</p>
              </div>
            </div>
            {reservation.ratePlan && (
              <div className="mt-3 pt-3 border-t border-blue-500/10">
                <p className="text-[9px] font-black uppercase tracking-widest text-text-muted">Rate Plan</p>
                <p className="text-xs font-bold text-text-primary mt-0.5">
                  {reservation.ratePlan.name} ({reservation.ratePlan.planType})
                </p>
              </div>
            )}
          </div>

          {/* Room Assignment */}
          <div className="border border-border rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-4 hover:bg-bg-dark/50 transition-colors"
              onClick={() => setRoomExpanded(!roomExpanded)}
            >
              <div className="flex items-center gap-2">
                <BedDouble className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-black uppercase tracking-widest text-text-primary">Assign Room</span>
              </div>
              {roomExpanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
            </button>
            {roomExpanded && (
              <div className="px-4 pb-4 border-t border-border pt-3">
                {availableRooms.length === 0 ? (
                  <p className="text-xs text-text-muted italic text-center py-2">No available rooms found for selected dates</p>
                ) : (
                  <div className="space-y-2">
                    {availableRooms.map((room) => (
                      <button
                        key={room.id}
                        onClick={() => setSelectedRoomId(room.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
                          selectedRoomId === room.id
                            ? 'border-blue-500/60 bg-blue-500/10'
                            : 'border-border hover:border-border/80 hover:bg-bg-dark/30'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-black text-text-primary">Room {room.roomNumber}</p>
                          <p className="text-[10px] text-text-muted font-medium">
                            {room.roomType?.name} {room.floor ? `· Floor ${room.floor}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                            room.status === 'vacant_clean'
                              ? 'bg-green-500/10 text-green-400'
                              : 'bg-amber-500/10 text-amber-400'
                          }`}>
                            {room.status.replace('_', ' ')}
                          </span>
                          {selectedRoomId === room.id && (
                            <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                              <div className="w-2 h-2 rounded-full bg-white" />
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Guest Details */}
          <div className="border border-border rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-4 hover:bg-bg-dark/50 transition-colors"
              onClick={() => setGuestExpanded(!guestExpanded)}
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-black uppercase tracking-widest text-text-primary">Guest Details</span>
              </div>
              {guestExpanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
            </button>
            {guestExpanded && (
              <div className="px-4 pb-4 border-t border-border">
                <div className="flex items-center gap-3 py-3">
                  <div className="w-9 h-9 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-sm font-black text-blue-400">
                    {reservation.guest.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black text-text-primary">{reservation.guest.name}</p>
                      <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest border-blue-500/20 text-blue-400 py-0">
                        Primary
                      </Badge>
                    </div>
                    <p className="text-[10px] text-text-muted font-medium">
                      {reservation.guest.phone}
                      {reservation.guest.idType && ` · ${reservation.guest.idType.replace(/_/g, ' ')}`}
                    </p>
                  </div>
                </div>
                {reservation.specialRequests && (
                  <div className="mt-2 p-3 bg-bg-dark/50 rounded-lg border border-border/40">
                    <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Special Requests</p>
                    <p className="text-xs text-text-secondary font-medium">{reservation.specialRequests}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Advance Payment Info */}
          {reservation.advancePayment && Number(reservation.advancePayment) > 0 && (
            <div className="bg-green-500/5 border border-green-500/15 rounded-xl p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-green-400 mb-1">Advance Payment</p>
              <p className="text-sm font-black text-text-primary">
                ${Number(reservation.advancePayment).toFixed(2)} · {reservation.paymentMethod || 'Cash'}
              </p>
              <p className="text-[10px] text-text-muted font-medium mt-1">Will be recorded in guest folio</p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-text-muted block mb-2">
              Check-In Notes (optional)
            </label>
            <textarea
              className="w-full bg-bg-dark border border-border rounded-xl p-3 text-sm text-text-primary resize-none focus:ring-2 focus:ring-blue-500/50 outline-none transition-all"
              rows={3}
              placeholder="Any notes for this check-in..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex gap-3">
          <Button variant="outline" className="flex-1 font-bold text-xs uppercase tracking-widest" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1 font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20"
            onClick={() => checkInMutation.mutate()}
            isLoading={checkInMutation.isPending}
            disabled={!selectedRoomId}
          >
            Confirm Check-In
          </Button>
        </div>

        <div className="px-6 pb-4 flex justify-end">
          <button
            onClick={onClose}
            className="text-[10px] font-bold text-text-muted hover:text-text-primary transition-colors uppercase tracking-widest"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CheckIn() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hotel', 'check-in', 'pending', today],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/check-in/pending', { params: { date: today } });
      return res.data;
    },
    refetchInterval: 60_000,
  });

  const items: Reservation[] = data?.data || [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.reservationNumber.toLowerCase().includes(q) ||
        (item.guest?.name || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <>
      <div className="space-y-6 animate-in">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <LogIn className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-text-primary tracking-tight">Hotel Check-In</h1>
              <p className="text-sm text-text-muted mt-1 font-medium italic">
                Processing arrivals for {formatDate(new Date().toISOString())}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                className="bg-bg-dark border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all w-full md:w-64"
                placeholder="Search reservation or guest..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="h-10 w-px bg-border hidden md:block" />
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black uppercase text-blue-400 tracking-widest">Expected Today</span>
              <span className="text-xl font-black text-text-primary">{items.length}</span>
            </div>
          </div>
        </div>

        {/* Cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-20 text-center border-dashed border-2 border-border/60 bg-bg-card/30 rounded-2xl">
            <Calendar className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-20" />
            <h3 className="text-lg font-bold text-text-primary">No pending arrivals</h3>
            <p className="text-sm text-text-muted max-w-xs mx-auto mt-2">
              All guests for today have been processed or no arrivals are scheduled.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filtered.map((item) => {
              const roomType = item.rooms[0]?.room?.roomType?.name || 'Standard';
              const roomNumber = item.rooms[0]?.room?.roomNumber || 'TBD';
              return (
                <Card
                  key={item.id}
                  className="group overflow-hidden border-border/40 hover:border-blue-500/40 rounded-2xl transition-all hover:shadow-2xl hover:shadow-blue-500/5 bg-gradient-to-b from-bg-card/80 to-bg-card"
                >
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-[10px] font-mono font-bold text-text-muted tracking-widest uppercase mb-1">
                          {item.reservationNumber}
                        </p>
                        <h3 className="text-lg font-black text-text-primary group-hover:text-blue-400 transition-colors tracking-tight">
                          {item.guest?.name}
                        </h3>
                      </div>
                      <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-blue-500/20 text-blue-400">
                        {item.rooms.length} Room{item.rooms.length > 1 ? 's' : ''}
                      </Badge>
                    </div>

                    <div className="space-y-2.5 mb-5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-text-muted font-bold uppercase tracking-widest text-[9px]">
                          <BedDouble className="w-3.5 h-3.5" /> Room
                        </span>
                        <span className="text-text-primary font-black">
                          {roomNumber}
                          <span className="text-[9px] text-text-muted ml-1 font-medium italic">({roomType})</span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-text-muted font-bold uppercase tracking-widest text-[9px]">
                          <Clock className="w-3.5 h-3.5" /> Check-in
                        </span>
                        <span className="text-text-primary font-black">{item.checkInTime || '2:00 PM'}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-text-muted font-bold uppercase tracking-widest text-[9px]">
                          <User className="w-3.5 h-3.5" /> Guests
                        </span>
                        <span className="text-text-primary font-black">{item.numberOfGuests}</span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-border/40 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${item.status === 'confirmed' ? 'bg-green-400' : 'bg-amber-400'}`} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                          {item.status}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => setSelectedReservation(item)}
                        className="px-5 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-blue-500/20"
                      >
                        Check In <ArrowRight className="w-3 h-3 ml-1.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Info Banner */}
        <div className="bg-blue-500/5 border border-blue-500/10 p-6 rounded-2xl flex flex-col md:flex-row items-center gap-6">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-7 h-7 text-blue-400" />
          </div>
          <div className="flex-1 text-center md:text-left">
            <h4 className="text-sm font-black text-text-primary uppercase tracking-tight">Identity Verification Required</h4>
            <p className="text-sm text-text-muted mt-1 font-medium">
              Please ensure all guests provide valid government ID before confirming digital check-in.
            </p>
          </div>
        </div>
      </div>

      {/* Check-In Panel */}
      {selectedReservation && (
        <CheckInPanel
          reservation={selectedReservation}
          onClose={() => setSelectedReservation(null)}
          onSuccess={() => refetch()}
        />
      )}
    </>
  );
}