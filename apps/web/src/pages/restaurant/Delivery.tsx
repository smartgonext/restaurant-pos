import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { Search, MapPin, Navigation, Bike, Plus, AlertCircle, UserPlus, Sparkles, Phone, CheckCircle2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';

export default function Delivery() {
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [partnerFilter, setPartnerFilter] = useState<'All' | 'In-House' | 'External'>('All');
  const [showAddExecModal, setShowAddExecModal] = useState(false);
  const [showFleetModal, setShowFleetModal] = useState(false);
  const [assigningOrderId, setAssigningOrderId] = useState<number | null>(null);
  const [execForm, setExecForm] = useState({ name: '', phone: '', vehicleNumber: '' });
  const [seeding, setSeeding] = useState(false);

  const { data: ordersRes, isLoading: ordersLoading, refetch: refetchOrders } = useQuery({
    queryKey: ['delivery-orders'],
    queryFn: () => api.get('/restaurant/orders', { params: { type: 'delivery' } }).then(r => r.data.data)
  });

  const { data: executivesRes = [], refetch: refetchExecutives } = useQuery({
    queryKey: ['delivery-executives'],
    queryFn: () => api.get('/restaurant/delivery-executives').then(r => r.data.data)
  });

  const handleSeedDemoData = async () => {
    setSeeding(true);
    try {
      await api.post('/restaurant/delivery-executives/seed-sample-data');
      toast.success('Sample delivery executives and orders seeded');
      refetchOrders();
      refetchExecutives();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to seed sample delivery data');
    } finally {
      setSeeding(false);
    }
  };

  const addExecutive = async () => {
    try {
      if (!execForm.name) { toast.error('Name is required'); return; }
      await api.post('/restaurant/delivery-executives', {
        name: execForm.name,
        phone: execForm.phone || undefined,
        vehicleNumber: execForm.vehicleNumber || undefined
      });
      toast.success('Delivery executive added successfully');
      queryClient.invalidateQueries({ queryKey: ['delivery-executives'] });
      setShowAddExecModal(false);
      setExecForm({ name: '', phone: '', vehicleNumber: '' });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to add executive');
    }
  };

  const assignExecutive = async (orderId: number, executiveId: number) => {
    try {
      await api.put(`/restaurant/orders/${orderId}`, {
        deliveryExecutiveId: executiveId,
        status: 'out_for_delivery'
      });
      toast.success('Delivery assigned successfully');
      setAssigningOrderId(null);
      refetchOrders();
      refetchExecutives();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to assign executive');
    }
  };

  const markDelivered = async (orderId: number) => {
    try {
      await api.put(`/restaurant/orders/${orderId}`, { status: 'delivered' });
      toast.success('Order marked as delivered');
      refetchOrders();
    } catch (err: any) {
      toast.error('Failed to update status');
    }
  };

  const orders = ordersRes || [];
  const activeDeliveries = orders.filter((o: any) => o.status !== 'delivered' && o.status !== 'cancelled');

  const filteredDeliveries = activeDeliveries.filter((order: any) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !searchQuery || 
      (order.orderNumber && order.orderNumber.toLowerCase().includes(q)) ||
      (order.customer?.name && order.customer.name.toLowerCase().includes(q)) ||
      (order.customer?.address && order.customer.address.toLowerCase().includes(q)) ||
      (order.deliveryExecutive?.name && order.deliveryExecutive.name.toLowerCase().includes(q));

    const execName = order.deliveryExecutive?.name || '';
    let matchPartner = true;
    if (partnerFilter === 'In-House') {
      matchPartner = !execName || execName.toLowerCase().includes('in-house') || !execName.toLowerCase().includes('dunzo');
    } else if (partnerFilter === 'External') {
      matchPartner = execName.toLowerCase().includes('external') || execName.toLowerCase().includes('dunzo') || execName.toLowerCase().includes('swiggy') || execName.toLowerCase().includes('zomato');
    }

    return matchSearch && matchPartner;
  });

  if (ordersLoading) return <div className="p-8 text-center text-text-muted">Loading delivery operations...</div>;

  return (
    <div className="space-y-4 animate-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Delivery Management</h1>
          <p className="text-xs text-text-muted mt-1">Track external and in-house delivery partners in real time</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportDropdown data={orders} filename="deliveries" title="Delivery Orders" size="sm" />
          <Button size="sm" variant="secondary" icon={<Bike className="w-4 h-4" />} onClick={() => setShowFleetModal(true)}>Fleet Status</Button>
          <Button size="sm" icon={<UserPlus className="w-4 h-4" />} onClick={() => setShowAddExecModal(true)}>Add Executive</Button>
          <button
            onClick={handleSeedDemoData}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
            {seeding ? 'Seeding...' : 'Seed Demo Deliveries'}
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Active Deliveries</span>
          <span className="text-2xl font-bold text-text-primary">{activeDeliveries.length}</span>
        </Card>
        <Card className="flex flex-col gap-1 bg-blue-500/5 border-blue-500/20">
          <span className="text-xs font-medium text-blue-400 uppercase tracking-wider">Executives Online</span>
          <span className="text-2xl font-bold text-text-primary">{(executivesRes || []).length}</span>
        </Card>
      </div>

      {/* Main Delivery Table & Controls */}
      <Card padding={false} className="border-border/50">
        <div className="p-3 border-b border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input w-full pl-9 h-9 text-sm"
              placeholder="Search order ID or delivery partner..."
            />
          </div>
          <div className="flex bg-bg-tertiary rounded-lg p-1 border border-border">
            {(['All', 'In-House', 'External'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setPartnerFilter(tab)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  partnerFilter === tab
                    ? 'bg-bg-secondary text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 divide-y divide-border/50">
          {filteredDeliveries.map((order: any) => (
            <div key={order.id} className="p-4 flex flex-col lg:flex-row gap-4 lg:items-center justify-between hover:bg-bg-hover/20 transition-colors">
              <div className="flex gap-4 items-center flex-1">
                <div className="p-2.5 bg-bg-tertiary rounded-lg border border-border shrink-0">
                  <Bike className={`w-5 h-5 ${order.status === 'out_for_delivery' ? 'text-blue-400' : 'text-warning'}`} />
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-text-primary text-base">{order.orderNumber}</h3>
                    <Badge variant={order.status === 'out_for_delivery' ? 'info' : 'warning'} size="sm" className="capitalize">
                      {(order.status || 'placed').replace('_', ' ')}
                    </Badge>
                    <span className="text-xs font-semibold text-emerald-400">₹{Number(order.total || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-purple-400" />
                      <strong>{order.customer?.name || 'Walk-in Customer'}</strong>
                      {order.customer?.address ? ` • ${order.customer.address}` : ''}
                    </span>
                    {order.customer?.phone && (
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {order.customer.phone}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 lg:pl-4 lg:border-l border-border/50">
                <div className="text-right space-y-0.5 min-w-[120px]">
                  <p className="font-medium text-text-primary text-xs">{order.deliveryExecutive?.name || 'Unassigned'}</p>
                  <p className="text-[10px] text-text-muted">{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>

                {!order.deliveryExecutiveId ? (
                  <div className="relative">
                    <Button
                      variant="primary"
                      size="sm"
                      className="h-8 text-xs"
                      icon={<Plus className="w-3 h-3" />}
                      onClick={() => setAssigningOrderId(assigningOrderId === order.id ? null : order.id)}
                    >
                      Assign
                    </Button>
                    {assigningOrderId === order.id && (
                      <div className="absolute right-0 top-10 z-20 w-56 bg-bg-secondary border border-border rounded-lg shadow-xl p-2 space-y-1">
                        <p className="text-[10px] font-bold text-text-muted uppercase px-2 py-1">Select Executive</p>
                        {executivesRes.map((exec: any) => (
                          <button
                            key={exec.id}
                            onClick={() => assignExecutive(order.id, exec.id)}
                            className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-bg-hover text-text-primary flex items-center justify-between"
                          >
                            <span>{exec.name}</span>
                            <span className="text-[10px] text-text-muted">{exec.status}</span>
                          </button>
                        ))}
                        {executivesRes.length === 0 && (
                          <p className="text-xs text-text-muted p-2">No executives available.</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" className="h-8 text-xs" icon={<Navigation className="w-3 h-3" />}>Track</Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-emerald-400 hover:text-emerald-300"
                      icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                      onClick={() => markDelivered(order.id)}
                    >
                      Delivered
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {filteredDeliveries.length === 0 && (
            <div className="p-10 text-center flex flex-col items-center">
              <AlertCircle className="w-10 h-10 text-text-muted/30 mb-2" />
              <p className="text-text-muted text-sm font-medium">No active deliveries match filter</p>
            </div>
          )}
        </div>
      </Card>

      {/* Fleet Status Modal */}
      <Modal open={showFleetModal} onClose={() => setShowFleetModal(false)} title="Delivery Fleet Status">
        <div className="p-4 space-y-3">
          <div className="divide-y divide-border">
            {executivesRes.map((exec: any) => (
              <div key={exec.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="font-bold text-text-primary text-sm">{exec.name}</p>
                  <p className="text-xs text-text-muted">{exec.phone || 'No phone'} {exec.vehicleNumber ? `• Vehicle: ${exec.vehicleNumber}` : ''}</p>
                </div>
                <Badge variant={exec.status === 'available' ? 'success' : 'warning'} size="sm" className="capitalize">
                  {exec.status}
                </Badge>
              </div>
            ))}
            {executivesRes.length === 0 && (
              <p className="text-xs text-text-muted py-4 text-center">No delivery executives registered yet.</p>
            )}
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={() => setShowFleetModal(false)}>Close</Button>
          </div>
        </div>
      </Modal>

      {/* Add Executive Modal */}
      <Modal open={showAddExecModal} onClose={() => setShowAddExecModal(false)} title="Add Delivery Executive">
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-bold text-text-muted block mb-1">Name</label>
            <input value={execForm.name} onChange={(e) => setExecForm({ ...execForm, name: e.target.value })} className="w-full bg-bg-dark border border-border rounded p-2 text-sm" placeholder="e.g. Suresh V" />
          </div>
          <div>
            <label className="text-xs font-bold text-text-muted block mb-1">Phone</label>
            <input value={execForm.phone} onChange={(e) => setExecForm({ ...execForm, phone: e.target.value })} className="w-full bg-bg-dark border border-border rounded p-2 text-sm" placeholder="e.g. 9876543210" />
          </div>
          <div>
            <label className="text-xs font-bold text-text-muted block mb-1">Vehicle Details (Optional)</label>
            <input value={execForm.vehicleNumber} onChange={(e) => setExecForm({ ...execForm, vehicleNumber: e.target.value })} className="w-full bg-bg-dark border border-border rounded p-2 text-sm" placeholder="e.g. TN 01 AB 1234" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddExecModal(false)}>Cancel</Button>
            <Button onClick={addExecutive} variant="primary">Save Executive</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
