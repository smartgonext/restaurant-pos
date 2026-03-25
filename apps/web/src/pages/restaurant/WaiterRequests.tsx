import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Bell, BellRing, Clock, CheckCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function WaiterRequests() {
  const queryClient = useQueryClient();
  const { data: requestsRes, isLoading } = useQuery({
    queryKey: ['waiter-requests'],
    queryFn: () => api.get('/restaurant/waiter-requests').then(r => r.data.data)
  });

  const attendMutation = useMutation({
    mutationFn: (id: number) => api.put(`/restaurant/waiter-requests/${id}`, { status: 'attended' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter-requests'] });
      toast.success('Request updated');
    }
  });

  const requests = requestsRes || [];

  if (isLoading) return <div className="p-8 text-center text-text-muted text-xs">Watching for requests...</div>;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            Waiter Calls 
            {requests.some((r: any) => r.status === 'pending') && (
               <BellRing className="w-4 h-4 text-danger animate-pulse" />
            )}
          </h1>
          <p className="text-xs text-text-muted mt-1">Real-time requests from customer QR menus</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {requests.map((req: any) => (
          <Card 
            key={req.id} 
            className={`border-l-2 overflow-hidden relative ${req.status === 'pending' ? 'border-danger' : 'border-success opacity-80'}`}
          >
            <div className="flex justify-between items-start mb-3">
              <div className="space-y-1">
                <Badge variant={req.status === 'pending' ? 'danger' : 'success'} size="sm" className="mb-1 text-[9px] h-4">
                  Table {req.table?.name || 'T-?'}
                </Badge>
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-text-muted" /> {req.type}
                </h3>
              </div>
            </div>

            <div className="flex justify-between items-end border-t border-border/50 pt-3 mt-1">
              <span className="text-[10px] text-text-muted flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              {req.status === 'pending' ? (
                <Button onClick={() => attendMutation.mutate(req.id)} size="sm" className="h-7 text-[10px] px-2" variant="primary">
                  Attend
                </Button>
              ) : (
                <span className="text-[10px] font-medium text-success flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Attended
                </span>
              )}
            </div>
          </Card>
        ))}

        {requests.length === 0 && (
          <div className="col-span-full py-12 text-center flex flex-col items-center border border-dashed border-border/50 rounded-xl">
            <Bell className="w-10 h-10 text-text-muted/20 mb-3" />
            <h3 className="text-sm font-medium text-text-primary">No Active Calls</h3>
            <p className="text-xs text-text-muted">Customers are served and happy.</p>
          </div>
        )}
      </div>
    </div>
  );
}
