import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { DatePreset, getDateRangeForPreset, toApiDateTimeRange } from '@/lib/dateRanges';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, CartesianGrid } from 'recharts';
import { ShieldAlert, RefreshCcw, Factory, Truck, Sparkles } from 'lucide-react';

const COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'];

export default function ProductionReport() {
  const [activeTab, setActiveTab] = useState<'overview' | 'transit' | 'discrepancies'>('overview');
  const [dateRange, setDateRange] = useState<DatePreset>('Current Month');
  const [startDate, setStartDate] = useState(getDateRangeForPreset('Current Month').startDate);
  const [endDate, setEndDate] = useState(getDateRangeForPreset('Current Month').endDate);

  useEffect(() => {
    if (dateRange === 'Custom') return;
    const next = getDateRangeForPreset(dateRange);
    setStartDate(next.startDate);
    setEndDate(next.endDate);
  }, [dateRange]);

  const { dateFrom, dateTo } = useMemo(() => toApiDateTimeRange(startDate, endDate), [startDate, endDate]);

  // Queries
  const { data: rawRuns = [], isLoading: loadingRuns, refetch: refetchRuns } = useQuery({
    queryKey: ['production-runs', startDate, endDate],
    queryFn: () => api.get('/restaurant/production/runs', { params: { dateFrom, dateTo } }).then(r => r.data.data || [])
  });

  const { data: rawTransfers = [], isLoading: loadingTransfers, refetch: refetchTransfers } = useQuery({
    queryKey: ['production-transfers', startDate, endDate],
    queryFn: () => api.get('/restaurant/production/transfers', { params: { dateFrom, dateTo } }).then(r => r.data.data || [])
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/restaurant/branches').then(r => r.data.data || []).catch(() => [])
  });

  const runs = Array.isArray(rawRuns) ? rawRuns : [];
  const transfers = Array.isArray(rawTransfers) ? rawTransfers : [];

  // Cost Computations with robust field normalization
  const totalMaterialCost = runs.reduce((s: number, r: any) => {
    const totCost = Number(r.totalCost ?? r.costOfProduction ?? 0);
    const ovhCost = Number(r.overheadCost ?? 0);
    const matCost = r.materialCost !== undefined ? Number(r.materialCost) : Math.max(0, totCost - ovhCost);
    return s + matCost;
  }, 0);

  const totalOverheadCost = runs.reduce((s: number, r: any) => s + Number(r.overheadCost ?? 0), 0);
  const totalProductionCost = runs.reduce((s: number, r: any) => s + Number(r.totalCost ?? r.costOfProduction ?? 0), 0);
  const totalYield = runs.reduce((s: number, r: any) => s + Number(r.quantity ?? r.quantityProduced ?? 0), 0);
  const totalWaste = runs.reduce((s: number, r: any) => s + Number(r.wasteQuantity ?? 0), 0);
  const averageYieldLoss = (totalYield + totalWaste) > 0 ? (totalWaste / (totalYield + totalWaste)) * 100 : 0;

  // Pie Chart Data: Material vs Overhead
  const costBreakdownData = [
    { name: 'Raw Material Cost', value: Number(totalMaterialCost.toFixed(2)) },
    { name: 'Overhead Cost', value: Number(totalOverheadCost.toFixed(2)) }
  ];

  // Bar Chart Data: Production Runs by Recipe
  const recipeVolumeMap: Record<string, { name: string; volume: number; cost: number }> = {};
  runs.forEach((r: any) => {
    const rName = r.recipe?.name || 'Standard Batch';
    const qty = Number(r.quantity ?? r.quantityProduced ?? 0);
    const cost = Number(r.totalCost ?? r.costOfProduction ?? 0);
    if (!recipeVolumeMap[rName]) {
      recipeVolumeMap[rName] = { name: rName, volume: 0, cost: 0 };
    }
    recipeVolumeMap[rName].volume += qty;
    recipeVolumeMap[rName].cost += cost;
  });
  const recipeChartData = Object.values(recipeVolumeMap);

  // Computed Transit Stock Bucket
  const transitTransfers = transfers.filter((t: any) => t.status === 'shipped');
  const transitItemsMap: Record<number, {
    itemId: number;
    name: string;
    unitSymbol: string;
    qty: number;
    valuation: number;
    transfersCount: number;
  }> = {};

  transitTransfers.forEach((t: any) => {
    t.items?.forEach((item: any) => {
      const itemId = item.inventoryItemId;
      const qty = Number(item.quantityShipped || 0);
      if (qty <= 0) return;

      if (!transitItemsMap[itemId]) {
        transitItemsMap[itemId] = {
          itemId,
          name: item.inventoryItem?.name || 'Inventory Item',
          unitSymbol: item.inventoryItem?.unit?.symbol || 'pcs',
          qty: 0,
          valuation: 0,
          transfersCount: 0
        };
      }
      transitItemsMap[itemId].qty += qty;
      transitItemsMap[itemId].valuation += qty * Number(item.unitCost || 0);
      transitItemsMap[itemId].transfersCount += 1;
    });
  });
  const transitItemsList = Object.values(transitItemsMap);
  const totalTransitValuation = transitItemsList.reduce((s, i) => s + i.valuation, 0);

  // Discrepancy & Damage logs
  const discrepancyTransfers = transfers.filter(
    (t: any) => t.status === 'completed_with_discrepancy' || (t.items && t.items.some((i: any) => Number(i.quantityDamaged) > 0))
  );

  const exportData = runs.map((r: any) => ({
    'Batch Code': r.batchNumber || r.id,
    Recipe: r.recipe?.name || 'N/A',
    'Yield Qty': Number(r.quantity ?? r.quantityProduced ?? 0),
    'Wasted Qty': Number(r.wasteQuantity ?? 0),
    'Total Cost (₹)': Number(r.totalCost ?? r.costOfProduction ?? 0),
    'Overhead Cost (₹)': Number(r.overheadCost ?? 0),
    Status: r.status,
    'Recorded At': new Date(r.createdAt).toLocaleString(),
  }));

  const [seeding, setSeeding] = useState(false);
  const handleSeedSampleData = async () => {
    setSeeding(true);
    try {
      await api.post('/restaurant/production/seed-sample-data');
      refetchRuns();
      refetchTransfers();
    } catch (err) {
      console.error('Failed to seed sample production data', err);
    } finally {
      setSeeding(false);
    }
  };

  if (loadingRuns || loadingTransfers) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCcw className="w-6 h-6 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in p-1">
      {/* Header & Export */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Factory className="w-6 h-6 text-purple-400" />
            Production & Warehouse Reports
          </h1>
          <p className="text-xs text-text-muted mt-1">Analyze yields, cost distribution, and track transit inventories in real time • {startDate} to {endDate}</p>
        </div>
        <ExportDropdown data={exportData} filename="production-report" title="Production & Warehouse Report" subtitle={`${startDate} to ${endDate}`} />
      </div>

      {/* Date Controls */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-end justify-between">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Date Range</label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DatePreset)}
                className="glass-input text-xs py-2 px-3 rounded-lg"
              >
                <option value="Today">Today</option>
                <option value="Yesterday">Yesterday</option>
                <option value="This Week">This Week</option>
                <option value="Current Month">Current Month</option>
                <option value="Last Month">Last Month</option>
                <option value="Last 30 Days">Last 30 Days</option>
                <option value="Custom">Custom Range</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setDateRange('Custom'); }}
                className="glass-input text-xs py-2 px-3 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setDateRange('Custom'); }}
                className="glass-input text-xs py-2 px-3 rounded-lg"
              />
            </div>
          </div>

          <button
            onClick={handleSeedSampleData}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
            {seeding ? 'Seeding Data...' : 'Seed Sample Batches'}
          </button>
        </div>
      </Card>

      {/* Tabs */}
      <Card className="p-2 flex gap-2 w-max">
        {(['overview', 'transit', 'discrepancies'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50'
            }`}
          >
            {tab === 'overview' && 'Yield & Costs'}
            {tab === 'transit' && 'Transit Inventory'}
            {tab === 'discrepancies' && 'Transit Discrepancies'}
          </button>
        ))}
      </Card>

      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
              <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Total Production Valuation</p>
              <p className="text-2xl font-black text-text-primary">₹{totalProductionCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-[9px] text-text-muted mt-1">{runs.length} batches completed</p>
            </Card>

            <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Total Yield Output</p>
              <p className="text-2xl font-black text-text-primary">{totalYield.toFixed(1)} Units</p>
              <p className="text-[9px] text-text-muted mt-1">Average batch size: {runs.length > 0 ? (totalYield / runs.length).toFixed(1) : 0} units</p>
            </Card>

            <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-rose-500/10 to-rose-500/5 border-rose-500/20">
              <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Production Wastage</p>
              <p className="text-2xl font-black text-text-primary">{totalWaste.toFixed(1)} Units</p>
              <p className="text-[9px] text-text-muted mt-1">Yield Loss rate: {averageYieldLoss.toFixed(1)}%</p>
            </Card>

            <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Overhead Expenses</p>
              <p className="text-2xl font-black text-text-primary">₹{totalOverheadCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-[9px] text-text-muted mt-1">Overhead ratio: {totalProductionCost > 0 ? ((totalOverheadCost / totalProductionCost) * 100).toFixed(0) : 0}%</p>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="col-span-1">
              <h3 className="font-bold text-text-primary text-sm mb-4">Production Cost Distribution</h3>
              <div className="h-[260px] flex items-center justify-center">
                {totalProductionCost > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={costBreakdownData}
                        cx="50%" cy="50%"
                        outerRadius={80}
                        innerRadius={40}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {costBreakdownData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => `₹${value}`} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <span className="text-text-muted text-xs">No cost data available</span>
                )}
              </div>
            </Card>

            <Card className="lg:col-span-2">
              <h3 className="font-bold text-text-primary text-sm mb-4">Production Yield Volume by Recipe</h3>
              <div className="h-[260px]">
                {recipeChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={recipeChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                      <Tooltip formatter={(value: any, name: string) => [value, name === 'volume' ? 'Units Produced' : 'Total Cost (₹)']} />
                      <Bar dataKey="volume" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Units Produced" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-text-muted text-xs">No volume data available</div>
                )}
              </div>
            </Card>
          </div>

          {/* Batch Records Table */}
          <Card padding={false}>
            <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30 flex items-center justify-between">
              <h3 className="font-bold text-text-primary text-sm">Batch Production & Yield Logs ({runs.length})</h3>
            </div>
            <div className="overflow-x-auto text-[10px]">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-bg-tertiary/20 border-b border-border/40 font-bold text-text-secondary">
                    <th className="py-2.5 px-4">Batch Code</th>
                    <th className="py-2.5 px-4">Recipe</th>
                    <th className="py-2.5 px-4 text-right">Yield Qty</th>
                    <th className="py-2.5 px-4 text-right">Wasted Qty</th>
                    <th className="py-2.5 px-4 text-right">Material Cost</th>
                    <th className="py-2.5 px-4 text-right">Total Valuation</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20 text-text-secondary">
                  {runs.map((run: any) => {
                    const qty = Number(run.quantity ?? run.quantityProduced ?? 0);
                    const wasted = Number(run.wasteQuantity ?? 0);
                    const totCost = Number(run.totalCost ?? run.costOfProduction ?? 0);
                    const ovhCost = Number(run.overheadCost ?? 0);
                    const matCost = run.materialCost !== undefined ? Number(run.materialCost) : Math.max(0, totCost - ovhCost);

                    return (
                      <tr key={run.id} className="hover:bg-bg-hover/10">
                        <td className="py-2 px-4 font-mono font-bold text-text-primary">{run.batchNumber || `PRD-${run.id}`}</td>
                        <td className="py-2 px-4 font-medium">{run.recipe?.name || 'Custom Recipe'}</td>
                        <td className="py-2 px-4 text-right font-mono font-bold text-emerald-400">{qty}</td>
                        <td className="py-2 px-4 text-right font-mono text-rose-400 font-bold">{wasted}</td>
                        <td className="py-2 px-4 text-right font-mono">₹{matCost.toFixed(2)}</td>
                        <td className="py-2 px-4 text-right font-mono font-bold text-text-primary">₹{totCost.toFixed(2)}</td>
                        <td className="py-2 px-4 text-center capitalize">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${run.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                            {run.status || 'completed'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {runs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-text-muted italic">
                        No production batch records found for selected period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'transit' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Total Value in Transit</p>
              <p className="text-2xl font-black text-text-primary">₹{totalTransitValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-[9px] text-text-muted mt-1">Deducted from warehouse; pending receipt at restaurants</p>
            </Card>

            <Card className="flex flex-col gap-2 p-4 bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border-indigo-500/20">
              <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Active Shipped Transfers</p>
              <p className="text-2xl font-black text-text-primary">{transitTransfers.length} Active</p>
              <p className="text-[9px] text-text-muted mt-1">Dispatches currently in transit</p>
            </Card>
          </div>

          <Card padding={false}>
            <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30">
              <h3 className="font-bold text-text-primary text-sm">Real-time Computed Transit Stock</h3>
            </div>
            <div className="overflow-x-auto text-[10px]">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-bg-tertiary/20 border-b border-border/40 font-bold text-text-secondary">
                    <th className="py-2.5 px-4">Item Name</th>
                    <th className="py-2.5 px-4 text-right">Qty in Transit</th>
                    <th className="py-2.5 px-4 text-right">Est. Unit Cost</th>
                    <th className="py-2.5 px-4 text-right">Transit Valuation</th>
                    <th className="py-2.5 px-4 text-center">Active Shipments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20 text-text-secondary">
                  {transitItemsList.map((item) => (
                    <tr key={item.itemId} className="hover:bg-bg-hover/10">
                      <td className="py-2.5 px-4 font-bold text-text-primary">{item.name}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-blue-400">{item.qty} {item.unitSymbol}</td>
                      <td className="py-2.5 px-4 text-right font-mono">₹{item.valuation > 0 ? (item.valuation / item.qty).toFixed(2) : '0.00'}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-text-primary">₹{item.valuation.toFixed(2)}</td>
                      <td className="py-2.5 px-4 text-center font-mono">{item.transfersCount} transfer(s)</td>
                    </tr>
                  ))}
                  {transitItemsList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-text-muted italic">No items currently in transit. All dispatches successfully reconciled.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'discrepancies' && (
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-border bg-bg-tertiary/30">
            <h3 className="font-bold text-text-primary text-sm flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 text-amber-500 animate-pulse" /> Transit Losses & Discrepancies</h3>
          </div>
          <div className="overflow-x-auto text-[10px]">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-bg-tertiary/20 border-b border-border/40 font-bold text-text-secondary">
                  <th className="py-2.5 px-4">Transfer Code</th>
                  <th className="py-2.5 px-4">Source / Destination</th>
                  <th className="py-2.5 px-4">Product</th>
                  <th className="py-2.5 px-4 text-right">Shipped Qty</th>
                  <th className="py-2.5 px-4 text-right">Received Qty</th>
                  <th className="py-2.5 px-4 text-right text-rose-400">Damaged / Missing</th>
                  <th className="py-2.5 px-4 text-right">Cost Loss</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 text-text-secondary">
                {discrepancyTransfers.flatMap((t: any) => {
                  const fromBranchName = branches.find((b: any) => b.id === t.fromBranchId)?.name || 'Warehouse';
                  const toBranchName = branches.find((b: any) => b.id === t.toBranchId)?.name || 'Restaurant';

                  return (t.items || []).filter((item: any) => {
                    const diff = Number(item.quantityShipped) - Number(item.quantityReceived);
                    return diff > 0 || Number(item.quantityDamaged) > 0;
                  }).map((item: any) => {
                    const missingQty = Number(item.quantityShipped) - Number(item.quantityReceived) - Number(item.quantityDamaged);
                    const damageQty = Number(item.quantityDamaged);
                    const totalLost = missingQty + damageQty;
                    const valLoss = totalLost * Number(item.unitCost || 0);

                    return (
                      <tr key={`${t.id}-${item.id}`} className="hover:bg-bg-hover/10">
                        <td className="py-2 px-4 font-mono font-bold text-text-primary">{t.transferNumber || `TRF-${t.id}`}</td>
                        <td className="py-2 px-4 text-[9px] text-text-muted">{fromBranchName} → {toBranchName}</td>
                        <td className="py-2 px-4 font-medium text-text-secondary">{item.inventoryItem?.name || 'Inventory Item'}</td>
                        <td className="py-2 px-4 text-right font-mono">{Number(item.quantityShipped)}</td>
                        <td className="py-2 px-4 text-right font-mono">{Number(item.quantityReceived)}</td>
                        <td className="py-2 px-4 text-right font-mono text-rose-400 font-bold">
                          {damageQty > 0 && `${damageQty} damaged`}
                          {missingQty > 0 && ` ${missingQty} missing`}
                        </td>
                        <td className="py-2 px-4 text-right font-mono text-rose-400 font-bold">₹{valLoss.toFixed(2)}</td>
                      </tr>
                    );
                  });
                })}
                {discrepancyTransfers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-text-muted italic">No transit discrepancies found. Zero damage log!</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
