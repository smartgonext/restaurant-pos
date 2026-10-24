import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { resolveImageUrl } from '@/lib/utils';
import {
  ShoppingCart,
  Bell,
  Sun,
  Moon,
  Search,
  MapPin,
  ChevronDown,
  Home,
  BookOpen,
  X,
  Plus,
  Minus,
  Trash2,
  UtensilsCrossed,
  ShoppingBag,
  Mail,
  PhoneCall,
  Clock,
  Loader,
  AlertCircle,
  CalendarDays,
  Users,
  Info,
  Phone,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const SERVER_URL =
  import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatCurrency(n: number, symbol = '₹') {
  return `${symbol}${Number(n).toFixed(2)}`;
}

function imgSrc(image?: string) {
  return resolveImageUrl(image) || '';
}

const FALLBACK_IMG =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23333" width="100" height="100"/%3E%3Ctext x="50" y="54" font-size="28" text-anchor="middle" fill="%23666"%3E🍽️%3C/text%3E%3C/svg%3E';

// ─── Types ────────────────────────────────────────────────────────────────────
type Page = 'home' | 'book' | 'about' | 'contact';

interface CartItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function MenuSite() {
  const { restaurantSlug, tableToken } = useParams<{
    restaurantSlug: string;
    tableToken: string;
  }>();

  const [page, setPage] = useState<Page>('home');
  const [isDark, setIsDark] = useState(true);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedMenu, setSelectedMenu] = useState<string>('all');

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);

  const isPreviewMode = tableToken === 'preview' || !tableToken || !data?.table;

  const menus: any[] = Array.isArray(data?.menus) ? data.menus : [];

  // ── Derived state ──────────────────────────────────────────────────────────
  const totalItems = cartItems.reduce((a, b) => a + b.quantity, 0);
  const subtotal = cartItems.reduce((a, b) => a + b.quantity * b.price, 0);
  const currencySymbol = data?.settings?.currencySymbol || '₹';

  // ── All categories across selected menus ──────────────────────────────────
  const allCategories = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    menus
      .filter((m) => selectedMenu === 'all' || m.id.toString() === selectedMenu)
      .forEach((m) =>
        m.menuItems.forEach((i: any) =>
          set.add(i.category?.name || 'Other')
        )
      );
    return Array.from(set);
  }, [data, selectedMenu]);

  // ── Filtered + grouped items ───────────────────────────────────────────────
  const grouped = useMemo<Record<string, any[]>>(() => {
    if (!data) return {};
    const map: Record<string, any[]> = {};
    menus
      .filter((m) => selectedMenu === 'all' || m.id.toString() === selectedMenu)
      .forEach((m) =>
        m.menuItems.forEach((i: any) => {
          if (
            search &&
            !i.name.toLowerCase().includes(search.toLowerCase())
          )
            return;
          if (vegOnly && !i.isVeg) return;
          if (
            selectedCategory !== 'all' &&
            (i.category?.name || 'Other') !== selectedCategory
          )
            return;
          const cat = i.category?.name || 'Other';
          if (!map[cat]) map[cat] = [];
          // avoid duplicates when "Show All" spans multiple menus
          if (!map[cat].find((x) => x.id === i.id)) map[cat].push(i);
        })
      );
    return map;
  }, [data, selectedMenu, search, vegOnly, selectedCategory]);

  // ── Category item counts (based on unfiltered selected-menu items) ─────────
  const categoryCount = useMemo<Record<string, number>>(() => {
    if (!data) return {};
    const map: Record<string, number> = {};
    menus
      .filter((m) => selectedMenu === 'all' || m.id.toString() === selectedMenu)
      .forEach((m) =>
        m.menuItems.forEach((i: any) => {
          const cat = i.category?.name || 'Other';
          map[cat] = (map[cat] || 0) + 1;
        })
      );
    return map;
  }, [data, selectedMenu]);

  // ── Fetch menu data ────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchMenu = async () => {
      try {
        setLoading(true);
        const endpoint =
          tableToken === 'preview' || !tableToken
            ? `/customer/${restaurantSlug}/preview/menu`
            : `/customer/${restaurantSlug}/${tableToken}/menu`;

        const res = await api.get(endpoint);
        if (res.data.success) {
          setData(res.data.data);
          setError(null);
        } else {
          setError(res.data.error || 'Failed to load menu');
        }
      } catch (err: any) {
        const msg = err.response?.data?.error || 'Failed to load menu';
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    };

    if (restaurantSlug) fetchMenu();
  }, [restaurantSlug, tableToken]);

  // ── Cart helpers ───────────────────────────────────────────────────────────
  const getCartQty = (itemId: string) =>
    cartItems.find((c) => c.menuItemId === itemId)?.quantity ?? 0;

  const addToCart = (item: any) => {
    const itemId = String(item.id);
    setCartItems((prev) => {
      const ex = prev.find((p) => p.menuItemId === itemId);
      if (ex)
        return prev.map((p) =>
          p.menuItemId === itemId ? { ...p, quantity: p.quantity + 1 } : p
        );
      return [
        ...prev,
        {
          id: `${itemId}-${Date.now()}`,
          menuItemId: itemId,
          name: item.name,
          price: Number(item.price),
          quantity: 1,
          image: item.image,
        },
      ];
    });
    toast.success(`${item.name} added to cart`);
  };

  const updateQty = (menuItemId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((p) =>
          p.menuItemId === menuItemId
            ? { ...p, quantity: p.quantity + delta }
            : p
        )
        .filter((p) => p.quantity > 0)
    );
  };

  const removeFromCart = (menuItemId: string) =>
    setCartItems((prev) => prev.filter((p) => p.menuItemId !== menuItemId));

  const clearCart = () => {
    setCartItems([]);
    toast.success('Cart cleared');
  };

  // ── Place order ────────────────────────────────────────────────────────────
  const handlePlaceOrder = async () => {
    if (isPreviewMode) {
      toast.error('Scan table QR to place order');
      return;
    }
    if (cartItems.length === 0) return;

    try {
      setPlacingOrder(true);
      const payload = {
        items: cartItems.map((ci) => ({
          menuItemId: Number(ci.menuItemId),
          quantity: ci.quantity,
          modifiers: [],
          note: '',
        })),
        note: '',
      };

      const res = await api.post(
        `/customer/${restaurantSlug}/${tableToken}/order`,
        payload
      );

      if (res.data.success) {
        toast.success('Order placed! 🎉');
        setCartItems([]);
        setShowCart(false);
      } else {
        toast.error(res.data.error || 'Failed to place order');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to place order');
    } finally {
      setPlacingOrder(false);
    }
  };

  // ── Call waiter ────────────────────────────────────────────────────────────
  const handleCallWaiter = async () => {
    if (isPreviewMode) {
      toast.error('Scan table QR to call waiter');
      return;
    }
    try {
      const res = await api.post(
        `/customer/${restaurantSlug}/${tableToken}/waiter`
      );
      if (res.data.success) {
        toast.success('Waiter is on the way! 🔔');
      } else {
        toast.error(res.data.error || 'Failed to call waiter');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to call waiter');
    }
  };

  // ── Theme classes ─────────────────────────────────────────────────────────
  const bg = isDark ? 'bg-[#0f1117]' : 'bg-gray-50';
  const text = isDark ? 'text-white' : 'text-gray-900';
  const border = isDark ? 'border-[#1e2330]' : 'border-gray-200';
  const cardBg = isDark ? 'bg-white/5' : 'bg-white';
  const inputBg = isDark ? 'bg-white/5' : 'bg-white border border-gray-200';
  const pillBase = isDark ? 'bg-white/5 text-gray-300' : 'bg-gray-100 text-gray-600';
  const headerBg = isDark ? 'bg-[#0f1117]/95' : 'bg-white/95';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER STATES
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={`flex items-center justify-center min-h-screen ${bg}`}>
        <div className="flex flex-col items-center gap-3">
          <Loader className="animate-spin text-violet-500" size={36} />
          <p className={`text-sm ${subText}`}>Loading menu…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={`flex items-center justify-center min-h-screen ${bg}`}>
        <div className="text-center px-6">
          <AlertCircle className="mx-auto text-red-500 mb-3" size={40} />
          <p className={`${text} font-semibold mb-1`}>Menu Unavailable</p>
          <p className={`text-sm ${subText}`}>{error || 'Unable to load menu data.'}</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={`${bg} ${text} min-h-screen font-sans transition-colors duration-300`}>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 ${headerBg} backdrop-blur-sm border-b ${border}`}
      >
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between gap-3">
          {/* Logo + table info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-violet-600 flex items-center justify-center font-bold text-white flex-shrink-0 text-sm">
              {data.restaurant.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 hidden sm:block">
              <div className="font-semibold truncate leading-tight">
                {data.restaurant.name}
              </div>
              {data.table && (
                <div className={`text-xs ${subText} flex items-center gap-1`}>
                  <MapPin size={11} />
                  {data.table.name} · {data.table.area}
                </div>
              )}
            </div>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {(
              [
                { key: 'home', label: 'Home', Icon: Home },
                { key: 'book', label: 'Book a Table', Icon: CalendarDays },
                { key: 'about', label: 'About', Icon: Info },
                { key: 'contact', label: 'Contact', Icon: Phone },
              ] as const
            ).map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setPage(key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  page === key
                    ? 'text-violet-400 bg-violet-500/10'
                    : `${subText} hover:${text}`
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Preview badge */}
            {isPreviewMode && (
              <span className="hidden sm:inline-flex items-center px-2 py-1 rounded-md text-xs bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 font-medium">
                Preview Mode
              </span>
            )}

            {/* Call waiter */}
            <button
              onClick={handleCallWaiter}
              title="Call Waiter"
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 active:scale-95 text-white px-3 py-2 rounded-lg text-sm transition-all"
            >
              <Bell size={15} />
              <span className="hidden sm:inline">Call Waiter</span>
            </button>

            {/* Theme toggle */}
            <button
              onClick={() => setIsDark((d) => !d)}
              title="Toggle theme"
              className={`w-9 h-9 rounded-lg flex items-center justify-center border ${border} ${subText} hover:${text} transition-colors`}
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {/* Cart */}
            <button
              onClick={() => setShowCart(true)}
              title="View cart"
              className={`relative w-9 h-9 rounded-lg flex items-center justify-center border ${border} ${subText} hover:${text} transition-colors`}
            >
              <ShoppingCart size={16} />
              {totalItems > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-violet-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                  {totalItems > 99 ? '99+' : totalItems}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN ───────────────────────────────────────────────────────── */}
      <main className="pt-20 md:pt-24 max-w-[1200px] mx-auto px-4 md:px-6 pb-28">

        {/* ══ HOME PAGE ══════════════════════════════════════════════════ */}
        {page === 'home' && (
          <>
            {/* Hero */}
            <section
              className="rounded-2xl p-8 md:p-10 mb-6"
              style={{ background: 'linear-gradient(135deg,#081025,#121428)' }}
            >
              <h1 className="text-2xl md:text-4xl font-bold leading-snug">
                Ready to Satisfy Your Cravings?{' '}
                <span className="text-violet-400">Place Your Order Now!</span>
              </h1>
              <p className={`text-sm ${subText} mt-2`}>
                {data.table
                  ? `Table ${data.table.name} · ${data.table.area}`
                  : data.restaurant.name}
              </p>
              {isPreviewMode && (
                <div className="mt-4 inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs px-3 py-1.5 rounded-lg">
                  <AlertCircle size={13} />
                  Preview mode — scan a table QR to place orders
                </div>
              )}
            </section>

            {/* Menu selector */}
            <section className="mb-6">
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                <MenuCard
                  active={selectedMenu === 'all'}
                  onClick={() => { setSelectedMenu('all'); setSelectedCategory('all'); }}
                  label="Show All"
                  count={menus.reduce((acc, m) => acc + m.menuItems.length, 0)}
                  Icon={UtensilsCrossed}
                  isDark={isDark}
                />
                {menus.map((m) => (
                  <MenuCard
                    key={m.id}
                    active={selectedMenu === m.id.toString()}
                    onClick={() => { setSelectedMenu(m.id.toString()); setSelectedCategory('all'); }}
                    label={m.name}
                    count={m.menuItems.length}
                    Icon={BookOpen}
                    isDark={isDark}
                  />
                ))}
              </div>
            </section>

            {/* Filters */}
            <section className="mb-6">
              <div className="flex items-center gap-3">
                {/* Search */}
                <div className="flex-1 relative">
                  <Search
                    className={`absolute left-3 top-1/2 -translate-y-1/2 ${subText}`}
                    size={16}
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search menu items…"
                    className={`w-full rounded-xl py-2.5 pl-9 pr-4 text-sm ${inputBg} ${text} placeholder:${subText} outline-none focus:ring-2 focus:ring-violet-500/40`}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 ${subText} hover:${text}`}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Veg toggle */}
                <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={vegOnly}
                    onClick={() => setVegOnly((v) => !v)}
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors ${
                      vegOnly ? 'bg-green-600' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        vegOnly ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className={`text-sm ${subText}`}>Veg only</span>
                </label>
              </div>

              {/* Category pills */}
              {allCategories.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  <CategoryPill
                    active={selectedCategory === 'all'}
                    onClick={() => setSelectedCategory('all')}
                    label="All"
                    count={Object.values(categoryCount).reduce((a, b) => a + b, 0)}
                  />
                  {allCategories.map((cat) => (
                    <CategoryPill
                      key={cat}
                      active={selectedCategory === cat}
                      onClick={() => setSelectedCategory(cat)}
                      label={cat}
                      count={categoryCount[cat] ?? 0}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Items */}
            <section>
              {Object.keys(grouped).length === 0 ? (
                <div className="text-center py-20">
                  <UtensilsCrossed className={`mx-auto mb-3 ${subText}`} size={36} />
                  <p className={subText}>No items match your filters.</p>
                  <button
                    onClick={() => { setSearch(''); setVegOnly(false); setSelectedCategory('all'); }}
                    className="mt-3 text-sm text-violet-400 hover:underline"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                Object.entries(grouped).map(([cat, items]) => (
                  <div key={cat} className="mb-10">
                    <div className="flex items-center gap-3 mb-4">
                      <h2 className="text-lg font-bold">{cat}</h2>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${pillBase}`}>
                        {items.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {items.map((item) => (
                        <ItemCard
                          key={item.id}
                          item={item}
                          qty={getCartQty(String(item.id))}
                          onAdd={() => addToCart(item)}
                          onInc={() => updateQty(String(item.id), 1)}
                          onDec={() => updateQty(String(item.id), -1)}
                          currencySymbol={currencySymbol}
                          isDark={isDark}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </section>
          </>
        )}

        {/* ══ BOOK PAGE ══════════════════════════════════════════════════ */}
        {page === 'book' && (
          <section className="pb-12">
            <PageHero
              title="Book a Table"
              subtitle="Reserve your spot and enjoy a great dining experience"
            />
            <div className={`${cardBg} rounded-2xl p-6 md:p-8 max-w-2xl border ${border}`}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                <div className="relative">
                  <CalendarDays className={`absolute left-3 top-1/2 -translate-y-1/2 ${subText}`} size={15} />
                  <input
                    type="date"
                    className={`w-full pl-9 pr-3 py-2.5 rounded-xl ${inputBg} ${text} text-sm outline-none focus:ring-2 focus:ring-violet-500/40`}
                  />
                </div>
                <div className="relative">
                  <Users className={`absolute left-3 top-1/2 -translate-y-1/2 ${subText}`} size={15} />
                  <select className={`w-full pl-9 pr-3 py-2.5 rounded-xl ${inputBg} ${text} text-sm outline-none appearance-none`}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} Guest{n > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <select className={`pl-3 pr-3 py-2.5 rounded-xl ${inputBg} ${text} text-sm outline-none appearance-none`}>
                  {['Breakfast', 'Lunch', 'Dinner'].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>

              <h3 className="font-semibold mb-3 text-sm">Select Time Slot</h3>
              <div className="flex flex-wrap gap-2 mb-5">
                {[
                  '08:00 AM','08:30 AM','09:00 AM','09:30 AM',
                  '10:00 AM','10:30 AM','11:00 AM',
                ].map((ts) => (
                  <button
                    key={ts}
                    className={`px-4 py-2 rounded-xl text-sm border ${border} hover:border-violet-500 hover:text-violet-400 transition-colors`}
                  >
                    {ts}
                  </button>
                ))}
              </div>

              <h3 className="font-semibold mb-2 text-sm">Special Requests</h3>
              <textarea
                rows={4}
                className={`w-full p-3 rounded-xl ${inputBg} ${text} text-sm mb-5 outline-none focus:ring-2 focus:ring-violet-500/40 resize-none`}
                placeholder="E.g. window seat, birthday decoration…"
              />

              <button className="bg-violet-600 hover:bg-violet-700 px-6 py-2.5 rounded-xl text-white text-sm font-medium transition-colors">
                Login to make reservation
              </button>
            </div>
          </section>
        )}

        {/* ══ ABOUT PAGE ═════════════════════════════════════════════════ */}
        {page === 'about' && (
          <section>
            <PageHero title={`About ${data.restaurant.name}`} subtitle="" />
            <div className={`${cardBg} rounded-2xl p-8 max-w-2xl border ${border}`}>
              {data.settings?.aboutText ? (
                data.settings.aboutText
                  .split('\n\n')
                  .map((p: string, i: number) => (
                    <p key={i} className={`mb-4 text-sm leading-relaxed ${subText}`}>
                      {p}
                    </p>
                  ))
              ) : (
                <p className={`text-sm leading-relaxed ${subText}`}>
                  Welcome to {data.restaurant.name}. We serve quality food with passion and pride.
                </p>
              )}
              <div className="mt-6 font-semibold">See you soon! 🍽️✨</div>
            </div>
          </section>
        )}

        {/* ══ CONTACT PAGE ═══════════════════════════════════════════════ */}
        {page === 'contact' && (
          <section>
            <PageHero title="Contact Us" subtitle="We'd love to hear from you" />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {data.settings?.email && (
                <ContactCard icon={<Mail size={22} />} title="Email" value={data.settings.email} href={`mailto:${data.settings.email}`} isDark={isDark} />
              )}
              {data.settings?.phone && (
                <ContactCard icon={<PhoneCall size={22} />} title="Phone" value={data.settings.phone} href={`tel:${data.settings.phone}`} isDark={isDark} />
              )}
              {data.settings?.address && (
                <ContactCard icon={<MapPin size={22} />} title="Address" value={data.settings.address} isDark={isDark} />
              )}
              {!data.settings?.email && !data.settings?.phone && !data.settings?.address && (
                <p className={`col-span-full text-sm ${subText}`}>No contact info available.</p>
              )}
            </div>
          </section>
        )}
      </main>

      {/* ── MOBILE BOTTOM NAV ──────────────────────────────────────────── */}
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 z-40 ${headerBg} border-t ${border} backdrop-blur-sm`}>
        <div className="flex">
          {(
            [
              { key: 'home', label: 'Home', Icon: Home },
              { key: 'book', label: 'Book', Icon: CalendarDays },
              { key: 'about', label: 'About', Icon: Info },
              { key: 'contact', label: 'Contact', Icon: Phone },
            ] as const
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setPage(key)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                page === key ? 'text-violet-400' : subText
              }`}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
          {/* Cart button in mobile nav */}
          <button
            onClick={() => setShowCart(true)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium relative ${subText}`}
          >
            <ShoppingCart size={18} />
            Cart
            {totalItems > 0 && (
              <span className="absolute top-2 right-4 w-4 h-4 bg-violet-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* ── CART DRAWER ────────────────────────────────────────────────── */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            onClick={() => setShowCart(false)}
          />

          {/* Panel */}
          <div className={`ml-auto w-full max-w-md ${isDark ? 'bg-[#0d1018]' : 'bg-white'} flex flex-col h-full shadow-2xl animate-slide-in`}>
            {/* Cart header */}
            <div className={`flex items-center justify-between px-5 py-4 border-b ${border}`}>
              <div>
                <h3 className="text-base font-bold">Your Cart</h3>
                <p className={`text-xs ${subText}`}>
                  {totalItems} item{totalItems !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {cartItems.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded border border-red-500/30 transition-colors"
                  >
                    Clear all
                  </button>
                )}
                <button
                  onClick={() => setShowCart(false)}
                  className={`${subText} hover:${text} transition-colors`}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {cartItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-20">
                  <ShoppingCart className={`${subText} mb-3`} size={40} />
                  <p className={`${subText} text-sm`}>Your cart is empty</p>
                  <button
                    onClick={() => setShowCart(false)}
                    className="mt-3 text-sm text-violet-400 hover:underline"
                  >
                    Browse menu
                  </button>
                </div>
              ) : (
                cartItems.map((ci) => (
                  <div
                    key={ci.id}
                    className={`flex items-center gap-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-xl p-3 border ${border}`}
                  >
                    {/* Image */}
                    <div className="w-14 h-14 bg-gray-800 flex-shrink-0 rounded-lg overflow-hidden">
                      <img
                        src={ci.image ? imgSrc(ci.image) : FALLBACK_IMG}
                        alt={ci.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = FALLBACK_IMG;
                        }}
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{ci.name}</div>
                      <div className={`text-xs ${subText}`}>
                        {formatCurrency(ci.price, currencySymbol)}
                      </div>
                      <div className={`text-xs font-semibold text-violet-400 mt-0.5`}>
                        = {formatCurrency(ci.price * ci.quantity, currencySymbol)}
                      </div>
                    </div>

                    {/* Qty controls */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => updateQty(ci.menuItemId, -1)}
                        className="w-7 h-7 rounded-lg bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center transition-colors"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="font-bold text-sm w-5 text-center">
                        {ci.quantity}
                      </span>
                      <button
                        onClick={() => updateQty(ci.menuItemId, 1)}
                        className="w-7 h-7 rounded-lg bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center transition-colors"
                      >
                        <Plus size={12} />
                      </button>
                      <button
                        onClick={() => removeFromCart(ci.menuItemId)}
                        className="ml-1 text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cart footer */}
            {cartItems.length > 0 && (
              <div className={`px-5 py-4 border-t ${border}`}>
                <div className="space-y-1.5 mb-4">
                  <div className={`flex justify-between text-sm ${subText}`}>
                    <span>Subtotal ({totalItems} items)</span>
                    <span>{formatCurrency(subtotal, currencySymbol)}</span>
                  </div>
                  <div className={`flex justify-between text-base font-bold`}>
                    <span>Total</span>
                    <span className="text-violet-400">
                      {formatCurrency(subtotal, currencySymbol)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handlePlaceOrder}
                  disabled={placingOrder || isPreviewMode || cartItems.length === 0}
                  className={`w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed py-3 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-colors ${isPreviewMode ? 'opacity-60' : ''}`}
                  title={isPreviewMode ? 'Scan table QR to place real orders' : ''}
                >
                  {placingOrder ? (
                    <>
                      <Loader size={16} className="animate-spin" />
                      Placing order…
                    </>
                  ) : (
                    <>
                      <ShoppingBag size={16} />
                      Place Order · {formatCurrency(subtotal, currencySymbol)}
                    </>
                  )}
                </button>
                {isPreviewMode && (
                  <p className={`text-center text-xs text-red-400 mt-2`}>
                    Scan table QR to place real orders
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slide-in animation */}
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
        .animate-slide-in { animation: slideIn 0.25s ease-out; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PageHero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div
      className="rounded-2xl p-8 md:p-10 mb-6"
      style={{ background: 'linear-gradient(135deg,#081025,#121428)' }}
    >
      <h1 className="text-2xl md:text-3xl font-bold">{title}</h1>
      {subtitle && <p className="text-sm text-gray-400 mt-2">{subtitle}</p>}
    </div>
  );
}

function MenuCard({
  active,
  onClick,
  label,
  count,
  Icon,
  isDark,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  Icon: React.ElementType;
  isDark: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl flex-shrink-0 transition-colors ${
        active
          ? 'bg-violet-600 text-white'
          : isDark
          ? 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10'
          : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
      }`}
    >
      <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
        <Icon size={16} />
      </div>
      <div className="text-left">
        <div className="font-semibold text-sm" style={{ maxWidth: 140 }}>
          {label}
        </div>
        <div className="text-xs opacity-70">{count} item{count !== 1 ? 's' : ''}</div>
      </div>
    </button>
  );
}

function CategoryPill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm transition-colors ${
        active
          ? 'bg-violet-600 text-white'
          : 'bg-white/5 text-gray-400 hover:bg-white/10'
      }`}
    >
      {label}
      <span className="ml-1.5 text-xs opacity-70">{count}</span>
    </button>
  );
}

function ItemCard({
  item,
  qty,
  onAdd,
  onInc,
  onDec,
  currencySymbol,
  isDark,
}: {
  item: any;
  qty: number;
  onAdd: () => void;
  onInc: () => void;
  onDec: () => void;
  currencySymbol: string;
  isDark: boolean;
}) {
  const border = isDark ? 'border-white/10' : 'border-gray-200';
  const cardBg = isDark ? 'bg-white/5' : 'bg-white';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className={`rounded-2xl overflow-hidden border ${border} ${cardBg} flex flex-col`}>
      {/* Image */}
      <div className="w-full h-40 bg-gray-800 overflow-hidden flex-shrink-0">
        <img
          src={item.image ? imgSrc(item.image) : FALLBACK_IMG}
          alt={item.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = FALLBACK_IMG;
          }}
          loading="lazy"
        />
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 flex-1">
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{item.name}</div>
            {item.description && (
              <div className={`text-xs ${subText} mt-1 line-clamp-2`}>
                {item.description}
              </div>
            )}
          </div>
          {/* Veg/non-veg dot */}
          <div
            className={`w-4 h-4 rounded-sm border-2 flex-shrink-0 mt-0.5 ${
              item.isVeg
                ? 'border-green-500 bg-green-500/20'
                : 'border-red-500 bg-red-500/20'
            }`}
          />
        </div>

        {item.preparationTime && (
          <div className={`text-xs ${subText} mt-2 flex items-center gap-1`}>
            <Clock size={11} />
            {item.preparationTime} min
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <div className="font-bold text-sm">
            {formatCurrency(Number(item.price), currencySymbol)}
          </div>

          {qty > 0 ? (
            <div className="flex items-center gap-2">
              <button
                onClick={onDec}
                className="w-7 h-7 rounded-lg bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center transition-colors"
              >
                <Minus size={12} />
              </button>
              <span className="font-bold text-sm w-5 text-center">{qty}</span>
              <button
                onClick={onInc}
                className="w-7 h-7 rounded-lg bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center transition-colors"
              >
                <Plus size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={onAdd}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-violet-500 text-violet-400 hover:bg-violet-500 hover:text-white transition-colors"
            >
              + Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactCard({
  icon,
  title,
  value,
  href,
  isDark,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  href?: string;
  isDark: boolean;
}) {
  const cardBg = isDark ? 'bg-white/5' : 'bg-white';
  const border = isDark ? 'border-white/10' : 'border-gray-200';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className={`${cardBg} rounded-2xl p-6 text-center border ${border}`}>
      <div className="text-violet-400 flex justify-center mb-3">{icon}</div>
      <h3 className="font-semibold text-sm mb-2">{title}</h3>
      {href ? (
        <a href={href} className={`text-sm ${subText} hover:text-violet-400 transition-colors break-all`}>
          {value}
        </a>
      ) : (
        <p className={`text-sm ${subText} break-words`}>{value}</p>
      )}
    </div>
  );
}