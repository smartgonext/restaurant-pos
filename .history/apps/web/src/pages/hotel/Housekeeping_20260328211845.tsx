import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Search, Calendar, User, CheckCircle2, AlertCircle, Clock, Trash2, Pencil, Filter, Brush, ClipboardList } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import api from '@/lib/api';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';

interface Task {
  id: number;
  taskDate: string;
  taskType: string;
  assignedTo: string | null;
  status: string;
  priority: string;
  notes: string | null;
  room?: { roomNumber?: string };
}

export default function Housekeeping() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Task | null>(null);
  
  const [formData, setFormData] = useState({
    roomId: '',
    taskType: 'cleaning',
    assignedTo: '',
    taskDate: date,
    priority: 'medium',
    notes: ''
  });

  const { data: roomsRes } = useQuery({
    queryKey: ['hotel', 'rooms'],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/rooms');
      return res.data;
    }
  });

  const { data: tasksRes, isLoading: tasksLoading } = useQuery({
    queryKey: ['hotel', 'housekeeping', date, statusFilter],
    queryFn: async () => {
      const res = await api.get('/restaurant/hotel/housekeeping', {
        params: {
          dateFrom: date,
          dateTo: date,
          status: statusFilter === 'all' ? undefined : statusFilter
        }
      });
      return res.data;
    }
  });

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingItem) return api.put(`/restaurant/hotel/housekeeping/${editingItem.id}`, payload);
      return api.post('/restaurant/hotel/housekeeping', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel', 'housekeeping'] });
      toast({ title: `Task ${editingItem ? 'updated' : 'created'} successfully` });
      setIsModalOpen(false);
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number, status: string }) => {
      return api.put(`/restaurant/hotel/housekeeping/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel', 'housekeeping'] });
      toast({ title: 'Task status updated' });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/restaurant/hotel/housekeeping/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel', 'housekeeping'] });
      toast({ title: 'Task deleted' });
    }
  });

  const tasks: Task[] = tasksRes?.data || [];
  const rooms = roomsRes?.data || [];

  const filteredTasks = useMemo(() => {
    if (!search) return tasks;
    const q = search.toLowerCase();
    return tasks.filter(t => 
      (t.room?.roomNumber || '').toLowerCase().includes(q) || 
      (t.assignedTo || '').toLowerCase().includes(q)
    );
  }, [tasks, search]);

  const handleOpenModal = (item?: Task) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        roomId: item.room?.roomNumber || '', // This might need the actual ID from the room object if available
        taskType: item.taskType,
        assignedTo: item.assignedTo || '',
        taskDate: item.taskDate.split('T')[0],
        priority: item.priority,
        notes: item.notes || ''
      });
    } else {
      setEditingItem(null);
      setFormData({
        roomId: '',
        taskType: 'cleaning',
        assignedTo: '',
        taskDate: date,
        priority: 'medium',
        notes: ''
      });
    }
    setIsModalOpen(true);
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high': return <Badge className="bg-red-500/10 text-red-400 border-red-500/20 font-black tracking-widest text-[9px] uppercase px-2 py-0">High</Badge>;
      case 'medium': return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 font-black tracking-widest text-[9px] uppercase px-2 py-0">Medium</Badge>;
      default: return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-black tracking-widest text-[9px] uppercase px-2 py-0">Low</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <Badge variant="success" className="text-[9px] font-black uppercase tracking-widest rounded-lg px-2 shadow-lg shadow-green-500/10">Completed</Badge>;
      case 'in_progress': return <Badge variant="info" className="text-[9px] font-black uppercase tracking-widest rounded-lg px-2 shadow-lg shadow-blue-500/10">In Progress</Badge>;
      default: return <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-widest rounded-lg px-2 shadow-lg shadow-black/10">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-card/50 backdrop-blur-md border border-border p-5 rounded-2xl shadow-xl shadow-black/10">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Brush className="w-6 h-6 text-amber-400" />
           </div>
           <div>
              <h1 className="text-2xl font-black text-text-primary tracking-tight">Housekeeping Operations</h1>
              <p className="text-sm text-text-muted mt-1 font-medium italic">Schedule and monitor room maintenance</p>
           </div>
        </div>
        <div className="flex items-center gap-3">
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                className="bg-bg-dark border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all w-full md:w-64"
                placeholder="Search staff or room..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
           </div>
           <Button onClick={() => handleOpenModal()} variant="primary" className="shadow-lg shadow-blue-500/30 font-black px-6 text-[10px] uppercase tracking-widest h-10">
              <Plus className="w-4 h-4 mr-2" /> New Task
           </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center bg-bg-card/30 p-4 rounded-xl border border-border/40">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-text-muted mr-2">
          <Filter className="w-3.5 h-3.5" /> Quick Filter:
        </div>
        <div className="flex items-center gap-2 bg-bg-dark p-1 rounded-xl border border-border/40">
           <Input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)} 
              className="h-8 w-36 text-xs font-bold border-none bg-transparent focus:ring-0" 
           />
        </div>
        <div className="flex gap-1 bg-bg-dark p-1 rounded-xl border border-border/40">
           {['all', 'pending', 'in_progress', 'completed'].map(s => (
             <button
               key={s}
               onClick={() => setStatusFilter(s)}
               className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${statusFilter === s ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-text-muted hover:text-text-primary'}`}
             >
               {s.replace('_', ' ')}
             </button>
           ))}
        </div>
      </div>

      <Card padding={false} className="overflow-hidden border-border/40 rounded-2xl shadow-xl bg-bg-card/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-dark/50 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted">
                <th className="text-left py-4 px-6 italic">Task Details</th>
                <th className="text-left py-4 px-6 italic">Personnel</th>
                <th className="text-left py-4 px-6 italic">Priority</th>
                <th className="text-left py-4 px-6 italic">Current Status</th>
                <th className="text-right py-4 px-6 italic">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {tasksLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={5} className="p-4"><Skeleton className="h-10 w-full rounded-lg" /></td></tr>
                ))
              ) : filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <div className="w-16 h-16 bg-bg-dark rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border/60">
                      <ClipboardList className="w-8 h-8 text-text-muted/50" />
                    </div>
                    <p className="text-text-muted font-bold italic">No housekeeping tasks for this period.</p>
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => (
                  <tr key={task.id} className="group hover:bg-amber-500/[0.02] transition-colors">
                    <td className="py-4 px-6">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-bg-dark border border-border flex items-center justify-center text-text-primary font-black group-hover:border-amber-500/40 transition-colors">
                             {task.room?.roomNumber || '—'}
                          </div>
                          <div>
                            <p className="font-black text-text-primary text-sm uppercase tracking-tight">{task.taskType}</p>
                            <p className="text-[10px] text-text-muted mt-0.5 font-mono italic">{task.notes || 'No instructions provided.'}</p>
                          </div>
                       </div>
                    </td>
                    <td className="py-4 px-6">
                       <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center">
                             <User className="w-3 h-3 text-blue-400" />
                          </div>
                          <span className="text-xs font-bold text-text-secondary">{task.assignedTo || 'Unassigned'}</span>
                       </div>
                    </td>
                    <td className="py-4 px-6">
                       {getPriorityBadge(task.priority)}
                    </td>
                    <td className="py-4 px-6">
                       <div className="flex items-center gap-3">
                          {getStatusBadge(task.status)}
                          {task.status !== 'completed' && (
                             <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-6 w-6 rounded-full hover:bg-green-500/10 text-green-500/40 hover:text-green-500"
                                onClick={() => updateStatusMutation.mutate({ id: task.id, status: task.status === 'pending' ? 'in_progress' : 'completed' })}
                             >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                             </Button>
                          )}
                       </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                       <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-400" onClick={() => handleOpenModal(task)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-500/10 hover:text-red-400" onClick={() => deleteMutation.mutate(task.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                       </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? 'Edit Task Assignment' : 'New Housekeeping Assignment'}
        size="md"
      >
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(formData); }} className="p-1 space-y-6">
           <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                 <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Target Room <span className="text-red-500">*</span></Label>
                 <select
                    className="w-full bg-bg-dark border border-border rounded-xl px-4 h-11 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none transition-all cursor-pointer"
                    value={formData.roomId}
                    onChange={e => setFormData({ ...formData, roomId: e.target.value })}
                    required
                 >
                   <option value="">Select Room</option>
                   {rooms.map((r: any) => <option key={r.id} value={r.id.toString()}>Room {r.roomNumber}</option>)}
                 </select>
              </div>
              <div className="space-y-2">
                 <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Task Category</Label>
                 <select
                    className="w-full bg-bg-dark border border-border rounded-xl px-4 h-11 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none transition-all cursor-pointer"
                    value={formData.taskType}
                    onChange={e => setFormData({ ...formData, taskType: e.target.value })}
                 >
                   <option value="cleaning">Standard Cleaning</option>
                   <option value="inspection">Room Inspection</option>
                   <option value="turn_down">Turn Down Service</option>
                   <option value="maintenance">Maintenance Repair</option>
                 </select>
              </div>
           </div>

           <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                 <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Assigned Personnel</Label>
                 <Input
                    value={formData.assignedTo}
                    onChange={e => setFormData({ ...formData, assignedTo: e.target.value })}
                    placeholder="Enter staff name"
                    className="font-bold h-11"
                 />
              </div>
              <div className="space-y-2">
                 <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Priority Level</Label>
                 <select
                    className="w-full bg-bg-dark border border-border rounded-xl px-4 h-11 text-sm font-bold text-text-primary outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none transition-all cursor-pointer"
                    value={formData.priority}
                    onChange={e => setFormData({ ...formData, priority: e.target.value })}
                 >
                   <option value="low">Low Priority</option>
                   <option value="medium">Medium Priority</option>
                   <option value="high">High Priority</option>
                 </select>
              </div>
           </div>

           <div className="space-y-2">
             <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Task Schedule Date</Label>
             <Input 
                type="date" 
                value={formData.taskDate} 
                onChange={e => setFormData({ ...formData, taskDate: e.target.value })} 
                className="font-bold h-11"
             />
           </div>

           <div className="space-y-2">
             <Label className="text-[10px] uppercase font-black tracking-widest text-text-muted">Special Instructions</Label>
             <textarea
               className="w-full h-24 bg-bg-dark border border-border rounded-xl p-4 text-text-primary text-sm focus:ring-2 focus:ring-blue-500/50 transition-all outline-none font-medium leading-relaxed italic"
               value={formData.notes}
               onChange={e => setFormData({ ...formData, notes: e.target.value })}
               placeholder="Additional details for the staff..."
             />
           </div>

           <div className="flex justify-end gap-3 pt-6 border-t border-border mt-4">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} className="font-black uppercase tracking-widest text-[10px]">Cancel</Button>
              <Button type="submit" variant="primary" isLoading={mutation.isPending} className="px-10 font-black uppercase tracking-widest text-[10px]">
                {editingItem ? 'Update Assignment' : 'Create Assignment'}
              </Button>
           </div>
        </form>
      <Modal
        mode="slide"
    </div>
  );
}
