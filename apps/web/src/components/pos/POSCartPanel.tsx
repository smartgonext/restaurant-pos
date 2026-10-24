import { memo } from 'react';
import { ShoppingCart, Package, Trash2, ChevronDown, User, UserPlus, X, Tag, UtensilsCrossed } from 'lucide-react';
import { cn, formatCurrency, resolveImageUrl } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { soundManager } from '@/lib/sounds';

interface CartItem {
  id: string;
  menuItemId: number;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  modifiers?: Array<{ name: string; price: number }>;
  inventoryItem?: any;
  inventoryItemMRPId?: number | null;
  note?: string;
}

interface POSCartPanelProps {
  cart: {
    items: CartItem[];
    orderType: string;
    tableId: number | null;
    getSubtotal: () => number;
    getTax: () => number;
    getTotal: () => number;
    addItem: (item: any) => void;
    removeItem: (id: string) => void;
    updateQuantity: (id: string, delta: number) => void;
    updateItemMrp: (id: string, mrpId: number, price: number, purchaseRate: number) => void;
    clearCart: () => void;
  };
  bakeryToken: any;
  customerName: string;
  pax: number;
  waiterId: number | '';
  selectedWaiter: any;
  staff: any[];
  sgstRate: number;
  cgstRate: number;
  taxInfo: { sgst: number; cgst: number; igst: number; total: number };
  orderTypeLabel: string;
  OrderIcon: any;
  openMrpId: string | null;
  mrpsCache: Record<string, any[]>;
  mrpLoading: Record<string, boolean>;
  showWaiterDropdown: boolean;
  onSetOrderType: () => void;
  onSetTable: () => void;
  onSetCustomer: () => void;
  onSetToken: () => void;
  onRemoveToken: () => void;
  onSetPax: (pax: number) => void;
  onSetWaiter: (id: number | '', waiter: any) => void;
  onToggleWaiterDropdown: () => void;
  onToggleMrp: (itemId: string) => void;
  onRemoveItem: (item: CartItem) => void;
  onMergeTable: () => void;
}

export const POSCartPanel = memo(function POSCartPanel({
  cart,
  bakeryToken,
  customerName,
  pax,
  waiterId,
  selectedWaiter,
  staff,
  sgstRate,
  cgstRate,
  taxInfo,
  orderTypeLabel,
  OrderIcon,
  openMrpId,
  mrpsCache,
  mrpLoading,
  showWaiterDropdown,
  onSetOrderType,
  onSetTable,
  onSetCustomer,
  onSetToken,
  onRemoveToken,
  onSetPax,
  onSetWaiter,
  onToggleWaiterDropdown,
  onToggleMrp,
  onRemoveItem,
  onMergeTable,
}: POSCartPanelProps) {
  return (
    <div
      className="bg-bg-primary rounded-xl border border-border flex flex-col overflow-hidden h-full"
      style={{ width: 340, minWidth: 300, flexShrink: 0 }}
    >
      {/* ── Panel Header: Order Meta ── */}
      <div className="flex-shrink-0 p-2.5 border-b border-border space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onSetOrderType}
            className="flex items-center gap-1.5 bg-bg-base border border-border rounded px-2 py-1 hover:border-purple-500/50 transition-colors flex-1 min-w-0"
          >
            <OrderIcon className="w-3 h-3 text-purple-400 flex-shrink-0" />
            <span className="text-[10px] font-bold text-text-primary truncate">{orderTypeLabel}</span>
            <ChevronDown className="w-3 h-3 text-text-muted ml-auto flex-shrink-0" />
          </button>
          <button
            onClick={onSetTable}
            className={cn(
              "flex items-center gap-1.5 bg-bg-base border rounded px-2 py-1 hover:border-purple-500/50 transition-colors text-[10px] font-bold flex-1 min-w-0",
              cart.tableId ? "border-purple-500/60 text-purple-300" : "border-border text-text-muted"
            )}
          >
            <UtensilsCrossed className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{cart.tableId ? `Table ${cart.tableId}` : 'Assign Table'}</span>
            <ChevronDown className="w-3 h-3 text-text-muted ml-auto flex-shrink-0" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSetCustomer}
            className={cn(
              "flex items-center gap-1.5 bg-bg-base border rounded px-2 py-1 hover:border-purple-500/50 transition-colors text-[10px] font-bold flex-1 min-w-0",
              customerName ? "border-green-500/60 text-green-400" : "border-border text-text-muted"
            )}
          >
            <User className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{customerName || 'Add Customer'}</span>
          </button>
          {bakeryToken ? (
            <div className="flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/40 rounded px-2 py-1 text-[10px] font-bold text-purple-400 flex-1 min-w-0">
              <Tag className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">Token #{bakeryToken.tokenNumber}</span>
              <button onClick={onRemoveToken} className="ml-auto hover:text-red-400 flex-shrink-0"><X className="w-3 h-3" /></button>
            </div>
          ) : (
            <button
              onClick={onSetToken}
              className="flex items-center gap-1.5 bg-bg-base border border-border rounded px-2 py-1 hover:border-purple-500/50 transition-colors text-[10px] font-bold text-text-muted flex-1 min-w-0"
            >
              <Tag className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">Link Token</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-bg-base border border-border rounded px-2 py-1" style={{ width: 90, flexShrink: 0 }}>
            <User className="w-3 h-3 text-text-muted flex-shrink-0" />
            <span className="text-[10px] text-text-muted font-bold flex-shrink-0">Pax</span>
            <input
              type="number"
              min={1}
              value={pax}
              onChange={(e) => onSetPax(Math.max(1, Number(e.target.value)))}
              className="bg-transparent w-full outline-none text-[10px] font-bold text-text-primary text-right"
            />
          </div>
          <div className="relative flex-1 min-w-0">
            <button
              onClick={onToggleWaiterDropdown}
              className="w-full bg-bg-base border border-border rounded px-2 py-1 text-[10px] font-bold flex items-center gap-1 text-text-muted hover:border-border transition-colors"
            >
              <User className="w-3 h-3 flex-shrink-0" />
              <span className="flex-1 text-left truncate">{selectedWaiter?.name || 'Waiter'}</span>
              <ChevronDown className="w-3 h-3 flex-shrink-0" />
            </button>
            {showWaiterDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-bg-primary border border-border rounded-md z-30 shadow-xl max-h-40 overflow-y-auto">
                <button
                  onClick={() => { onSetWaiter('', null); }}
                  className="w-full text-left px-3 py-1.5 text-[10px] font-bold text-text-muted hover:bg-bg-hover transition-colors"
                >
                  — No Waiter
                </button>
                {staff.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => { onSetWaiter(s.id, s); }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-[10px] font-bold transition-colors",
                      waiterId === s.id ? 'bg-purple-500/20 text-purple-400' : 'text-text-muted hover:bg-bg-hover'
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onMergeTable}
            className="flex-shrink-0 bg-bg-base border border-border p-1 rounded hover:bg-bg-hover transition-colors"
            title="Merge Tables"
          >
            <UserPlus className="w-3 h-3 text-text-muted" />
          </button>
        </div>
      </div>

      {/* ── Cart Items ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
        {bakeryToken && bakeryToken.items?.length > 0 && (
          <div className="mb-2 bg-bg-base border border-purple-500/20 rounded p-2">
            <div className="text-[9px] uppercase font-bold text-purple-500 mb-1.5">Token Items (Locked)</div>
            {bakeryToken.items.map((i: any) => (
              <div
                key={i.id}
                className={cn(
                  "flex justify-between items-center text-[10px] font-bold py-0.5",
                  i.isRemoved ? "line-through text-red-500/50" : "text-text-muted"
                )}
              >
                <span>{i.name} × {i.quantity}</span>
                <span>{formatCurrency(i.price * i.quantity)}</span>
              </div>
            ))}
          </div>
        )}

        {cart.items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 opacity-30 py-8">
            <ShoppingCart className="w-10 h-10 text-text-muted" />
            <p className="text-[11px] font-bold text-text-muted">Cart is empty</p>
            <p className="text-[10px] text-text-muted">Click an item to add</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cart.items.map((item, idx) => (
              <div
                key={item.id}
                className="flex gap-2 border-b border-gray-800/40 pb-2 hover:bg-gray-800/10 px-1 rounded transition-colors"
              >
                <span className="text-[9px] font-bold text-text-muted w-4 flex-shrink-0 pt-0.5">{idx + 1}</span>

                {item.image ? (
                  <img
                    src={resolveImageUrl(item.image) || ''}
                    alt={item.name}
                    className="w-8 h-8 rounded object-cover border border-gray-700 flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded bg-gray-900 border border-gray-700 flex items-center justify-center flex-shrink-0">
                    <Package className="w-3.5 h-3.5 text-gray-600" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-text-primary uppercase truncate leading-tight">{item.name}</p>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.modifiers.map((m, i) => (
                        <span key={i} className="text-[8px] bg-purple-500/10 border border-purple-500/20 text-purple-300 rounded px-1 py-0.5 font-bold uppercase">
                          +{m.name} (+{formatCurrency(m.price)})
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-1">
                    <button
                      onClick={() => cart.updateQuantity(item.id, -1)}
                      className="w-4 h-4 rounded bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-xs transition-colors"
                    >-</button>
                    <span className="text-[10px] font-black w-4 text-center">{item.quantity}</span>
                    <button
                      onClick={() => cart.updateQuantity(item.id, 1)}
                      className="w-4 h-4 rounded bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-xs transition-colors"
                    >+</button>

                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleMrp(item.id);
                        }}
                        className="flex items-center gap-1 bg-bg-base border border-border rounded px-1.5 py-0.5 text-[10px] font-black hover:border-purple-500/50 transition-colors"
                      >
                        {formatCurrency(item.price)}
                        <ChevronDown className="w-2.5 h-2.5 text-text-muted" />
                      </button>
                      {openMrpId === item.id && (
                        <div className="absolute left-0 mt-1 w-48 bg-bg-primary border border-border rounded z-50 shadow-xl overflow-hidden">
                          {mrpLoading[item.id] ? (
                            <div className="p-2 text-[10px] text-text-muted">Loading…</div>
                          ) : mrpsCache[item.id]?.length > 0 ? (
                            mrpsCache[item.id].map((m: any) => (
                              <button
                                key={m.id}
                                onClick={() => {
                                  cart.updateItemMrp(item.id, m.id, Number(m.sellingPrice ?? m.mrp), Number(m.purchaseRate ?? m.mrp));
                                  toast.success('Price updated');
                                }}
                                className={cn(
                                  "w-full text-left px-2.5 py-1.5 hover:bg-bg-hover transition-colors",
                                  item.inventoryItemMRPId === m.id && "bg-purple-500/10"
                                )}
                              >
                                <div className="text-[10px] font-bold text-text-primary">{formatCurrency(Number(m.sellingPrice ?? m.mrp))}</div>
                                <div className="text-[9px] text-text-muted">Buy: {formatCurrency(Number(m.purchaseRate ?? 0))}</div>
                              </button>
                            ))
                          ) : (
                            <div className="p-2 text-[10px] text-text-muted">No MRPs found</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end justify-between flex-shrink-0">
                  <span className="text-[11px] font-black text-text-primary">
                    {formatCurrency((item.price + (item.modifiers?.reduce((sum, m) => sum + m.price, 0) || 0)) * item.quantity)}
                  </span>
                  <button
                    onClick={() => onRemoveItem(item)}
                    className="text-red-500/40 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Summary ── */}
      <div className="flex-shrink-0 bg-bg-base border-t border-border px-3 py-2 space-y-1">
        <div className="flex justify-between text-[10px] font-bold text-text-muted">
          <span>Items ({cart.items.reduce((s, i) => s + i.quantity, 0)})</span>
          <span>{formatCurrency(cart.getSubtotal())}</span>
        </div>
        <div className="flex justify-between text-[10px] font-bold text-text-muted">
          <span>SGST ({sgstRate}%)</span>
          <span>{formatCurrency(taxInfo.sgst)}</span>
        </div>
        <div className="flex justify-between text-[10px] font-bold text-text-muted">
          <span>CGST ({cgstRate}%)</span>
          <span>{formatCurrency(taxInfo.cgst)}</span>
        </div>
        <div className="flex justify-between text-sm font-black text-text-primary pt-1 border-t border-border">
          <span>Total</span>
          <span>{formatCurrency(cart.getTotal())}</span>
        </div>
      </div>
    </div>
  );
});