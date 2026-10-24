import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import api from '@/lib/api';

interface Venue {
  id: number;
  name: string;
  capacity: number;
  baseRate: number | string;
  status: string;
}

interface EventItem {
  id: number;
  eventNumber: string;
  eventName: string;
  customerName: string;
  eventDate: string;
  guestsCount?: number;
  status: string;
  venue?: { id: number; name: string };
}

export default function Banquets() {
  const [venueSearch, setVenueSearch] = useState('');
  const [eventSearch, setEventSearch] = useState('');
  const [venueFilter, setVenueFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: venuesRes } = useQuery({
    queryKey: ['hotel-venues', venueSearch],
    queryFn: () => api.get('/restaurant/hotel/venues', { params: { search: venueSearch || undefined } }).then((r) => r.data),
  });

  const { data: eventsRes, isLoading } = useQuery({
    queryKey: ['hotel-events', eventSearch, venueFilter, statusFilter],
    queryFn: () =>
      api
        .get('/restaurant/hotel/events', {
          params: {
            search: eventSearch || undefined,
            venueId: venueFilter === 'all' ? undefined : Number(venueFilter),
            status: statusFilter === 'all' ? undefined : statusFilter,
          },
        })
        .then((r) => r.data),
  });

  const venues: Venue[] = venuesRes?.data || [];
  const events: EventItem[] = eventsRes?.data || [];

  const filteredVenues = useMemo(() => {
    const q = venueSearch.toLowerCase();
    return venues.filter((v) => v.name.toLowerCase().includes(q));
  }, [venues, venueSearch]);

  return (
    <div className="space-y-8 animate-in">
      <h1 className="text-3xl font-bold text-text-primary">Hotel Banquet & Events</h1>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-text-primary">Venues</h2>
        <Input value={venueSearch} onChange={(e) => setVenueSearch(e.target.value)} placeholder="Search by venue name..." className="max-w-[320px]" />
        <div className="glass-card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-tertiary/60 text-text-muted">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Capacity</th>
                <th className="text-left px-4 py-3">Base Rate</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredVenues.map((venue) => (
                <tr key={venue.id} className="border-t border-border/50">
                  <td className="px-4 py-3">{venue.name}</td>
                  <td className="px-4 py-3">{venue.capacity}</td>
                  <td className="px-4 py-3">{formatCurrency(venue.baseRate)}</td>
                  <td className="px-4 py-3">{venue.status}</td>
                </tr>
              ))}
              {filteredVenues.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-text-muted">
                    No venues found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-text-primary">Events</h2>
        <div className="flex flex-wrap gap-3">
          <Input value={eventSearch} onChange={(e) => setEventSearch(e.target.value)} placeholder="Search by event number, name, or customer..." className="min-w-[320px]" />
          <Select value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)} className="w-[160px]">
            <option value="all">All Venues</option>
            {venues.map((venue) => (
              <option key={venue.id} value={String(venue.id)}>
                {venue.name}
              </option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-[160px]">
            <option value="all">All Statuses</option>
            <option value="tentative">Tentative</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </Select>
        </div>
        <div className="glass-card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-tertiary/60 text-text-muted">
              <tr>
                <th className="text-left px-4 py-3">Event #</th>
                <th className="text-left px-4 py-3">Event Name</th>
                <th className="text-left px-4 py-3">Venue</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Date & Time</th>
                <th className="text-left px-4 py-3">Guests</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-text-muted">
                    Loading events...
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-text-muted">
                    No events found.
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.id} className="border-t border-border/50">
                    <td className="px-4 py-3">{event.eventNumber}</td>
                    <td className="px-4 py-3">{event.eventName}</td>
                    <td className="px-4 py-3">{event.venue?.name || '-'}</td>
                    <td className="px-4 py-3">{event.customerName || '--'}</td>
                    <td className="px-4 py-3">{formatDateTime(event.eventDate)}</td>
                    <td className="px-4 py-3">{event.guestsCount || '-'}</td>
                    <td className="px-4 py-3">{event.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
