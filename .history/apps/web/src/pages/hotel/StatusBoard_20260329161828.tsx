import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Search, Filter, Layers, CheckCircle2, AlertCircle, Clock, User, BedDouble, Info } from 'lucide-react';
import api from '@/lib/api';

interface Room {
  id: number;
  roomNumber: string;
  floor: number | null;
  status: string;
  roomType: { id: number; name: string };
  stays?: Array<{ guest?: { name?: string } }>;
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  vacant_clean: { label: 'Vacant Clean', color: 'text-green-400 bg-green-500/10 border-green-500/20', icon: CheckCircle2 },
  vacant_dirty: { label: 'Vacant Dirty', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: AlertCircle },
  occupied: { label: 'Occupied', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: User },
  maintenance: { label: 'Maintenance', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20', icon: Clock },
  out_of_order: { label: 'Out of Order', color: 'text-red-400 bg-red-500/10 border-red-500/20', icon: AlertCircle },
  reserved: { label: 'Reserved', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20', icon: Clock },
};

export default function StatusBoard() {
  const [floorFilter, setFloorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');

  const { data: roomsRes, isLoading } = useQuery({
    queryKey: ['hotel', 'room-status-board'],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/room-status-board');
      return res.data;
    }
  });

  const rooms: Room[] = roomsRes?.data || [];

  const floors = useMemo(() => {
    const values = Array.from(new Set(rooms.map((r) => r.floor).filter((f): f is number => f !== null))).sort((a, b) => a - b);
    return values;
  }, [rooms]);

  const roomTypes = useMemo(() => {
    const list = Array.from(new Set(rooms.map((r) => r.roomType?.name).filter(Boolean)));
    return list;
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      const matchesFloor = floorFilter === 'all' || r.floor === Number(floorFilter);
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchesType = typeFilter === 'all' || r.roomType?.name === typeFilter;
      const matchesSearch = !search || r.roomNumber.toLowerCase().includes(search.toLowerCase()) || 
                           (r.stays?.[0]?.guest?.name && r.stays[0].guest.name.toLowerCase().includes(search.toLowerCase()));
      return matchesFloor && matchesStatus && matchesType && matchesSearch;
    });
  }, [rooms, floorFilter, statusFilter, typeFilter, search]);

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10">
        <div>
          <h1 className="text-2xl font-black text-text-primary tracking-tight">Room Status Board</h1>
          <p className="text-sm text-text-muted mt-1 font-medium italic">Real-time visibility of hotel inventory</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
             <input
               className="bg-bg-dark border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all w-full md:w-64"
               placeholder="Search room or guest..."
               value={search}
               onChange={e => setSearch(e.target.value)}
             />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center bg-bg-card/30 p-4 rounded-xl border border-border/40">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-text-muted mr-2">
          <Filter className="w-3.5 h-3.5" /> Filter By:
        </div>
        <select 
          className="bg-bg-dark border border-border rounded-lg px-3 py-1.5 text-xs font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
          value={floorFilter}
          onChange={e => setFloorFilter(e.target.value)}
        >
          <option value="all">All Floors</option>
          {floors.map(f => <option key={f} value={f.toString()}>Floor {f}</option>)}
        </select>
        
        <select 
          className="bg-bg-dark border border-border rounded-lg px-3 py-1.5 text-xs font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          {Object.entries(statusConfig).map(([val, cfg]) => <option key={val} value={val}>{cfg.label}</option>)}
        </select>

        <select 
          className="bg-bg-dark border border-border rounded-lg px-3 py-1.5 text-xs font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="all">All Categories</option>
          {roomTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <div className="ml-auto flex items-center gap-4">
           {Object.entries(statusConfig).map(([val, cfg]) => (
             <div key={val} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${cfg.color.split(' ')[0]}`} />
                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">{cfg.label}</span>
             </div>
           ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : filteredRooms.length === 0 ? (
        <Card className="p-20 text-center border-dashed border-2 border-border/60 bg-bg-card/30 rounded-2xl">
           <Layers className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-20" />
           <p className="text-text-muted font-bold italic">No rooms matching the selected criteria.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredRooms.map((room) => {
            const config = statusConfig[room.status] || { label: room.status, color: 'text-text-muted bg-bg-dark border-border', icon: Info };
            const Icon = config.icon;
            
            return (
              <Card key={room.id} className="group relative overflow-hidden border-border/40 hover:border-blue-500/40 transition-all hover:shadow-xl hover:shadow-blue-500/5 bg-gradient-to-br from-bg-card to-bg-card/60 rounded-2xl">
                 <div className={`absolute top-0 right-0 w-12 h-12 ${config.color.split(' ')[1]} blur-2xl opacity-50`} />
                 <div className="p-4 relative">
                    <div className="flex justify-between items-start mb-3">
                       <div>
                          <p className="text-[10px] font-black text-text-muted tracking-widest uppercase mb-0.5">Floor {room.floor ?? 'G'}</p>
                          <h3 className="text-2xl font-black text-text-primary group-hover:text-blue-400 transition-colors tracking-tighter leading-none">{room.roomNumber}</h3>
                       </div>
                       <div className={`p-1.5 rounded-lg ${config.color}`}>
                          <Icon className="w-4 h-4" />
                       </div>
                    </div>

                    <div className="space-y-2">
                       <p className="text-[10px] font-bold text-text-secondary truncate uppercase">{room.roomType?.name}</p>
                       <Badge variant="outline" className={`text-[8px] font-black uppercase tracking-widest py-0 px-2 rounded-md ${config.color}`}>
                          {config.label}
                       </Badge>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border/40">
                       {room.status === 'occupied' && room.stays?.[0]?.guest?.name ? (
                         <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center">
                               <User className="w-3 h-3 text-blue-400" />
                            </div>
                            <span className="text-[10px] font-black text-text-primary truncate uppercase">{room.stays[0].guest.name}</span>
                         </div>
                       ) : (
                         <div className="flex items-center gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                            <BedDouble className="w-3.5 h-3.5 text-text-muted" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-text-muted italic">Available</span>
                         </div>
                       )}
                    </div>
                 </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
