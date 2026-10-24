import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Search, Calendar, User, ShieldAlert, FileText, Download } from 'lucide-react';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { format } from 'date-fns';

interface AuditLog {
  id: number;
  action: string;
  reason: string;
  referenceId: string;
  details: any;
  createdAt: string;
  terminalId?: number;
}

export default function AuditLogReport() {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState('today');

  const { data: logs = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ['audit-logs', dateRange],
    queryFn: async () => {
      // Stubbing API endpoint, assuming user has built the backend for this or will build it
      const { data } = await axios.get(`/api/restaurant/reports/audit-logs?range=${dateRange}`);
      return data.data;
    },
  });

  const filteredLogs = logs.filter(log => 
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) || 
    log.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.referenceId.includes(searchTerm)
  );

  const exportRows = filteredLogs.map((log) => ({
    Timestamp: format(new Date(log.createdAt), 'dd MMM yyyy, HH:mm'),
    Action: log.action,
    Reference: log.referenceId,
    Details: log.details ? JSON.stringify(log.details) : '',
    Terminal: log.terminalId ?? '',
    Reason: log.reason || '',
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-red-500" /> Security & Audit Logs
          </h1>
          <p className="text-slate-500 text-sm mt-1">Track high-privilege actions like item deletions and quantity modifications.</p>
        </div>
        <ExportDropdown
          data={exportRows}
          filename="audit-log-report"
          title="Security & Audit Logs"
          subtitle={`Range: ${dateRange}`}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by action, reason, or reference ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
        <div className="relative">
          <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none transition-all"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7days">Last 7 Days</option>
            <option value="last30days">Last 30 Days</option>
          </select>
        </div>
      </div>

      <div className="bg-white border text-left border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                <th className="py-3 px-4 text-left font-medium w-48">Timestamp</th>
                <th className="py-3 px-4 text-left font-medium">Action</th>
                <th className="py-3 px-4 text-left font-medium">Token/Ref</th>
                <th className="py-3 px-4 text-left font-medium">Details</th>
                <th className="py-3 px-4 text-left font-medium w-64">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent flex items-center justify-center rounded-full mx-auto mb-2"></div>
                    Loading audit logs...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500 flex flex-col items-center">
                    <ShieldAlert className="w-12 h-12 text-slate-300 mb-3 mx-auto" />
                    No audit logs found for the selected view.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 text-slate-600">
                      {format(new Date(log.createdAt), 'dd MMM yyyy, HH:mm')}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${
                        log.action.includes('DELETE') ? 'bg-red-100 text-red-700' :
                        log.action.includes('EDIT') ? 'bg-yellow-100 text-yellow-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {log.action.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{log.referenceId}</div>
                      {log.terminalId && <div className="text-xs text-slate-500 mt-0.5">Terminal #{log.terminalId}</div>}
                    </td>
                    <td className="py-3 px-4">
                      {log.details ? (
                        <div className="space-y-1 text-slate-600 text-xs">
                          {log.details.menuItemName && <div><span className="font-medium">Item:</span> {log.details.menuItemName}</div>}
                          {log.details.oldQty !== undefined && <div><span className="font-medium">Change:</span> {log.details.oldQty} → {log.details.newQty}</div>}
                          {log.details.staffUsername && <div><span className="font-medium">Staff:</span> {log.details.staffUsername}</div>}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">No details</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 italic">"{log.reason}"</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
