import { useState, useEffect, useMemo, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Search, LogOut, Trash2, RotateCcw, ShoppingCart,
  Plus, Minus, AlertCircle, Users, Loader2, Send, Utensils, Volume2,
  Sun, Moon, BarChart3, UserCheck, CheckCircle2, Armchair, X, Award, Layers
} from 'lucide-react';
import { cn, formatCurrency, resolveImageUrl } from '@/lib/utils';
import { postOrder } from '@/lib/offlineQueue';
import { useEnterKeyNavigation } from '@/hooks/useEnterKeyNavigation';
import { useClickSound } from '@/hooks/useClickSound';
import { useSocket } from '@/hooks/useSocket';
import { SERVER_BASE_URL } from '@/lib/config';

const SERVER_URL = SERVER_BASE_URL;

interface Table {
  id: number;
  name: string;
  status: 'available' | 'partially_occupied' | 'occupied' | 'cleanup' | string;
  seatCount?: number;
  occupiedSeats?: number[];
  // Independent combine groups on this table, e.g. [[1,3],[2,4]]. When a chair is
  // clicked its whole group lights up purple and shows the shared bill items.
  groupedSeats?: number[][];
  activeStaff?: string | null;
  area?: {
    id: number;
    name: string;
  };
}

interface MenuItem {
  id: number;
  name: string;
  price: number;
  image?: string;
  categoryId?: number;
}

interface Category {
  id: number;
  name: string;
}

// FIX: PendingItem now carries the chair it was ordered for, so cart items
// from different chairs never get merged or sent together by accident.
interface PendingItem {
  id: string;
  menuItemId: number;
  name: string;
  price: number;
  quantity: number;
  tableId?: number;
  chairNumber: number;
}

interface Token {
  id: number;
  tokenNumber: number;
  qrCode: string;
  status: string;
  customerName?: string;
  customerPhone?: string;
  subtotal: number;
  total: number;
  items?: any[];
  payments?: any[];
}

interface ConfirmModalState {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

function normalizeToken(raw: any): Token | null {
  if (!raw) return null;
  return {
    id: Number(raw.id || 0),
    tokenNumber: Number(raw.tokenNumber || 0),
    qrCode: String(raw.qrCode || ''),
    status: String(raw.status || ''),
    customerName: raw.customerName || undefined,
    customerPhone: raw.customerPhone || undefined,
    subtotal: Number(raw.subtotal ?? 0) || 0,
    total: Number(raw.total ?? 0) || 0,
    items: Array.isArray(raw.items) ? raw.items : [],
    payments: Array.isArray(raw.payments) ? raw.payments : [],
  };
}

export default function WaiterTerminal() {
  useEnterKeyNavigation();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const isLight = theme === 'light';

  const navigate = useNavigate();
  const qc = useQueryClient();
  const { playAddSound, playIncrementSound, playDecrementSound, playDeleteSound, playTokenSound, playKeypadSound } = useClickSound();

  // ── STATES ──
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [selectedChair, setSelectedChair] = useState<number>(1);
  const [activeToken, setActiveToken] = useState<Token | null>(null);
  const [activeTab, setActiveTab] = useState<'tables' | 'menu' | 'cart'>('tables');

  const [pendingCart, setPendingCart] = useState<PendingItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [tableSearch, setTableSearch] = useState('');

  // Customer info
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const [isConfirming, setIsConfirming] = useState(false);
  const [showStaffAnalytics, setShowStaffAnalytics] = useState(false);
  const [tableSelectionMode, setTableSelectionMode] = useState<'entire_table' | 'by_chair'>('by_chair');

  // FIX: group-billing support — lets a waiter combine 2+ chairs (a couple / friend
  // COMBINE BILL MODE (Cross-table Bill Group)
  const [combineBillMode, setCombineBillMode] = useState(false);
  const [combinedSelections, setCombinedSelections] = useState<
    {
      tableId: number;
      tableName: string;
      chairNumber: number;
    }[]
  >([]);
  // Unique id for the currently-active combine session. Every selected chair
  // belongs to this one group, so a separate combine session gets its own id and
  // never overlaps with another group's bill.
  const combineGroupIdRef = useRef<string>('');

  const genGroupId = () => `g${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 6)}`;



  // ── LONG PRESS TRIGGER LOGIC ──
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startChairLongPress = (
    tableId: number,
    tableName: string,
    chairNumber: number
  ) => {
    clearChairLongPress();

    longPressTimer.current = setTimeout(() => {
      playTokenSound();
      setCombineBillMode(true);
      if (!combineGroupIdRef.current) combineGroupIdRef.current = genGroupId();
      setCombinedSelections([
        {
          tableId,
          tableName,
          chairNumber,
        },
      ]);
      toast.success(
        `Combine Bill activated — T${tableName} Chair ${chairNumber}`,
        {
          icon: '🔮',
          duration: 2500,
        }
      );
    }, 500);
  };

  const startTableLongPress = (table: Table) => {
    clearChairLongPress();

    longPressTimer.current = setTimeout(() => {
      playTokenSound();
      const seatCount = table.seatCount || 4;
      const newChairs = Array.from({ length: seatCount }, (_, i) => ({
        tableId: table.id,
        tableName: table.name,
        chairNumber: i + 1,
      }));

      setCombineBillMode(true);
      if (!combineGroupIdRef.current) combineGroupIdRef.current = genGroupId();
      setCombinedSelections(prev => {
        const allPresent = newChairs.every(nc =>
          prev.some(p => p.tableId === nc.tableId && p.chairNumber === nc.chairNumber)
        );

        if (allPresent) {
          const filtered = prev.filter(p => p.tableId !== table.id);
          if (filtered.length === 0) setCombineBillMode(false);
          return filtered;
        }

        const existingOther = prev.filter(p => p.tableId !== table.id);
        return [...existingOther, ...newChairs];
      });

      toast.success(
        `Combined Bill — All ${seatCount} Chairs selected for Table ${table.name}`,
        { icon: '🔮', duration: 2500 }
      );
    }, 500);
  };

  const clearChairLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleChairClick = (
    tableId: number,
    tableName: string,
    chairNumber: number
  ) => {
    if (combineBillMode) {
      setCombinedSelections(prev => {
        const exists = prev.some(
          x => x.tableId === tableId && x.chairNumber === chairNumber
        );

        if (exists) {
          return prev.filter(
            x => !(x.tableId === tableId && x.chairNumber === chairNumber)
          );
        }

        return [
          ...prev,
          {
            tableId,
            tableName,
            chairNumber,
          },
        ];
      });

      return;
    }

    const tableObj = tables.find(t => t.id === tableId);
    if (tableObj && selectedTable?.id !== tableId) {
      setSelectedTable(tableObj);
    }
    handleSelectChair(chairNumber);
  };

  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    open: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({
      open: true,
      title,
      message,
      onConfirm,
    });
  };

  // Redirect if not authorized
  const hasAccess = user && (
    ['waiter', 'admin', 'branch_head', 'chef', 'staff'].includes(user.role) ||
    (user.permissions && typeof user.permissions === 'object' && (user.permissions['pos'] || user.permissions['tables'] || user.permissions['waiter_requests']))
  );

  // ── QUERIES ──
  const { data: tables = [], isLoading: isLoadingTables } = useQuery<Table[]>({
    queryKey: ['waiter-tables'],
    queryFn: async () => {
      const { data } = await api.get('/restaurant/tables');
      return Array.isArray(data.data) ? data.data : [];
    },
    refetchInterval: 3000,
  });

  // Sync selectedTable with updated tables query data (occupiedSeats, status)
  useEffect(() => {
    if (selectedTable && tables.length > 0) {
      const freshTable = tables.find(t => t.id === selectedTable.id);
      if (freshTable) {
        setSelectedTable(freshTable);
      }
    }
  }, [tables]);

  const { data: items = [], isLoading: isLoadingItems } = useQuery<MenuItem[]>({
    queryKey: ['waiter-items'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/restaurant/menu-items');
        return Array.isArray(data.data) ? data.data : [];
      } catch {
        try {
          const { data } = await api.get('/restaurant/inventory/items');
          return Array.isArray(data.data) ? data.data : [];
        } catch {
          const { data } = await api.get('/subpos/items');
          return Array.isArray(data.data) ? data.data : [];
        }
      }
    },
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['waiter-categories'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/restaurant/item-categories');
        return Array.isArray(data.data) ? data.data : [];
      } catch {
        try {
          const { data } = await api.get('/restaurant/categories');
          return Array.isArray(data.data) ? data.data : [];
        } catch {
          const { data } = await api.get('/subpos/categories');
          return Array.isArray(data.data) ? data.data : [];
        }
      }
    },
  });

  const { data: restaurantSettings } = useQuery({
    queryKey: ['restaurant-settings'],
    queryFn: async () => {
      const { data } = await api.get('/restaurant/settings');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  // Staff Performance Analytics Query
  const { data: staffPerformance, isLoading: isLoadingAnalytics } = useQuery({
    queryKey: ['staff-performance', user?.id],
    queryFn: async () => {
      const { data } = await api.get('/restaurant/staff/performance', {
        params: { staffId: user?.id, staffName: user?.name }
      });
      return data.data;
    },
    enabled: showStaffAnalytics,
    refetchInterval: 10000,
  });

  const { socket } = useSocket();

  // ── REALTIME SOCKET SYNC ──
  useEffect(() => {
    if (!socket) return;

    const handleTableUpdate = (data: any) => {
      qc.invalidateQueries({ queryKey: ['waiter-tables'] });

      if (selectedTable && (data.id === selectedTable.id || data.tableId === selectedTable.id)) {
        const remainingChairs: number[] = data.occupiedSeats || data.remainingChairs || [];
        // Only treat as fully closed when ALL chairs are released AND the table is now available
        const isFullyClosed = data.status === 'available' && remainingChairs.length === 0;
        const isEntireTable = data.entireTable === true && remainingChairs.length === 0;

        if (isFullyClosed || isEntireTable) {
          toast.success(`🔔 Table ${selectedTable.name} has been closed/freed!`, { icon: '🪑' });
          handleClearStates();
          setActiveTab('tables');
        } else if (selectedChair && remainingChairs.length > 0 && !remainingChairs.includes(selectedChair)) {
          // Current chair was freed but other chairs still active
          toast.success(`🔔 Chair ${selectedChair} on Table ${selectedTable.name} is now freed!`);
          setPendingCart(prev => prev.filter(i => i.chairNumber !== selectedChair));
          setActiveToken(prev => prev ? {
            ...prev,
            items: (prev.items || []).filter((i: any) => Number(i.chairNumber) !== selectedChair),
          } : prev);
          setSelectedTable(prev => prev ? {
            ...prev,
            status: data.status || prev.status,
            occupiedSeats: remainingChairs,
          } : null);
          setSelectedChair(remainingChairs[0]);
        } else if (remainingChairs.length > 0) {
          // Other chairs updated, just sync occupiedSeats
          setSelectedTable(prev => prev ? {
            ...prev,
            status: data.status || prev.status,
            occupiedSeats: remainingChairs,
          } : null);
        }
      }
    };

    const handleTokenPaid = (data: any) => {
      qc.invalidateQueries({ queryKey: ['waiter-tables'] });
      if (selectedTable && data.tableId === selectedTable.id) {
        toast.success(`🧾 Bill paid for Table ${selectedTable.name}! Chair cleared.`, { icon: '💳' });
        handleClearStates();
        setActiveTab('tables');
      }
    };

    socket.on('table_updated', handleTableUpdate);
    socket.on('table_closed', handleTableUpdate);
    socket.on('token_paid', handleTokenPaid);
    socket.on('waiter_bill_cleared', handleTableUpdate);

    return () => {
      socket.off('table_updated', handleTableUpdate);
      socket.off('table_closed', handleTableUpdate);
      socket.off('token_paid', handleTokenPaid);
      socket.off('waiter_bill_cleared', handleTableUpdate);
    };
  }, [socket, selectedTable, selectedChair, qc]);

  // ── MUTATIONS ──
  // Closes the bill: the selected chair(s)/table are freed on this Waiter
  // terminal immediately, AND the bill is sent to the Main POS cashier as a
  // PENDING waiter bill (via /tables/:id/request-bill). The cashier loads it
  // and collects the payment; the items are fully marked paid only then.
  const requestBillMut = useMutation({
    mutationFn: async (vars?: { chairNumbers?: number[]; items?: any[]; total?: number; isEntireTable?: boolean }) => {
      if (!selectedTable) throw new Error('No active table selected');
      // Send the bill to the Main POS cashier as a PENDING waiter bill. The
      // selected chair(s) are freed on the floor plan right away, but the bill
      // stays pending until the cashier loads it and collects the payment.
      await api.post(`/restaurant/tables/${selectedTable.id}/request-bill`, {
        staffId: user?.id,
        isEntireTable: vars?.isEntireTable === true,
        chairNumbers: vars?.isEntireTable ? undefined : vars?.chairNumbers,
        items: vars?.items,
        total: vars?.total
      });
      return vars;
    },
    onSuccess: (vars) => {
      playTokenSound();
      const billedChairs = vars?.chairNumbers || [];
      const isEntire = !!vars?.isEntireTable || billedChairs.length === 0;

      toast.success(
        `🧾 Bill sent to cashier for Table ${selectedTable?.name}${!isEntire ? ` (Chair${billedChairs.length > 1 ? 's' : ''} ${billedChairs.join(', ')})` : ''}!`,
        { icon: '🔔', duration: 4000 }
      );

      // The bill is now with the cashier as a PENDING waiter bill, and the
      // selected chair(s)/table are already freed on this Waiter floor plan
      // (handled on the server). We just clear the local selection and refresh.
      handleClearStates();
      setActiveTab('tables');
      qc.invalidateQueries({ queryKey: ['waiter-tables'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || '❌ Failed to request bill');
    }
  });

  // ── HANDLERS ──
  const loadChairOrder = async (tableId: number, chairNumber: number) => {
    try {
      const { data } = await api.get(`/restaurant/tables/${tableId}/chairs/${chairNumber}/order`);
      const order = data.data;

      if (!order || !order.items || order.items.length === 0) {
        setActiveToken(null);
        return;
      }

      const formattedItems = order.items.map((item: any) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        menuItemName: item.menuItem?.name || item.name || 'Item',
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 1),
        total: Number(item.price || 0) * Number(item.quantity || 1),
        chairNumber: item.chairNumber != null ? Number(item.chairNumber) : chairNumber,
        note: item.note,
        isRemoved: false,
      }));

      const itemsTotal = formattedItems.reduce((sum: number, item: any) => sum + item.total, 0);

      setActiveToken({
        id: Number(order.bakeryTokenId || 0),
        tokenNumber: 0,
        qrCode: '',
        status: 'open',
        subtotal: itemsTotal,
        total: itemsTotal,
        items: formattedItems,
        payments: [],
      } as any);
    } catch (err) {
      console.error(err);
      setActiveToken(null);
    }
  };

  const handleSelectChair = async (chairNumber: number) => {
    playKeypadSound();
    setSelectedChair(chairNumber);
    if (!selectedTable) return;
    await loadChairOrder(selectedTable.id, chairNumber);
  };

  const loadExistingTableToken = async (table: Table) => {
    try {
      const { data: tokenResp } = await api.get(`/restaurant/tokens/by-table/${table.id}`);
      const token = normalizeToken(tokenResp.data);
      if (token) {
        setActiveToken(token as any);
        toast.success(`🔁 Loaded running order for ${table.name}`);
        return;
      }
      const { data } = await api.get('/restaurant/orders', {
        params: { tableId: table.id, limit: 10 },
      });
      const orders = (data.data as any[]) || [];
      const activeStatuses = ['placed', 'running', 'confirmed', 'preparing', 'ready', 'served'];
      const ord = orders.find((o: any) => o && !o.isDraft && activeStatuses.includes(o.status));
      if (ord) {
        if (ord.bakeryToken?.id) {
          const tokenId = ord.bakeryToken.id;
          const { data: tokenData } = await api.get(`/restaurant/tokens/${tokenId}`);
          const token2 = normalizeToken(tokenData.data) ?? tokenData.data;
          setActiveToken(token2 as any);
          toast.success(`🔁 Loaded running order for ${table.name}`);
          return;
        }
        const items = (ord.kots || []).flatMap((k: any) => (k.items || []).map((i: any) => ({
          id: i.id,
          menuItemId: i.menuItemId,
          menuItemName: i.menuItem?.name || i.name || 'Item',
          price: Number(i.price || 0),
          quantity: Number(i.quantity || 1),
          total: Number(i.price || 0) * Number(i.quantity || 1),
          chairNumber: i.chairNumber ?? undefined,
          note: i.note,
          isRemoved: false,
        })));
        setActiveToken({
          id: 0,
          tokenNumber: 0,
          qrCode: '',
          status: 'open',
          subtotal: Number(ord.subtotal || 0),
          total: Number(ord.total || 0),
          items,
          payments: [],
        } as any);
        toast.success(`🔁 Loaded running order for ${table.name}`);
        return;
      }
    } catch (err: any) {}
    setActiveToken(null);
  };

  const handleSelectTable = async (table: Table) => {
    playKeypadSound();
    setSelectedTable(table);
    setActiveToken(null);
    setPendingCart([]);
    setCustomerName('');
    setCustomerPhone('');

    // Default to the first occupied chair for occupied tables so existing customer orders load immediately
    const seatCount = table.seatCount || 4;
    const occupied = table.occupiedSeats || [];
    let defaultChair = 1;
    if (table.status !== 'available' && occupied.length > 0) {
      defaultChair = occupied[0];
    } else {
      for (let c = 1; c <= seatCount; c++) {
        if (!occupied.includes(c)) {
          defaultChair = c;
          break;
        }
      }
    }
    setSelectedChair(defaultChair);

    if (table.status !== 'available') {
      await loadChairOrder(table.id, defaultChair);
    } else {
      toast.success(`🪑 Table ${table.name} selected (Chair ${defaultChair})`, { icon: '🪑' });
    }

    setActiveTab('menu');
  };

  // FIX: cart items are now scoped to the chair that's currently active, so
  // adding "2x Chicken 65" while Chair 2 is selected never silently merges with
  // an identical item that was added earlier for Chair 1.
  const handleAddToCart = (item: MenuItem) => {
    playAddSound();

    if (combineBillMode && combinedSelections.length > 0) {
      const targetSel = combinedSelections.find(s => s.tableId === selectedTable?.id && s.chairNumber === selectedChair) || combinedSelections[0];
      setPendingCart(prev => {
        const existing = prev.find(p => p.menuItemId === item.id && p.tableId === targetSel.tableId && p.chairNumber === targetSel.chairNumber);
        if (existing) {
          return prev.map(p => p.id === existing.id ? { ...p, quantity: p.quantity + 1 } : p);
        }
        return [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          menuItemId: item.id,
          name: item.name,
          price: Number(item.price),
          quantity: 1,
          tableId: targetSel.tableId,
          chairNumber: targetSel.chairNumber,
        }];
      });
      toast.success(`Added 1x ${item.name} (T${targetSel.tableName}-C${targetSel.chairNumber})`, { duration: 800 });
      return;
    }

    setPendingCart(prev => {
      const existing = prev.find(p => p.menuItemId === item.id && p.chairNumber === selectedChair && (!selectedTable || p.tableId === selectedTable.id));
      if (existing) {
        return prev.map(p => p.id === existing.id ? { ...p, quantity: p.quantity + 1 } : p);
      }
      return [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        menuItemId: item.id,
        name: item.name,
        price: Number(item.price),
        quantity: 1,
        tableId: selectedTable?.id,
        chairNumber: selectedChair,
      }];
    });
    toast.success(`Added ${item.name} (Chair ${selectedChair})`, { duration: 600 });
  };

  const handleUpdateQty = (id: string, delta: number) => {
    if (delta > 0) playIncrementSound();
    else playDecrementSound();
    setPendingCart(prev =>
      prev.map(p => p.id === id ? { ...p, quantity: Math.max(1, p.quantity + delta) } : p)
    );
  };

  const handleRemoveItem = (id: string) => {
    playDeleteSound();
    setPendingCart(prev => prev.filter(p => p.id !== id));
  };

  const handleClearStates = () => {
    playDeleteSound();
    setSelectedTable(null);
    setSelectedChair(1);
    setActiveToken(null);
    setPendingCart([]);
    setSearchQuery('');
    setActiveCategory('all');
    setCustomerName('');
    setCustomerPhone('');
    setCombineBillMode(false);
    setCombinedSelections([]);
    combineGroupIdRef.current = '';
  };

  // Image resolver helper with fallbacks
  const getItemImage = (img?: string, name: string = 'Item') => {
    if (img && img !== 'null' && img !== 'undefined') {
      if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:')) return img;
      const resolved = resolveImageUrl(img);
      if (resolved && !resolved.includes('undefined')) return resolved;
      return `${SERVER_URL}${img.startsWith('/') ? '' : '/'}${img}`;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0d9488&color=ffffff&bold=true&size=128`;
  };

  // Auto-refresh active token and table status on socket events
  useEffect(() => {
    const onTokenUpdated = (e: any) => {
      const token = (e as CustomEvent).detail;
      if (!token) return;
      if (activeToken && String(token.id) === String(activeToken.id)) {
        const tok = normalizeToken(token) ?? token;
        setActiveToken(tok as any);
      }
    };

    const onTokenPaid = (e: any) => {
      const token = (e as CustomEvent).detail;
      if (!token) return;
      if (activeToken && String(token.id) === String(activeToken.id)) {
        toast.success(`💳 Table freed - Bill paid!`);
        handleClearStates();
        qc.invalidateQueries({ queryKey: ['waiter-tables'] });
        setActiveTab('tables');
      }
    };

    const onTableUpdated = (e: any) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      qc.invalidateQueries({ queryKey: ['waiter-tables'] });

      if (selectedTable && String(detail.id || detail.tableId) === String(selectedTable.id)) {
        setSelectedTable(prev => prev ? {
          ...prev,
          status: detail.status || prev.status,
          occupiedSeats: detail.occupiedSeats ?? prev.occupiedSeats ?? []
        } : null);
      }
    };

    const onTableClosed = (e: any) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      qc.invalidateQueries({ queryKey: ['waiter-tables'] });

      if (selectedTable && String(detail.tableId) === String(selectedTable.id)) {
        if (detail.entireTable || !detail.remainingChairs || detail.remainingChairs.length === 0) {
          toast.success(`🪑 Table ${selectedTable.name} freed — Bill closed!`);
          handleClearStates();
        } else if (detail.closedChairs && detail.closedChairs.includes(selectedChair)) {
          toast.success(`🪑 Chair ${selectedChair} freed — Bill closed!`);
          setActiveToken(null);
          setSelectedTable(prev => prev ? {
            ...prev,
            occupiedSeats: detail.remainingChairs,
            status: detail.remainingChairs.length === 0 ? 'available' : 'partially_occupied'
          } : null);
        } else {
          setSelectedTable(prev => prev ? {
            ...prev,
            occupiedSeats: detail.remainingChairs,
            status: detail.remainingChairs.length === 0 ? 'available' : 'partially_occupied'
          } : null);
        }
      }
    };

    window.addEventListener('token_updated', onTokenUpdated as EventListener);
    window.addEventListener('token_paid', onTokenPaid as EventListener);
    window.addEventListener('table_updated', onTableUpdated as EventListener);
    window.addEventListener('table_closed', onTableClosed as EventListener);
    return () => {
      window.removeEventListener('token_updated', onTokenUpdated as EventListener);
      window.removeEventListener('token_paid', onTokenPaid as EventListener);
      window.removeEventListener('table_updated', onTableUpdated as EventListener);
      window.removeEventListener('table_closed', onTableClosed as EventListener);
    };
  }, [activeToken, selectedTable, selectedChair]);

  // FIX: KOT now only sends the items relevant to the current mode/chair, tags
  // every item with its chairNumber, and only removes those sent items from the
  // pending cart — items queued for OTHER chairs at the same table are left
  // untouched instead of being wiped or merged in.
  const handleConfirmOrder = async () => {
    if (combineBillMode && combinedSelections.length > 0) {
      if (pendingCart.length === 0) {
        toast.error('Add items to order first');
        return;
      }
      setIsConfirming(true);
      playTokenSound();

      try {
        const itemsByTable = new Map<number, typeof pendingCart>();
        for (const item of pendingCart) {
          const tId = item.tableId || selectedTable?.id;
          if (!tId) continue;
          if (!itemsByTable.has(tId)) itemsByTable.set(tId, []);
          itemsByTable.get(tId)!.push(item);
        }

        // Map of tableId -> selected chairs that should ALL show as occupied
        const chairsByTable = new Map<number, number[]>();
        for (const sel of combinedSelections) {
          if (!chairsByTable.has(sel.tableId)) chairsByTable.set(sel.tableId, []);
          const arr = chairsByTable.get(sel.tableId)!;
          if (!arr.includes(sel.chairNumber)) arr.push(sel.chairNumber);
        }

        for (const [tId, tItems] of itemsByTable.entries()) {
          const itemsPayload = tItems.map(i => ({
            menuItemId: i.menuItemId,
            quantity: i.quantity,
            chairNumber: i.chairNumber || 1,
          }));

          await api.post('/restaurant/orders', {
            tableId: tId,
            customerName: `Combined Group Order`,
            staffId: user?.id,
            type: 'dine_in',
            note: '[Combined Group Order]',
            groupId: combineGroupIdRef.current || undefined,
            occupiedChairs: chairsByTable.get(tId) || [],
            items: itemsPayload,
          });
        }

        const totalChairs = combinedSelections.length;
        setPendingCart([]);

        // Re-fetch tables to update floor plan
        await qc.invalidateQueries({ queryKey: ['waiter-tables'] });

        // If currently viewing one of the combined tables, update its local state immediately
        if (selectedTable && chairsByTable.has(selectedTable.id)) {
          const nowOccupied = chairsByTable.get(selectedTable.id)!;
          setSelectedTable(prev => {
            if (!prev) return prev;
            const newOccupied = Array.from(new Set([...(prev.occupiedSeats || []), ...nowOccupied])).sort((a, b) => a - b);
            const cap = prev.seatCount || 4;
            return {
              ...prev,
              occupiedSeats: newOccupied,
              status: newOccupied.length >= cap ? 'occupied' : 'partially_occupied',
            };
          });
        }

        toast.success(`🍳 KOT sent! (${totalChairs} Combined Chairs now OCCUPIED)`, { duration: 3500 });
      } catch (err: any) {
        toast.error(err.response?.data?.error || err.message || 'Failed to send combined KOT');
      } finally {
        setIsConfirming(false);
      }
      return;
    }

    if (!selectedTable) {
      toast.error('Select a table first');
      return;
    }

    const isEntire = tableSelectionMode === 'entire_table';
    const itemsToSend = isEntire
      ? pendingCart
      : pendingCart.filter(i => i.chairNumber === selectedChair);

    if (itemsToSend.length === 0) {
      toast.error(isEntire ? 'Add items to order first' : `Add items for Chair ${selectedChair} first`);
      return;
    }

    setIsConfirming(true);
    playTokenSound();

    const seatNote = isEntire ? '[Entire Table]' : `[Seat: ${selectedChair}]`;
    const itemsPayload = itemsToSend.map(i => ({
      menuItemId: i.menuItemId,
      quantity: i.quantity,
      chairNumber: i.chairNumber || selectedChair || 1,
    }));

    try {
      if (!activeToken) {
        try {
          await api.post('/restaurant/orders', {
            tableId: selectedTable.id,
            customerName: customerName || (isEntire ? 'Table Guests' : `Customer (Chair ${selectedChair})`),
            customerPhone: customerPhone || undefined,
            staffId: user?.id,
            type: 'dine_in',
            note: seatNote,
            items: itemsPayload,
          });
        } catch {
          await api.post('/subpos/token/create', {
            tableId: selectedTable.id,
            customerName: customerName || (isEntire ? 'Table Guests' : `Customer (Chair ${selectedChair})`),
            customerPhone: customerPhone || undefined,
            staffId: user?.id,
            note: seatNote,
            items: itemsPayload,
          });
        }
      } else {
        const payload = {
          bakeryTokenId: activeToken.id,
          tableId: selectedTable.id,
          staffId: user?.id,
          note: seatNote,
          items: itemsPayload,
        };
        await postOrder(payload);
      }

      const sentIds = new Set(itemsToSend.map(i => i.id));
      const remainingCart = pendingCart.filter(i => !sentIds.has(i.id));
      setPendingCart(remainingCart);

      // Immediately mark selected chair as occupied in local selectedTable state so UI reflects occupied immediately
      setSelectedTable(prev => {
        if (!prev) return prev;
        const newOccupied = Array.from(new Set([...(prev.occupiedSeats || []), selectedChair])).sort((a, b) => a - b);
        const cap = prev.seatCount || 4;
        return {
          ...prev,
          status: newOccupied.length >= cap ? 'occupied' : 'partially_occupied',
          occupiedSeats: newOccupied,
        };
      });

      setActiveTab('menu');
      await qc.invalidateQueries({ queryKey: ['waiter-tables'] });
      if (selectedTable) {
        await loadChairOrder(selectedTable.id, selectedChair);
      }

      toast.success(
        `🍳 KOT sent — Table ${selectedTable.name}, Chair ${selectedChair}`,
        { duration: 3000 }
      );
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || '❌ Failed to send KOT');
    } finally {
      setIsConfirming(false);
    }
  };

  // ── DERIVED STATE ──
  const sgstRate = Number(restaurantSettings?.sgstRate ?? 2.5);
  const cgstRate = Number(restaurantSettings?.cgstRate ?? 2.5);

  // FIX: totals/tax shown & sent now reflect only what THIS action will affect
  // — the current chair's queued items (or the whole cart, in entire-table mode)
  // — instead of always summing the full pending cart regardless of chair.
  const relevantPendingCart = (combineBillMode && combinedSelections.length > 0)
    ? pendingCart
    : tableSelectionMode === 'entire_table'
      ? pendingCart
      : pendingCart.filter(i => i.chairNumber === selectedChair);

  const otherChairsPendingCount = pendingCart.length - relevantPendingCart.length;

  const pendingSubtotal = relevantPendingCart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const pendingSgst = pendingSubtotal * (sgstRate / 100);
  const pendingCgst = pendingSubtotal * (cgstRate / 100);
  const pendingTax = pendingSgst + pendingCgst;
  const pendingTotal = pendingSubtotal + pendingTax;

  const existingItems = activeToken?.items?.filter((i: any) => !i.isRemoved) || [];
  const existingSubtotal = activeToken?.subtotal ?? existingItems.reduce((s: number, item: any) => s + (Number(item.price || 0) * Number(item.quantity || 1)), 0);
  const existingTotal = activeToken?.total ?? existingSubtotal;
  const combinedTotal = existingTotal + pendingTotal;

  // The chairs grouped together with the currently selected/combined chair. Uses
  // the live combine selections when in combine mode; otherwise uses the persisted
  // grouping from the floor plan so clicking any member of a group lights the
  // whole group purple and shows the shared bill items.
  const activeGroupSeats = useMemo(() => {
    if (combineBillMode && combinedSelections.length > 0) {
      return Array.from(new Set(
        combinedSelections.filter(s => s.tableId === selectedTable?.id).map(s => s.chairNumber)
      )).sort((a, b) => a - b);
    }
    const groups = selectedTable?.groupedSeats || [];
    const g = groups.find(grp => grp.includes(selectedChair));
    return g || [];
  }, [combineBillMode, combinedSelections, selectedTable, selectedChair]);

  // FIX: chair-level filtering now trusts the real chairNumber field first.
  // The old code fell back to `return selectedChair === 1` for anything it
  // couldn't identify — silently dumping unrelated items into Chair 1's bill.
  // Unidentified legacy items are now excluded from per-chair views entirely
  // (they still show up correctly under "Entire Table").
  const chairItems = useMemo(() => {
    if (!activeToken?.items) return [];
    return activeToken.items.filter((i: any) => {
      if (i.isRemoved) return false;
      if (i.chairNumber !== undefined && i.chairNumber !== null) {
        const cn = Number(i.chairNumber);
        return activeGroupSeats.length ? activeGroupSeats.includes(cn) : cn === Number(selectedChair);
      }
      const noteStr = String(i.note || i.seatNote || i.description || '');
      const match = noteStr.match(/(?:Chair|Seat:?\s*)(\d+)/i);
      if (match && match[1]) {
        const cn = Number(match[1]);
        return activeGroupSeats.length ? activeGroupSeats.includes(cn) : cn === Number(selectedChair);
      }
      return false; // unknown ownership — never guess Chair 1
    });
  }, [activeToken, selectedChair, activeGroupSeats]);

  const chairRunningSubtotal = chairItems.reduce((acc: number, item: any) => acc + (Number(item.price || 0) * Number(item.quantity || 1)), 0);

  const handleFinalizeBill = () => {
    if (!selectedTable) return;
    const isEntire = tableSelectionMode === 'entire_table';
    // If the selected chair is part of a combine group, bill the WHOLE group
    // together (the backend also joins by group id). Otherwise bill just the
    // selected chair / the whole table.
    const billChairs = isEntire
      ? []
      : (activeGroupSeats.length > 0 ? activeGroupSeats : [selectedChair]);

    const itemsForBill = isEntire
      ? (activeToken?.items?.filter((i: any) => !i.isRemoved) || [])
      : (activeToken?.items?.filter((i: any) => !i.isRemoved && (billChairs.length === 0 || billChairs.includes(Number(i.chairNumber)))) || []);

    const pendingForBill = isEntire
      ? pendingCart
      : pendingCart.filter(i => billChairs.length === 0 || billChairs.includes(i.chairNumber));

    const itemsSubtotal = itemsForBill.reduce((s: number, i: any) => s + Number(i.price || 0) * Number(i.quantity || 1), 0);
    const pendingSubtotalForBill = pendingForBill.reduce((s, i) => s + i.price * i.quantity, 0);
    const pendingTaxForBill = pendingSubtotalForBill * ((sgstRate + cgstRate) / 100);
    const targetTotal = isEntire ? combinedTotal : (itemsSubtotal + pendingSubtotalForBill + pendingTaxForBill);

    const targetLabel = isEntire
      ? `Table ${selectedTable.name} (Entire Table)`
      : `Table ${selectedTable.name} (Chair ${selectedChair})`;

    showConfirm(
      `Send Bill to Cashier for ${targetLabel}`,
      `Close the bill for ${targetLabel}?\n\nRunning Total: ${formatCurrency(targetTotal)}\n\nThe chair/table will be freed right away, and the bill will be sent to the Main POS cashier (Pending Waiter Bill) to collect the payment.`,
      () => requestBillMut.mutate({
        isEntireTable: isEntire,
        chairNumbers: isEntire ? undefined : billChairs,
        items: [...itemsForBill, ...pendingForBill],
        total: targetTotal
      })
    );
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchCat = activeCategory === 'all' || String(item.categoryId) === String(activeCategory);
      const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [items, activeCategory, searchQuery]);

  const filteredTables = useMemo(() => {
    if (!tableSearch.trim()) return tables;
    const q = tableSearch.toLowerCase();
    return tables.filter(t =>
      t.name.toLowerCase().includes(q) || (t.area?.name || '').toLowerCase().includes(q)
    );
  }, [tables, tableSearch]);

  const tablesByArea = useMemo(() => {
    const groups: Record<string, Table[]> = {};
    filteredTables.forEach(t => {
      const areaName = t.area?.name || 'General Area';
      if (!groups[areaName]) groups[areaName] = [];
      groups[areaName].push(t);
    });
    return groups;
  }, [filteredTables]);

  if (!hasAccess) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className={cn(
      "flex flex-col h-screen w-screen overflow-hidden select-none font-sans transition-colors duration-200",
      isLight ? "bg-slate-100 text-slate-900" : "bg-[#070913] text-white"
    )}>

      {/* ── Green Close Confirm Modal ── */}
      {confirmModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <div className={cn(
            "border rounded-3xl p-6 max-w-sm w-full shadow-2xl transition-all",
            isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#121420] border-gray-800 text-gray-200"
          )}>
            <div className="text-center mb-4">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3 animate-bounce" />
              <h3 className="text-lg font-black uppercase tracking-tight">{confirmModal.title}</h3>
            </div>
            <p className={cn("text-sm text-center mb-6 whitespace-pre-line leading-relaxed font-medium", isLight ? "text-slate-600" : "text-gray-400")}>
              {confirmModal.message}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmModal(o => ({ ...o, open: false }))}
                className={cn(
                  "flex-1 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition border",
                  isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-700 border-slate-300" : "bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700"
                )}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmModal(o => ({ ...o, open: false }));
                  confirmModal.onConfirm();
                }}
                disabled={requestBillMut.isPending}
                className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white py-3.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                {requestBillMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm & Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Staff Performance Analytics Modal ── */}
      {showStaffAnalytics && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4">
          <div className={cn(
            "border rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 transition-all relative",
            isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#121420] border-gray-800 text-white"
          )}>
            <button
              onClick={() => setShowStaffAnalytics(false)}
              className="absolute top-4 right-4 p-2 rounded-xl text-gray-400 hover:text-white hover:bg-rose-500/20 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 bg-teal-500/10 rounded-2xl border border-teal-500/30 text-teal-400">
                <Award className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-black tracking-tight">{user?.name} - Staff Analytics</h3>
                <p className={cn("text-xs uppercase font-bold tracking-wider", isLight ? "text-slate-500" : "text-teal-400")}>
                  Role: <span className="text-teal-400 font-extrabold">{user?.role}</span>
                </p>
              </div>
            </div>

            {isLoadingAnalytics ? (
              <div className="py-12 text-center text-teal-400">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p className="text-xs font-bold uppercase tracking-widest">Calculating Performance...</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className={cn("p-4 rounded-2xl border text-center space-y-1", isLight ? "bg-slate-50 border-slate-200" : "bg-gray-900/80 border-gray-800")}>
                  <p className="text-[10px] font-black uppercase text-teal-500 tracking-wider">Today's Customers</p>
                  <p className="text-2xl font-black text-teal-400">{staffPerformance?.dailyCustomers ?? 0}</p>
                  <p className="text-[10px] text-gray-500 font-bold">{staffPerformance?.dailyOrdersCount ?? 0} orders handled</p>
                </div>

                <div className={cn("p-4 rounded-2xl border text-center space-y-1", isLight ? "bg-slate-50 border-slate-200" : "bg-gray-900/80 border-gray-800")}>
                  <p className="text-[10px] font-black uppercase text-purple-400 tracking-wider">This Month's Customers</p>
                  <p className="text-2xl font-black text-purple-400">{staffPerformance?.monthlyCustomers ?? 0}</p>
                  <p className="text-[10px] text-gray-500 font-bold">{staffPerformance?.monthlyOrdersCount ?? 0} orders handled</p>
                </div>

                <div className={cn("p-4 rounded-2xl border text-center space-y-1", isLight ? "bg-slate-50 border-slate-200" : "bg-gray-900/80 border-gray-800")}>
                  <p className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">Daily Avg Customers</p>
                  <p className="text-2xl font-black text-emerald-400">{staffPerformance?.avgCustomersPerDay ?? 0}</p>
                  <p className="text-[10px] text-gray-500 font-bold">Avg customers / day</p>
                </div>

                <div className={cn("p-4 rounded-2xl border text-center space-y-1", isLight ? "bg-slate-50 border-slate-200" : "bg-gray-900/80 border-gray-800")}>
                  <p className="text-[10px] font-black uppercase text-amber-400 tracking-wider">Avg Order Value</p>
                  <p className="text-xl font-black text-amber-400">{formatCurrency(staffPerformance?.avgOrderValue ?? 0)}</p>
                  <p className="text-[10px] text-gray-500 font-bold">Per customer bill</p>
                </div>
              </div>
            )}

            <div className="pt-2 text-right">
              <button
                onClick={() => setShowStaffAnalytics(false)}
                className="w-full py-3 bg-teal-500 text-black font-black rounded-xl text-xs uppercase tracking-wider hover:bg-teal-400 transition"
              >
                Close Performance Panel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className={cn(
        "sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b flex-shrink-0 transition-colors",
        isLight ? "bg-white border-slate-200 text-slate-900 shadow-sm" : "bg-[#121420] border-gray-800 text-white"
      )}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-500/10 rounded-xl border border-teal-500/20">
            <Utensils className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black tracking-tighter text-sm md:text-base italic">SMART<span className="text-teal-400">GONEXT</span></span>
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">WAITER TERMINAL</span>
            </div>
            {selectedTable && (
              <span className="text-[11px] font-black text-teal-400">
                Active: Table {selectedTable.name} (Chair {selectedChair}) {activeToken ? `(#${activeToken.tokenNumber})` : '(New Order)'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Light/Dark Toggle */}
          <button
            onClick={toggleTheme}
            className={cn(
              "p-2 rounded-xl border transition flex items-center gap-1.5 text-xs font-black uppercase tracking-wider",
              isLight ? "bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200" : "bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800"
            )}
            title="Toggle Light/Dark Theme"
          >
            {isLight ? <Moon className="w-4 h-4 text-purple-600" /> : <Sun className="w-4 h-4 text-amber-400" />}
            <span className="hidden sm:inline">{isLight ? 'Dark' : 'Light'} Mode</span>
          </button>

          {/* Staff Performance Button */}
          <button
            onClick={() => setShowStaffAnalytics(true)}
            className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 px-3 py-1.5 rounded-xl border border-teal-500/30 transition"
          >
            <BarChart3 className="w-3.5 h-3.5 text-teal-400" />
            <span>My Performance</span>
          </button>

          <span className={cn("text-xs font-bold uppercase hidden md:inline", isLight ? "text-slate-600" : "text-gray-400")}>
            👤 {user?.name}
          </span>

          <button onClick={logout} className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 px-3 py-1.5 rounded-xl border border-rose-500/20 transition">
            <LogOut className="w-3.5 h-3.5 text-rose-500" /> Exit
          </button>
        </div>
      </header>

      {/* ── Tab Navigation (Mobile) ── */}
      <nav className={cn(
        "md:hidden flex border-b flex-shrink-0 z-20 transition-colors",
        isLight ? "bg-white border-slate-200 text-slate-800" : "bg-[#121420] border-gray-800 text-white"
      )}>
        <button
          onClick={() => { playKeypadSound(); setActiveTab('tables'); }}
          className={cn(
            "flex-1 py-3 text-xs font-black uppercase tracking-wider transition-all border-b-2 text-center",
            activeTab === 'tables'
              ? "border-teal-500 text-teal-400 bg-teal-500/10"
              : "border-transparent text-gray-500 hover:text-gray-300"
          )}
        >
          1. Tables ({tables.filter(t => t.status === 'occupied' || t.status === 'partially_occupied').length} Active)
        </button>
        <button
          onClick={() => { playKeypadSound(); selectedTable && setActiveTab('menu'); }}
          disabled={!selectedTable}
          className={cn(
            "flex-1 py-3 text-xs font-black uppercase tracking-wider transition-all border-b-2 text-center disabled:opacity-30",
            activeTab === 'menu'
              ? "border-teal-500 text-teal-400 bg-teal-500/10"
              : "border-transparent text-gray-500 hover:text-gray-300"
          )}
        >
          2. Menu
        </button>
        <button
          onClick={() => { playKeypadSound(); selectedTable && setActiveTab('cart'); }}
          disabled={!selectedTable}
          className={cn(
            "flex-1 py-3 text-xs font-black uppercase tracking-wider transition-all border-b-2 text-center disabled:opacity-30 relative",
            activeTab === 'cart'
              ? "border-teal-500 text-teal-400 bg-teal-500/10"
              : "border-transparent text-gray-500 hover:text-gray-300"
          )}
        >
          3. Cart & Bill
          {pendingCart.length > 0 && (
            <span className="absolute top-2 right-2 bg-teal-500 text-black text-[9px] font-black rounded-full w-5 h-5 flex items-center justify-center">
              {pendingCart.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          )}
        </button>
      </nav>

      {/* Main Container */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">

        {/* ═════════════════════════════════════════════════════════════
            PANEL 1: FLOOR PLAN & TABLES WITH CHAIR STATUS
        ═════════════════════════════════════════════════════════════ */}
        <div className={cn(
          "flex-col border-r p-4 overflow-y-auto custom-scrollbar flex-shrink-0 transition-colors",
          "w-full md:w-80 lg:w-96",
          isLight ? "border-slate-200 bg-white" : "border-gray-800 bg-[#070913]",
          activeTab === 'tables' ? "flex" : "hidden md:flex"
        )}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-teal-400">Restaurant Tables</h3>
              <span className="text-[10px] font-bold text-gray-500">{tables.length} Total</span>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Search table or area..."
                className={cn(
                  "w-full rounded-2xl py-3 pl-10 pr-4 text-xs focus:outline-none transition border",
                  isLight ? "bg-slate-100 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-teal-500" : "bg-[#121420] border-gray-800 text-white placeholder-gray-600 focus:border-teal-500/50"
                )}
              />
            </div>

            {/* ── PURPLE COMBINE BILL BANNER (Active when chairs long-pressed/selected) ── */}
            {combineBillMode && (
              <div className="p-3 rounded-2xl border bg-gradient-to-r from-purple-950/90 to-indigo-950/90 border-purple-500/80 ring-2 ring-purple-500/40 space-y-2 shadow-xl animate-pulse">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase text-purple-300 flex items-center gap-1.5 tracking-wider">
                    <Layers className="w-4 h-4 text-purple-400" />
                    Combined Bill Group ({combinedSelections.length} Picked)
                  </span>
                  <button
                    onClick={() => {
                      playKeypadSound();
                      setCombineBillMode(false);
                      setCombinedSelections([]);
                      combineGroupIdRef.current = '';
                    }}
                    className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-rose-500 hover:bg-rose-400 text-white transition border border-rose-400"
                  >
                    Exit Combine
                  </button>
                </div>

                <p className="text-[10px] text-purple-200 font-bold leading-tight">
                  Long-press any chair to add it to the Combined Bill group. Add items, Send KOT to mark all chairs occupied, then use the Cart panel to Request Bill for all combined chairs.
                </p>

                {combinedSelections.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                      {combinedSelections.map(sel => (
                        <span
                          key={`${sel.tableId}-${sel.chairNumber}`}
                          className="px-2 py-1 bg-purple-400 text-black text-[10px] font-black rounded-lg flex items-center gap-1 shadow-xs"
                        >
                          T{sel.tableName}-C{sel.chairNumber}
                          <button
                            onClick={() => setCombinedSelections(prev => prev.filter(s => !(s.tableId === sel.tableId && s.chairNumber === sel.chairNumber)))}
                            className="hover:text-rose-900 font-bold ml-1"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>

                    <p className="text-[10px] text-emerald-300 font-bold text-center pt-0.5">
                      ✅ Add items &amp; Send KOT, then go to Cart panel to Request Bill
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-6">
              {isLoadingTables ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin text-teal-400 mb-3" />
                  <p className="text-xs uppercase font-bold tracking-widest">Loading tables...</p>
                </div>
              ) : Object.keys(tablesByArea).length === 0 ? (
                <div className="text-center py-20 text-gray-600 text-xs uppercase font-bold">No tables found</div>
              ) : (
                Object.entries(tablesByArea).map(([areaName, areaTables]) => (
                  <div key={areaName} className="space-y-2.5">
                    <h4 className="text-[10px] font-black text-teal-500/80 uppercase tracking-widest px-1">{areaName}</h4>
                    <div className="grid grid-cols-2 gap-2.5">
                      {areaTables.map(table => {
                        const seatCount = table.seatCount || 4;
                        const occupiedSeats = table.occupiedSeats || [];
                        const isPartiallyOccupied = table.status === 'partially_occupied';
                        const isFullyOccupied = table.status === 'occupied';

                        return (
                          <div
                            key={table.id}
                            onPointerDown={() => startTableLongPress(table)}
                            onPointerUp={clearChairLongPress}
                            onPointerLeave={clearChairLongPress}
                            onTouchStart={() => startTableLongPress(table)}
                            onTouchEnd={clearChairLongPress}
                            onClick={() => handleSelectTable(table)}
                            className={cn(
                              'p-3 rounded-2xl text-left transition-all border flex flex-col justify-between min-h-[120px] relative overflow-hidden group scale-100 active:scale-95 shadow-md cursor-pointer',
                              selectedTable?.id === table.id
                                ? 'bg-teal-500 border-teal-300 text-black shadow-lg shadow-teal-500/25 font-black'
                                : isFullyOccupied
                                  ? 'bg-rose-950 border-rose-900/80 text-rose-200 hover:bg-rose-900'
                                  : isPartiallyOccupied
                                    ? 'bg-amber-950 border-amber-800/80 text-amber-200 hover:bg-amber-900'
                                    : isLight
                                      ? 'bg-slate-50 border-slate-200 text-slate-800 hover:border-teal-500'
                                      : 'bg-[#0a2318] border-emerald-800/70 text-emerald-300 hover:bg-[#0f2e20]'
                            )}
                          >
                            <div className="flex justify-between items-start w-full">
                              <span className="font-black text-sm tracking-tight">{table.name}</span>
                              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-black/20 flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {occupiedSeats.length}/{seatCount} Seats
                              </span>
                            </div>

                            {/* Active Staff Badge */}
                            {table.activeStaff && (
                              <p className="text-[9px] font-bold truncate opacity-90 text-amber-300">
                                👤 Waiter: {table.activeStaff}
                              </p>
                            )}

                            {/* Individual Chair Pills with Long-Press Combine Trigger */}
                            <div className="flex flex-wrap items-center gap-1 my-1.5 z-10" onClick={e => e.stopPropagation()}>
                              {Array.from({ length: seatCount }).map((_, idx) => {
                                const chairNum = idx + 1;
                                const isChairOccupied = occupiedSeats.includes(chairNum);
                                const isCombined = combinedSelections.some(
                                  x => x.tableId === table.id && x.chairNumber === chairNum
                                );

                                return (
                                  <button
                                    key={chairNum}
                                    onPointerDown={() => startChairLongPress(table.id, table.name, chairNum)}
                                    onPointerUp={clearChairLongPress}
                                    onPointerLeave={clearChairLongPress}
                                    onTouchStart={() => startChairLongPress(table.id, table.name, chairNum)}
                                    onTouchEnd={clearChairLongPress}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleChairClick(table.id, table.name, chairNum);
                                    }}
                                    className={cn(
                                      "px-2 py-1 rounded-lg text-[10px] font-black transition border shadow-xs active:scale-95 cursor-pointer flex items-center gap-1",
                                      isCombined
                                        ? "bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-purple-300 shadow-lg ring-2 ring-purple-400 font-extrabold"
                                        : isChairOccupied
                                          ? "bg-rose-950 text-rose-300 border-rose-800 hover:bg-rose-900"
                                          : isLight
                                            ? "bg-white border-slate-300 text-slate-700 hover:border-purple-400"
                                            : "bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-700"
                                    )}
                                    title={`Hold for 0.5s to Combine | Chair ${chairNum}`}
                                  >
                                    C{chairNum} {isCombined && '✓'}
                                  </button>
                                );
                              })}
                            </div>

                            <div className="flex items-center gap-1.5 mt-auto">
                              <span className={cn(
                                "w-2 h-2 rounded-full",
                                selectedTable?.id === table.id
                                  ? "bg-black"
                                  : isFullyOccupied
                                    ? "bg-rose-500"
                                    : isPartiallyOccupied
                                      ? "bg-amber-400"
                                      : "bg-emerald-400"
                              )} />
                              <span className="text-[9px] font-black uppercase tracking-wider">
                                {isFullyOccupied ? 'FULL' : isPartiallyOccupied ? 'PARTIAL' : 'AVAILABLE'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ═════════════════════════════════════════════════════════════
            PANEL 2: MENU & DISH SELECTION + SEAT CHAIR PICKER
        ═════════════════════════════════════════════════════════════ */}
        <div className={cn(
          "flex-col flex-1 min-w-0 p-4 overflow-y-auto custom-scrollbar border-r transition-colors",
          isLight ? "border-slate-200 bg-white" : "border-gray-800 bg-[#070913]",
          activeTab === 'menu' ? "flex" : "hidden md:flex"
        )}>
          {!selectedTable ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 space-y-3">
              <Utensils className="w-12 h-12 text-gray-700 animate-bounce" />
              <p className="text-sm font-black uppercase tracking-wider text-gray-400">Select a Table to Start Order</p>
              <p className="text-xs text-gray-600">Choose any table from the floor plan on the left panel</p>
            </div>
          ) : (
            <div className="space-y-4">

              {/* 🪑 SEAT / CHAIR PICKER SYSTEM */}
              <div className={cn(
                "p-3 rounded-2xl border space-y-2 transition-colors",
                isLight ? "bg-slate-50 border-slate-200" : "bg-[#121420] border-gray-800"
              )}>
                {/* Mode Selector for Couples/Groups vs Individual Chair */}
                <div className="flex gap-2 p-1 bg-[#080911] rounded-xl border border-gray-800 mb-2">
                  <button
                    onClick={() => {
                      playKeypadSound();
                      setTableSelectionMode('entire_table');
                    }}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer",
                      tableSelectionMode === 'entire_table'
                        ? "bg-gradient-to-r from-teal-500 to-emerald-500 text-black shadow-md font-black"
                        : "text-gray-400 hover:text-white"
                    )}
                  >
                    <Users className="w-3.5 h-3.5" /> Entire Table (Couple / Group)
                  </button>
                  <button
                    onClick={() => {
                      playKeypadSound();
                      setTableSelectionMode('by_chair');
                    }}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer",
                      tableSelectionMode === 'by_chair'
                        ? "bg-gradient-to-r from-teal-500 to-emerald-500 text-black shadow-md font-black"
                        : "text-gray-400 hover:text-white"
                    )}
                  >
                    <Armchair className="w-3.5 h-3.5" /> Separate Chair Billing
                  </button>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-xs font-black uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                    <Armchair className="w-4 h-4" />
                    {combineBillMode ? '🔮 Tap chairs across any table to add/remove' : `Select Chair / Seat for Table ${selectedTable.name}`}
                  </span>
                  <span className="text-[10px] font-bold text-gray-500">Capacity: {selectedTable.seatCount || 4} Chairs</span>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                  {Array.from({ length: selectedTable.seatCount || 4 }).map((_, idx) => {
                    const chairNum = idx + 1;
                    const isOccupied = (selectedTable.occupiedSeats || []).includes(chairNum);
                    const isSelected = selectedChair === chairNum;
                    const isCombined = combinedSelections.some(
                      x => x.tableId === selectedTable.id && x.chairNumber === chairNum
                    );
                    // When a data-grouped (persisted) chair is clicked, the whole
                    // group lights purple so the waiter sees they're one shared bill.
                    const isGroupLit = activeGroupSeats.includes(chairNum);
                    const isPurpleLit = isCombined || (isOccupied && isGroupLit);

                    return (
                      <button
                        key={chairNum}
                        onPointerDown={() => selectedTable && startChairLongPress(selectedTable.id, selectedTable.name, chairNum)}
                        onPointerUp={clearChairLongPress}
                        onPointerLeave={clearChairLongPress}
                        onTouchStart={() => selectedTable && startChairLongPress(selectedTable.id, selectedTable.name, chairNum)}
                        onTouchEnd={clearChairLongPress}
                        onClick={() => selectedTable && handleChairClick(selectedTable.id, selectedTable.name, chairNum)}
                        className={cn(
                          "px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition border active:scale-95 cursor-pointer",
                          isPurpleLit
                            ? "bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-purple-300 shadow-lg ring-2 ring-purple-400 font-extrabold"
                            : isSelected && !combineBillMode
                              ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-black border-teal-300 shadow-md font-black ring-2 ring-teal-400"
                              : isOccupied
                                ? "bg-rose-950/80 border-rose-800 text-rose-300"
                                : isLight
                                  ? "bg-white border-slate-300 text-slate-700 hover:border-purple-400"
                                  : "bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-700"
                        )}
                      >
                        <Armchair className="w-3.5 h-3.5" />
                        Chair {chairNum}
                        {isOccupied && (
                          <span className={cn(
                            "text-[9px] font-extrabold px-1 rounded",
                            isPurpleLit
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                              : "text-rose-400"
                          )}>
                            Occupied
                          </span>
                        )}
                        {!isOccupied && isPurpleLit && <span className="text-[9px] text-white font-extrabold">✓</span>}
                        {isOccupied && isPurpleLit && <span className="text-[9px] text-rose-300 font-extrabold">•</span>}
                        {!isPurpleLit && isSelected && <span className="text-[9px] text-black font-extrabold">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Filter Bar */}
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search menu items..."
                      className={cn(
                        "w-full rounded-2xl py-3 pl-10 pr-4 text-xs focus:outline-none transition border",
                        isLight ? "bg-slate-100 border-slate-200 text-slate-900 focus:border-teal-500" : "bg-[#121420] border-gray-800 text-white focus:border-teal-500/50"
                      )}
                    />
                  </div>
                  <button
                    onClick={() => { setSearchQuery(''); setActiveCategory('all'); }}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-4 rounded-2xl text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Horizontal Category Pill List */}
                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                  <button
                    onClick={() => { playKeypadSound(); setActiveCategory('all'); }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all border",
                      activeCategory === 'all'
                        ? "bg-teal-500 text-black border-teal-400 shadow-md"
                        : isLight
                          ? "bg-slate-100 border-slate-200 text-slate-700 hover:border-slate-300"
                          : "bg-[#121420] border-gray-800 text-gray-400 hover:border-gray-700"
                    )}
                  >
                    All Items
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => { playKeypadSound(); setActiveCategory(String(cat.id)); }}
                      className={cn(
                        "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all border",
                        activeCategory === String(cat.id)
                          ? "bg-teal-500 text-black border-teal-400 shadow-md"
                          : isLight
                            ? "bg-slate-100 border-slate-200 text-slate-700 hover:border-slate-300"
                            : "bg-[#121420] border-gray-800 text-gray-400 hover:border-gray-700"
                      )}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Menu Items List */}
              <div className="space-y-3 pt-2">
                {isLoadingItems ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                    <Loader2 className="w-8 h-8 animate-spin text-teal-400 mb-2" />
                    <p className="text-xs">Loading items...</p>
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-20 text-gray-600 text-xs">No items match filters</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredItems.map(item => {
                      const cartEntry = pendingCart.find(p => p.menuItemId === item.id && p.chairNumber === selectedChair);
                      const cartQty = cartEntry?.quantity ?? 0;
                      const imageUrl = getItemImage(item.image, item.name);

                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "border rounded-2xl p-3 flex flex-col justify-between hover:border-teal-500/50 transition group shadow-xs",
                            isLight ? "bg-white border-slate-200" : "bg-[#121420] border-gray-800"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0 mb-3">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={item.name}
                                className="w-14 h-14 object-cover rounded-xl bg-gray-800 flex-shrink-0 border border-gray-700/50 shadow-xs"
                                loading="lazy"
                                onError={(e) => {
                                  e.currentTarget.onerror = null;
                                  e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=0d9488&color=fff`;
                                }}
                              />
                            ) : (
                              <div className="w-14 h-14 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 flex-shrink-0">
                                <Utensils className="w-6 h-6" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <h4 className={cn("text-xs font-black truncate group-hover:text-teal-400 transition", isLight ? "text-slate-900" : "text-gray-200")}>
                                {item.name}
                              </h4>
                              <p className="text-xs font-bold text-teal-500 mt-1">{formatCurrency(item.price)}</p>
                            </div>
                          </div>

                          <div className={cn("flex items-center justify-between pt-2 border-t", isLight ? "border-slate-100" : "border-gray-800/60")}>
                            <span className="text-[10px] text-gray-500 font-bold uppercase">In Cart (Chair {selectedChair})</span>
                            {cartQty > 0 ? (
                              <div className="flex items-center gap-2 bg-[#080911] border border-gray-800 p-1 rounded-xl">
                                <button
                                  onClick={() => handleUpdateQty(cartEntry!.id, -1)}
                                  className="bg-gray-800 text-white w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold hover:bg-gray-700 active:scale-95"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-xs font-black px-1.5 text-teal-400">{cartQty}</span>
                                <button
                                  onClick={() => handleUpdateQty(cartEntry!.id, 1)}
                                  className="bg-teal-500 text-black w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold hover:bg-teal-400 active:scale-95"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddToCart(item)}
                                className="bg-teal-500 hover:bg-teal-400 text-black px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 active:scale-95 transition"
                              >
                                Add <Plus className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

        {/* ═════════════════════════════════════════════════════════════
            PANEL 3: CART & BILL SUMMARY
        ═════════════════════════════════════════════════════════════ */}
        <div className={cn(
          "flex-col p-4 overflow-y-auto custom-scrollbar flex-shrink-0 transition-colors",
          "w-full md:w-80 lg:w-96",
          isLight ? "bg-slate-50 text-slate-900" : "bg-[#070913] text-white",
          activeTab === 'cart' ? "flex" : "hidden md:flex"
        )}>
          {!selectedTable ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 space-y-3">
              <ShoppingCart className="w-12 h-12 text-gray-700" />
              <p className="text-xs font-black uppercase tracking-wider text-gray-400">No Table Selected</p>
            </div>
          ) : (
            <div className="space-y-4">

              {/* Table Banner */}
              <div className={cn(
                "border rounded-3xl p-4 flex justify-between items-center shadow-xs",
                isLight ? "bg-white border-slate-200" : "bg-[#121420] border-gray-800"
              )}>
                <div>
                  <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest">Active Station</p>
                  <h3 className="text-base font-black mt-1">Table {selectedTable.name} <span className="text-xs font-bold text-teal-500">(Chair {selectedChair})</span></h3>
                </div>
                <div className="text-right">
                  {activeToken ? (
                    <>
                      <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Running Token</p>
                      <h3 className="text-base font-black text-rose-300 mt-1">#{activeToken.tokenNumber}</h3>
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Table Status</p>
                      <h3 className="text-base font-black text-emerald-400 mt-1">OPEN SEAT</h3>
                    </>
                  )}
                </div>
              </div>

              {/* Running Ordered Items — filtered by REAL chairNumber now */}
              {((selectedTable?.status !== 'available') || ((selectedTable?.occupiedSeats || []).includes(selectedChair))) && activeToken && activeToken.items && activeToken.items.length > 0 && (
                <div className={cn(
                  "border rounded-3xl p-4 space-y-3 shadow-sm transition-colors",
                  isLight ? "bg-amber-50/70 border-amber-300" : "bg-[#16140b] border-amber-900/60"
                )}>
                  <div className="flex justify-between items-center pb-2 border-b border-amber-500/20">
                    <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Utensils className="w-3.5 h-3.5 text-amber-400" />
                      {tableSelectionMode === 'entire_table' ? 'Entire Table Items' : `Chair ${selectedChair} Items`} (#{activeToken.tokenNumber || 'Active'})
                    </span>
                    <span className="text-[9px] font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase">
                      Ordered
                    </span>
                  </div>

                  <div className="space-y-2.5 max-h-48 overflow-y-auto custom-scrollbar pr-1 divide-y divide-amber-500/10">
                    {(tableSelectionMode === 'entire_table'
                      ? activeToken.items.filter((i: any) => !i.isRemoved)
                      : chairItems
                    ).map((item: any, idx: number) => {
                      const itemName = item.menuItemName || item.menuItem?.name || item.name || 'Item';
                      const price = Number(item.price || 0);
                      const qty = Number(item.quantity || 1);
                      return (
                        <div key={item.id || idx} className={cn("flex items-center justify-between text-xs", idx > 0 && "pt-2")}>
                          <div className="min-w-0 flex-1 pr-2">
                            <span className={cn("font-black block truncate", isLight ? "text-slate-800" : "text-gray-200")}>
                              {itemName}
                            </span>
                            <span className="text-[10px] text-gray-500 font-bold block mt-0.5">
                              {formatCurrency(price)} × {qty}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-black text-amber-500 text-xs">{formatCurrency(price * qty)}</span>
                          </div>
                        </div>
                      );
                    })}
                    {tableSelectionMode === 'by_chair' && chairItems.length === 0 && (
                      <div className="text-center py-3 text-[11px] text-gray-500 font-bold uppercase">
                        No ordered items tagged to Chair {selectedChair} yet
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Pending Cart Items — scoped to the active chair (or whole cart in entire-table mode) */}
              <div className={cn(
                "border rounded-3xl p-4 space-y-3 shadow-xs",
                isLight ? "bg-white border-slate-200" : "bg-[#121420] border-gray-800"
              )}>
                <div className="flex justify-between items-center pb-2 border-b border-gray-800">
                  <span className="text-[10px] font-black text-teal-400 uppercase tracking-widest">
                    {tableSelectionMode === 'entire_table' ? 'Pending Order Additions' : `Pending Additions — Chair ${selectedChair}`}
                  </span>
                  {relevantPendingCart.length > 0 && (
                    <button
                      onClick={() => {
                        const relevantIds = new Set(relevantPendingCart.map(i => i.id));
                        setPendingCart(prev => prev.filter(i => !relevantIds.has(i.id)));
                      }}
                      className="text-[10px] font-black text-rose-500 uppercase tracking-wider hover:underline"
                    >
                      Clear these
                    </button>
                  )}
                </div>

                {relevantPendingCart.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-500 uppercase font-black tracking-widest">
                    No new items added yet
                  </div>
                ) : (
                  <div className="space-y-3 divide-y divide-gray-800/50">
                    {relevantPendingCart.map((item, idx) => (
                      <div key={item.id} className={cn("flex items-center justify-between text-xs", idx > 0 && "pt-3")}>
                        <div className="min-w-0 flex-1 pr-3">
                          <span className="font-bold block truncate">{item.name}</span>
                          <span className="text-[10px] text-gray-500 font-medium mt-0.5 block">
                            {formatCurrency(item.price)} each {tableSelectionMode === 'entire_table' && `· Chair ${item.chairNumber}`}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-[#080911] p-1 rounded-xl border border-gray-800">
                            <button
                              onClick={() => handleUpdateQty(item.id, -1)}
                              className="bg-gray-800 text-white w-6 h-6 flex items-center justify-center rounded-lg text-xs"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-5 text-center font-black text-teal-400">{item.quantity}</span>
                            <button
                              onClick={() => handleUpdateQty(item.id, 1)}
                              className="bg-teal-500 text-black w-6 h-6 flex items-center justify-center rounded-lg text-xs"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-gray-500 hover:text-rose-500 p-1 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {otherChairsPendingCount > 0 && (
                  <p className="text-[10px] text-amber-500 font-bold text-center pt-1">
                    ⓘ {otherChairsPendingCount} item(s) queued for other chairs — switch chair to view/send them
                  </p>
                )}
              </div>

              {/* Totals Summary — reflects only what will be sent/billed right now */}
              {(relevantPendingCart.length > 0 || activeToken) && (
                <div className={cn(
                  "border rounded-3xl p-4 space-y-3 shadow-xs",
                  isLight ? "bg-white border-slate-200" : "bg-[#121420] border-gray-800"
                )}>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Subtotal</span>
                    <span>{formatCurrency(existingSubtotal + pendingSubtotal)}</span>
                  </div>
                  {relevantPendingCart.length > 0 && (
                    <div className="pl-3 border-l-2 border-teal-500/30 space-y-1.5 text-[10px] text-gray-500">
                      <div className="flex justify-between">
                        <span>SGST ({sgstRate}%)</span>
                        <span>{formatCurrency(pendingSgst)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>CGST ({cgstRate}%)</span>
                        <span>{formatCurrency(pendingCgst)}</span>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between text-teal-500 font-black text-sm pt-2 border-t border-gray-800 uppercase tracking-wider">
                    <span>Grand Total</span>
                    <span>{formatCurrency(combinedTotal)}</span>
                  </div>
                </div>
              )}

              {/* Actions Area */}
              <div className="space-y-2.5 pt-2">
                <button
                  onClick={handleConfirmOrder}
                  disabled={relevantPendingCart.length === 0 || isConfirming}
                  className="w-full bg-teal-500 hover:bg-teal-400 text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition flex items-center justify-center gap-2 disabled:opacity-40 shadow-lg shadow-teal-500/20 active:scale-95 cursor-pointer"
                >
                  {isConfirming ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Sending to Kitchen...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      {tableSelectionMode === 'entire_table' ? 'CONFIRM & SEND KOT (WHOLE TABLE)' : `CONFIRM & SEND KOT (CHAIR ${selectedChair})`}
                    </>
                  )}
                </button>

                {(selectedTable || (combineBillMode && combinedSelections.length > 0)) && (
                  <button
                    onClick={handleFinalizeBill}
                    disabled={requestBillMut.isPending || isConfirming}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 active:scale-95 cursor-pointer border border-emerald-400/30"
                  >
                    {requestBillMut.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : tableSelectionMode === 'entire_table' ? (
                      "🧾 CLOSE BILL & SEND TO CASHIER (WHOLE TABLE)"
                    ) : (
                      `🧾 CLOSE BILL & SEND TO CASHIER (CHAIR ${selectedChair})`
                    )}
                  </button>
                )}

                <button
                  onClick={handleClearStates}
                  className={cn(
                    "w-full border hover:bg-gray-800 text-gray-400 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition",
                    isLight ? "bg-white border-slate-200 text-slate-600 hover:bg-slate-100" : "bg-[#121420] border-gray-800 text-gray-400 hover:bg-gray-800"
                  )}
                >
                  Clear Selection
                </button>
              </div>

            </div>
          )}
        </div>

      </div>

    </div>
  );
}