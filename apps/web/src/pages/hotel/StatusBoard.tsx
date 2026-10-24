import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Search, Filter, Layers, CheckCircle2, AlertCircle,
  Clock, User, BedDouble, Wrench, XCircle, MinusCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { useNavigate } from 'react-router-dom';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Room {
  id: number;
  roomNumber: string;
  floor: number | null;
  status: string;
  notes?: string;
  roomType: { id: number; name: string };
  stays?: Array<{
    id: number;
    status: string;
    checkOutDatetime?: string | null;
    guest?: { name: string };
  }>;
}

// ─── Status Config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, {
  label: string;
  dot: string;
  card: string;
  badge: string;
  Icon: any;
}> = {
  vacant_clean: {
    label: 'Vacant Clean',
    dot: 'bg-green-400',
    card: 'border-green-500/20 hover:border-green-500/50',
    badge: 'border-green-500/30 text-green-400 bg-green-500/5',
    Icon: CheckCircle2,
  },
  vacant_dirty: {
    label: 'Vacant Dirty',
    dot: 'bg-amber-400',
    card: 'border-amber-500/20 hover:border-amber-500/50',
    badge: 'border-amber-500/30 text-amber-400 bg-amber-500/5',
    Icon: AlertCircle,
  },
  occupied: {
    label: 'Occupied',
    dot: 'bg-blue-400',
    card: 'border-blue-500/30 hover:border-blue-500/60',
    badge: 'border-blue-500/30 text-blue-400 bg-blue-500/5',
    Icon: User,
  },
  maintenance: {
    label: 'Maintenance',
    dot: 'bg-orange-400',
    card: 'border-orange-500/20 hover:border-orange-500/50',
    badge: 'border-orange-500/30 text-orange-400 bg-orange-500/5',
    Icon: Wrench,
  },
  out_of_order: {
    label: 'Out of Order',
    dot: 'bg-red-400',
    card: 'border-red-500/20 hover:border-red-500/50',
    badge: 'border-red-500/30 text-red-400 bg-red-500/5',
    Icon: XCircle,
  },
  out_of_service: {
    label: 'Out of Service',
    dot: 'bg-zinc-500',
    card: 'border-zinc-700/40 hover:border-zinc-600/60',
    badge: 'border-zinc-600/30 text-zinc-400 bg-zinc-800/30',
    Icon: MinusCircle,
  },
};

// ─── Room Card ────────────────────────────────────────────────────────────────

function RoomCard({ room, onCheckIn }: { room: Room; onCheckIn: (room: Room) => void }) {
  const config = STATUS_CONFIG[room.status] || STATUS_CONFIG.vacant_clean;
  const { Icon } = config;
  const activeStay = room.stays?.find((s) => s.status === 'active');
  const isVacant = ['vacant_clean', 'vacant_dirty'].includes(room.status);

  const checkoutDate = activeStay?.checkOutDatetime
    ? new Date(activeStay.checkOutDatetime)
    : null;
  const isOverdue = checkoutDate && checkoutDate < new Date();

  return (
    <Card
      className={`group relative overflow-hidden transition-all duration-200 rounded-2xl border ${config.card} bg-gradient-to-br from-bg-card to-bg-card/70 cursor-default`}
    >
      {/* Status glow */}
      <div className={`absolute -top-4 -right-4 w-16 h-16 rounded-full ${config.dot} opacity-10 blur-xl`} />

      <div className="p-4 relative">
        {/* Top row */}
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="text-[9px] font-black text-text-muted tracking-widest uppercase mb-0.5">
              {room.floor !== null ? `Floor ${room.floor}` : 'Ground'}
            </p>
            <h3 className="text-2xl font-black text-text-primary tracking-tighter leading-none group-hover:text-current transition-colors">
              {room.roomNumber}
            </h3>
          </div>
          <div className={`p-1.5 rounded-lg border ${config.badge}`}>
            <Icon className="w-4 h-4" />
          </div>
        </div>

        {/* Room type */}
        <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2 truncate">
          {room.roomType?.name}
        </p>

        {/* Status badge */}
        <div className={`inline-flex items-center gap-1 border px-2 py-0.5 rounded-md ${config.badge}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
          <span className="text-[8px] font-black uppercase tracking-widest">{config.label}</span>
        </div>

        {/* Bottom */}
        <div className="mt-3 pt-3 border-t border-border/40">
          {room.status === 'occupied' && activeStay?.guest?.name ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <User className="w-3 h-3 text-blue-400" />
                </div>
                <span className="text-[10px] font-black text-text-primary truncate uppercase">
                  {activeStay.guest.name}
                </span>
              </div>
              {checkoutDate && (
                <p className={`text-[9px] font-bold ml-7 ${isOverdue ? 'text-red-400' : 'text-text-muted'}`}>
                  {isOverdue ? '⚠ Overdue · ' : 'Out: '}
                  {checkoutDate.toLocaleDateString()}
                </p>
              )}
            </div>
          ) : isVacant ? (
            <button
              onClick={() => onCheckIn(room)}
              className="w-full flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-green-400 hover:text-green-300 transition-colors group/link"
            >
              <span>Check In</span>
              <span className="group-hover/link:translate-x-1 transition-transform">→</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 opacity-40">
              <BedDouble className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-[9px] font-black uppercase tracking-widest text-text-muted italic">
                {room.status === 'maintenance' ? 'Under Maintenance' : 'Not Available'}
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StatusBoard() {
  const navigate = useNavigate();
  const [floorFilter, setFloorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');

  const { data: roomsRes, isLoading } = useQuery({
    queryKey: ['hotel', 'room-status-board'],
    queryFn: () =>
      api.get('/restaurant/hotel/room-status-board').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const rooms: Room[] = roomsRes?.data || [];

  const floors = useMemo(
    () =>
      Array.from(new Set(rooms.map((r) => r.floor).filter((f): f is number => f !== null))).sort(
        (a, b) => a - b
      ),
    [rooms]
  );

  const roomTypes = useMemo(
    () => Array.from(new Set(rooms.map((r) => r.roomType?.name).filter(Boolean))),
    [rooms]
  );

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (floorFilter !== 'all' && r.floor !== Number(floorFilter)) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (typeFilter !== 'all' && r.roomType?.name !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const guestName = r.stays?.[0]?.guest?.name?.toLowerCase() || '';
        if (!r.roomNumber.toLowerCase().includes(q) && !guestName.includes(q)) return false;
      }
      return true;
    });
  }, [rooms, floorFilter, statusFilter, typeFilter, search]);

  // Counts per status for summary
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    rooms.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return counts;
  }, [rooms]);

  const handleCheckIn = (room: Room) => {
    navigate('/admin/hotel/check-in');
  };

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10">
        <div>
          <h1 className="text-2xl font-black text-text-primary tracking-tight">Room Status Board</h1>
          <p className="text-sm text-text-muted mt-1 font-medium italic">
            Real-time hotel inventory · {rooms.length} rooms total
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              className="bg-bg-dark border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all w-full md:w-64"
              placeholder="Search room or guest..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
            className={`flex flex-col items-center p-3 rounded-xl border transition-all text-center ${
              statusFilter === key
                ? `border-current ${cfg.badge}`
                : 'border-border hover:border-border/80 bg-bg-card/30'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${cfg.dot} mb-1.5`} />
            <p className="text-lg font-black text-text-primary">{statusCounts[key] || 0}</p>
            <p className="text-[8px] font-black uppercase tracking-widest text-text-muted leading-tight">
              {cfg.label}
            </p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-bg-card/30 p-4 rounded-xl border border-border/40">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-text-muted">
          <Filter className="w-3.5 h-3.5" /> Filter:
        </div>
        <select
          className="bg-bg-dark border border-border rounded-lg px-3 py-1.5 text-xs font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
          value={floorFilter}
          onChange={(e) => setFloorFilter(e.target.value)}
        >
          <option value="all">All Floors</option>
          {floors.map((f) => <option key={f} value={String(f)}>Floor {f}</option>)}
        </select>

        <select
          className="bg-bg-dark border border-border rounded-lg px-3 py-1.5 text-xs font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
            <option key={val} value={val}>{cfg.label}</option>
          ))}
        </select>

        <select
          className="bg-bg-dark border border-border rounded-lg px-3 py-1.5 text-xs font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All Room Types</option>
          {roomTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        {(floorFilter !== 'all' || statusFilter !== 'all' || typeFilter !== 'all' || search) && (
          <button
            className="text-[10px] font-black uppercase tracking-widest text-text-muted hover:text-text-primary transition-colors ml-auto"
            onClick={() => { setFloorFilter('all'); setStatusFilter('all'); setTypeFilter('all'); setSearch(''); }}
          >
            Clear All ×
          </button>
        )}
      </div>

      {/* Room Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : filteredRooms.length === 0 ? (
        <Card className="p-20 text-center border-dashed border-2 border-border/60 bg-bg-card/30 rounded-2xl">
          <Layers className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-bold text-text-primary">No rooms match filters</h3>
          <p className="text-sm text-text-muted mt-2">Try adjusting the floor, status, or type filters.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredRooms.map((room) => (
            <RoomCard key={room.id} room={room} onCheckIn={handleCheckIn} />
          ))}
        </div>
      )}
    </div>
  );
}