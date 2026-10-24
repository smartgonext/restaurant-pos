import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Search, Download, ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { useToast } from '@/components/inventory/ToastProvider';

interface Props {
  quickAction?: string | null;
  onClearQuickAction?: () => void;
}

export default function StockMovementsPage({ quickAction, onClearQuickAction }: Props) {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('All');
  const [selectedBranch, setSelectedBranch] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (quickAction === 'add-movement') {
      showToast('info', 'Record Movement', 'To record a stock movement, select "+ Stock" on any raw material row in the Raw Materials catalog.');
      onClearQuickAction?.();
    }
  }, [quickAction]);

  // Queries
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['inv-movements'],
    queryFn: () => api.get('/restaurant/inventory/movements').then(r => r.data.data).catch(() => [])
  });
  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => api.get('/restaurant/branches').then(r => r.data.data).catch(() => []) });

  const getMovementTypeStyle = (type: string) => {
    switch (type) {
      case 'purchase': return { label: 'PURCHASE', bg: 'rgba(16,185,129,0.1)', color: '#10b981' };
      case 'sale': return { label: 'SALE', bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' };
      case 'waste': return { label: 'WASTE', bg: 'rgba(239,68,68,0.1)', color: '#ef4444' };
      case 'transfer': return { label: 'TRANSFER', bg: 'rgba(167,139,250,0.1)', color: '#a78bfa' };
      case 'adjust': return { label: 'ADJUST', bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' };
      case 'damage': return { label: 'DAMAGE', bg: 'rgba(249,115,22,0.1)', color: '#f97316' };
      default: return { label: type.toUpperCase(), bg: 'rgba(255,255,255,0.05)', color: 'var(--text)' };
    }
  };

  const filteredMovements = movements.filter((m: any) => {
    const sTerm = search.toLowerCase().trim();
    const itemMatch = !sTerm || m.inventoryItem?.name?.toLowerCase().includes(sTerm);

    const typeMatch = selectedType === 'All' || m.type === selectedType;
    const branchMatch = selectedBranch === 'All' ||
      String(m.sourceBranchId) === selectedBranch ||
      String(m.destBranchId) === selectedBranch;

    let dateMatch = true;
    const mTime = new Date(m.createdAt).getTime();
    if (dateFrom) {
      dateMatch = dateMatch && mTime >= new Date(dateFrom).getTime();
    }
    if (dateTo) {
      dateMatch = dateMatch && mTime <= new Date(dateTo).setHours(23, 59, 59, 999);
    }

    return itemMatch && typeMatch && branchMatch && dateMatch;
  });

  // Calculate Aggregations
  let totalIn = 0;
  let totalOut = 0;
  filteredMovements.forEach((m: any) => {
    const qty = Number(m.quantity || 0);
    if (['purchase', 'transfer'].includes(m.type)) {
      totalIn += qty;
    } else {
      totalOut += qty;
    }
  });
  const netShift = totalIn - totalOut;

  const handleExport = () => {
    const csvContent = "data:text/csv;charset=utf-8,"
      + ["Timestamp,Item Name,Action Type,Quantity Change,Remarks,Reference ID"].join(",") + "\n"
      + filteredMovements.map((m: any) => {
          const change = ['purchase', 'transfer'].includes(m.type) ? `+${m.quantity}` : `-${m.quantity}`;
          return `"${new Date(m.createdAt).toLocaleString()}","${m.inventoryItem?.name || ''}","${m.type.toUpperCase()}",${change},"${m.note || ''}","${m.id}"`;
        }).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `stock_movements_audit_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Title Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Stock Movement Audit Trail</h1>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>Trace comprehensive historical audit logs of manual adjustments, receipts and internal branch movements</p>
        </div>
        <button onClick={handleExport}
          style={{
            height: 34, padding: '0 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--text)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6
          }}>
          <Download size={14} /> Export Audit Log
        </button>
      </div>

      {/* SUMMARY BANNER CARD ROWS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {[
          { label: 'Cumulative Inward Stock (+)', val: `${totalIn.toFixed(1)} units`, color: '#10b981', icon: <ArrowUpRight size={18} /> },
          { label: 'Cumulative Outward Deductions (-)', val: `${totalOut.toFixed(1)} units`, color: '#ef4444', icon: <ArrowDownLeft size={18} /> },
          { label: 'Period Net Volumetric Delta', val: `${netShift >= 0 ? '+' : ''}${netShift.toFixed(1)} units`, color: netShift >= 0 ? '#10b981' : '#ef4444' }
        ].map((card, idx) => (
          <div key={idx} style={{
            background: 'rgba(var(--bg-secondary-rgb), 0.5)', border: '1px solid var(--border)', borderRadius: 10,
            padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{card.label}</span>
              <span style={{ fontSize: 18, fontWeight: 900, color: card.color }}>{card.val}</span>
            </div>
            {card.icon && <div style={{ color: card.color }}>{card.icon}</div>}
          </div>
        ))}
      </div>

      {/* TOOLBAR FILTERS */}
      <div style={{
        background: 'rgba(var(--bg-secondary-rgb), 0.5)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by material name..."
            style={{ width: '100%', height: 32, paddingLeft: 30, paddingRight: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 11, outline: 'none' }} />
        </div>

        {/* Action Type Filter */}
        <select value={selectedType} onChange={e => setSelectedType(e.target.value)}
          style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', color: 'var(--text)', fontSize: 11, outline: 'none' }}>
          <option value="All">All Actions</option>
          {['purchase', 'sale', 'waste', 'transfer', 'adjust', 'damage'].map(st => (
            <option key={st} value={st}>{st.toUpperCase()}</option>
          ))}
        </select>

        {/* Branch Filter */}
        <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
          style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', color: 'var(--text)', fontSize: 11, outline: 'none' }}>
          <option value="All">All Branches</option>
          {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        {/* Date Pickers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
          <span>From</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 8px', color: 'var(--text)', outline: 'none' }} />
          <span>To</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ height: 32, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 8px', color: 'var(--text)', outline: 'none' }} />
        </div>
      </div>

      {/* DATA LOGGER TABLE */}
      {isLoading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Loading movement logs...</div>
      ) : filteredMovements.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 10 }}>No movement records match selected criteria.</div>
      ) : (
        <div style={{
          background: 'rgba(var(--bg-secondary-rgb), 0.3)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ width: 30 }}></th>
                {['Date/Time Logged', 'Material Item', 'Action Type', 'Volumetric Qty Shift', 'Remarks / Note'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 10 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredMovements.map((m: any) => {
                const style = getMovementTypeStyle(m.type);
                const isInward = ['purchase', 'transfer'].includes(m.type);
                const isExpanded = expandedId === m.id;

                return (
                  <>
                    <tr key={m.id} style={{ borderBottom: '1px solid rgba(42,45,62,0.5)', cursor: 'pointer' }} className="table-row">
                      <td style={{ padding: '10px 14px', textAlign: 'center' }} onClick={() => setExpandedId(isExpanded ? null : m.id)}>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{new Date(m.createdAt).toLocaleString()}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--text)' }}>{m.inventoryItem?.name}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-flex', padding: '2px 8px', borderRadius: 20, fontSize: 8, fontWeight: 800,
                          background: style.bg, color: style.color
                        }}>{style.label}</span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 800, color: isInward ? '#10b981' : '#ef4444', fontFamily: 'monospace' }}>
                        {isInward ? '+' : '-'}{Number(m.quantity || 0).toFixed(1)} {m.inventoryItem?.unit?.symbol}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{m.note || '—'}</td>
                    </tr>

                    {/* Row Expanded Audit Logs */}
                    {isExpanded && (
                      <tr style={{ background: 'rgba(0,0,0,0.12)' }}>
                        <td colSpan={6} style={{ padding: '12px 18px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 10 }}>
                            <div style={{ display: 'flex', gap: 24 }}>
                              <div>
                                <span style={{ color: 'var(--text-muted)' }}>Transaction Reference ID:</span>
                                <span style={{ color: 'var(--text)', marginLeft: 6, fontFamily: 'monospace' }}>{m.id}</span>
                              </div>
                              {m.sourceBranchId && (
                                <div>
                                  <span style={{ color: 'var(--text-muted)' }}>Source Location:</span>
                                  <span style={{ color: 'var(--text)', marginLeft: 6 }}>Branch #{m.sourceBranchId}</span>
                                </div>
                              )}
                              {m.destBranchId && (
                                <div>
                                  <span style={{ color: 'var(--text-muted)' }}>Destination Location:</span>
                                  <span style={{ color: 'var(--text)', marginLeft: 6 }}>Branch #{m.destBranchId}</span>
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: 24, marginTop: 4 }}>
                              <div>
                                <span style={{ color: 'var(--text-muted)' }}>Stock Before Action:</span>
                                <span style={{ color: 'var(--text)', marginLeft: 6, fontFamily: 'monospace' }}>{Number(m.beforeQuantity || 0).toFixed(1)} units</span>
                              </div>
                              <div>
                                <span style={{ color: 'var(--text-muted)' }}>Stock After Action:</span>
                                <span style={{ color: 'var(--text)', marginLeft: 6, fontFamily: 'monospace' }}>{Number(m.afterQuantity || 0).toFixed(1)} units</span>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
