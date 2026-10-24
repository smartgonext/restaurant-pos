import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import { useState } from 'react';
import api from '@/lib/api';
import { UserPlus, Truck, Search } from 'lucide-react';

export default function DeliveryExecutive() {
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const { data: executives = [], isLoading } = useQuery({
    queryKey: ['delivery-executives'],
    queryFn: () => api.get('/restaurant/delivery-executives').then(r => r.data.data),
  });

  const createExec = useMutation({
    mutationFn: (payload: any) => api.post('/restaurant/delivery-executives', payload),
    onSuccess: () => {
      toast.success('Delivery executive added');
      queryClient.invalidateQueries({ queryKey: ['delivery-executives'] });
      setVisible(false);
      setName('');
      setPhone('');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed'),
  });

  const addExecutive = () => {
    if (!name.trim()) return toast.error('Provide a name');

    createExec.mutate({ name: name.trim(), phone: phone.trim() || undefined });
  };

  return (
    <div className="space-y-4 animate-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold">Delivery Executives</h1>
          <p className="text-xs text-text-muted">Manage riders and assign orders</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" icon={<UserPlus className="w-4 h-4" />} onClick={() => setVisible(true)}>
            Add Executive
          </Button>
        </div>
      </div>

      <Card>
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Search className="w-4 h-4 text-text-muted" />
          <input className="glass-input w-full h-9 text-sm" placeholder="Search by name or id..." disabled />
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {isLoading ? (
            <p className="text-sm text-text-muted">Loading...</p>
          ) : executives.length === 0 ? (
            <p className="text-sm text-text-muted">No executives found.</p>
          ) : (
            executives.map((exec: any) => (
              <div key={exec.id} className="p-3 border border-border rounded-lg flex items-center gap-3">
                <Truck className="w-5 h-5 text-blue-500" />
                <div>
                  <strong>{exec.name}</strong>
                  <div className="text-xs text-text-muted">{exec.phone || 'No phone'}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Modal open={visible} onClose={() => setVisible(false)} title="Add Delivery Executive">
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-bold text-text-muted block mb-1">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-bg-dark border border-border rounded p-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-bold text-text-muted block mb-1">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-bg-dark border border-border rounded p-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVisible(false)}>Cancel</Button>
            <Button onClick={addExecutive}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
