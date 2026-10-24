/**
 * FrontDesk.tsx  —  Front Desk Dashboard
 *
 * Shows:
 *  - Live clock + date
 *  - Stats: Arrivals / Departures / In-House / Occupancy
 *  - Available Rooms grid (NEW)
 *  - Today's Arrivals, Departures, In-House panels
 *  - Quick actions: Walk-In Check-In, Check-Out
 */

import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  CheckCircle2, LogOut, BedDouble, Building,
  ArrowRight, Calendar, Clock, Zap, Users,
  AlertCircle, Wrench, XCircle, MinusCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { format } from 'date-fns';
import { Progress } from '@/components/ui/Progress';
import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  arrivals_today: number;
  departures_today: number;
  in_house_count: number;
  occupancy_rate: number;
  total_rooms: number;
}

interface Reservation {
  id: number;
  reservationNumber: string;
  checkInTime?: string;
  guest: { name: string };
  checkInDate: string;
  rooms?: any[];
}

interface Stay {
  id: number;
  guest: { name: string };
  room: { roomNumber: string; roomType?: { name: string } };
  checkInDatetime: string;
  checkOutDatetime: string;
  folioCharges?: Array<{ amount: number | string }>;
  folioPayments?: Array<{ amount: number | string }>;
}

interface Room {
  id: number;
  roomNumber: string;
  floor: number | null;
  status: string;
  roomType: { name: string };
  stays?: Array<{ status: string; guest?: { name: string }; checkOutDatetime?: string }>;
}

// ─── Room Status Config ───────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { dot: string; label: string; Icon: any }> = {
  vacant_clean:   { dot: 'bg-green-400',  label: 'Vacant Clean',   Icon: CheckCircle2 },
  vacant_dirty:   { dot: 'bg-amber-400',  label: 'Vacant Dirty',   Icon: AlertCircle  },
  occupied:       { dot: 'bg-blue-400',   label: 'Occupied',       Icon: Users        },
  maintenance:    { dot: 'bg-orange-400', label: 'Maintenance',    Icon: Wrench       },
  out_of_order:   { dot: 'bg-red-400',    label: 'Out of Order',   Icon: XCircle      },
  out_of_service: { dot: 'bg-zinc-500',   label: 'Out of Service', Icon: MinusCircle  },
};

const BASE = '/restaurant/hotel';

// ─── Available Room Mini Card ─────────────────────────────────────────────────

function RoomMiniCard({ room, onCheckIn }: { room: Room; onCheckIn: (r: Room) => void }) {
  const cfg = STATUS_CFG[room.status] || STATUS_CFG.vacant_clean;
  const activeStay = room.stays?.find((s) => s.status === 'active');
  const isVacant = room.status === 'vacant_clean' || room.status === 'vacant_dirty';

  return (
    <div
      className={`group relative p-3 rounded-xl border transition-all ${
        isVacant
          ? 'border-green-500/25 hover:border-green-500/60 bg-green-500/5 cursor-pointer'
          : room.status === 'occupied'
          ? 'border-blue-500/20 bg-blue-500/5'
          : 'border-border bg-bg-card/30 opacity-60'
      }`}
      onClick={isVacant ? () => onCheckIn(room) : undefined}
    >
      {/* Status dot */}
      <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${cfg.dot}`} />

      <p className="text-lg font-black text-text-primary leading-none">{room.roomNumber}</p>
      <p className="text-[10px] text-text-muted font-medium truncate mt-0.5">{room.roomType?.name}</p>
      {room.floor !== null && (
        <p className="text-[9px] text-text-muted font-bold uppercase tracking-wider mt-0.5">
          Floor {room.floor}
        </p>
      )}

      {isVacant && (
        <p className="text-[9px] font-black text-green-400 uppercase tracking-widest mt-2 group-hover:underline">
          Check In →
        </p>
      )}
      {room.status === 'occupied' && activeStay?.guest?.name && (
        <p className="text-[9px] font-bold text-blue-400 mt-1.5 truncate">{activeStay.guest.name}</p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FrontDesk() {
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Stats
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['hotel', 'dashboard', 'stats'],
    queryFn: () => api.get(`${BASE}/dashboard/stats`).then((r) => r.data),
    refetchInterval: 60_000,
  });

  // Arrivals
  const { data: arrivalsData, isLoading: arrivalsLoading } = useQuery({
    queryKey: ['hotel', 'dashboard', 'arrivals'],
    queryFn: () => api.get(`${BASE}/dashboard/arrivals`).then((r) => r.data),
    refetchInterval: 60_000,
  });

  // Departures
  const { data: departuresData, isLoading: departuresLoading } = useQuery({
    queryKey: ['hotel', 'dashboard', 'departures'],
    queryFn: () => api.get(`${BASE}/dashboard/departures`).then((r) => r.data),
    refetchInterval: 60_000,
  });

  // In-House
  const { data: inHouseData, isLoading: inHouseLoading } = useQuery({
    queryKey: ['hotel', 'dashboard', 'in-house'],
    queryFn: () => api.get(`${BASE}/dashboard/in-house`).then((r) => r.data),
    refetchInterval: 60_000,
  });

  // All rooms for status board (available rooms widget)
  const { data: roomsData, isLoading: roomsLoading } = useQuery({
    queryKey: ['hotel', 'room-status-board'],
    queryFn: () => api.get(`${BASE}/room-status-board`).then((r) => r.data),
    refetchInterval: 30_000,
  });

  const stats: DashboardStats = statsData?.data || {
    arrivals_today: 0, departures_today: 0,
    in_house_count: 0, occupancy_rate: 0, total_rooms: 0,
  };

  const allRooms: Room[] = roomsData?.data || [];
  const vacantRooms = allRooms.filter((r) => r.status === 'vacant_clean' || r.status === 'vacant_dirty');
  const occupiedRooms = allRooms.filter((r) => r.status === 'occupied');

  // Status counts for summary row
  const statusCounts: Record<string, number> = {};
  allRooms.forEach((r) => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });

  return (
    <div className="space-y-6 animate-in">

      {/* ── Header ── */}
      <div className="bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Building className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-text-primary tracking-tight">Front Desk Dashboard</h1>
            <div className="flex items-center gap-3 text-sm text-text-muted mt-0.5">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {format(now, 'EEEE, MMMM d, yyyy')}
              </span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span className="flex items-center gap-1.5 font-mono tabular-nums">
                <Clock className="w-3.5 h-3.5" />
                {format(now, 'hh:mm:ss a')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          {/* Walk-In: opens the unified flow page */}
          <Button
            onClick={() => navigate('/admin/hotel/walk-in')}
            variant="primary"
            className="shadow-lg shadow-blue-500/20 font-black"
          >
            <Zap className="w-4 h-4 mr-2" />
            Walk-In Check-In
          </Button>
          <Button
            onClick={() => navigate('/admin/hotel/check-in')}
            variant="outline"
            className="border-border/60 hover:bg-bg-hover font-black"
          >
            <CheckCircle2 className="w-4 h-4 mr-2 text-green-400" />
            Check-In
          </Button>
          <Button
            onClick={() => navigate('/admin/hotel/check-out')}
            variant="outline"
            className="border-border/60 hover:bg-bg-hover font-black"
          >
            <LogOut className="w-4 h-4 mr-2 text-red-400" />
            Check-Out
          </Button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 border-l-4 border-l-blue-500 bg-gradient-to-br from-bg-card to-blue-500/5 hover:scale-[1.02] transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black text-text-secondary uppercase tracking-wider">Arrivals Today</span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/20">
              <Calendar className="w-4 h-4 text-blue-400" />
            </div>
          </div>
          <span className="text-3xl font-black text-text-primary">
            {statsLoading ? <Skeleton className="h-9 w-12 inline-block" /> : stats.arrivals_today}
          </span>
        </Card>

        <Card className="p-5 border-l-4 border-l-red-500 bg-gradient-to-br from-bg-card to-red-500/5 hover:scale-[1.02] transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black text-text-secondary uppercase tracking-wider">Departures</span>
            <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center border border-red-500/20">
              <LogOut className="w-4 h-4 text-red-400" />
            </div>
          </div>
          <span className="text-3xl font-black text-text-primary">
            {statsLoading ? <Skeleton className="h-9 w-12 inline-block" /> : stats.departures_today}
          </span>
        </Card>

        <Card className="p-5 border-l-4 border-l-green-500 bg-gradient-to-br from-bg-card to-green-500/5 hover:scale-[1.02] transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black text-text-secondary uppercase tracking-wider">In House</span>
            <div className="w-9 h-9 rounded-xl bg-green-500/20 flex items-center justify-center border border-green-500/20">
              <BedDouble className="w-4 h-4 text-green-400" />
            </div>
          </div>
          <span className="text-3xl font-black text-text-primary">
            {statsLoading ? <Skeleton className="h-9 w-12 inline-block" /> : stats.in_house_count}
          </span>
          <p className="text-xs text-text-muted mt-1 font-medium">of {stats.total_rooms} rooms</p>
        </Card>

        <Card className="p-5 border-l-4 border-l-purple-500 bg-gradient-to-br from-bg-card to-purple-500/5 hover:scale-[1.02] transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black text-text-secondary uppercase tracking-wider">Occupancy</span>
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/20">
              <Building className="w-4 h-4 text-purple-400" />
            </div>
          </div>
          <span className="text-3xl font-black text-text-primary">
            {statsLoading ? <Skeleton className="h-9 w-12 inline-block" /> : `${stats.occupancy_rate}%`}
          </span>
          <Progress value={stats.occupancy_rate} className="h-1.5 bg-border/40 mt-2" />
        </Card>
      </div>

      {/* ── Room Status Summary Bar ── */}
      <div className="flex flex-wrap gap-3 items-center p-4 bg-bg-card/30 rounded-xl border border-border/40">
        <span className="text-[10px] font-black uppercase tracking-widest text-text-muted mr-2">Room Status:</span>
        {Object.entries(STATUS_CFG).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            <span className="text-[10px] font-black text-text-muted">{statusCounts[key] || 0} {cfg.label}</span>
          </div>
        ))}
      </div>

      {/* ── Available Rooms (NEW) ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
            <h2 className="text-sm font-black text-text-primary uppercase tracking-wider">
              Available Rooms
            </h2>
            <span className="bg-green-500/20 text-green-400 text-xs font-black px-2 py-0.5 rounded-full border border-green-500/20">
              {vacantRooms.length}
            </span>
          </div>
          <button
            onClick={() => navigate('/admin/hotel/room-status-board')}
            className="text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
          >
            View All <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {roomsLoading ? (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
            {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : vacantRooms.length === 0 ? (
          <div className="text-center py-8 bg-bg-card/30 border border-dashed border-border/60 rounded-xl">
            <BedDouble className="w-8 h-8 text-text-muted/30 mx-auto mb-2" />
            <p className="text-text-muted text-sm font-bold italic">No vacant rooms available</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
            {vacantRooms.map((room) => (
              <RoomMiniCard
                key={room.id}
                room={room}
                onCheckIn={() => navigate('/admin/hotel/walk-in')}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── 3 Panels ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Today's Arrivals */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
              <h2 className="text-sm font-black text-text-primary uppercase tracking-wider">Today's Arrivals</h2>
            </div>
            <span className="bg-blue-500/20 text-blue-400 text-xs font-black px-2 py-0.5 rounded-full border border-blue-500/20">
              {stats.arrivals_today}
            </span>
          </div>

          {arrivalsLoading
            ? [1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)
            : (arrivalsData?.data || []).length === 0
            ? (
              <div className="bg-bg-card/30 border border-dashed border-border rounded-xl p-6 text-center text-text-muted text-sm italic">
                No arrivals today.
              </div>
            )
            : (arrivalsData?.data || []).map((res: Reservation) => (
              <div
                key={res.id}
                className="group bg-bg-card border border-border rounded-xl p-4 hover:border-blue-500/40 transition-all relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50" />
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-[10px] font-mono text-text-muted">{res.reservationNumber}</p>
                    <p className="font-black text-text-primary">{res.guest?.name}</p>
                  </div>
                  <button
                    onClick={() => navigate('/admin/hotel/check-in')}
                    className="text-[10px] font-black text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                  >
                    Check In <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-xs text-text-muted flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> {res.checkInTime || '2:00 PM'}
                  {res.rooms && res.rooms.length > 0 && (
                    <span className="ml-2 text-blue-400 font-bold">· {res.rooms.length} Room{res.rooms.length > 1 ? 's' : ''}</span>
                  )}
                </p>
              </div>
            ))}
        </div>

        {/* Today's Departures */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
              <h2 className="text-sm font-black text-text-primary uppercase tracking-wider">Departures</h2>
            </div>
            <span className="bg-red-500/20 text-red-400 text-xs font-black px-2 py-0.5 rounded-full border border-red-500/20">
              {stats.departures_today}
            </span>
          </div>

          {departuresLoading
            ? [1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)
            : (departuresData?.data || []).length === 0
            ? (
              <div className="bg-bg-card/30 border border-dashed border-border rounded-xl p-6 text-center text-text-muted text-sm italic">
                No departures today.
              </div>
            )
            : (departuresData?.data || []).map((stay: Stay) => {
              const charged = (stay.folioCharges || []).reduce((s, c) => s + Number(c.amount || 0), 0);
              const paid = (stay.folioPayments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
              const balance = Math.max(0, charged - paid);
              return (
                <div
                  key={stay.id}
                  className="group bg-bg-card border border-border rounded-xl p-4 hover:border-red-500/40 transition-all relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-red-500/50" />
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-[10px] font-mono text-text-muted">STAY-{stay.id}</p>
                      <p className="font-black text-text-primary">{stay.guest?.name}</p>
                    </div>
                    <button
                      onClick={() => navigate('/admin/hotel/check-out')}
                      className="text-[10px] font-black text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                    >
                      Check Out <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-text-muted flex items-center gap-1">
                      <BedDouble className="w-3 h-3" /> {stay.room?.roomNumber}
                    </span>
                    {balance > 0 && (
                      <span className="text-red-400 font-black">Due: {formatCurrency(balance)}</span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {/* In-House */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              <h2 className="text-sm font-black text-text-primary uppercase tracking-wider">In-House</h2>
            </div>
            <span className="bg-green-500/20 text-green-400 text-xs font-black px-2 py-0.5 rounded-full border border-green-500/20">
              {stats.in_house_count}
            </span>
          </div>

          {inHouseLoading
            ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)
            : (inHouseData?.data || []).length === 0
            ? (
              <div className="bg-bg-card/30 border border-dashed border-border rounded-xl p-6 text-center text-text-muted text-sm italic">
                No guests in-house.
              </div>
            )
            : (inHouseData?.data || []).map((stay: Stay) => (
              <div
                key={stay.id}
                className="bg-bg-card border border-border rounded-xl p-4 hover:border-green-500/40 transition-all relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-green-500/50" />
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-black text-text-primary">{stay.guest?.name}</p>
                    <p className="text-xs text-text-muted flex items-center gap-1.5 mt-1">
                      <BedDouble className="w-3 h-3" /> {stay.room?.roomNumber}
                      <span className="text-[9px]">· {stay.room?.roomType?.name}</span>
                    </p>
                  </div>
                  <span className="text-[10px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded border border-green-500/20 font-black uppercase tracking-widest">
                    Active
                  </span>
                </div>
                <p className="text-[10px] text-text-muted mt-2">
                  Out: {stay.checkOutDatetime ? format(new Date(stay.checkOutDatetime), 'MMM d') : '—'}
                </p>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}