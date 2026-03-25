import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Users, Shield } from 'lucide-react';
import { formatDateTime, getInitials } from '@/lib/utils';
import api from '@/lib/api';

export default function Members() {
  const { data: members, isLoading } = useQuery({
    queryKey: ['superadmin-members'],
    queryFn: () => api.get('/superadmin/members').then((r) => r.data.data).catch(() => []),
  });

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">SuperAdmin Members</h1>
          <p className="text-sm text-text-muted mt-1">Manage system administrators</p>
        </div>
      </div>

      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted bg-bg-tertiary/50">
                <th className="text-left py-3 px-5 font-medium">User</th>
                <th className="text-left py-3 px-5 font-medium">Email</th>
                <th className="text-left py-3 px-5 font-medium">Role</th>
                <th className="text-left py-3 px-5 font-medium">Created On</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="table-row">
                    {Array.from({ length: 4 }).map((_, j) => <td key={j} className="py-3 px-5"><Skeleton className="h-4 w-20" /></td>)}
                  </tr>
                ))
              ) : members?.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-text-muted">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    No members found.
                  </td>
                </tr>
              ) : (
                members?.map((m: any) => (
                  <tr key={m.id} className="table-row">
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center">
                          {getInitials(m.name)}
                        </div>
                        <span className="font-medium text-text-primary">{m.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-5 text-text-secondary">{m.email}</td>
                    <td className="py-3 px-5">
                      <Badge variant="info" className="flex items-center w-fit gap-1">
                        <Shield className="w-3 h-3" />
                        {m.role}
                      </Badge>
                    </td>
                    <td className="py-3 px-5 text-text-muted">{formatDateTime(m.createdAt)}</td>
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
