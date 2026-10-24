import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, Search, Users, Calendar, MapPin, DollarSign, X, CheckCircle2, Clock } from 'lucide-react';
import { formatCurrency, formatDateTime, formatDate } from '@/lib/utils';
import api from '@/lib/api';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';

interface Venue {
  id: number;
  name: string;
  capacity: number;
  baseRate: string;
  description: string | null;
  amenities: string[] | null;
  isActive: boolean;
  status: string;
}

interface EventItem {
  id: number;
  eventNumber: string;
  eventName: string;
  venueId: number;
  venue?: { name: string };
  customerName: string;
  customerPhone: string | null;
  eventDate: string;
  eventTime: string;
  guestsCount: number | null;
  totalAmount: string | null;
  depositAmount: string | null;
  status: string;
  createdAt: string;
}

export default function Banquets() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [venueSearch, setVenueSearch] = useState('');
  const [eventSearch, setEventSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'venues' | 'events'>('events');
  
  const [isVenueModalOpen, setIsVenueModalOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [newAmenity, setNewAmenity] = useState('');
  const [venueFormData, setVenueFormData] = useState({
    name: '',
    capacity: 50,
    baseRate: '',
    description: '',
    amenities: [] as string[],
    isActive: true
  });

  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [eventFormData, setEventFormData] = useState({
    eventName: '',
    venueId: '',
    customerName: '',
    customerPhone: '',
    eventDate: '',
    eventTime: '12:00',
    guestsCount: '',
    totalAmount: '',
    depositAmount: '',
    status: 'tentative'
  });

  // Queries
  const { data: venuesRes, isLoading: venuesLoading } = useQuery({
    queryKey: ['hotel', 'venues'],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/venues');
      return res.data;
    }
  });

  const { data: eventsRes, isLoading: eventsLoading } = useQuery({
    queryKey: ['hotel', 'events'],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/events');
      return res.data;
    }
  });

  // Venue Mutations
  const venueMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingVenue) return api.put(`/restaurant/hotel/venues/${editingVenue.id}`, payload);
      return api.post('/restaurant/hotel/venues', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel', 'venues'] });
      toast({ title: `Venue ${editingVenue ? 'updated' : 'created'} successfully` });
      setIsVenueModalOpen(false);
    }
  });

  // Event Mutations
  const eventMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingEvent) return api.put(`/restaurant/hotel/events/${editingEvent.id}`, payload);
      return api.post('/restaurant/hotel/events', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel', 'events'] });
      toast({ title: `Event ${editingEvent ? 'updated' : 'created'} successfully` });
      setIsEventModalOpen(false);
    }
  });

  const venues: Venue[] = venuesRes?.data || [];
  const events: EventItem[] = eventsRes?.data || [];

  const filteredVenues = useMemo(() => {
    if (!venueSearch) return venues;
    return venues.filter(v => v.name.toLowerCase().includes(venueSearch.toLowerCase()));
  }, [venues, venueSearch]);

  const filteredEvents = useMemo(() => {
    if (!eventSearch) return events;
    const q = eventSearch.toLowerCase();
    return events.filter(e => 
      e.eventName.toLowerCase().includes(q) || 
      e.customerName.toLowerCase().includes(q) ||
      e.eventNumber.toLowerCase().includes(q)
    );
  }, [events, eventSearch]);

  const handleOpenVenueModal = (item?: Venue) => {
    if (item) {
      setEditingVenue(item);
      setVenueFormData({
        name: item.name,
        capacity: item.capacity,
        baseRate: item.baseRate,
        description: item.description || '',
        amenities: Array.isArray(item.amenities) ? item.amenities : [],
        isActive: item.isActive
      });
    } else {
      setEditingVenue(null);
      setVenueFormData({
        name: '',
        capacity: 50,
        baseRate: '',
        description: '',
        amenities: [],
        isActive: true
      });
    }
    setIsVenueModalOpen(true);
  };

  const handleOpenEventModal = (item?: EventItem) => {
    if (item) {
      setEditingEvent(item);
      setEventFormData({
        eventName: item.eventName,
        venueId: item.venueId.toString(),
        customerName: item.customerName,
        customerPhone: item.customerPhone || '',
        eventDate: item.eventDate.split('T')[0],
        eventTime: item.eventTime,
        guestsCount: item.guestsCount?.toString() || '',
        totalAmount: item.totalAmount || '',
        depositAmount: item.depositAmount || '',
        status: item.status
      });
    } else {
      setEditingEvent(null);
      setEventFormData({
        eventName: '',
        venueId: '',
        customerName: '',
        customerPhone: '',
        eventDate: new Date().toISOString().split('T')[0],
        eventTime: '12:00',
        guestsCount: '',
        totalAmount: '',
        depositAmount: '',
        status: 'tentative'
      });
    }
    setIsEventModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10">
        <div>
          <h1 className="text-2xl font-black text-text-primary tracking-tight">Banquet & Event Mgmt</h1>
          <p className="text-sm text-text-muted mt-1 font-medium">Manage venues and event bookings</p>
        </div>
        <div className="flex gap-2 bg-bg-dark p-1 rounded-xl">
          <Button 
            variant={activeTab === 'events' ? 'primary' : 'ghost'} 
            onClick={() => setActiveTab('events')}
            className={`text-[10px] uppercase font-black tracking-widest px-6 h-9 ${activeTab === 'events' ? 'shadow-lg shadow-blue-500/20' : ''}`}
          >
            Events
          </Button>
          <Button 
            variant={activeTab === 'venues' ? 'primary' : 'ghost'} 
            onClick={() => setActiveTab('venues')}
            className={`text-[10px] uppercase font-black tracking-widest px-6 h-9 ${activeTab === 'venues' ? 'shadow-lg shadow-blue-500/20' : ''}`}
          >
            Venues
          </Button>
        </div>
      </div>

      {activeTab === 'venues' ? (
        <section className="space-y-4">
          <div className="flex justify-between items-center">
             <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  className="bg-bg-card border border-border rounded-xl pl-10 pr-4 py-2 text-sm w-full outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="Search venues..."
                  value={venueSearch}
                  onChange={e => setVenueSearch(e.target.value)}
                />
             </div>
             <Button onClick={() => handleOpenVenueModal()} variant="primary" size="sm" className="font-bold uppercase tracking-widest text-[10px]">
                <Plus className="w-4 h-4 mr-2" /> Add Venue
             </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {venuesLoading ? [1, 2, 3].map(i => <Skeleton key={i} className="h-64 rounded-2xl" />) :
              filteredVenues.map(venue => (
                <Card key={venue.id} className="group overflow-hidden border-border/40 hover:border-blue-500/40 rounded-2xl transition-all h-full bg-gradient-to-b from-bg-card/80 to-bg-card">
                   <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                         <h3 className="text-xl font-black text-text-primary group-hover:text-blue-400 transition-colors uppercase tracking-tight">{venue.name}</h3>
                         <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleOpenVenueModal(venue)}><Pencil className="w-4 h-4" /></Button>
                         </div>
                      </div>
                      <p className="text-xs text-text-muted mb-4 font-medium italic">{venue.description || 'No description provided.'}</p>
                      
                      <div className="grid grid-cols-2 gap-3 mb-4">
                         <div className="bg-bg-dark/50 p-2 rounded-xl border border-border/40 flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-xs font-bold text-text-primary">Cap: {venue.capacity}</span>
                         </div>
                         <div className="bg-bg-dark/50 p-2 rounded-xl border border-border/40 flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-red-400" />
                            <span className="text-xs font-bold text-text-primary">{venue.isActive ? 'Active' : 'Hidden'}</span>
                         </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mb-4">
                         {(venue.amenities || []).map((a, i) => (
                           <span key={i} className="text-[9px] font-black uppercase tracking-widest bg-bg-dark text-text-muted px-2 py-0.5 rounded border border-border">{a}</span>
                         ))}
                      </div>

                      <div className="pt-4 border-t border-border/40 flex justify-between items-center">
                         <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase text-text-muted tracking-widest">Base Rate</span>
                            <span className="text-xl font-black text-blue-400">${venue.baseRate}</span>
                         </div>
                         <Badge variant={venue.isActive ? 'success' : 'secondary'} className="rounded-lg text-[9px] uppercase font-black tracking-widest px-2">
                            {venue.isActive ? 'ENABLED' : 'DISABLED'}
                         </Badge>
                      </div>
                   </div>
                </Card>
              ))
             }
          </div>
        </section>
      ) : (
        <section className="space-y-4">
           <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  className="bg-bg-card border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm w-full outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="Search event#, name, or customer..."
                  value={eventSearch}
                  onChange={e => setEventSearch(e.target.value)}
                />
              </div>
              <Button onClick={() => handleOpenEventModal()} variant="primary" size="sm" className="w-full md:w-auto font-black uppercase tracking-widest text-[10px] h-10 px-8">
                <Plus className="w-4 h-4 mr-2" /> Book New Event
              </Button>
           </div>

           <Card padding={false} className="overflow-hidden border-border/40 rounded-2xl shadow-xl bg-bg-card/50">
             <div className="overflow-x-auto">
                <table className="w-full text-sm">
                   <thead>
                      <tr className="border-b border-border bg-bg-dark/50 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted">
                         <th className="text-left py-4 px-6">Event Details</th>
                         <th className="text-left py-4 px-6">Customer Info</th>
                         <th className="text-left py-4 px-6">Schedule</th>
                         <th className="text-left py-4 px-6">Package Details</th>
                         <th className="text-left py-4 px-6">Status</th>
                         <th className="text-right py-4 px-6">Actions</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-border/40">
                      {eventsLoading ? [1, 2, 3, 4, 5].map(i => (
                         <tr key={i}><td colSpan={6} className="p-4"><Skeleton className="h-10 w-full rounded-lg" /></td></tr>
                      )) : filteredEvents.map(event => (
                         <tr key={event.id} className="group hover:bg-blue-500/[0.02] transition-colors">
                            <td className="py-4 px-6">
                               <p className="text-[10px] font-mono text-text-muted mb-0.5">{event.eventNumber}</p>
                               <p className="font-black text-text-primary uppercase tracking-tight group-hover:text-blue-400 transition-colors">{event.eventName}</p>
                               <p className="text-[10px] font-black text-blue-400/70">{event.venue?.name}</p>
                            </td>
                            <td className="py-4 px-6">
                               <p className="font-bold text-text-secondary text-sm">{event.customerName}</p>
                               <p className="text-[10px] font-mono text-text-muted">{event.customerPhone || 'No Phone'}</p>
                            </td>
                            <td className="py-4 px-6">
                               <div className="flex items-center gap-2 text-xs text-text-primary font-bold">
                                  <Calendar className="w-3.5 h-3.5 text-blue-400/50" /> {formatDate(event.eventDate)}
                               </div>
                               <div className="flex items-center gap-2 text-[10px] text-text-muted mt-1 font-black">
                                  <Clock className="w-3.5 h-3.5" /> {event.eventTime}
                               </div>
                            </td>
                            <td className="py-4 px-6">
                               <div className="flex flex-col">
                                  <p className="text-[10px] font-black text-text-muted uppercase tracking-wider">Package: <span className="text-blue-400 font-black">${event.totalAmount || '0.00'}</span></p>
                                  <p className="text-[10px] font-black text-text-muted uppercase tracking-wider mt-1">Paid: <span className="text-green-500 font-black">${event.depositAmount || '0.00'}</span></p>
                               </div>
                            </td>
                            <td className="py-4 px-6">
                               <Badge variant={event.status === 'confirmed' ? 'success' : 'secondary'} className="text-[9px] font-black uppercase tracking-widest rounded-lg px-2">
                                  {event.status}
                               </Badge>
                            </td>
                            <td className="py-4 px-6 text-right">
                               <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleOpenEventModal(event)}><Pencil className="w-4 h-4" /></Button>
                               </div>
                            </td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             </div>
           </Card>
        </section>
      )}

      {/* Venue Modal */}
      <Modal mode="slide" isOpen={isVenueModalOpen} onClose={() => setIsVenueModalOpen(false)} title={editingVenue ? 'Edit Venue' : 'Register New Venue'} size="lg">
         <form onSubmit={(e) => { e.preventDefault(); venueMutation.mutate(venueFormData); }} className="p-1 space-y-6">
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Venue Name</Label>
                  <Input value={venueFormData.name} onChange={e => setVenueFormData({...venueFormData, name: e.target.value})} placeholder="e.g. Grand Ballroom" required className="font-bold h-11" />
               </div>
               <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Max Capacity</Label>
                  <Input type="number" value={venueFormData.capacity} onChange={e => setVenueFormData({...venueFormData, capacity: parseInt(e.target.value)})} required className="font-bold h-11" />
               </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Base Rental Rate ($)</Label>
                  <Input type="number" value={venueFormData.baseRate} onChange={e => setVenueFormData({...venueFormData, baseRate: e.target.value})} placeholder="0.00" required className="font-black h-11 border-blue-500/30 bg-blue-500/5 text-blue-400" />
               </div>
               <div className="flex items-center gap-3 mt-8 ml-4">
                  <input type="checkbox" checked={venueFormData.isActive} onChange={e => setVenueFormData({...venueFormData, isActive: e.target.checked})} className="w-4 h-4 rounded border-border" id="venueActive" />
                  <Label htmlFor="venueActive" className="text-xs font-black uppercase tracking-widest cursor-pointer">Active Terminal</Label>
               </div>
            </div>
            <div className="space-y-2">
               <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Amenities</Label>
               <div className="flex gap-2">
                  <Input
                    value={newAmenity}
                    onChange={e => setNewAmenity(e.target.value)}
                    onKeyPress={e => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      const value = newAmenity.trim();
                      if (!value) return;
                      setVenueFormData(prev => ({ ...prev, amenities: [...prev.amenities, value] }));
                      setNewAmenity('');
                    }}
                    placeholder="Type amenity and press Enter"
                    className="font-medium h-10"
                  />
                  <Button type="button" onClick={() => {
                    const value = newAmenity.trim();
                    if (!value) return;
                    setVenueFormData(prev => ({ ...prev, amenities: [...prev.amenities, value] }));
                    setNewAmenity('');
                  }} variant="primary" className="h-10 px-6 font-bold uppercase tracking-widest text-[10px]">Add</Button>
               </div>
               <div className="flex flex-wrap gap-2 p-3 bg-bg-dark border border-border rounded-xl">
                  {venueFormData.amenities.map((a, i) => (
                    <Badge key={i} className="bg-blue-500/10 text-blue-400 border-blue-500/20 px-2.5 py-1 flex items-center gap-1.5 font-bold">
                       {a} <X className="w-3 h-3 cursor-pointer" onClick={() => setVenueFormData({...venueFormData, amenities: venueFormData.amenities.filter((_, idx) => idx !== i)})} />
                    </Badge>
                  ))}
               </div>
            </div>
            <div className="flex justify-end gap-3 pt-6 border-t border-border">
               <Button type="submit" variant="primary" isLoading={venueMutation.isPending} className="px-10 font-black uppercase tracking-widest text-[10px]">Save Venue</Button>
            </div>
         </form>
      </Modal>

      {/* Event Modal */}
      <Modal mode="slide" isOpen={isEventModalOpen} onClose={() => setIsEventModalOpen(false)} title={editingEvent ? 'Update Event Booking' : 'New Event Booking'} size="lg">
         <form onSubmit={(e) => { e.preventDefault(); eventMutation.mutate(eventFormData); }} className="p-1 space-y-6">
            <div className="space-y-4">
               <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">
                  <Plus className="w-3 h-3" /> Event Identity
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                     <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Event Name</Label>
                     <Input value={eventFormData.eventName} onChange={e => setEventFormData({...eventFormData, eventName: e.target.value})} placeholder="e.g. Smith Wedding" required className="font-bold h-11" />
                  </div>
                  <div className="space-y-2">
                     <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Select Venue</Label>
                     <select className="w-full bg-bg-dark border border-border rounded-xl px-4 h-11 text-sm font-bold outline-none appearance-none" value={eventFormData.venueId} onChange={e => setEventFormData({...eventFormData, venueId: e.target.value})} required>
                        <option value="">Choose Venue</option>
                        {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                     </select>
                  </div>
               </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-border/40">
               <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-red-400">
                  <Users className="w-3 h-3" /> Customer Information
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                     <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Customer Name</Label>
                     <Input value={eventFormData.customerName} onChange={e => setEventFormData({...eventFormData, customerName: e.target.value})} placeholder="Full name" required className="font-bold" />
                  </div>
                  <div className="space-y-2">
                     <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Contact Phone</Label>
                     <Input value={eventFormData.customerPhone} onChange={e => setEventFormData({...eventFormData, customerPhone: e.target.value})} placeholder="+0-000-000-0000" className="font-mono font-bold" />
                  </div>
               </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-border/40">
               <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-purple-400">
                  <Clock className="w-3 h-3" /> Schedule & Guests
               </div>
               <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                     <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Event Date</Label>
                     <Input type="date" value={eventFormData.eventDate} onChange={e => setEventFormData({...eventFormData, eventDate: e.target.value})} required className="font-bold" />
                  </div>
                  <div className="space-y-2">
                     <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Start Time</Label>
                     <Input type="time" value={eventFormData.eventTime} onChange={e => setEventFormData({...eventFormData, eventTime: e.target.value})} required className="font-bold" />
                  </div>
                  <div className="space-y-2">
                     <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Guest Count</Label>
                     <Input type="number" value={eventFormData.guestsCount} onChange={e => setEventFormData({...eventFormData, guestsCount: e.target.value})} placeholder="0" className="font-bold" />
                  </div>
               </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-border/40">
               <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-green-400">
                  <DollarSign className="w-3 h-3" /> Financial Details
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                     <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Package Amount ($)</Label>
                     <Input type="number" value={eventFormData.totalAmount} onChange={e => setEventFormData({...eventFormData, totalAmount: e.target.value})} placeholder="0.00" required className="font-black border-blue-500/30 bg-blue-500/5 text-blue-400" />
                  </div>
                  <div className="space-y-2">
                     <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Advance Paid ($)</Label>
                     <Input type="number" value={eventFormData.depositAmount} onChange={e => setEventFormData({...eventFormData, depositAmount: e.target.value})} placeholder="0.00" required className="font-black border-green-500/30 bg-green-500/5 text-green-500" />
                  </div>
               </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-border mt-4">
               <Button type="submit" variant="primary" isLoading={eventMutation.isPending} className="px-10 font-black uppercase tracking-widest text-[10px]">Confirm Booking</Button>
            </div>
         </form>
      </Modal>
    </div>
  );
}
