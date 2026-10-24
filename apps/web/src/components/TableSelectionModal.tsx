import React, { useState, useEffect } from 'react';
import { X, Users, Grid3X3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import axios from 'axios';

interface Table {
  id: number;
  name: string;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved';
  currentOccupancy?: number;
  areaName?: string;
}

interface TableSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTable: (table: Table) => void;
  restaurantId: number;
}

export const TableSelectionModal: React.FC<TableSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelectTable,
  restaurantId,
}) => {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'available' | 'occupied'>('all');

  useEffect(() => {
    if (isOpen) {
      fetchTables();
    }
  }, [isOpen]);

  const fetchTables = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await axios.get(`/api/tables?restaurantId=${restaurantId}`);
      setTables(response.data || []);
    } catch (err: any) {
      setError('Failed to load tables. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTables = tables.filter(table => {
    if (filter === 'available') return table.status === 'available';
    if (filter === 'occupied') return table.status === 'occupied';
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-500/20 border-green-500 text-green-200';
      case 'occupied':
        return 'bg-amber-500/20 border-amber-500 text-amber-200';
      case 'reserved':
        return 'bg-blue-500/20 border-blue-500 text-blue-200';
      default:
        return 'bg-gray-500/20 border-gray-500 text-gray-200';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1c23] rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#14151a] border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Grid3X3 size={20} className="text-purple-400" />
            <h2 className="text-lg font-bold text-white">Select a Table</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="sticky top-16 bg-[#14151a] border-b border-gray-800 px-6 py-3 flex gap-2">
          {(['all', 'available', 'occupied'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-4 py-2 rounded-lg font-medium transition-all text-sm',
                filter === f
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500 rounded-lg text-red-200 text-sm mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
              <p className="text-gray-400 mt-2">Loading tables...</p>
            </div>
          ) : filteredTables.length === 0 ? (
            <div className="text-center py-12">
              <Grid3X3 size={32} className="text-gray-600 mx-auto mb-2" />
              <p className="text-gray-400">No tables found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredTables.map(table => (
                <button
                  key={table.id}
                  onClick={() => {
                    onSelectTable(table);
                    onClose();
                  }}
                  className={cn(
                    'p-4 rounded-lg border-2 transition-all hover:shadow-lg',
                    table.status === 'available'
                      ? 'border-green-500 bg-green-500/5 hover:bg-green-500/10'
                      : table.status === 'occupied'
                      ? 'border-amber-500 bg-amber-500/5 hover:bg-amber-500/10'
                      : 'border-gray-700 bg-[#14151a] hover:border-gray-600'
                  )}
                >
                  <div className="text-left">
                    <h3 className="font-bold text-white text-lg mb-1">{table.name}</h3>
                    {table.areaName && (
                      <p className="text-xs text-gray-400 mb-2">{table.areaName}</p>
                    )}

                    {/* Capacity & Occupancy */}
                    <div className="flex items-center gap-2 mb-3 p-2 bg-[#1a1c23] rounded">
                      <Users size={14} className="text-gray-400" />
                      <span className="text-sm text-gray-300">
                        {table.currentOccupancy || 0}/{table.capacity}
                      </span>
                    </div>

                    {/* Status Badge */}
                    <div className={cn('text-xs font-semibold px-2 py-1 rounded text-center', getStatusColor(table.status))}>
                      {table.status.toUpperCase()}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
