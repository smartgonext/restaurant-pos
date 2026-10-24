import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { Bell, Clock, MapPin, CheckCircle, AlertCircle, Trash2, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export default function WaiterRequests() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  // Play notification sound
  const playNotificationSound = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800; // Hz
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  // Fetch initial waiter requests
  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await api.get('/restaurant/waiter-requests');
      if (res.data.success) {
        setRequests(res.data.data || []);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  // Socket.io listener for new waiter requests
  useEffect(() => {
    if (!socket) return;

    socket.on('new_waiter_request', (data: any) => {
      playNotificationSound();
      setRequests(prev => [data, ...prev]);
      setSelectedRequest(data);
      toast.success(`Waiter request from Table ${data.table?.name}`, {
        icon: '🔔',
        duration: 5000,
      });
    });

    return () => {
      socket.off('new_waiter_request');
    };
  }, [socket]);

  const handleMarkAttended = async (requestId: number) => {
    try {
      const res = await api.patch(`/restaurant/waiter-requests/${requestId}/attend`);
      if (res.data.success) {
        setRequests(prev => prev.filter(r => r.id !== requestId));
        setSelectedRequest(null);
        toast.success('Request marked as attended ✓');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update request');
    }
  };

  const handleDelete = async (requestId: number) => {
    try {
      const res = await api.delete(`/restaurant/waiter-requests/${requestId}`);
      if (res.data.success) {
        setRequests(prev => prev.filter(r => r.id !== requestId));
        setSelectedRequest(null);
        toast.success('Request deleted ✓');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete request');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Waiter Requests</h1>
        <p className="text-sm text-text-muted mt-1">Manage customer waiter calls in real-time</p>
      </div>

      {loading && (
        <Card className="p-8 text-center text-text-muted">
          <div className="inline-block animate-spin">🔄</div> Loading requests...
        </Card>
      )}

      {!loading && requests.length === 0 && (
        <Card className="p-8 text-center text-text-muted">
          <Bell size={32} className="mx-auto mb-2 opacity-30" />
          <p>No active waiter requests</p>
        </Card>
      )}

      {!loading && requests.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {requests.map(req => (
            <Card 
              key={req.id} 
              className={`p-4 border-l-4 ${selectedRequest?.id === req.id ? 'border-l-violet-600 bg-white/5' : 'border-l-amber-500'} cursor-pointer transition-all hover:shadow-lg`}
              onClick={() => setSelectedRequest(req)}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-bold flex items-center gap-2">
                    <MapPin size={16} className="text-amber-500" />
                    Table {req.table?.name}
                  </div>
                  <div className="text-xs text-text-muted flex items-center gap-1 mt-1">
                    <Clock size={12} /> {req.table?.area || 'Area'}
                  </div>
                </div>
                <div className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded">
                  {req.status || 'Pending'}
                </div>
              </div>

              <div className="text-xs text-text-muted mb-3">
                Requested {new Date(req.createdAt).toLocaleTimeString()}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); handleMarkAttended(req.id); }}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-xs font-medium flex items-center justify-center gap-1"
                >
                  <CheckCircle size={14} /> Mark Attended
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(req.id); }}
                  className="px-3 py-2 rounded border border-gray-700 hover:bg-white/5 text-text-muted"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Popup notification for new request */}
      {selectedRequest && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedRequest(null)} />
          <Card className="relative w-full max-w-sm p-8 text-center z-50">
            <button
              onClick={() => setSelectedRequest(null)}
              className="absolute top-4 right-4 text-text-muted hover:text-text-primary"
            >
              <X size={20} />
            </button>

            <Bell className="mx-auto mb-4 text-amber-500 animate-bounce" size={48} />
            <h2 className="text-xl font-bold text-text-primary mb-2">
              New Waiter Request
            </h2>
            <p className="text-text-muted mb-4">
              Table <strong className="text-text-primary">{selectedRequest.table?.name}</strong> in{' '}
              <strong className="text-text-primary">{selectedRequest.table?.area || 'Area'}</strong>
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => { handleMarkAttended(selectedRequest.id); playNotificationSound(); }}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
              >
                <CheckCircle size={18} /> Mark Attended
              </button>
              <button
                onClick={() => setSelectedRequest(null)}
                className="fb-1 bg-white/10 hover:bg-white/20 text-text-primary py-3 rounded-lg font-semibold"
              >
                Close
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
