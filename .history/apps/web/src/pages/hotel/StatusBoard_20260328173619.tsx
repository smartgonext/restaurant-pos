import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select } from '@/components/ui/Select';
import api from '@/lib/api';

interface Room {
  id: number;
  roomNumber: string;
  floor?: number;
  status: string;
  roomType: { id: number; name: string };
  stays?: Array<{ guest?: { name?: string } }>;
}

const statusColors: Record<string, string> = {
  vacant_clean: 'bg-emerald-500/15 text-emerald-300',
  vacant_dirty: 'bg-amber-500/15 text-amber-300',
  occupied: 'bg-blue-500/15 text-blue-300',
  maintenance: 'bg-orange-500/15 text-orange-300',
  out_of_order: 'bg-red-500/15 text-red-300',
  out_of_service: 'bg-gray-500/20 text-gray-300',
};

const statusLabel = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function StatusBoard() {
  const [floor, setFloor] = useState('all');
  const [status, setStatus] = useState('all');
  const [roomTypeFilter, setRoomTypeFilter] = useState('all');

  const { data: roomsRes, isLoading } = useQuery({
    queryKey: ['hotel-room-status-board', floor, status],
    queryFn: () =>
      api
        .get('/restaurant/hotel/room-status-board', {
          params: {
            floor: floor === 'all' ? undefined : Number(floor),
            status: status === 'all' ? undefined : status,
          },
        })
        .then((r) => r.data),
  });

  const rooms: Room[] = roomsRes?.data || [];

  const floors = useMemo(() => {
    const values = Array.from(new Set(rooms.map((r) => r.floor).filter((f): f is number => f !== undefined))).sort((a, b) => a - b);
    return values;
  }, [rooms]);

  const roomTypes = useMemo(() => {
    const list = Array.from(new Set(rooms.map((r) => r.roomType?.name).filter(Boolean)));
    return list;
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    if (roomTypeFilter === 'all') return rooms;
    return rooms.filter((r) => r.roomType?.name === roomTypeFilter);
  }, [rooms, roomTypeFilter]);

  return (
    <div className="space-y-6 animate-in">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-text-primary">Room Status Board</h1>
        <div className="flex flex-wrap gap-3">
          <Select value={floor} onChange={(e) => setFloor(e.target.value)} className="min-w-[160px]">
            <option value="all">All Floors</option>
            {floors.map((f) => (
              <option key={f} value={String(f)}>
                Floor {f}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="min-w-[180px]">
            <option value="all">All Statuses</option>
            <option value="vacant_clean">Vacant Clean</option>
            <option value="vacant_dirty">Vacant Dirty</option>
            <option value="occupied">Occupied</option>
            <option value="maintenance">Maintenance</option>
            <option value="out_of_order">Out of Order</option>
            <option value="out_of_service">Out of Service</option>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 border-b border-border pb-2">
        <button
          onClick={() => setRoomTypeFilter('all')}
          className={`px-3 py-2 text-sm ${roomTypeFilter === 'all' ? 'text-blue-400 border-b border-blue-400' : 'text-text-muted'}`}
        >
          All Rooms
        </button>
        {roomTypes.map((type) => (
          <button
            key={type}
            onClick={() => setRoomTypeFilter(type)}
            className={`px-3 py-2 text-sm ${roomTypeFilter === type ? 'text-blue-400 border-b border-blue-400' : 'text-text-muted'}`}
          >
            {type}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-text-muted">
        {Object.keys(statusColors).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${statusColors[s].split(' ')[0]}`} />
            <span>{statusLabel(s)}</span>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="text-text-muted">Loading room status board...</div>
      ) : filteredRooms.length === 0 ? (
        <div className="glass-card p-8 text-center text-text-muted">No rooms found for selected filters.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredRooms.map((room) => (
            <div key={room.id} className="glass-card p-4 border border-border/60">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-text-primary">{room.roomNumber}</h3>
                <span className={`text-xs px-2 py-1 rounded-full ${statusColors[room.status] || 'bg-gray-500/20 text-gray-200'}`}>
                  {statusLabel(room.status)}
                </span>
              </div>
              <p className="text-sm text-text-muted mt-2">
                {room.roomType?.name} • Floor {room.floor ?? '-'}
              </p>
              {room.stays?.[0]?.guest?.name && <p className="text-xs text-text-secondary mt-2">Guest: {room.stays[0].guest?.name}</p>}
              <div className="mt-3 pt-3 border-t border-border text-sm text-emerald-400">Check In</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
