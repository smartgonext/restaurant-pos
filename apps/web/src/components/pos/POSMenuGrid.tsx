import { memo } from 'react';
import { Package, Plus } from 'lucide-react';
import { cn, formatCurrency, resolveImageUrl } from '@/lib/utils';


interface MenuItem {
  id: number;
  name: string;
  price: number;
  image: string | null;
  isVeg: boolean | null;
  categoryId: number | null;
}

interface POSMenuGridProps {
  items: MenuItem[];
  isLoading: boolean;
  filteredItems: MenuItem[];
  onAddItem: (item: MenuItem) => void;
  onClearFilters: () => void;
}

export const POSMenuGrid = memo(function POSMenuGrid({
  filteredItems,
  isLoading,
  onAddItem,
  onClearFilters,
}: POSMenuGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="rounded-lg bg-bg-primary border border-border animate-pulse" style={{ height: 130 }} />
        ))}
      </div>
    );
  }

  if (filteredItems.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 opacity-40">
        <Package className="w-12 h-12 text-text-muted" />
        <p className="text-sm font-bold text-text-muted">No items found</p>
        <button onClick={onClearFilters} className="text-xs text-purple-400 underline">Clear filters</button>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        {filteredItems.map(item => (
          <button
            key={item.id}
            onClick={() => onAddItem(item)}
            className="flex flex-col bg-bg-primary rounded-lg overflow-hidden border border-border hover:border-purple-500/50 hover:shadow-md transition-all group active:scale-95"
          >
            <div className="relative w-full bg-[#14151a] h-24 overflow-hidden flex items-center justify-center">
              <img
                src={resolveImageUrl(item.image) || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=1a1c23&color=fff`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                alt={item.name}
                loading="lazy"
              />
              {/* Veg/Non-Veg Indicator */}
              <div className="absolute top-1.5 right-1.5">
                <div className={cn(
                  "w-3 h-3 rounded-sm border flex items-center justify-center",
                  item.isVeg ? "border-green-500 bg-green-900/40" : "border-red-500 bg-red-900/40"
                )}>
                  <div className={cn("w-1.5 h-1.5 rounded-full", item.isVeg ? "bg-green-500" : "bg-red-500")} />
                </div>
              </div>
              <div className="absolute inset-0 bg-purple-900/0 group-hover:bg-purple-900/20 transition-colors flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-purple-600 rounded-full p-1">
                  <Plus className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
            </div>
            <div className="p-1.5 text-left flex-1 flex flex-col justify-between">
              <h4 className="text-[10px] font-bold text-text-primary uppercase truncate leading-tight">{item.name}</h4>
              <span className="text-[11px] font-black text-purple-300 mt-0.5">{formatCurrency(item.price)}</span>
            </div>
          </button>
        ))}
      </div>
      <p className="text-center text-[10px] text-text-muted font-bold uppercase tracking-widest py-4 border-t border-border/30 mt-3">
        {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''} displayed
      </p>
    </>
  );
});