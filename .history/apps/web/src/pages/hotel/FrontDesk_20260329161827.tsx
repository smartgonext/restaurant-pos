import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CheckCircle2, LogOut, BedDouble, Building, ArrowRight, Calendar, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/Skeleton';
import api from '@/lib/api';
import { format } from 'date-fns';
import { Progress } from '@/components/ui/Progress';
import { useEffect, useState } from 'react';

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
  guest: { name: string };
  checkInDate: string;
}

interface Stay {
  id: number;
  guest: { name: string };
  room: { roomNumber: string; roomType: { name: string } };
  checkInDatetime: string;
  checkOutDatetime: string;
}

export default function FrontDesk() {
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['hotel', 'dashboard', 'stats'],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/dashboard/stats');
      return res.data;
    },
    refetchInterval: 60_000,
  });

  const { data: arrivalsData, isLoading: arrivalsLoading } = useQuery({
    queryKey: ['hotel', 'dashboard', 'arrivals'],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/dashboard/arrivals');
      return res.data;
    },
    refetchInterval: 60_000,
  });

  const { data: departuresData, isLoading: departuresLoading } = useQuery({
    queryKey: ['hotel', 'dashboard', 'departures'],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/dashboard/departures');
      return res.data;
    },
    refetchInterval: 60_000,
  });

  const { data: inHouseData, isLoading: inHouseLoading } = useQuery({
    queryKey: ['hotel', 'dashboard', 'in-house'],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/dashboard/in-house');
      return res.data;
    },
    refetchInterval: 60_000,
  });

  const stats: DashboardStats = statsData?.data || { 
    arrivals_today: 0, 
    departures_today: 0, 
    in_house_count: 0, 
    occupancy_rate: 0,
    total_rooms: 0
  };

  return (
    <div className="space-y-6 animate-in">
      {/* Header Strip */}
      <div className="bg-bg-card/50 backdrop-blur-md border border-border p-4 rounded-xl flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
            <Building className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">Front Desk Dashboard</h1>
            <div className="flex items-center gap-3 text-sm text-text-muted mt-0.5">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {format(now, 'EEEE, MMMM d, yyyy')}
              </span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span className="flex items-center gap-1.5 font-mono">
                <Clock className="w-3.5 h-3.5" />
                {format(now, 'h:mm a')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => navigate('/admin/hotel/check-in')} variant="primary" className="shadow-lg shadow-blue-500/20">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Check In
          </Button>
          <Button onClick={() => navigate('/admin/hotel/check-out')} variant="outline" className="border-border/60 hover:bg-bg-hover">
            <LogOut className="w-4 h-4 mr-2 text-red-400" />
            Check Out
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Arrivals Today */}
        <Card className="p-5 border-l-4 border-l-blue-500 bg-gradient-to-br from-bg-card to-blue-500/5 transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-text-secondary uppercase tracking-wider">Arrivals Today</span>
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/20">
              <Calendar className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-text-primary">{statsLoading ? <Skeleton className="h-9 w-12" /> : stats.arrivals_today}</span>
          </div>
        </Card>

        {/* Departures Today */}
        <Card className="p-5 border-l-4 border-l-red-500 bg-gradient-to-br from-bg-card to-red-500/5 transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-text-secondary uppercase tracking-wider">Departures Today</span>
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center border border-red-500/20">
              <LogOut className="w-5 h-5 text-red-400" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-text-primary">{statsLoading ? <Skeleton className="h-9 w-12" /> : stats.departures_today}</span>
          </div>
        </Card>

        {/* In House */}
        <Card className="p-5 border-l-4 border-l-green-500 bg-gradient-to-br from-bg-card to-green-500/5 transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-text-secondary uppercase tracking-wider">In House</span>
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center border border-green-500/20">
              <BedDouble className="w-5 h-5 text-green-400" />
            </div>
          </div>
          <div>
            <span className="text-3xl font-bold text-text-primary">{inHouseLoading ? <Skeleton className="h-9 w-12" /> : stats.in_house_count}</span>
            <p className="text-xs text-text-muted mt-1 font-medium">Occupancy Rate: {stats.occupancy_rate}%</p>
          </div>
        </Card>

        {/* Occupancy Rate */}
        <Card className="p-5 border-l-4 border-l-purple-500 bg-gradient-to-br from-bg-card to-purple-500/5 transition-all hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-text-secondary uppercase tracking-wider">Occupancy Rate</span>
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/20">
              <Building className="w-5 h-5 text-purple-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-3xl font-bold text-text-primary">{statsLoading ? <Skeleton className="h-9 w-12" /> : `${stats.occupancy_rate}%`}</span>
            </div>
            <Progress value={stats.occupancy_rate} className="h-1.5 bg-border/40" />
            <div className="flex justify-between text-[10px] text-text-muted mt-1 font-medium italic">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Panels Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Arrivals Panel */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
              <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">Today's Arrivals</h2>
            </div>
            <span className="bg-blue-500/20 text-blue-400 text-xs font-bold px-2 py-0.5 rounded-full border border-blue-500/20">
              {stats.arrivals_today}
            </span>
          </div>
          <div className="space-y-3">
            {arrivalsLoading ? (
              [1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
            ) : (arrivalsData?.data || []).length === 0 ? (
              <div className="bg-bg-card/30 border border-dashed border-border rounded-xl p-8 text-center text-text-muted text-sm italic">
                No arrivals scheduled for today.
              </div>
            ) : (
              (arrivalsData?.data || []).map((res: Reservation) => (
                <div key={res.id} className="group bg-bg-card border border-border rounded-xl p-4 hover:border-blue-500/40 transition-all hover:bg-bg-hover relative overflow-hidden">
                   <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50" />
                   <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-xs font-mono text-text-muted mb-1">{res.reservationNumber}</p>
                        <h3 className="font-bold text-text-primary">{res.guest.name}</h3>
                      </div>
                      <button 
                         onClick={() => navigate('/admin/hotel/check-in')}
                         className="flex items-center gap-1 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Check In <ArrowRight className="w-3 h-3" />
                      </button>
                   </div>
                   <p className="text-xs text-text-muted flex items-center gap-1.5 font-medium">
                      <Clock className="w-3 h-3" /> 2:00 PM
                   </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Today's Departures Panel */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
              <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">Today's Departures</h2>
            </div>
            <span className="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-0.5 rounded-full border border-red-500/20">
              {stats.departures_today}
            </span>
          </div>
          <div className="space-y-3">
            {departuresLoading ? (
              [1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
            ) : (departuresData?.data || []).length === 0 ? (
              <div className="bg-bg-card/30 border border-dashed border-border rounded-xl p-8 text-center text-text-muted text-sm italic">
                No departures scheduled for today.
              </div>
            ) : (
              (departuresData?.data || []).map((stay: Stay) => (
                <div key={stay.id} className="group bg-bg-card border border-border rounded-xl p-4 hover:border-red-500/40 transition-all hover:bg-bg-hover relative overflow-hidden">
                   <div className="absolute top-0 left-0 w-1 h-full bg-red-500/50" />
                   <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-xs font-mono text-text-muted mb-1">STAY-{stay.id}</p>
                        <h3 className="font-bold text-text-primary">{stay.guest.name}</h3>
                      </div>
                      <button 
                         onClick={() => navigate('/admin/hotel/check-out')}
                         className="flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-300 transition-colors"
                      >
                        Check Out <ArrowRight className="w-3 h-3" />
                      </button>
                   </div>
                   <div className="flex items-center gap-3 mt-2">
                      <p className="text-xs text-text-muted flex items-center gap-1.5 font-medium">
                        <BedDouble className="w-3 h-3" /> {stay.room.roomNumber}
                      </p>
                      <p className="text-xs text-text-muted flex items-center gap-1.5 font-medium">
                        <Clock className="w-3 h-3" /> 11:00 AM
                      </p>
                   </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* In-House Guest Panel */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">In-House</h2>
            </div>
            <span className="bg-green-500/20 text-green-400 text-xs font-bold px-2 py-0.5 rounded-full border border-green-500/20">
              {stats.in_house_count}
            </span>
          </div>
          <div className="space-y-3">
            {inHouseLoading ? (
              [1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
            ) : (inHouseData?.data || []).length === 0 ? (
              <div className="bg-bg-card/30 border border-dashed border-border rounded-xl p-8 text-center text-text-muted text-sm italic">
                Not Available
              </div>
            ) : (
              (inHouseData?.data || []).map((stay: Stay) => (
                <div key={stay.id} className="group bg-bg-card border border-border rounded-xl p-4 hover:border-green-500/40 transition-all hover:bg-bg-hover relative overflow-hidden">
                   <div className="absolute top-0 left-0 w-1 h-full bg-green-500/50" />
                   <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-xs font-mono text-text-muted mb-1">STAY-{stay.id}</p>
                        <h3 className="font-bold text-text-primary">{stay.guest.name}</h3>
                      </div>
                      <span className="text-[10px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded border border-green-500/20 font-bold uppercase tracking-widest">
                        Active
                      </span>
                   </div>
                   <div className="flex items-center gap-3 mt-2">
                      <p className="text-xs text-text-muted flex items-center gap-1.5 font-medium">
                        <BedDouble className="w-3 h-3" /> {stay.room.roomNumber}
                      </p>
                      <p className="text-xs text-text-muted flex items-center gap-1.5 font-medium">
                        <Calendar className="w-3 h-3" /> Since {format(new Date(stay.checkInDatetime), 'MMM d')}
                      </p>
                   </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
