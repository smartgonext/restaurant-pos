import { useEffect, useState, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
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
  ShoppingBag
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useCartStore } from '@/stores/cartStore';

const SERVER_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

export default function POS() {
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  
  // View states
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showWaiterDropdown, setShowWaiterDropdown] = useState(false);
  
  // Selection state
  const [pax, setPax] = useState<number>(1);
  const [waiterId, setWaiterId] = useState<number | ''>('');
  const [selectedWaiter, setSelectedWaiter] = useState<any>(null);

  // Modals state
  const [isOrderTypeModalOpen, setIsOrderTypeModalOpen] = useState(false);
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<number | null>(null);
  const [showOrderPanel, setShowOrderPanel] = useState(false);

  const cart = useCartStore();

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

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchCat = activeCategory === 'all' || item.categoryId === parseInt(activeCategory);
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [items, activeCategory, search]);

  const handleAddToCart = (item: any) => {
    cart.addItem({
      id: Math.random().toString(36).substr(2, 9),
      menuItemId: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      image: item.image,
      note: ''
    });
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
        pax: pax,
        waiterId: waiterId || undefined,
        items: cart.items.map(i => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity,
          note: i.note
        }))
      };

      const res = await api.post('/restaurant/orders', orderData);
      const order = res.data.data;

      if (options.pay) {
          await api.post(`/restaurant/orders/${order.id}/payment`, {
              amount: order.total,
              method: 'cash'
          });
      }

      toast.dismiss(loadingToast);
      toast.success(options.pay ? "Order Finalized!" : "Order Sent!");
      
      setLastOrderId(order.id);
      setShowOrderPanel(true);
      cart.clearCart();
    } catch (err: any) {
      toast.dismiss(loadingToast);
      toast.error(err.response?.data?.error || "Submit Error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#0f1014] text-white">
      
      {/* Search & Filter Header Section (Matching Image) */}
      <div className="p-4 space-y-3">
        <div className="flex gap-4">
           <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input 
                type="text" 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your menu item here" 
                className="w-full bg-[#1a1c23] border border-gray-800 rounded-md py-2.5 pl-10 pr-4 text-sm outline-none focus:border-purple-500/50 transition-all"
              />
           </div>
           <div className="flex gap-2">
              <button className="bg-[#1a1c23] border border-gray-800 p-2.5 rounded-md hover:bg-gray-800 transition-all">
                <AlignLeft className="w-4 h-4" />
              </button>
              <button className="bg-[#1a1c23] border border-gray-800 p-2.5 rounded-md hover:bg-gray-800 transition-all">
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => { setSearch(''); setActiveCategory('all'); }}
                className="bg-[#7c5cfc] hover:bg-[#6b4ae0] text-white px-6 rounded-md text-sm font-bold flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <div className="relative">
              <button className="w-full bg-[#1a1c23] border border-gray-800 rounded-md py-2.5 px-4 text-xs font-bold text-left flex justify-between items-center text-gray-400">
                <div className="flex items-center gap-2">
                   <AlignLeft className="w-3.5 h-3.5" /> Filter by Menu
                </div>
                <ChevronDown className="w-4 h-4" />
              </button>
           </div>
           <div className="relative">
              <button className="w-full bg-[#1a1c23] border border-gray-800 rounded-md py-2.5 px-4 text-xs font-bold text-left flex justify-between items-center text-gray-400">
                <div className="flex items-center gap-2">
                   <LayoutGrid className="w-3.5 h-3.5" /> Filter by Category
                </div>
                <ChevronDown className="w-4 h-4" />
              </button>
           </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden px-4 gap-6">
        {/* Menu Items Area (Matching Image Grid) */}
        <div className="flex-[2.5] overflow-y-auto custom-scrollbar pb-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
               {filteredItems.map(item => (
                 <button 
                   key={item.id}
                   onClick={() => handleAddToCart(item)}
                   className="flex flex-col bg-[#1a1c23] rounded-lg overflow-hidden border border-gray-800 hover:border-gray-700 transition-all group scale-100 active:scale-95"
                 >
                    <div className="relative aspect-square w-full">
                       <img 
                        src={item.image ? (item.image.startsWith('http') ? item.image : `${SERVER_URL}${item.image}`) : `https://ui-avatars.com/api/?name=${item.name}&background=1a1c23&color=fff`}
                        className="w-full h-full object-cover"
                        alt={item.name}
                       />
                       <div className="absolute top-2 right-2 flex gap-1">
                          <div className={cn("w-3.5 h-3.5 rounded-sm border border-white/20 flex items-center justify-center bg-white/10", item.isVeg ? "text-green-500" : "text-red-500")}>
                             <div className="w-1.5 h-1.5 rounded-full bg-current" />
                          </div>
                       </div>
                    </div>
                    <div className="p-3 text-left">
                       <h4 className="text-[11px] font-bold text-white uppercase truncate mb-1">{item.name}</h4>
                       <span className="text-xs font-black text-gray-100 tracking-tight">{formatCurrency(item.price)}</span>
                    </div>
                 </button>
               ))}
            </div>
            <div className="p-10 text-center text-xs text-gray-600 font-bold uppercase tracking-widest border-t border-gray-800/50 mt-10">
               Displaying all Items
            </div>
        </div>

        {/* Action Panel Sidebar (Matching Image) */}
        <div className="flex-[1] min-w-[380px] bg-[#1a1c23] rounded-t-xl border-x border-t border-gray-800 flex flex-col">
            {/* Sidebar Top: Order Type & Customer */}
            <div className="p-4 border-b border-gray-800/50 space-y-4">
                <div className="flex items-center justify-between">
                   <div className="text-xs font-bold text-gray-400">Order Type: <span className="text-white">Dine In</span></div>
                   <button onClick={() => setIsOrderTypeModalOpen(true)} className="bg-gray-800 hover:bg-gray-700 text-[10px] px-3 py-1 rounded font-bold transition-all">Change</button>
                </div>
                <button className="text-[11px] font-bold text-purple-400 flex items-center gap-1 hover:text-purple-300">
                  <Plus className="w-3 h-3" /> Add Customer Details
                </button>
                <div className="flex items-center justify-between pt-2">
                   <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-gray-500" />
                      <span className="text-xs font-bold">Order #12</span>
                   </div>
                   <div className="flex gap-2">
                      <button onClick={() => setIsTableModalOpen(true)} className="bg-gray-800 hover:bg-gray-700 text-[10px] px-3 py-1.5 rounded font-bold border border-gray-700">Assign Table</button>
                      <button className="bg-gray-800 hover:bg-gray-700 text-[10px] px-3 py-1.5 rounded font-bold border border-gray-700 flex items-center gap-1">
                        <UserPlus className="w-3.5 h-3.5" /> Merge Tables
                      </button>
                   </div>
                </div>

                <div className="flex gap-4 pt-2">
                   <div className="flex-1">
                     <span className="text-[10px] text-gray-500 font-bold block mb-1">Pax</span>
                     <div className="bg-[#0f1014] border border-gray-800 p-2 rounded text-xs font-bold text-white">
                        <input type="number" value={pax} onChange={(e) => setPax(Number(e.target.value))} className="bg-transparent w-full outline-none" placeholder="1" />
                     </div>
                   </div>
                   <div className="flex-[0.5] flex items-end">
                      <button className="bg-gray-800 p-2 rounded border border-gray-700 hover:bg-gray-700">
                         <AlignLeft className="w-4 h-4 text-gray-400" />
                      </button>
                   </div>
                   <div className="flex-[2] relative">
                      <span className="text-[10px] text-gray-500 font-bold block mb-1">Select Waiter</span>
                      <button className="w-full bg-[#0f1014] border border-gray-800 p-2 rounded text-xs font-bold text-left flex justify-between items-center text-gray-400">
                        Select Waiter <ChevronDown size={14} />
                      </button>
                   </div>
                </div>
            </div>

            {/* Cart Items Area */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {cart.items.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-30 text-center">
                     <ShoppingCart className="w-12 h-12 mb-3 text-gray-500" />
                     <p className="text-xs font-bold text-gray-400">No record found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.items.map(item => (
                      <div key={item.id} className="flex gap-3 border-b border-gray-800/50 pb-3">
                         <div className="flex-1">
                            <h4 className="text-xs font-bold text-white uppercase">{item.name}</h4>
                            <div className="flex items-center gap-2 mt-1">
                               <button onClick={() => cart.updateQuantity(item.id, -1)} className="bg-gray-800 w-5 h-5 flex items-center justify-center rounded text-xs">-</button>
                               <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                               <button onClick={() => cart.updateQuantity(item.id, 1)} className="bg-gray-800 w-5 h-5 flex items-center justify-center rounded text-xs">+</button>
                               <span className="text-[11px] font-bold text-gray-500 ml-2">x {formatCurrency(item.price)}</span>
                            </div>
                         </div>
                         <div className="text-right">
                            <span className="text-[11px] font-bold text-white">{formatCurrency(item.price * item.quantity)}</span>
                            <button onClick={() => cart.removeItem(item.id)} className="block mt-1 text-red-500/50 hover:text-red-500">
                               <Trash2 className="w-3.5 h-3.5" />
                            </button>
                         </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {/* Sidebar Summary Area */}
            <div className="p-4 bg-[#0f1014] border-t border-gray-800 space-y-2">
                <div className="flex justify-between text-[11px] font-bold">
                   <span className="text-gray-500">Item(s)</span>
                   <span>{cart.items.length}</span>
                </div>
                <div className="flex justify-between text-[11px] font-bold">
                   <span className="text-gray-500">Sub Total</span>
                   <span>{formatCurrency(cart.getSubtotal())}</span>
                </div>
                <div className="flex justify-between text-[11px] font-bold">
                   <span className="text-gray-500">SGST (2.5%)</span>
                   <span>{formatCurrency(cart.getTax()/2)}</span>
                </div>
                <div className="flex justify-between text-[11px] font-bold">
                   <span className="text-gray-500">CGST (2.5%)</span>
                   <span>{formatCurrency(cart.getTax()/2)}</span>
                </div>
                <div className="flex justify-between text-base font-black border-t border-gray-800 pt-2 mt-1">
                   <span>Total</span>
                   <span className="text-white">{formatCurrency(cart.getTotal())}</span>
                </div>
            </div>

            {/* Action Buttons Grid (Final Action Area) */}
            <div className="p-2 bg-[#0f1014] border-t border-gray-800 space-y-2 pb-4">
                <button 
                  onClick={() => handlePlaceOrder({ kot: true, bill: false, pay: false, print: false })}
                  className="w-full bg-[#f39c12] hover:bg-[#e67e22] text-white py-3 rounded text-[11px] font-black uppercase transition-all"
                >
                   Save as Draft
                </button>
                <div className="grid grid-cols-3 gap-2">
                   <button onClick={() => handlePlaceOrder({ kot: true, bill: false, pay: false, print: false })} className="bg-[#3a3f51] hover:bg-gray-700 text-white p-3 rounded text-[9px] font-black uppercase">KOT</button>
                   <button onClick={() => handlePlaceOrder({ kot: true, bill: false, pay: false, print: true })} className="bg-[#3a3f51] hover:bg-gray-700 text-white p-3 rounded text-[9px] font-black uppercase">KOT & Print</button>
                   <button className="bg-[#3a3f51] hover:bg-gray-700 text-white p-2 rounded text-[7px] font-black uppercase leading-tight">KOT, Bill, Print & Payment</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                   <button className="bg-[#9b59b6] hover:bg-[#8e44ad] text-white p-3 rounded text-[9px] font-black uppercase">BILL</button>
                   <button className="bg-[#2ecc71] hover:bg-[#27ae60] text-white p-3 rounded text-[9px] font-black uppercase">Bill & Payment</button>
                   <button onClick={() => handlePlaceOrder({ kot: false, bill: true, pay: false, print: true })} className="bg-[#3498db] hover:bg-[#2980b9] text-white p-3 rounded text-[9px] font-black uppercase">Bill & Print</button>
                </div>
            </div>
        </div>
      </div>

      <Modal open={isOrderTypeModalOpen} onClose={() => setIsOrderTypeModalOpen(false)} title="Select Order Mode">
          <div className="grid grid-cols-3 gap-4 p-4">
             {[
               { id: 'dine_in', label: 'Dine-In', icon: UtensilsCrossed },
               { id: 'delivery', label: 'Delivery', icon: Truck },
               { id: 'pickup', label: 'Pickup', icon: Package }
             ].map(mode => (
               <button 
                 key={mode.id}
                 onClick={() => { cart.setOrderType(mode.id as any); setIsOrderTypeModalOpen(false); }}
                 className={cn("p-6 rounded-xl border-2 flex flex-col items-center gap-3 transition-all", cart.orderType === mode.id ? "border-purple-500 bg-purple-500/10 text-white" : "border-gray-800 bg-gray-900 text-gray-500")}
               >
                  <mode.icon size={32} />
                  <span className="text-xs font-bold uppercase">{mode.label}</span>
               </button>
             ))}
          </div>
      </Modal>

      <Modal open={isTableModalOpen} onClose={() => setIsTableModalOpen(false)} title="Assign Table">
         <div className="grid grid-cols-6 gap-3 p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
            {tables.map((t: any) => (
               <button 
                key={t.id}
                disabled={t.status === 'running'}
                onClick={() => { cart.setTableId(t.id); setIsTableModalOpen(false); }}
                className={cn("aspect-square rounded-xl border-2 flex flex-col items-center justify-center transition-all", cart.tableId === t.id ? "border-purple-500 bg-purple-500/10 text-white" : t.status === 'running' ? "border-red-500/20 bg-red-500/10 text-red-500 opacity-50 cursor-not-allowed" : "border-gray-800 bg-gray-900")}
               >
                  <span className="text-[10px] uppercase font-bold text-gray-500">TBL</span>
                  <span className="text-lg font-black">{t.name}</span>
               </button>
            ))}
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
