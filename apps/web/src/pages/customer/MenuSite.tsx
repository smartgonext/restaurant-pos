import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useCartStore } from '@/stores/cartStore';
import { ShoppingCart, Search, Bell, Sun, Moon, Menu as MenuIcon } from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { useThemeStore } from '@/stores/themeStore';
import toast from 'react-hot-toast';

const SERVER_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

export default function MenuSite() {
  const { restaurantSlug, tableToken } = useParams<{ restaurantSlug: string, tableToken: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { items: cartItems } = useCartStore();
  const { socket } = useSocket();
  const { theme, toggleTheme } = useThemeStore();
  
  const [search, setSearch] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedMenu, setSelectedMenu] = useState<string>('all');

  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const response = await api.get(`/customer/${restaurantSlug}/${tableToken}/menu`);
        if (response.data.success) {
          setData(response.data.data);
        }
      } catch (err: any) {
        toast.error(err.response?.data?.error || 'Failed to load menu');
      } finally {
        setLoading(false);
      }
    };
    if (restaurantSlug && tableToken) {
        fetchMenu();
    }
  }, [restaurantSlug, tableToken]);

  const handleCallWaiter = async () => {
    try {
      const res = await api.post(`/customer/${restaurantSlug}/${tableToken}/waiter`);
      if (res.data.success) {
        toast.success('Waiter has been notified! ✓', { icon: '🔔' });
      }
    } catch (err: any) {
       toast.error('Failed to notify waiter');
    }
  };

  const getFilteredItems = (menuItems: any[]) => {
      return menuItems.filter(item => {
          if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
          if (vegOnly && !item.isVeg) return false;
          if (selectedCategory !== 'all' && item.category?.name !== selectedCategory) return false;
          return true;
      });
  };

  if (loading) return <div className="p-8 text-center">Loading Menu...</div>;
  if (!data) return <div className="p-8 text-center text-red-500">Menu unavailable.</div>;

  const totalItems = cartItems.reduce((acc, i) => acc + i.quantity, 0);

  return (
    <div className="flex flex-col flex-1 pb-24 relative overflow-y-auto">
      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 max-w-md mx-auto z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
            <div className="bg-blue-600 text-white w-8 h-8 flex items-center justify-center rounded-lg font-bold">
                {data.restaurant.name.charAt(0)}
            </div>
            <h1 className="font-semibold">{data.restaurant.name}</h1>
        </div>
        <div className="flex items-center gap-4">
            <button onClick={toggleTheme} className="text-gray-500 hover:text-gray-900 dark:hover:text-white">
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <MenuIcon size={20} className="text-gray-500" />
        </div>
      </header>

      {/* HERO SECTION */}
      <div className="pt-20 px-4 pb-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800 text-center">
         <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 mb-2">
            Ready to Satisfy Your Cravings?
         </h2>
         <p className="text-gray-600 dark:text-gray-400 text-sm">Table {data.table.name} • Place Your Order Now!</p>
      </div>

      {/* FILTERS */}
      <div className="sticky top-[68px] z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-4 py-3 space-y-3">
         {/* Menus horizontal scroll */}
         <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
             <button 
                onClick={() => setSelectedMenu('all')}
                className={`flex-none px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedMenu === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
             >
                 Show All
             </button>
             {data.menus.map((menu: any) => (
                 <button 
                    key={menu.id}
                    onClick={() => setSelectedMenu(menu.id.toString())}
                    className={`flex-none px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedMenu === menu.id.toString() ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
                 >
                     {menu.name}
                 </button>
             ))}
         </div>

         {/* Search & Category & Veg Toggle */}
         <div className="flex flex-col gap-3">
             <div className="relative">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                 <input 
                     type="text" 
                     placeholder="Search your menu item here..."
                     value={search}
                     onChange={(e) => setSearch(e.target.value)}
                     className="w-full bg-gray-100 dark:bg-gray-800 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                 />
             </div>
             <div className="flex items-center justify-between">
                 <select 
                    className="bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg text-sm px-3 py-1.5 outline-none"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                 >
                     <option value="all">Categories ▾</option>
                     {/* Unique Categories mapped based on items logic skipped for brevity, rendering 'all' filter functionality primarily */}
                 </select>
                 
                 <label className="flex items-center gap-2 cursor-pointer bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-3 py-1.5 rounded-lg border border-green-200 dark:border-green-800 text-sm font-medium">
                     <input 
                        type="checkbox" 
                        checked={vegOnly} 
                        onChange={(e) => setVegOnly(e.target.checked)}
                        className="rounded text-green-600 focus:ring-green-500 w-4 h-4 border-green-300"
                     />
                     <span>Veg Only</span>
                 </label>
             </div>
         </div>
      </div>

      {/* ITEMS LISTING */}
      <div className="p-4 space-y-6">
        {data.menus.filter((m: any) => selectedMenu === 'all' || m.id.toString() === selectedMenu).map((menu: any) => {
            const filteredItems = getFilteredItems(menu.menuItems);
            if (filteredItems.length === 0) return null;

            return (
                <div key={menu.id}>
                   <h3 className="font-bold text-lg mb-4 text-gray-900 dark:text-white pb-2 border-b border-gray-100 dark:border-gray-800">{menu.name}</h3>
                   <div className="space-y-4">
                       {filteredItems.map(item => (
                           <div key={item.id} className="flex gap-4 p-3 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800/50 shadow-sm">
                               <div className="w-24 h-24 flex-shrink-0 bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden relative">
                                   {item.image ? (
                                       <img src={item.image.startsWith('http') ? item.image : `${SERVER_URL}${item.image}`} alt={item.name} className="w-full h-full object-cover" />
                                   ) : (
                                       <div className="w-full h-full flex items-center justify-center text-gray-400">No Img</div>
                                   )}
                                   <div className={`absolute top-2 right-2 w-3 h-3 rounded-full border border-white dark:border-gray-800 ${item.isVeg ? 'bg-green-500' : 'bg-red-500'}`} />
                               </div>
                               <div className="flex-1 min-w-0 flex flex-col">
                                    <h4 className="font-semibold text-gray-900 dark:text-white truncate">{item.name}</h4>
                                    {item.description && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5 leading-snug">{item.description}</p>}
                                    <div className="mt-auto flex items-end justify-between">
                                        <div className="font-bold">{data.settings?.currencySymbol || '$'}{Number(item.price).toFixed(2)}</div>
                                        <button 
                                            className="px-4 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-800/50 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 rounded-lg text-sm font-semibold transition-colors"
                                            onClick={() => {
                                                const cartStore = useCartStore.getState();
                                                const itemId = `${item.id}-${[]}`;
                                                cartStore.addItem({
                                                    id: itemId,
                                                    menuItemId: item.id,
                                                    name: item.name,
                                                    price: Number(item.price),
                                                    quantity: 1,
                                                    modifiers: []
                                                });
                                                toast.success('Added to cart');
                                            }}
                                        >
                                            Add
                                        </button>
                                    </div>
                               </div>
                           </div>
                       ))}
                   </div>
                </div>
            )
        })}
      </div>

      {/* FLOATING ACTION BOTTOM SHEET & WAITER CALL */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 z-50 pointer-events-none flex flex-col gap-3">
          
          <button 
            onClick={handleCallWaiter}
            className="self-end pointer-events-auto w-12 h-12 bg-amber-500 hover:bg-amber-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-amber-500/30 transition-transform active:scale-95"
          >
              <Bell size={24} />
          </button>

          {totalItems > 0 && (
             <button 
                onClick={() => navigate(`/menu/${restaurantSlug}/${tableToken}/cart`)}
                className="pointer-events-auto w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl p-4 flex items-center justify-between shadow-xl shadow-blue-600/20 transition-transform active:scale-95"
             >
                 <div className="flex flex-col text-left">
                     <span className="text-sm font-medium text-blue-100">{totalItems} Item(s) Selection</span>
                     <span className="font-bold text-lg">View Cart & Checkout</span>
                 </div>
                 <ShoppingCart size={24} />
             </button>
          )}
      </div>

    </div>
  );
}
