import { create } from 'zustand';

export interface CartItem {
  id: string; // unique id for cart item (could be menuItemId + modifiers hash)
  menuItemId: number;
  name: string;
  price: number;
  quantity: number;
  note?: string;
  image?: string;
  modifiers?: { name: string; price: number }[];
  // Optional inventory/MRP fields
  inventoryItem?: any;
  inventoryItemMRPId?: number | null;
  purchaseRate?: number | null;
}

interface CartStore {
  items: CartItem[];
  orderType: 'dine_in' | 'delivery' | 'pickup';
  tableId: number | null;
  customerId: number | null;
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, delta: number) => void;
  updateItemMrp: (id: string, inventoryItemMRPId: number | null, mrpValue?: number, purchaseRate?: number | null) => void;
  setOrderType: (type: 'dine_in' | 'delivery' | 'pickup') => void;
  setTableId: (id: number | null) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getTax: () => number;
  getTotal: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  orderType: 'dine_in',
  tableId: null,
  customerId: null,
  
  addItem: (newItem) => set((state) => {
    const existingIndex = state.items.findIndex(i => i.id === newItem.id);
    if (existingIndex >= 0) {
      const newItems = [...state.items];
      newItems[existingIndex].quantity += newItem.quantity;
      return { items: newItems };
    }
    return { items: [...state.items, newItem] };
  }),
  
  removeItem: (id) => set((state) => ({
    items: state.items.filter(i => i.id !== id)
  })),
  
  updateQuantity: (id, delta) => set((state) => ({
    items: state.items.map(i => {
      if (i.id === id) {
        const newQty = Math.max(1, i.quantity + delta);
        return { ...i, quantity: newQty };
      }
      return i;
    })
  })),

  updateItemMrp: (id, inventoryItemMRPId, mrpValue, purchaseRate) => set((state) => ({
    items: state.items.map(i => {
      if (i.id === id) {
        return { ...i, inventoryItemMRPId: inventoryItemMRPId ?? null, price: typeof mrpValue === 'number' ? mrpValue : i.price, purchaseRate: typeof purchaseRate === 'number' ? purchaseRate : i.purchaseRate ?? null };
      }
      return i;
    })
  })),

  setOrderType: (type) => set({ orderType: type }),
  setTableId: (id) => set({ tableId: id }),
  clearCart: () => set({ items: [], tableId: null, customerId: null }),
  
  getSubtotal: () => {
    const raw = get().items.reduce((sum, item) => {
      const modTotal = item.modifiers?.reduce((mSum, m) => mSum + Number(m.price || 0), 0) || 0;
      return sum + ((Number(item.price || 0) + modTotal) * item.quantity);
    }, 0);
    return Math.round(raw * 100) / 100;
  },
  
  getTax: () => {
    const breakdown = (get() as any).getTaxBreakdown ? (get() as any).getTaxBreakdown() : null;
    if (breakdown) return breakdown.total;
    return Math.round(get().getSubtotal() * 0.05 * 100) / 100;
  },

  getTaxBreakdown: () => {
    const settings = (globalThis as any).__RESTAURANT_SETTINGS__ || {};
    const sgstRate = Number(settings?.sgstRate ?? 2.5);
    const cgstRate = Number(settings?.cgstRate ?? 2.5);
    const igstRate = Number(settings?.igstRate ?? 0);
    const subtotal = get().getSubtotal();
    const sgst = Math.round(subtotal * (sgstRate / 100) * 100) / 100;
    const cgst = Math.round(subtotal * (cgstRate / 100) * 100) / 100;
    const igst = Math.round(subtotal * (igstRate / 100) * 100) / 100;
    const total = Math.round((sgst + cgst + igst) * 100) / 100;
    return { sgst, cgst, igst, total, sgstRate, cgstRate, igstRate };
  },
  
  getTotal: () => {
    return Math.round((get().getSubtotal() + get().getTax()) * 100) / 100;
  }
}));
