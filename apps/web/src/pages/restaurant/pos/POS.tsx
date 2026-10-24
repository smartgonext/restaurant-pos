import { useEffect, useState, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { OrderDetailPanel } from '@/components/orders/OrderDetailPanel';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  UserPlus,
  Truck,
  Package,
  UtensilsCrossed,
  ChevronDown,
  Printer,
  CreditCard,
  History,
  Info,
  Flame,
  LayoutGrid,
  Filter,
  CheckCircle2,
  X,
  RotateCcw,
  User,
  ChevronRight,
  AlignLeft,
  ShoppingBag,
  Tag,
  Loader2
} from 'lucide-react';
import { formatCurrency, cn, resolveImageUrl } from '@/lib/utils';
import api from '@/lib/api';
import { postOrder } from '@/lib/offlineQueue';
import toast from 'react-hot-toast';
import { printCurrentPageOrFallback } from '@/lib/electronPrint';
import { useCartStore } from '@/stores/cartStore';
import { soundManager } from '@/lib/sounds';
import { POSMenuGrid } from '@/components/pos/POSMenuGrid';
import { POSCartPanel } from '@/components/pos/POSCartPanel';
import { POSActionBar } from '@/components/pos/POSActionBar';
import { SERVER_BASE_URL } from '@/lib/config';

const SERVER_URL = SERVER_BASE_URL;

export default function POS() {
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showWaiterDropdown, setShowWaiterDropdown] = useState(false);

  const [pax, setPax] = useState<number>(1);
  const [waiterId, setWaiterId] = useState<number | ''>('');
  const [selectedWaiter, setSelectedWaiter] = useState<any>(null);

  const [isOrderTypeModalOpen, setIsOrderTypeModalOpen] = useState(false);
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<number | null>(null);
  const [showOrderPanel, setShowOrderPanel] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const [bakeryToken, setBakeryToken] = useState<any>(null);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [tokenLookupInput, setTokenLookupInput] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);

  const cart = useCartStore();
  const taxInfo = (cart as any).getTaxBreakdown
    ? (cart as any).getTaxBreakdown()
    : { sgst: cart.getTax() / 2, cgst: cart.getTax() / 2, igst: 0, total: cart.getTax(), sgstRate: 2.5, cgstRate: 2.5 };
  const sgstRate = Number(taxInfo.sgstRate ?? 2.5);
  const cgstRate = Number(taxInfo.cgstRate ?? 2.5);

  const [openMrpId, setOpenMrpId] = useState<string | null>(null);
  const [mrpsCache, setMrpsCache] = useState<Record<string, any[]>>({});
  const [mrpLoading, setMrpLoading] = useState<Record<string, boolean>>({});

  const [activeModifierItem, setActiveModifierItem] = useState<any | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<number, any[]>>({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [itemsRes, catRes, tableRes, staffRes] = await Promise.all([
          api.get('/restaurant/menu-items'),
          api.get('/restaurant/item-categories'),
          api.get('/restaurant/tables').catch(() => ({ data: { data: [] } })),
          api.get('/restaurant/staff').catch(() => ({ data: { data: [] } }))
        ]);
        setItems(itemsRes.data.data);
        setCategories(catRes.data.data);
        setTables(tableRes.data.data);
        setStaff(staffRes.data.data);
      } catch (error) {
        toast.error("Failed to load POS infrastructure");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Keyboard Shortcuts for Cashier POS Speed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger hotkeys if user is actively typing in a text/input field (except Escape)
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.key === 'Escape') {
        if (search) { setSearch(''); e.preventDefault(); }
        return;
      }

      if (isInput) return;

      if (e.key === 'F1') {
        e.preventDefault();
        cart.setOrderType('dine_in');
        toast.success('Order mode: Dine In', { id: 'hotkey-mode', duration: 1200 });
      } else if (e.key === 'F2') {
        e.preventDefault();
        cart.setOrderType('delivery');
        toast.success('Order mode: Delivery', { id: 'hotkey-mode', duration: 1200 });
      } else if (e.key === 'F3') {
        e.preventDefault();
        cart.setOrderType('pickup');
        toast.success('Order mode: Pickup', { id: 'hotkey-mode', duration: 1200 });
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (cart.items.length > 0 && !isSubmitting) {
          handlePlaceOrder({ kot: true, bill: true, pay: true, print: true });
        } else if (cart.items.length === 0) {
          toast.error('Cart is empty');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [search, cart.items.length, isSubmitting]);

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter(item => {
      const matchCat = activeCategory === 'all' || item.categoryId === parseInt(activeCategory);
      const matchSearch = !q ||
        String(item.name || '').toLowerCase().includes(q) ||
        String(item.category?.name || '').toLowerCase().includes(q) ||
        String(item.productQR || '').toLowerCase().includes(q) ||
        String(item.inventoryItem?.barcode || '').toLowerCase().includes(q) ||
        String(item.inventoryItem?.sku || '').toLowerCase().includes(q) ||
        String(item.id || '') === q;
      return matchCat && matchSearch;
    });
  }, [items, activeCategory, search]);

  const handleAddToCart = (item: any) => {
    if (Array.isArray(item.itemModifiers) && item.itemModifiers.length > 0) {
      setActiveModifierItem(item);
      setSelectedModifiers({});
      return;
    }

    soundManager.playSuccess();
    toast.success(`Added ${item.name}`, { duration: 1500 });
    const inventoryItem = item.inventoryItem ?? null;
    let selectedMRPId: number | null = null;
    let purchaseRate: number | null = null;
    let price = Number(item.price ?? 0);
    if (inventoryItem && Array.isArray(inventoryItem.inventoryMRPs) && inventoryItem.inventoryMRPs.length > 0) {
      const active = inventoryItem.inventoryMRPs.find((m: any) => m.isActive) ?? inventoryItem.inventoryMRPs[0];
      selectedMRPId = active?.id ?? null;
      purchaseRate = active?.purchaseRate ?? null;
      price = Number(active?.sellingPrice ?? active?.mrp ?? price);
    }
    cart.addItem({
      id: Math.random().toString(36).substr(2, 9),
      menuItemId: item.id,
      name: item.name,
      price,
      quantity: 1,
      image: item.image,
      note: '',
      inventoryItem,
      inventoryItemMRPId: selectedMRPId,
      purchaseRate
    });
  };

  const handleAddWithModifiers = () => {
    if (!activeModifierItem) return;
    soundManager.playSuccess();
    toast.success(`Added ${activeModifierItem.name}`, { duration: 1500 });

    const inventoryItem = activeModifierItem.inventoryItem ?? null;
    let selectedMRPId: number | null = null;
    let purchaseRate: number | null = null;
    let price = Number(activeModifierItem.price ?? 0);
    if (inventoryItem && Array.isArray(inventoryItem.inventoryMRPs) && inventoryItem.inventoryMRPs.length > 0) {
      const active = inventoryItem.inventoryMRPs.find((m: any) => m.isActive) ?? inventoryItem.inventoryMRPs[0];
      selectedMRPId = active?.id ?? null;
      purchaseRate = active?.purchaseRate ?? null;
      price = Number(active?.sellingPrice ?? active?.mrp ?? price);
    }

    const flatModifiers = Object.values(selectedModifiers).flat().map(opt => ({
      name: opt.name,
      price: Number(opt.price || 0)
    }));

    const modHash = flatModifiers.map(m => `${m.name}:${m.price}`).sort().join('|');
    const uniqueCartId = `${activeModifierItem.id}-${modHash || 'none'}`;

    cart.addItem({
      id: uniqueCartId,
      menuItemId: activeModifierItem.id,
      name: activeModifierItem.name,
      price,
      quantity: 1,
      image: activeModifierItem.image,
      note: '',
      modifiers: flatModifiers,
      inventoryItem,
      inventoryItemMRPId: selectedMRPId,
      purchaseRate
    });

    setActiveModifierItem(null);
    setSelectedModifiers({});
  };

  const lookupBakeryToken = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!tokenLookupInput.trim()) return;
    setIsLookingUp(true);
    try {
      const isNum = /^\d+$/.test(tokenLookupInput.trim());
      const payload = isNum ? { tokenNumber: Number(tokenLookupInput) } : { qrCode: tokenLookupInput.trim() };
      const { data } = await api.post('/restaurant/tokens/lookup', payload);
      setBakeryToken(data.data);
      setIsTokenModalOpen(false);
      setTokenLookupInput('');
      toast.success(`Linked Token #${data.data.tokenNumber}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Token not found');
    } finally {
      setIsLookingUp(false);
    }
  };

  const handlePlaceOrder = async (options: { kot: boolean; bill: boolean; pay: boolean; print: boolean }) => {
    if (cart.items.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setIsSubmitting(true);
    const loadingToast = toast.loading(options.pay ? "Processing Payment..." : "Syncing Order...");
    try {
      const orderData = {
        type: cart.orderType,
        tableId: cart.tableId,
        pax,
        waiterId: waiterId || undefined,
        bakeryTokenId: bakeryToken?.id,
        items: cart.items.map(i => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity,
          note: i.note
        }))
      };
      const res = await postOrder(orderData);
      const order = res.data.data;

      if (order?.offline) {
        if (options.print) {
          setTimeout(async () => {
            try { await printCurrentPageOrFallback(); } catch (err: any) { toast.error(err?.message || 'Print failed'); }
          }, 300);
        }
        toast.success('Order queued locally');
        setLastOrderId(order.tempId || null);
        setShowOrderPanel(true);
        cart.clearCart();
        setBakeryToken(null);
        setIsSubmitting(false);
        toast.dismiss(loadingToast);
        return;
      }

      if (options.bill && order?.id) {
        try { await api.post(`/restaurant/orders/${order.id}/bill`); } catch (err: any) {
          toast.error(err?.response?.data?.error || 'Bill generation failed');
        }
      }
      if (options.pay) {
        try { await api.post(`/restaurant/orders/${order.id}/payment`, { amount: order.total, method: 'cash' }); } catch (err: any) {
          toast.error(err?.response?.data?.error || 'Payment failed');
        }
      }
      if (options.print) {
        setTimeout(async () => {
          try { await printCurrentPageOrFallback(); } catch (err: any) { toast.error(err?.message || 'Print failed'); }
        }, 300);
      }

      toast.dismiss(loadingToast);
      if (options.pay) toast.success("Payment processed!");
      else if (options.bill) toast.success("Bill generated!");
      else toast.success("Order sent to kitchen!");

      setLastOrderId(order.id);
      setShowOrderPanel(true);
      cart.clearCart();
      setBakeryToken(null);
    } catch (err: any) {
      toast.dismiss(loadingToast);
      toast.error(err.response?.data?.error || "Submit Error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const orderTypeLabel = cart.orderType === 'dine_in' ? 'Dine In' : cart.orderType === 'delivery' ? 'Delivery' : 'Pickup';
  const orderTypeIcon = cart.orderType === 'dine_in' ? UtensilsCrossed : cart.orderType === 'delivery' ? Truck : Package;
  const OrderIcon = orderTypeIcon;

  const handleToggleMrp = async (itemId: string) => {
    if (openMrpId === itemId) { setOpenMrpId(null); return; }
    setOpenMrpId(itemId);
    const item = cart.items.find(i => i.id === itemId);
    if (!mrpsCache[itemId] && item?.inventoryItem?.id) {
      setMrpLoading(prev => ({ ...prev, [itemId]: true }));
      try {
        const res = await api.get(`/restaurant/inventory/items/${item.inventoryItem.id}`);
        setMrpsCache(prev => ({ ...prev, [itemId]: res.data.data.inventoryMRPs || [] }));
      } catch { toast.error('Failed to load MRPs'); }
      finally { setMrpLoading(prev => ({ ...prev, [itemId]: false })); }
    }
  };

  return (
    <div
      className="flex flex-col bg-bg-base text-text-primary h-full overflow-hidden"
      style={{ contain: 'strict' }}
    >
      {/* ── Top Bar: Search + Categories ── */}
      <div className="flex-shrink-0 px-3 pt-1.5 pb-1 space-y-1.5 border-b border-border bg-bg-base">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search item, barcode, SKU…"
              className="w-full bg-bg-primary border border-border rounded pl-8 pr-3 py-1.5 text-xs outline-none placeholder:text-text-muted focus:border-purple-500/60 transition-colors text-text-primary"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button
            onClick={() => { setSearch(''); setActiveCategory('all'); }}
            className="bg-purple-600 hover:bg-purple-700 text-white px-3 rounded text-xs font-bold flex items-center gap-1.5 transition-colors flex-shrink-0"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
          <button
            onClick={() => setActiveCategory('all')}
            className={cn(
              'flex-shrink-0 rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors border',
              activeCategory === 'all'
                ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                : 'bg-bg-primary border-border text-text-muted hover:bg-bg-hover'
            )}
          >
            All {items.length > 0 && <span className="ml-1 opacity-60">({items.length})</span>}
          </button>
          {categories.map((cat: any) => {
            const count = items.filter(i => i.categoryId === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(String(cat.id))}
                className={cn(
                  'flex-shrink-0 rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors border',
                  activeCategory === String(cat.id)
                    ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                    : 'bg-bg-primary border-border text-text-muted hover:bg-bg-hover'
                )}
              >
                {cat.name} {count > 0 && <span className="ml-1 opacity-60">({count})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Body ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden gap-3 px-3 py-2">

        {/* ── LEFT: Menu Grid ── */}
        <div className="flex-[2.2] min-h-0 overflow-y-auto custom-scrollbar">
          <POSMenuGrid
            items={items}
            isLoading={isLoading}
            filteredItems={filteredItems}
            onAddItem={handleAddToCart}
            onClearFilters={() => { setSearch(''); setActiveCategory('all'); }}
          />
        </div>

        {/* ── RIGHT: Order Panel ── */}
        <div
          className="bg-bg-primary rounded-xl border border-border flex flex-col overflow-hidden h-full"
          style={{ width: 340, minWidth: 300, flexShrink: 0 }}
        >
          <POSCartPanel
            cart={cart}
            bakeryToken={bakeryToken}
            customerName={customerName}
            pax={pax}
            waiterId={waiterId}
            selectedWaiter={selectedWaiter}
            staff={staff}
            sgstRate={sgstRate}
            cgstRate={cgstRate}
            taxInfo={taxInfo}
            orderTypeLabel={orderTypeLabel}
            OrderIcon={OrderIcon}
            openMrpId={openMrpId}
            mrpsCache={mrpsCache}
            mrpLoading={mrpLoading}
            showWaiterDropdown={showWaiterDropdown}
            onSetOrderType={() => setIsOrderTypeModalOpen(true)}
            onSetTable={() => setIsTableModalOpen(true)}
            onSetCustomer={() => setIsCustomerModalOpen(true)}
            onSetToken={() => setIsTokenModalOpen(true)}
            onRemoveToken={() => { setBakeryToken(null); toast('Token unlinked'); }}
            onSetPax={(val) => setPax(val)}
            onSetWaiter={(id, waiter) => { setWaiterId(id as any); setSelectedWaiter(waiter); setShowWaiterDropdown(false); }}
            onToggleWaiterDropdown={() => setShowWaiterDropdown(!showWaiterDropdown)}
            onToggleMrp={handleToggleMrp}
            onRemoveItem={(item) => { soundManager.playError(); cart.removeItem(item.id); toast(`Removed ${item.name}`, { duration: 1200, icon: '🗑️' }); }}
            onMergeTable={() => toast('Merge table: select another table')}
          />

          <POSActionBar
            isSubmitting={isSubmitting}
            cartItemsCount={cart.items.length}
            onPlaceOrder={handlePlaceOrder}
          />
        </div>
      </div>

      {/* ── Modals ── */}
      <Modal open={isOrderTypeModalOpen} onClose={() => setIsOrderTypeModalOpen(false)} title="Select Order Mode">
        <div className="grid grid-cols-3 gap-3 p-4">
          {[
            { id: 'dine_in', label: 'Dine-In', icon: UtensilsCrossed },
            { id: 'delivery', label: 'Delivery', icon: Truck },
            { id: 'pickup', label: 'Pickup', icon: Package }
          ].map(mode => (
            <button
              key={mode.id}
              onClick={() => { cart.setOrderType(mode.id as any); setIsOrderTypeModalOpen(false); }}
              className={cn(
                "p-5 rounded-xl border-2 flex flex-col items-center gap-2 transition-all",
                cart.orderType === mode.id
                  ? "border-purple-500 bg-purple-500/10 text-white"
                  : "border-gray-800 bg-gray-900 text-gray-500 hover:border-gray-700"
              )}
            >
              <mode.icon size={28} />
              <span className="text-[11px] font-bold uppercase">{mode.label}</span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={isTableModalOpen} onClose={() => setIsTableModalOpen(false)} title="Assign Table">
        <div className="grid grid-cols-5 gap-2.5 p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {tables.map((t: any) => (
            <button
              key={t.id}
              disabled={t.status === 'running'}
              onClick={() => { cart.setTableId(t.id); setIsTableModalOpen(false); }}
              className={cn(
                "aspect-square rounded-xl border-2 flex flex-col items-center justify-center transition-all",
                cart.tableId === t.id
                  ? "border-purple-500 bg-purple-500/10 text-white"
                  : t.status === 'running'
                    ? "border-red-500/20 bg-red-500/10 text-red-500 opacity-50 cursor-not-allowed"
                    : "border-gray-800 bg-gray-900 hover:border-gray-700"
              )}
            >
              <span className="text-[9px] uppercase font-bold text-gray-500">TBL</span>
              <span className="text-base font-black">{t.name}</span>
              {t.status === 'running' && <span className="text-[8px] text-red-500 font-bold">Busy</span>}
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={isCustomerModalOpen}
        onClose={() => { setIsCustomerModalOpen(false); setCustomerName(''); setCustomerPhone(''); }}
        title="Customer Details"
      >
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1.5">Customer Name</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Enter name"
              className="w-full bg-[#1a1c23] border border-gray-800 rounded p-2 text-white outline-none focus:border-purple-500 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1.5">Phone Number</label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Enter phone"
              className="w-full bg-[#1a1c23] border border-gray-800 rounded p-2 text-white outline-none focus:border-purple-500 text-sm"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => {
                if (customerName || customerPhone) {
                  toast.success('Customer saved');
                  setIsCustomerModalOpen(false);
                } else {
                  toast.error('Enter at least one detail');
                }
              }}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded font-bold text-sm transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => { setIsCustomerModalOpen(false); setCustomerName(''); setCustomerPhone(''); }}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded font-bold text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={isTokenModalOpen} onClose={() => setIsTokenModalOpen(false)} title="Link Bakery Token">
        <form onSubmit={lookupBakeryToken} className="p-4 space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1.5">Token Number or QR Code</label>
            <input
              type="text"
              autoFocus
              value={tokenLookupInput}
              onChange={(e) => setTokenLookupInput(e.target.value)}
              placeholder="e.g. 1004"
              className="w-full bg-[#1a1c23] border border-gray-800 rounded p-2.5 text-white outline-none focus:border-purple-500 text-sm font-bold tracking-widest"
            />
          </div>
          <button
            type="submit"
            disabled={isLookingUp || !tokenLookupInput.trim()}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-2 rounded font-bold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {isLookingUp ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
            Find & Link
          </button>
        </form>
      </Modal>

      {/* ── Modifiers Selection Modal ── */}
      <Modal
        open={!!activeModifierItem}
        onClose={() => { setActiveModifierItem(null); setSelectedModifiers({}); }}
        title={`Customize ${activeModifierItem?.name}`}
      >
        <div className="space-y-4">
          <p className="text-xs text-text-muted">Choose your desired add-ons and variations below.</p>
          
          <div className="space-y-4 max-h-96 overflow-y-auto custom-scrollbar pr-1">
            {activeModifierItem?.itemModifiers?.map((im: any) => {
              const group = im.modifierGroup;
              if (!group) return null;
              const options = Array.isArray(group.options) ? group.options : [];
              return (
                <div key={group.id} className="bg-bg-tertiary/40 border border-border/30 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">{group.name}</h4>
                    <span className="text-[9px] uppercase font-bold text-text-muted bg-bg-base border border-border/50 rounded px-1.5 py-0.5">Select Options</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                    {options.map((opt: any, optIdx: number) => {
                      const groupSels = selectedModifiers[group.id] || [];
                      const isSelected = groupSels.some(s => s.name === opt.name);
                      return (
                        <button
                          key={optIdx}
                          type="button"
                          onClick={() => {
                            let newSels = [...groupSels];
                            if (isSelected) {
                              newSels = newSels.filter(s => s.name !== opt.name);
                            } else {
                              newSels.push(opt);
                            }
                            setSelectedModifiers({
                              ...selectedModifiers,
                              [group.id]: newSels
                            });
                          }}
                          className={cn(
                            "flex items-center justify-between text-left p-2 rounded-lg border text-xs transition-all",
                            isSelected 
                              ? "bg-purple-500/10 border-purple-500 text-purple-300 font-bold" 
                              : "bg-bg-secondary border-border/50 hover:bg-bg-hover text-text-primary"
                          )}
                        >
                          <span>{opt.name}</span>
                          <span className={cn("text-[10px]", isSelected ? "text-purple-300 font-extrabold" : "text-success font-medium")}>
                            {opt.price === 0 ? 'Free' : `+${formatCurrency(opt.price)}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-border/50">
            <div className="text-left">
              <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider block">Extra Price</span>
              <span className="text-sm font-black text-purple-300">
                +{formatCurrency(Object.values(selectedModifiers).flat().reduce((sum, opt) => sum + Number(opt.price || 0), 0))}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setActiveModifierItem(null); setSelectedModifiers({}); }}>
                Cancel
              </Button>
              <Button onClick={handleAddWithModifiers} className="bg-purple-600 hover:bg-purple-700 text-white font-bold">
                Add to Cart
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <OrderDetailPanel
        orderId={lastOrderId}
        open={showOrderPanel}
        onClose={() => { setShowOrderPanel(false); setLastOrderId(null); }}
      />
    </div>
  );
}