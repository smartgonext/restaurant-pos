import { useState } from 'react';
import { Search, Calendar, Filter, Download, Plus, X, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export interface FilterBarProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  
  startDate?: string;
  endDate?: string;
  onDateChange?: (range: { startDate: string; endDate: string }) => void;
  showDateFilter?: boolean;
  
  status?: string;
  statusOptions?: { label: string; value: string }[];
  onStatusChange?: (status: string) => void;

  category?: string;
  categoryOptions?: { label: string; value: string }[];
  onCategoryChange?: (category: string) => void;

  onExport?: (format: 'csv' | 'xlsx' | 'pdf') => void;
  onAdd?: () => void;
  addLabel?: string;
  
  onReset?: () => void;
  className?: string;
}

export function FilterBar({
  searchQuery = '',
  onSearchChange,
  searchPlaceholder = 'Search records...',
  startDate = '',
  endDate = '',
  onDateChange,
  showDateFilter = true,
  status = '',
  statusOptions = [],
  onStatusChange,
  category = '',
  categoryOptions = [],
  onCategoryChange,
  onExport,
  onAdd,
  addLabel = 'Add New',
  onReset,
  className = '',
}: FilterBarProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);

  const setPreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'clear') => {
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    if (preset === 'clear') {
      onDateChange?.({ startDate: '', endDate: '' });
      return;
    }

    if (preset === 'today') {
      const dateStr = formatDate(today);
      onDateChange?.({ startDate: dateStr, endDate: dateStr });
    } else if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const dateStr = formatDate(y);
      onDateChange?.({ startDate: dateStr, endDate: dateStr });
    } else if (preset === 'week') {
      const start = new Date(today);
      start.setDate(start.getDate() - 7);
      onDateChange?.({ startDate: formatDate(start), endDate: formatDate(today) });
    } else if (preset === 'month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      onDateChange?.({ startDate: formatDate(start), endDate: formatDate(today) });
    }
  };

  const hasActiveFilters = Boolean(searchQuery || startDate || endDate || status || category);

  return (
    <div className={`glass-card p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 relative z-40 ${className}`}>
      {/* Left side: Search and filters */}
      <div className="flex flex-wrap items-center gap-2.5 flex-1">
        {/* Universal Search Input */}
        {onSearchChange && (
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="glass-input w-full pl-10 pr-9 min-h-[44px] text-xs font-medium rounded-xl border border-border focus:border-blue-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Date Filter */}
        {showDateFilter && onDateChange && (
          <div className="relative z-50">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className={`flex items-center gap-2 px-3 py-2.5 min-h-[44px] text-xs font-semibold rounded-xl border transition-all ${
                startDate || endDate
                  ? 'bg-blue-500/10 border-blue-500/50 text-blue-400'
                  : 'bg-bg-tertiary border-border text-text-secondary hover:bg-bg-hover'
              }`}
            >
              <Calendar className="w-4 h-4 shrink-0 text-blue-400" />
              <span>
                {startDate && endDate
                  ? startDate === endDate
                    ? startDate === new Date().toISOString().split('T')[0]
                      ? `Today (${startDate})`
                      : startDate
                    : `${startDate} ~ ${endDate}`
                  : startDate
                  ? `From ${startDate}`
                  : endDate
                  ? `Until ${endDate}`
                  : 'Date Range'}
              </span>
            </button>

            {showDatePicker && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-transparent"
                  onClick={() => setShowDatePicker(false)}
                />
                <div className="absolute top-full mt-2 left-0 z-[100] p-4 bg-bg-secondary border border-border rounded-2xl shadow-2xl w-80 max-w-[90vw] space-y-3 animate-in">
                  <div className="flex items-center justify-between text-xs font-bold text-text-primary pb-2 border-b border-border">
                    <span>Select Date Range</span>
                    <button onClick={() => setShowDatePicker(false)} className="text-text-muted hover:text-text-primary">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Quick Presets */}
                  <div className="grid grid-cols-4 gap-1.5">
                    <button onClick={() => { setPreset('today'); setShowDatePicker(false); }} className="px-2 py-1.5 text-[11px] font-bold bg-bg-tertiary hover:bg-blue-500/20 text-text-secondary hover:text-blue-400 rounded-lg">Today</button>
                    <button onClick={() => { setPreset('yesterday'); setShowDatePicker(false); }} className="px-2 py-1.5 text-[11px] font-bold bg-bg-tertiary hover:bg-blue-500/20 text-text-secondary hover:text-blue-400 rounded-lg">Yesterday</button>
                    <button onClick={() => { setPreset('week'); setShowDatePicker(false); }} className="px-2 py-1.5 text-[11px] font-bold bg-bg-tertiary hover:bg-blue-500/20 text-text-secondary hover:text-blue-400 rounded-lg">7 Days</button>
                    <button onClick={() => { setPreset('month'); setShowDatePicker(false); }} className="px-2 py-1.5 text-[11px] font-bold bg-bg-tertiary hover:bg-blue-500/20 text-text-secondary hover:text-blue-400 rounded-lg">Month</button>
                  </div>

                  {/* Inputs */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-[10px] text-text-muted font-bold mb-1">Start Date</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => onDateChange({ startDate: e.target.value, endDate })}
                        className="glass-input w-full p-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-text-muted font-bold mb-1">End Date</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => onDateChange({ startDate, endDate: e.target.value })}
                        className="glass-input w-full p-2 text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <button onClick={() => { setPreset('clear'); setShowDatePicker(false); }} className="text-xs text-rose-400 hover:underline">Clear Date</button>
                    <Button size="sm" onClick={() => setShowDatePicker(false)}>Apply</Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Status Dropdown Filter */}
        {statusOptions.length > 0 && onStatusChange && (
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            className="glass-input px-3 py-2.5 min-h-[44px] text-xs font-semibold rounded-xl border border-border bg-bg-tertiary text-text-primary"
          >
            <option value="">All Statuses</option>
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}

        {/* Category Dropdown Filter */}
        {categoryOptions.length > 0 && onCategoryChange && (
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="glass-input px-3 py-2.5 min-h-[44px] text-xs font-semibold rounded-xl border border-border bg-bg-tertiary text-text-primary"
          >
            <option value="">All Categories</option>
            {categoryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}

        {/* Reset Button */}
        {hasActiveFilters && onReset && (
          <button
            onClick={onReset}
            className="flex items-center gap-1 px-3 py-2.5 min-h-[44px] text-xs font-bold text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all"
            title="Reset Filters"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Right side: Export & Add Actions */}
      <div className="flex items-center gap-2 justify-end">
        {onExport && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onExport('csv')}
              className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs font-bold bg-bg-tertiary border border-border hover:bg-bg-hover text-text-secondary hover:text-text-primary rounded-xl transition-all"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>CSV</span>
            </button>
            <button
              onClick={() => onExport('xlsx')}
              className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs font-bold bg-bg-tertiary border border-border hover:bg-bg-hover text-text-secondary hover:text-text-primary rounded-xl transition-all"
            >
              <Download className="w-4 h-4 text-blue-400" />
              <span>Excel</span>
            </button>
          </div>
        )}

        {onAdd && (
          <Button
            onClick={onAdd}
            className="min-h-[44px] px-4 font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-glow-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{addLabel}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
