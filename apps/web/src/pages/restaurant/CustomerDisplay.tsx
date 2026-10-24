import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Utensils, ShoppingBag, CreditCard, RefreshCcw, Wifi, WifiOff, QrCode, Sparkles, ShieldCheck, Sun, Moon } from 'lucide-react';
import { formatCurrency, cn, resolveImageUrl } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { useSearchParams } from 'react-router-dom';
import { useThemeStore } from '@/stores/themeStore';

export default function CustomerDisplay() {
  const { theme, toggleTheme } = useThemeStore();
  const isLight = theme === 'light';
  const [cart, setCart] = useState<any[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [tax, setTax] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [total, setTotal] = useState(0);
  const { socket } = useSocket();
  const [connected, setConnected] = useState(Boolean(socket?.connected));
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [tableName, setTableName] = useState<string | null>(null);

  // useSearchParams works correctly with both BrowserRouter and HashRouter
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get('token');
  const ridParam = searchParams.get('rid');

  // Fetch store bill settings to display official store tax rate if needed
  const { data: billSettings } = useQuery({
    queryKey: ['store-bill-settings-display'],
    queryFn: async () => {
      try {
        const res = await api.get('/mainpos/bill-settings');
        return res.data?.data;
      } catch {
        try {
          const res = await axios.get('/api/restaurant/bill-settings', { withCredentials: true });
          return res.data?.data;
        } catch {
          return null;
        }
      }
    },
    retry: false,
    staleTime: 1000 * 60 * 10,
  });

  const { data: latestOrder, isLoading: orderLoading } = useQuery({
    queryKey: ['latest-pos-order', ridParam],
    queryFn: () => axios.get('/api/restaurant/orders?limit=1', { withCredentials: true }).then(r => r.data?.data?.[0]).catch(() => null),
    refetchInterval: 8000,
    enabled: false,
    retry: false,
  });

  const [upiData, setUpiData] = useState<any>(null);
  const [splitDetails, setSplitDetails] = useState<any>(null);
  const [paymentSuccessData, setPaymentSuccessData] = useState<any>(null);

  const handleReset = () => {
    setCart([]);
    setSubtotal(0);
    setTax(0);
    setDiscount(0);
    setTotal(0);
    setUpiData(null);
    setSplitDetails(null);
    setOrderNumber(null);
    setTableName(null);
    setPaymentSuccessData(null);
  };

  const handlePaymentOk = (data: any) => {
    setUpiData(null);
    setPaymentSuccessData(data || { paid: total || subtotal });
    setTimeout(() => {
      setPaymentSuccessData(null);
      handleReset();
    }, 4000);
  };

  useEffect(() => {
    if (!socket) return;

    const checkConn = () => setConnected(Boolean(socket.connected));
    checkConn();

    const connInterval = setInterval(() => {
      setConnected(Boolean(socket.connected));
    }, 1000);

    const activeRid = ridParam || billSettings?.restaurantId || 1;

    const handleConnect = () => {
      setConnected(true);
      if (activeRid) socket.emit('join_restaurant', activeRid);
    };

    const handleDisconnect = () => setConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    if (activeRid && socket.connected) {
      socket.emit('join_restaurant', activeRid);
    }

    const handleNewOrder = (order: any) => {
      setUpiData(null);
      setSplitDetails(null);
      setOrderNumber(order.orderNumber || null);
      setTableName(order.table?.name || null);
      const items = order.kots?.flatMap((kot: any) =>
        kot.items.map((i: any) => ({
          name: i.menuItem?.name || 'Unknown',
          category: i.menuItem?.category?.name || '',
          quantity: Number(i.quantity ?? 1),
          price: Number(i.price ?? 0),
          image: resolveImageUrl(i.menuItem?.image) || null
        })) || []
      ) || [];
      setCart(items);
      const calcSub = Number(order.subtotal ?? items.reduce((s: number, it: any) => s + (it.price * it.quantity), 0));
      const calcTax = Number(order.tax ?? 0);
      const calcDisc = Number(order.discount ?? 0);
      const calcTot = Number(order.total ?? (calcSub + calcTax - calcDisc));
      setSubtotal(calcSub);
      setTax(calcTax);
      setDiscount(calcDisc);
      setTotal(calcTot);
    };

    const handleDisplayUpdate = (data: any) => {
      setUpiData(null);
      setSplitDetails(null);
      if (data.tokenNumber) setOrderNumber(String(data.tokenNumber));
      else if (data.orderNumber) setOrderNumber(data.orderNumber);

      if (data.items) {
        const mappedItems = data.items.map((i: any) => ({
          name: i.name,
          category: i.category || '',
          quantity: Number(i.quantity ?? 1),
          price: Number(i.price ?? 0),
          image: resolveImageUrl(i.image) || null
        }));
        setCart(mappedItems);

        const itemsSubtotal = mappedItems.reduce((s: number, it: any) => s + (it.price * it.quantity), 0);
        const calcSub = data.subtotal !== undefined ? Number(data.subtotal) : itemsSubtotal;
        const calcTax = data.tax !== undefined ? Number(data.tax) : 0;
        const calcDisc = data.discount !== undefined ? Number(data.discount) : 0;
        const calcTot = data.total !== undefined ? Number(data.total) : (calcSub + calcTax - calcDisc);

        setSubtotal(calcSub);
        setTax(calcTax);
        setDiscount(calcDisc);
        setTotal(calcTot);
      }
    };

    const handleShowQR = (data: any) => setUpiData(data);
    const handleSplitUpdate = (data: any) => setSplitDetails(data);

    socket.on('new_order', handleNewOrder);
    socket.on('order_updated', handleNewOrder);
    socket.on('customer_display_update', handleDisplayUpdate);
    socket.on('customer_display_reset', handleReset);
    socket.on('customer_display_show_qr', handleShowQR);
    socket.on('customer_display_split_update', handleSplitUpdate);
    socket.on('customer_display_payment_ok', handlePaymentOk);
    socket.on('payment_success', handlePaymentOk);

    return () => {
      clearInterval(connInterval);
      socket.off('new_order', handleNewOrder);
      socket.off('order_updated', handleNewOrder);
      socket.off('customer_display_update', handleDisplayUpdate);
      socket.off('customer_display_reset', handleReset);
      socket.off('customer_display_show_qr', handleShowQR);
      socket.off('customer_display_split_update', handleSplitUpdate);
      socket.off('customer_display_payment_ok', handlePaymentOk);
      socket.off('payment_success', handlePaymentOk);
      socket.off('connect');
      socket.off('disconnect');
    };
  }, [socket, ridParam]);

  useEffect(() => {
    if (latestOrder && !socket?.connected) {
      setOrderNumber(latestOrder.orderNumber || null);
      setTableName(latestOrder.table?.name || null);
      const items = latestOrder.kots?.flatMap((kot: any) =>
        kot.items.map((i: any) => ({
          name: i.menuItem?.name || 'Unknown',
          category: i.menuItem?.category?.name || '',
          quantity: Number(i.quantity ?? 1),
          price: Number(i.price ?? 0),
          image: resolveImageUrl(i.menuItem?.image) || null
        })) || []
      ) || [];
      setCart(items);
      const calcSub = Number(latestOrder.subtotal ?? items.reduce((s: number, it: any) => s + (it.price * it.quantity), 0));
      const calcTax = Number(latestOrder.tax ?? 0);
      const calcTot = Number(latestOrder.total ?? (calcSub + calcTax));
      setSubtotal(calcSub);
      setTax(calcTax);
      setTotal(calcTot);
    }
  }, [latestOrder, socket]);

  const closeQR = () => setUpiData(null);

  useEffect(() => {
    if (!upiData) return;

    // Real status poller: Polls token status in backend every 1.5s (No fake timer)
    const pollInterval = setInterval(async () => {
      const tokenQr = upiData.token || upiData.tokenQr;
      if (!tokenQr) return;
      try {
        const res = await axios.get(`/api/restaurant/payment-gateway/token-status/${tokenQr}`).catch(() => null);
        const tok = res?.data?.data ?? res?.data;
        if (tok?.status === 'paid') {
          handlePaymentOk({
            paid: Number(tok.total || upiData.amount),
            customerName: tok.customerName
          });
        }
      } catch (err) {
        // silent catch
      }
    }, 1500);

    const closeTimer = setTimeout(() => setUpiData(null), 120000);
    return () => {
      clearInterval(pollInterval);
      clearTimeout(closeTimer);
    };
  }, [upiData]);

  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const gstPercent = billSettings?.taxRate ?? billSettings?.gstPercent ?? (tax > 0 && subtotal > 0 ? Math.round((tax / subtotal) * 100) : 0);

  if (orderLoading && cart.length === 0) {
    return (
      <div className="fixed inset-0 bg-[#0b0f19] text-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 opacity-70">
          <RefreshCcw className="w-9 h-9 animate-spin text-purple-400" />
          <p className="text-xl font-bold tracking-wide text-slate-300">Connecting Customer Terminal...</p>
          <p className="text-sm text-slate-500">Waiting for live order stream</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "fixed inset-0 flex flex-col font-sans selection:bg-purple-500/30 overflow-hidden transition-colors duration-200",
      isLight ? "bg-slate-100 text-slate-900" : "bg-[#0b0f19] text-slate-50"
    )}>
      {/* Top Header Bar */}
      <div className={cn(
        "h-16 px-8 flex items-center justify-between backdrop-blur-xl z-20 border-b transition-colors duration-200",
        isLight ? "bg-white/90 border-slate-200 shadow-sm" : "bg-[#111625]/90 border-slate-800/80"
      )}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-purple-500/20">
            {(billSettings?.restaurantName || 'S')[0].toUpperCase()}
          </div>
          <div>
            <span className={cn("font-extrabold text-lg tracking-tight", isLight ? "text-slate-900" : "text-white")}>{billSettings?.restaurantName || 'SMARTGONEXT POS'}</span>
            <span className={cn("ml-2 text-xs font-semibold px-2 py-0.5 rounded border", isLight ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-purple-500/10 text-purple-400 border-purple-500/20")}>Live Checkout</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className={cn(
              "p-2 rounded-xl border flex items-center justify-center transition-all shadow-sm",
              isLight ? "bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700" : "bg-gray-800 hover:bg-gray-700 border-gray-700 text-amber-400"
            )}
            title="Toggle theme mode"
          >
            {isLight ? <Moon className="w-4 h-4 text-purple-700" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>

          <div className={cn(
            'flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border',
            connected
              ? (isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20')
              : (isLight ? 'bg-slate-200 text-slate-600 border-slate-300' : 'bg-slate-800 text-slate-400 border-slate-700')
          )}>
            {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {connected ? 'Live Sync' : 'Polling Mode'}
          </div>
          {(tokenParam || orderNumber) && (
            <div className={cn("px-4 py-1.5 rounded-full border text-xs font-black uppercase tracking-wider shadow-sm", isLight ? "bg-purple-100 text-purple-900 border-purple-300" : "bg-purple-500/10 text-purple-300 border-purple-500/20")}>
              Token #{tokenParam || orderNumber}
            </div>
          )}
        </div>
      </div>

      {/* QR Code Payment Overlay */}
      {upiData && (() => {
        const displayedVpa = upiData.merchantVpa || (upiData.upiUri?.match(/pa=([^&]+)/)?.[1] ? decodeURIComponent(upiData.upiUri.match(/pa=([^&]+)/)[1]) : '');
        return (
          <div className="fixed inset-0 z-[100] bg-slate-950/98 backdrop-blur-2xl flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-300" onClick={closeQR}>
            <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl shadow-purple-500/30 mb-8 transform scale-105 relative">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiData.upiUri || `upi://pay?pa=merchant@upi&pn=Restaurant&am=${upiData.amount}&cu=INR`)}`} 
                alt="Payment QR"
                className="w-72 h-72 rounded-xl"
              />
            </div>
            <h2 className="text-4xl font-black text-white mb-2 tracking-tight">Scan QR to Pay</h2>
            <p className="text-5xl font-black text-emerald-400 mb-3 tracking-tight">{formatCurrency(upiData.amount)}</p>
            <p className="text-base text-slate-400 font-bold tracking-widest uppercase">GPay / PhonePe / Paytm / Any UPI App</p>
            {displayedVpa && (
              <p className="text-sm font-mono text-purple-300 bg-purple-500/10 px-4 py-1.5 rounded-full border border-purple-500/20 mt-4 font-bold tracking-wide">
                UPI VPA: {displayedVpa}
              </p>
            )}

            <p className="text-xs text-slate-500 mt-6 animate-pulse">Tap screen to close</p>
          </div>
        );
      })()}

      {/* Payment Success Overlay */}
      {paymentSuccessData && (
        <div className="fixed inset-0 z-[110] bg-slate-950/98 backdrop-blur-2xl flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-300">
          <div className="w-28 h-28 rounded-full bg-emerald-500/20 border-4 border-emerald-500 flex items-center justify-center text-emerald-400 mb-6 shadow-2xl shadow-emerald-500/40 animate-bounce">
            <ShieldCheck className="w-16 h-16" />
          </div>
          <h2 className="text-4xl font-black text-white mb-2 tracking-tight">Payment Successful! 🎉</h2>
          <p className="text-5xl font-black text-emerald-400 mb-3 tracking-tight">
            {formatCurrency(paymentSuccessData.paid || paymentSuccessData.amount || total)}
          </p>
          <p className="text-lg text-slate-300 font-bold">Thank you for dining with us!</p>
          {paymentSuccessData.customerName && (
            <p className="text-sm text-purple-400 font-extrabold mt-2">Welcome back, {paymentSuccessData.customerName}!</p>
          )}
        </div>
      )}

      {/* Main Screen Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Cart & Totals */}
        <div className={cn("flex-1 flex flex-col p-8 border-r transition-colors duration-200", isLight ? "bg-white border-slate-200" : "bg-[#0d1220]/70 border-slate-800/80")}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center border shadow-md", isLight ? "bg-purple-100 text-purple-700 border-purple-300" : "bg-purple-500/10 text-purple-400 border-purple-500/20")}>
                <ShoppingBag size={24} />
              </div>
              <div>
                <h1 className={cn("text-2xl font-black tracking-tight", isLight ? "text-slate-900" : "text-white")}>Your Order</h1>
                <p className={cn("text-xs font-medium", isLight ? "text-slate-500" : "text-slate-400")}>Review your item list below</p>
              </div>
            </div>
            {itemCount > 0 && (
              <span className={cn("font-bold text-xs px-3.5 py-1.5 rounded-full border shadow-sm", isLight ? "bg-purple-100 text-purple-900 border-purple-300" : "bg-purple-500/10 text-purple-300 border-purple-500/20")}>
                {itemCount} {itemCount === 1 ? 'Item' : 'Items'}
              </span>
            )}
          </div>

          {/* Cart Items List with Images */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            {cart.length > 0 ? cart.map((item, i) => {
              const itemTotal = item.price * item.quantity;
              const initial = String(item.name || 'I').charAt(0).toUpperCase();
              return (
                <div key={i} className={cn("flex items-center justify-between border p-4 rounded-2xl transition-all shadow-sm", isLight ? "bg-slate-50 border-slate-200 hover:border-purple-300 text-slate-900" : "bg-[#151c2e]/90 border-slate-800/90 hover:border-purple-500/30 text-white")}>
                  <div className="flex items-center gap-4">
                    {/* Item Image */}
                    {item.image ? (
                      <img src={item.image} alt={item.name} className={cn("w-14 h-14 rounded-xl object-cover border shadow-md", isLight ? "border-slate-300" : "border-slate-700/60")} />
                    ) : (
                      <div className={cn("w-14 h-14 rounded-xl border flex items-center justify-center font-black text-xl shadow-md", isLight ? "bg-purple-100 text-purple-700 border-purple-300" : "bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700/60 text-purple-400")}>
                        {initial}
                      </div>
                    )}
                    <div>
                      <h3 className={cn("text-base font-extrabold tracking-wide", isLight ? "text-slate-900" : "text-white")}>{item.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn("text-xs font-black px-2.5 py-0.5 rounded border", isLight ? "bg-purple-100 text-purple-800 border-purple-300" : "bg-purple-500/10 text-purple-400 border-purple-500/20")}>
                          Qty: {item.quantity}
                        </span>
                        <span className={cn("text-xs font-semibold", isLight ? "text-slate-600" : "text-slate-400")}>
                          @ {formatCurrency(item.price)} each
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className={cn("text-lg font-black tracking-tight", isLight ? "text-slate-900" : "text-white")}>{formatCurrency(itemTotal)}</span>
                </div>
              );
            }) : (
              <div className="h-full flex flex-col items-center justify-center opacity-40 text-center px-10">
                <Utensils size={72} className={cn("mb-4", isLight ? "text-slate-400" : "text-slate-600")} />
                <p className={cn("text-2xl font-bold", isLight ? "text-slate-700" : "text-slate-300")}>Welcome to our POS Counter!</p>
                <p className={cn("text-sm mt-1 font-medium", isLight ? "text-slate-500" : "text-slate-500")}>Your order details will appear here live as items are scanned.</p>
              </div>
            )}
          </div>

          {/* Totals Breakdown matching Store Settings */}
          {total > 0 && (
            <div className={cn("mt-6 pt-5 border-t space-y-3", isLight ? "border-slate-200" : "border-slate-800/90")}>
              <div className={cn("space-y-2 text-sm font-semibold", isLight ? "text-slate-700" : "text-slate-300")}>
                <div className="flex justify-between items-center">
                  <span className={isLight ? "text-slate-500" : "text-slate-400"}>Subtotal</span>
                  <span className={cn("text-base font-bold", isLight ? "text-slate-900" : "text-slate-200")}>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={isLight ? "text-slate-500" : "text-slate-400"}>
                    {gstPercent > 0 ? `GST / TAX (${gstPercent}%)` : 'GST / TAX'}
                  </span>
                  <span className={cn("text-base font-bold", isLight ? "text-slate-900" : "text-slate-200")}>
                    {tax > 0 ? formatCurrency(tax) : '₹0.00'}
                  </span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between items-center text-emerald-600 font-bold">
                    <span>Discount</span>
                    <span className="text-base font-bold">- {formatCurrency(discount)}</span>
                  </div>
                )}
              </div>

              {/* Split Breakdown */}
              {splitDetails && (
                <div className={cn("border p-3.5 rounded-2xl space-y-2", isLight ? "bg-purple-50 border-purple-200" : "bg-[#151c2e] border-purple-500/30")}>
                  <div className="flex justify-between items-center text-xs font-black text-purple-700 uppercase tracking-wide">
                    <span>Split Payment Breakdown</span>
                    <span className="text-[10px] bg-purple-200 text-purple-800 px-2 py-0.5 rounded border border-purple-300 font-bold">Live Mode</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                    <div className={cn("p-2 rounded-xl border flex justify-between items-center", isLight ? "bg-white border-slate-300" : "bg-slate-900/90 border-slate-800")}>
                      <span className={cn("uppercase text-[11px] font-black", isLight ? "text-slate-600" : "text-slate-400")}>{splitDetails.method1}:</span>
                      <span className="text-emerald-600 font-mono font-black text-sm">₹{Number(splitDetails.amount1 || 0).toFixed(2)}</span>
                    </div>
                    <div className={cn("p-2 rounded-xl border flex justify-between items-center", isLight ? "bg-white border-slate-300" : "bg-slate-900/90 border-slate-800")}>
                      <span className={cn("uppercase text-[11px] font-black", isLight ? "text-slate-600" : "text-slate-400")}>{splitDetails.method2}:</span>
                      <span className="text-purple-700 font-mono font-black text-sm">₹{Number(splitDetails.amount2 || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Total Payable */}
              <div className="flex justify-between items-center bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-5 rounded-2xl shadow-xl shadow-purple-900/20 border border-purple-400/20">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-200 block">Total Payable</span>
                  <span className="text-3xl font-black tracking-tight">{formatCurrency(total)}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-lg border border-white/20 text-xs font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Verified Bill</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Modern Promotional Branding Panel */}
        <div className={cn("w-[420px] flex flex-col p-8 overflow-hidden relative border-l transition-colors duration-200", isLight ? "bg-slate-50 border-slate-200" : "bg-[#0b0f19] border-slate-800/80")}>
          <div className="relative z-10 flex-1 flex flex-col">
            {/* Gourmet Showcase Card */}
            <div className="mb-6 flex-1">
              <div className="flex items-center justify-between mb-3">
                <h2 className={cn("font-extrabold text-xs uppercase tracking-[0.2em] flex items-center gap-1.5", isLight ? "text-purple-700" : "text-purple-400")}>
                  <Sparkles className="w-3.5 h-3.5" /> Handcrafted Delights
                </h2>
                <Badge variant="success" className="text-[10px] font-bold">Fresh Daily</Badge>
              </div>

              <Card padding={false} className={cn("border h-[340px] overflow-hidden rounded-2xl relative group shadow-xl", isLight ? "bg-white border-slate-200" : "bg-[#121827] border-slate-800")}>
                <div className="h-full relative flex flex-col justify-end p-6">
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent z-10" />
                  <img 
                    src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&q=80" 
                    alt="Fresh Gourmet Kitchen"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                  />
                  <div className="relative z-20">
                    <span className="px-2.5 py-1 bg-purple-600/90 text-white font-bold text-[10px] uppercase tracking-wider rounded-md mb-2 inline-block">
                      Artisanal Quality
                    </span>
                    <h3 className="text-2xl font-black text-white mb-1">Chef's Gourmet Selection</h3>
                    <p className="text-slate-300 text-xs leading-relaxed">Made with authentic recipes & premium fresh ingredients.</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Loyalty Rewards Banner */}
            <div className={cn("p-6 border rounded-2xl flex flex-col items-center text-center shadow-lg transition-colors duration-200", isLight ? "bg-white border-slate-200" : "bg-gradient-to-br from-[#131929] to-[#171f34] border-slate-800")}>
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-3 ring-1", isLight ? "bg-purple-100 text-purple-700 ring-purple-200" : "bg-purple-500/10 text-purple-400 ring-purple-500/20")}>
                <CreditCard size={24} />
              </div>
              <h3 className={cn("text-lg font-black mb-1", isLight ? "text-slate-900" : "text-white")}>Join Our Loyalty Rewards</h3>
              <p className={cn("text-xs leading-relaxed mb-4", isLight ? "text-slate-500" : "text-slate-400")}>Earn instant cash points on every order & unlock VIP discounts.</p>
              <div className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-xs transition-all shadow-md shadow-purple-600/20 flex items-center justify-center gap-2">
                <QrCode className="w-4 h-4" />
                Scan & Claim Points
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.15); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.3); }
      `}</style>
    </div>
  );
}