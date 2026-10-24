import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Check, X, FileText } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function OfflineRequests() {
  const { data: requests, isLoading, refetch } = useQuery({
    queryKey: ['superadmin-offline-requests'],
    queryFn: () => api.get('/superadmin/offline-requests').then((r) => r.data.data ?? []).catch(() => []),
  });

  const handleAction = async (id: number, action: 'approve' | 'reject') => {
    try {
      await api.put(`/superadmin/offline-requests/${id}`, {
        status: action === 'approve' ? 'approved' : 'rejected'
      });
      toast.success(`Request ${action}d!`);
      refetch();
    } catch {
      toast.error('Failed to process request');
    }
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Offline Requests</h1>
          <p className="text-sm text-text-muted mt-1">Manual payment approvals</p>
        </div>
      </div>

      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted bg-bg-tertiary/50">
                <th className="text-left py-3 px-5 font-medium">Restaurant</th>
                <th className="text-left py-3 px-5 font-medium">Package</th>
                <th className="text-left py-3 px-5 font-medium">Cycle</th>
                <th className="text-left py-3 px-5 font-medium">Payment By</th>
                <th className="text-left py-3 px-5 font-medium">Status</th>
                <th className="text-left py-3 px-5 font-medium">Date</th>
                <th className="text-left py-3 px-5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="table-row">
                    {Array.from({ length: 7 }).map((_, j) => <td key={j} className="py-3 px-5"><Skeleton className="h-4 w-20" /></td>)}
                  </tr>
                ))
              ) : requests?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-text-muted">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    No offline requests found.
                  </td>
                </tr>
              ) : (
                requests?.map((r: any) => (
                  <tr key={r.id} className="table-row">
                    <td className="py-3 px-5 font-medium text-text-primary">{r.restaurant?.name || `ID: ${r.restaurantId}`}</td>
                    <td className="py-3 px-5 text-blue-400">{r.package?.name || `ID: ${r.packageId}`}</td>
                    <td className="py-3 px-5 capitalize text-text-secondary">{r.billingCycle}</td>
                    <td className="py-3 px-5 text-text-secondary">{r.paymentBy || 'N/A'}</td>
                    <td className="py-3 px-5">
                      <Badge variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-5 text-text-muted">{formatDateTime(r.createdAt)}</td>
                    <td className="py-3 px-5">
                      {r.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleAction(r.id, 'approve')} className="!bg-success/20 !text-success !border-success/30" icon={<Check className="w-3 h-3"/>}>Approve</Button>
                          <Button size="sm" variant="danger" onClick={() => handleAction(r.id, 'reject')} icon={<X className="w-3 h-3"/>}>Reject</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
