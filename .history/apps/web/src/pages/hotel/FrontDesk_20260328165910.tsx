import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/Skeleton';

interface DashboardStats {
  arrivals_today: number;
  departures_today: number;
  in_house_count: number;
  occupancy_rate: number;
}

interface Reservation {
  id: number;
  reservationNumber: string;
  guest: { name: string };
  checkInDate: string;
  checkOutDate: string;
}

interface Stay {
  id: number;
  guest: { name: string };
  room: { roomNumber: string; roomType: { name: string } };
  checkOutDatetime: string;
}

export default function FrontDesk() {
  const navigate = useNavigate();

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['hotel', 'dashboard', 'stats'],
    queryFn: async () => {
      const res = await fetch('/api/restaurant/hotel/dashboard/stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
  });

  const { data: arrivalsData, isLoading: arrivalsLoading } = useQuery({
    queryKey: ['hotel', 'dashboard', 'arrivals'],
    queryFn: async () => {
      const res = await fetch('/api/restaurant/hotel/dashboard/arrivals');
      if (!res.ok) throw new Error('Failed to fetch arrivals');
      return res.json();
    },
  });

  const { data: departuresData, isLoading: departuresLoading } = useQuery({
    queryKey: ['hotel', 'dashboard', 'departures'],
    queryFn: async () => {
      const res = await fetch('/api/restaurant/hotel/dashboard/departures');
      if (!res.ok) throw new Error('Failed to fetch departures');
      return res.json();
    },
  });

  const { data: inHouseData, isLoading: inHouseLoading } = useQuery({
    queryKey: ['hotel', 'dashboard', 'in-house'],
    queryFn: async () => {
      const res = await fetch('/api/restaurant/hotel/dashboard/in-house');
      if (!res.ok) throw new Error('Failed to fetch in-house');
      return res.json();
    },
  });

  const stats: DashboardStats = statsData?.data || { arrivals_today: 0, departures_today: 0, in_house_count: 0, occupancy_rate: 0 };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Front Desk Dashboard</h1>
        <div className="flex gap-3">
          <Button onClick={() => navigate('/admin/hotel/check-in')} variant="primary">
            <CheckCircle2 className="w-4 h-4" />
            Check In
          </Button>
          <Button onClick={() => navigate('/admin/hotel/check-out')} variant="outline">
            Check Out
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Arrivals Today"
          value={statsLoading ? <Skeleton /> : stats.arrivals_today}
          color="blue"
        />
        <StatCard
          label="Departures Today"
          value={departuresLoading ? <Skeleton /> : stats.departures_today}
          color="red"
        />
        <StatCard
          label="In-House"
          value={inHouseLoading ? <Skeleton /> : stats.in_house_count}
          sublabel={`${stats.occupancy_rate}% Occupancy`}
          color="green"
        />
        <StatCard
          label="Occupancy Rate"
          value={statsLoading ? <Skeleton /> : `${stats.occupancy_rate}%`}
          format="percentage"
          color="purple"
        />
      </div>

      {/* Panels */}
      <div className="grid grid-cols-1 gap-6">
        {/* Today's Arrivals */}
        <Card>
          <div className="flex items-center justify-between p-6 border-b border-border">
            <h2 className="text-lg font-semibold text-text-primary">Today's Arrivals</h2>
            <span className="text-sm bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full">
              {stats.arrivals_today}
            </span>
          </div>
          <div className="overflow-x-auto">
            {arrivalsLoading ? (
              <div className="p-6 text-center text-text-muted">Loading...</div>
            ) : (arrivalsData?.data || []).length === 0 ? (
              <div className="p-6 text-center text-text-muted">No arrivals today</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-t border-border">
                    <th className="text-left px-6 py-3 text-sm font-semibold text-text-secondary">Reservation #</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-text-secondary">Guest Name</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-text-secondary">Check-in Time</th>
                    <th className="text-right px-6 py-3 text-sm font-semibold text-text-secondary">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(arrivalsData?.data || []).map((res: Reservation) => (
                    <tr key={res.id} className="border-t border-border hover:bg-bg-hover">
                      <td className="px-6 py-3 text-text-primary font-medium">{res.reservationNumber}</td>
                      <td className="px-6 py-3 text-text-primary">{res.guest.name}</td>
                      <td className="px-6 py-3 text-text-muted">2:00 PM</td>
                      <td className="px-6 py-3 text-right">
                        <Button size="sm" variant="primary" onClick={() => navigate('/admin/hotel/check-in')}>
                          Check In
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* Today's Departures */}
        <Card>
          <div className="flex items-center justify-between p-6 border-b border-border">
            <h2 className="text-lg font-semibold text-text-primary">Today's Departures</h2>
            <span className="text-sm bg-red-500/20 text-red-400 px-3 py-1 rounded-full">
              {stats.departures_today}
            </span>
          </div>
          <div className="overflow-x-auto">
            {departuresLoading ? (
              <div className="p-6 text-center text-text-muted">Loading...</div>
            ) : (departuresData?.data || []).length === 0 ? (
              <div className="p-6 text-center text-text-muted">No departures today</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-t border-border">
                    <th className="text-left px-6 py-3 text-sm font-semibold text-text-secondary">Stay #</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-text-secondary">Guest Name</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-text-secondary">Room</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-text-secondary">Check-out Time</th>
                    <th className="text-right px-6 py-3 text-sm font-semibold text-text-secondary">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(departuresData?.data || []).map((stay: Stay) => (
                    <tr key={stay.id} className="border-t border-border hover:bg-bg-hover">
                      <td className="px-6 py-3 text-text-primary font-medium">S-{stay.id}</td>
                      <td className="px-6 py-3 text-text-primary">{stay.guest.name}</td>
                      <td className="px-6 py-3 text-text-muted">{stay.room.roomNumber}</td>
                      <td className="px-6 py-3 text-text-muted">11:00 AM</td>
                      <td className="px-6 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => navigate('/admin/hotel/check-out')}>
                          Check Out
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* In-House Guests */}
        <Card>
          <div className="flex items-center justify-between p-6 border-b border-border">
            <h2 className="text-lg font-semibold text-text-primary">In-House Guests</h2>
            <span className="text-sm bg-green-500/20 text-green-400 px-3 py-1 rounded-full">
              {stats.in_house_count}
            </span>
          </div>
          <div className="overflow-x-auto">
            {inHouseLoading ? (
              <div className="p-6 text-center text-text-muted">Loading...</div>
            ) : (inHouseData?.data || []).length === 0 ? (
              <div className="p-6 text-center text-text-muted">No guests currently in house</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-t border-border">
                    <th className="text-left px-6 py-3 text-sm font-semibold text-text-secondary">Stay #</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-text-secondary">Guest</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-text-secondary">Room</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-text-secondary">Check-in Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(inHouseData?.data || []).map((stay: Stay) => (
                    <tr key={stay.id} className="border-t border-border hover:bg-bg-hover">
                      <td className="px-6 py-3 text-text-primary font-medium">S-{stay.id}</td>
                      <td className="px-6 py-3 text-text-primary">{stay.guest.name}</td>
                      <td className="px-6 py-3 text-text-muted">{stay.room.roomNumber}</td>
                      <td className="px-6 py-3 text-text-muted">Today</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
