
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Utensils, ShoppingBag, CreditCard, CheckCircle2 } from 'lucide-react';
import { formatCurrency, resolveImageUrl } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
import { useSocket } from '@/hooks/useSocket';

const SERVER_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

type DisplayState = 'idle' | 'showing' | 'qr' | 'payment_ok' | 'message';

type TokenItem = {
   id: string;
   menuItemId: number;
   name: string;
   price: number;
   quantity: number;
   isRemoved?: boolean;
   image?: string | null;
};

type DisplayToken = {
   id: number;
   tokenNumber: number;
   qrCode: string;
   status: string;
   customerName?: string;
   customerPhone?: string;
   subtotal: number;
   total: number;
   sgst: number;
   cgst: number;
   items: TokenItem[];
};

export default function CustomerDisplay() {
   const { socket } = useSocket();
   const [state, setState] = useState<DisplayState>('idle');
   const [token, setToken] = useState<DisplayToken | null>(null);
   const tokenRef = useRef<DisplayToken | null>(null);
   const [message, setMessage] = useState<string | null>(null);
   const [qrData, setQrData] = useState<string | null>(null);
   const resetTimer = useRef<number | null>(null);

   // Fallback polling for latest order (only used as initial content if socket is absent)
   const { data: latestOrder } = useQuery({
      queryKey: ['latest-pos-order'],
      queryFn: () => api.get('/restaurant/orders?limit=1').then(r => r.data.data[0]),
      refetchInterval: 15000,
   });

   // Reset helper
   const clearReset = () => {
      if (resetTimer.current) {
         window.clearTimeout(resetTimer.current);
         resetTimer.current = null;
      }
   };

   const scheduleReset = (ms = 6000) => {
      clearReset();
      resetTimer.current = window.setTimeout(() => {
         setToken(null);
         setMessage(null);
         setState('idle');
         resetTimer.current = null;
      }, ms) as unknown as number;
   };

   // Fetch token details by tokenNumber (server formats items for UI)
   const fetchTokenByNumber = async (tokenNumber: number) => {
      try {
         const { data } = await api.post('/restaurant/tokens/lookup', { tokenNumber });
         return data.data as DisplayToken;
      } catch (err) {
         console.error('Failed to fetch token for display', err);
         return null;
      }
   };

   // Socket listeners
   useEffect(() => {
      if (!socket) return;

      const showBill = async (payload: any) => {
         clearReset();
         setMessage(null);
         // If server sent ephemeral items (no saved token), render directly
         if (payload?.items && Array.isArray(payload.items)) {
              const items = payload.items.map((it: any, idx: number) => ({
                 id: String(it.id ?? `ep-${idx}`),
                 menuItemId: Number(it.menuItemId ?? -1),
                 name: it.name ?? it.menuItemName ?? 'Item',
                 price: Number(it.price ?? 0),
                 quantity: Number(it.quantity ?? 1),
                 image: it.image ?? null,
               }));

            const subtotal = Number(payload.subtotal ?? items.reduce((s: number, it: any) => s + (it.price * it.quantity), 0));
            const t: DisplayToken = {
               id: Number(payload.tokenId ?? -1),
               tokenNumber: payload.tokenNumber ? Number(payload.tokenNumber) : 0,
               qrCode: payload.qrCode ?? '',
               status: payload.status ?? 'open',
               customerName: payload.customerName,
               customerPhone: payload.customerPhone,
               subtotal,
               total: Number(payload.total ?? subtotal),
               sgst: Number(payload.sgst ?? 0),
               cgst: Number(payload.cgst ?? 0),
               items,
            };

            setToken(t);
            setState('showing');
            return;
         }

         const tokenNumber = payload?.tokenNumber ?? payload?.token?.tokenNumber;
         if (!tokenNumber) return;
         const t = await fetchTokenByNumber(Number(tokenNumber));
         if (!t) {
            setMessage('Unable to load bill details');
            setState('message');
            scheduleReset(4000);
            return;
         }
         setToken(t);
         setState('showing');
      };

      const paymentOk = (payload: any) => {
         clearReset();
         setMessage(null);
         // payload may contain customerName, pointsEarned, paid, due
         setMessage(payload?.customerName ? `Payment received: ${formatCurrency(payload?.paid || 0)}` : 'Payment received');
         setState('payment_ok');
         scheduleReset(5000);
      };

      const onTokenUpdated = async (payload: any) => {
         // Server emits `token_updated` when items/payments change — refresh if we're showing this token
         clearReset();
         const tokenNumber = payload?.tokenNumber ?? payload?.token?.tokenNumber ?? payload?.tokenNumber;
         if (!tokenNumber) return;
         if (tokenRef.current && tokenRef.current.tokenNumber === Number(tokenNumber)) {
            const t = await fetchTokenByNumber(Number(tokenNumber));
            if (t) {
               setToken(t);
               setState('showing');
            }
         }
      };

      const onShowQR = (payload: any) => {
         clearReset();
         setMessage(null);
         // If server provided a prebuilt UPI URI, use it. Otherwise, construct from amount+token.
         if (payload?.upiUri) {
            setQrData(payload.upiUri);
         } else if (payload?.amount && payload?.token) {
            const merchantVpa = (import.meta.env.VITE_UPI_MERCHANT || import.meta.env.VITE_MERCHANT_UPI || 'merchant@upi');
            const merchantName = payload?.merchantName || import.meta.env.VITE_MERCHANT_NAME || 'Merchant';
            const upiUri = `upi://pay?pa=${encodeURIComponent(merchantVpa)}&pn=${encodeURIComponent(merchantName)}&am=${encodeURIComponent(String(payload.amount))}&cu=INR&tr=${encodeURIComponent(String(payload.token))}`;
            setQrData(upiUri);
         } else {
            setQrData(null);
         }
         setState('qr');
         // keep QR until user action/pay event occurs (no auto-reset here)
      };

      const onReset = () => {
         resetNow();
      };

      socket.on('customer_display_show_bill', showBill);
      socket.on('customer_display_payment_ok', paymentOk);
      socket.on('token_updated', onTokenUpdated);
      socket.on('customer_display_show_qr', onShowQR);
      socket.on('customer_display_reset', onReset);

      return () => {
            socket.off('customer_display_show_bill', showBill);
            socket.off('customer_display_payment_ok', paymentOk);
            socket.off('token_updated', onTokenUpdated);
            socket.off('customer_display_show_qr', onShowQR);
            socket.off('customer_display_reset', onReset);
      };
   }, [socket]);

         // keep tokenRef in sync with state so listeners can refer to latest shown token
         useEffect(() => { tokenRef.current = token; }, [token]);

   // Load bill from URL param on mount (when opened from MainPOS)
   useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const tokenNum = params.get('token');
      if (tokenNum && !token) {
         fetchTokenByNumber(Number(tokenNum)).then(t => {
            if (t) {
               setToken(t);
               setState('showing');
            }
         });
      }
   }, []);

   // Removed fallback latestOrder summary to avoid showing Token #-1 by default

   // Manual mark-as-paid (cash) — calls mainpos payment endpoint which will emit payment_ok
   const markPaid = async () => {
      if (!token || !token.qrCode) return;
      try {
         setMessage('Recording payment...');
         setState('message');
         await api.post(`/mainpos/token/${token.qrCode}/payment`, { method: 'cash', amount: token.total });
         // server will emit 'customer_display_payment_ok' which we listen to
      } catch (err: any) {
         console.error('Payment failed', err);
         setMessage(err?.response?.data?.error || 'Payment failed');
         setState('message');
         scheduleReset(4000);
      }
   };

   // Toggle QR view
   const showQR = () => {
      if (!token) return;
      setState('qr');
   };

   const resetNow = () => {
      clearReset();
        setToken(null);
        setMessage(null);
        setQrData(null);
        setState('idle');
   };

   const paymentQRCodeData = () => {
        if (qrData) return qrData;
        if (!token) return '';
        // Use a simple payment landing URL that can be scanned from the customer display.
        // Integrators can customize to encode UPI payloads or a payment gateway deep-link.
        return `${window.location.origin}/menu/pay?token=${encodeURIComponent(token.qrCode)}&amount=${encodeURIComponent(String(token.total))}`;
   };

   return (
      <div className="fixed inset-0 bg-slate-950 text-slate-50 flex flex-col font-sans selection:bg-blue-500/30">
         <div className="flex h-full">
            {/* Left: Cart & Totals / Bill */}
            <div className="flex-1 flex flex-col p-12 bg-slate-900">
               <div className="flex items-center gap-5 mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                     <ShoppingBag size={28} />
                  </div>
                  <h1 className="text-4xl font-bold tracking-tight">Customer Display</h1>
               </div>

               <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
                  {state === 'idle' && (
                     <div className="h-full flex flex-col items-center justify-center opacity-40 text-center">
                        <Utensils size={96} className="mb-6 text-slate-500" />
                        <p className="text-4xl font-semibold text-slate-300">Welcome!</p>
                        <p className="text-lg mt-2 text-slate-400">Waiting for the cashier to present the bill...</p>
                     </div>
                  )}

                  {(state === 'showing' || state === 'qr' || state === 'payment_ok' || state === 'message') && token && (
                     <div className="space-y-6">
                        <div className="flex items-start justify-between">
                           <div>
                              <p className="text-lg text-slate-400">Token</p>
                              <h2 className="text-3xl font-bold">#{token.tokenNumber}</h2>
                              {token.customerName && <p className="text-slate-400 mt-1">{token.customerName}</p>}
                           </div>
                           <div className="text-right">
                              <p className="text-slate-400">Items</p>
                              <p className="text-3xl font-bold">{token.items.reduce((s, it) => s + it.quantity, 0)}</p>
                           </div>
                        </div>

                        <div className="space-y-3">
                           {token.items.map((it) => (
                                 <div key={it.id} className="flex items-center justify-between bg-slate-800/40 border border-slate-700/40 p-4 rounded-xl">
                                    <div className="flex items-center gap-4">
                                                                                                <img src={
                                                                                                   it.image
                                                                                                      ? (resolveImageUrl(it.image) || `https://ui-avatars.com/api/?name=${encodeURIComponent(it.name.charAt(0) || 'A')}&background=1a1c23&color=fff`)
                                                                                                      : `https://ui-avatars.com/api/?name=${encodeURIComponent(it.name.charAt(0) || 'A')}&background=1a1c23&color=fff`
                                                                                                } alt={it.name} className="w-16 h-12 rounded-md object-cover flex-shrink-0" />
                                       <div>
                                          <p className="text-lg font-semibold">{it.name}</p>
                                          <p className="text-sm text-slate-400">x{it.quantity} • {formatCurrency(it.price)}</p>
                                       </div>
                                    </div>
                                    <div className="text-right">
                                       <p className="text-lg font-bold">{formatCurrency(it.price * it.quantity)}</p>
                                    </div>
                                 </div>
                              ))}
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-800 space-y-3">
                           <div className="flex justify-between text-slate-400">
                              <span>Subtotal</span>
                              <span>{formatCurrency(token.subtotal)}</span>
                           </div>
                           <div className="flex justify-between text-slate-400">
                              <span>GST</span>
                              <span>{formatCurrency((token.sgst || 0) + (token.cgst || 0))}</span>
                           </div>
                           <div className="flex justify-between items-end bg-blue-600 text-white p-6 rounded-3xl shadow-lg shadow-blue-900/20">
                              <span className="text-2xl font-medium">Total Payable</span>
                              <span className="text-5xl font-bold tracking-tight">{formatCurrency(token.total)}</span>
                           </div>
                        </div>

                        <div className="flex gap-4 mt-6">
                           <button onClick={showQR} className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-semibold">Show Payment QR</button>
                           <button onClick={markPaid} className="flex-1 py-4 bg-green-600 text-white rounded-xl font-semibold">Mark Paid (Cash)</button>
                           <button onClick={resetNow} className="py-4 px-6 bg-slate-800 text-slate-300 rounded-xl">Reset</button>
                        </div>
                     </div>
                  )}

                  {/* QR view */}
                  {state === 'qr' && token && (
                     <div className="flex flex-col items-center justify-center py-12">
                        <div className="mb-6 bg-white p-6 rounded-2xl">
                           <img src={`https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(paymentQRCodeData())}`} alt="Payment QR" />
                        </div>
                        <p className="text-slate-400 mb-4">Scan to pay securely</p>
                        <div className="flex gap-4">
                           <button onClick={markPaid} className="py-3 px-6 bg-green-600 text-white rounded-xl">Already Paid</button>
                           <button onClick={() => setState('showing')} className="py-3 px-6 bg-slate-800 text-slate-200 rounded-xl">Back</button>
                        </div>
                     </div>
                  )}

                  {/* Payment success / message */}
                  {state === 'payment_ok' && (
                     <div className="h-full flex flex-col items-center justify-center text-center">
                        <CheckCircle2 size={96} className="text-emerald-400 mb-6" />
                        <h2 className="text-4xl font-bold">Payment Confirmed</h2>
                        {message && <p className="text-slate-300 mt-3">{message}</p>}
                     </div>
                  )}

                  {state === 'message' && message && (
                     <div className="h-full flex flex-col items-center justify-center text-center">
                        <p className="text-2xl text-slate-300">{message}</p>
                     </div>
                  )}
               </div>
            </div>

            {/* Right: Branding & Promo / Small Info */}
            <div className="w-[480px] bg-slate-950 border-l border-slate-800 flex flex-col p-12 overflow-hidden relative">
               <div className="absolute -top-24 -right-24 opacity-5 pointer-events-none text-blue-500">
                  <Utensils size={400} />
               </div>

               <div className="relative z-10 flex-1 flex flex-col">
                  <div className="mb-10">
                     <h2 className="text-blue-400 font-semibold text-lg uppercase tracking-wider mb-4">Info</h2>
                     <Card className="p-6 border border-slate-800 bg-slate-900 rounded-3xl">
                        <p className="text-slate-300 mb-3">This display mirrors the active token presented by the cashier. Use the buttons to show the payment QR or mark cash payments.</p>
                        <div className="flex gap-3 mt-4">
                           <Badge className="bg-blue-600 text-white">Live</Badge>
                           <Badge variant="outline" className="text-slate-300 border-slate-600">Auto-reset</Badge>
                        </div>
                     </Card>
                  </div>

                  <div className="mt-auto p-8 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col items-center text-center">
                     {state === 'qr' && qrData ? (
                        <>
                           <div className="mb-4 bg-white p-4 rounded-2xl">
                              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrData)}`} alt="UPI QR Code" className="w-64 h-64" />
                           </div>
                           <p className="text-slate-300 mb-2 text-sm">Scan this UPI QR to pay ₹{token ? formatCurrency(token.total) : ''}</p>
                           <p className="text-slate-400 leading-relaxed mb-4">Open Google Pay/PhonePe/Paytm and scan to pay.</p>
                        </>
                     ) : (
                        <>
                           <div className="w-16 h-16 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center mb-6">
                              <CreditCard size={32} />
                           </div>
                           <h3 className="text-2xl font-bold text-slate-100 mb-2">Payments & Loyalty</h3>
                           <p className="text-slate-400 leading-relaxed mb-4">Payments recorded here will update all POS terminals in real-time.</p>
                        </>
                     )}
                     <button onClick={() => { resetNow(); }} className="w-full py-3 bg-slate-100 text-slate-900 rounded-xl font-bold hover:bg-white transition-colors">Clear Display</button>
                  </div>
               </div>
            </div>
         </div>

         <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.4); }
      `}</style>
      </div>
   );
}