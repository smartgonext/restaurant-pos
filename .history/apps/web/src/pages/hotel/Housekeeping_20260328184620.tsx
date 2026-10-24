import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { formatDate } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface Task {
  id: number;
  taskDate: string;
  taskType: string;
  assignedTo?: string;
  status: string;
  room?: { roomNumber?: string };
}

export default function Housekeeping() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState('all');
  const [roomId, setRoomId] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ roomId: '', taskType: 'cleaning', assignedTo: '', taskDate: date, priority: 'medium', notes: '' });

  const { data: roomsRes } = useQuery({
    queryKey: ['hotel-rooms-for-housekeeping'],
    queryFn: () => api.get('/restaurant/hotel/rooms').then((r) => r.data),
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hotel-housekeeping', date, status, roomId],
    queryFn: () =>
      api
        .get('/restaurant/hotel/housekeeping', {
          params: {
            dateFrom: date,
            dateTo: date,
            status: status === 'all' ? undefined : status,
            roomId: roomId === 'all' ? undefined : Number(roomId),
          },
        })
        .then((r) => r.data),
  });

  const tasks: Task[] = data?.data || [];
  const rooms = roomsRes?.data || [];

  const handleCreateTask = async () => {
    if (!form.roomId) {
      toast.error('Please select a room');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/restaurant/hotel/housekeeping', {
        roomId: Number(form.roomId),
        taskType: form.taskType,
        assignedTo: form.assignedTo || null,
        taskDate: new Date(form.taskDate),
        priority: form.priority,
        notes: form.notes || null,
      });
      toast.success('Task created');
      setShowModal(false);
      setForm({ roomId: '', taskType: 'cleaning', assignedTo: '', taskDate: date, priority: 'medium', notes: '' });
      refetch();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-text-primary">Room Housekeeping Tasks</h1>
        <Button onClick={() => setShowModal(true)}>Add Task</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[180px]" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-[160px]">
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </Select>
        <Select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="w-[170px]">
          <option value="all">All Rooms</option>
          {rooms.map((room: any) => (
            <option key={room.id} value={String(room.id)}>
              Room {room.roomNumber}
            </option>
          ))}
        </Select>
      </div>

      <div className="glass-card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-tertiary/60 text-text-muted">
            <tr>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Room</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Assigned To</th>
              <th className="text-left px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                  Loading tasks...
                </td>
              </tr>
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                  No housekeeping tasks found
                </td>
              </tr>
            ) : (
              tasks.map((task) => (
                <tr key={task.id} className="border-t border-border/50">
                  <td className="px-4 py-3">{formatDate(task.taskDate)}</td>
                  <td className="px-4 py-3">{task.room?.roomNumber || '-'}</td>
                  <td className="px-4 py-3">{task.taskType}</td>
                  <td className="px-4 py-3">{task.assignedTo || '-'}</td>
                  <td className="px-4 py-3">{task.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Housekeeping Task" size="md">
        <div className="space-y-4">
          <Select label="Room" value={form.roomId} onChange={(e) => setForm((p) => ({ ...p, roomId: e.target.value }))}>
            <option value="">Select room</option>
            {rooms.map((room: any) => (
              <option key={room.id} value={String(room.id)}>
                Room {room.roomNumber}
              </option>
            ))}
          </Select>
          <Select label="Task Type" value={form.taskType} onChange={(e) => setForm((p) => ({ ...p, taskType: e.target.value }))}>
            <option value="cleaning">Cleaning</option>
            <option value="inspection">Inspection</option>
            <option value="turn_down">Turn Down</option>
          </Select>
          <Input label="Assigned To" value={form.assignedTo} onChange={(e) => setForm((p) => ({ ...p, assignedTo: e.target.value }))} placeholder="Staff name" />
          <Input label="Task Date" type="date" value={form.taskDate} onChange={(e) => setForm((p) => ({ ...p, taskDate: e.target.value }))} />
          <Select label="Priority" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTask} loading={submitting} disabled={submitting}>
              Save Task
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
