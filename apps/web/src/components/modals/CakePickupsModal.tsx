import React, { useState, useEffect } from 'react';
import { X, Search, Cake, CheckCircle2, Clock, Phone, AlertCircle, DollarSign, Printer, Check } from 'lucide-react';
import restaurantApi from '@/lib/api';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/utils';
import { printHtmlOrFallback } from '@/lib/electronPrint';

interface CakePickupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLight?: boolean;
}

export const CakePickupsModal: React.FC<CakePickupsModalProps> = ({
  isOpen,
  onClose,
  isLight = false,
}) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<'pending' | 'today' | 'all'>('pending');
  const [settlingOrder, setSettlingOrder] = useState<any | null>(null);
  const [settleMode, setSettleMode] = useState('Cash');
  const [isSubmittingSettle, setIsSubmittingSettle] = useState(false);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const res = await restaurantApi.get('/mainpos/cake-orders');
      if (res.data?.success) {
        setOrders(res.data.data || []);
      }
    } catch (err: any) {
      toast.error('Failed to load cake orders');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchOrders();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const todayStr = new Date().toISOString().split('T')[0];

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customerPhone?.includes(searchTerm) ||
      o.cakeFlavor?.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterTab === 'pending') {
      return o.status !== 'COMPLETED' && o.status !== 'CANCELLED';
    }
    if (filterTab === 'today') {
      return o.deliveryDate === todayStr;
    }
    return true;
  });

  const printFinalTaxBill = async (order: any, billNo: string, mode: string) => {
    const html = `
      <div style="font-family: monospace; font-size: 13px; max-width: 300px; padding: 10px; margin: 0 auto; color: #000;">
        <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
          <h2 style="margin: 0; font-size: 18px; font-weight: bold;">AMORA BAKERY & CAFE</h2>
          <div style="font-size: 11px;">Final Tax Invoice</div>
          <div style="font-weight: bold; font-size: 13px; margin-top: 4px;">Bill No: ${billNo}</div>
          <div style="font-size: 11px;">Ref Order: ${order.orderNumber}</div>
        </div>

        <div style="margin-bottom: 8px; font-size: 12px;">
          <div><b>Customer:</b> ${order.customerName}</div>
          <div><b>Phone:</b> ${order.customerPhone}</div>
          <div><b>Date:</b> ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
        </div>

        <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 8px 0; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between;">
            <span><b>${order.cakeFlavor} (${order.weightKg}kg)</b></span>
            <span>Rs. ${Number(order.totalPrice).toFixed(2)}</span>
          </div>
          <div style="font-size: 11px; color: #555;">Shape: ${order.cakeShape} | ${order.isEggless ? 'Eggless' : 'Regular'}</div>
          ${order.messageOnCake ? `<div style="font-size: 11px; font-style: italic;">"${order.messageOnCake}"</div>` : ''}
        </div>

        <div style="margin-bottom: 8px; font-size: 13px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Total Bill:</span>
            <b>Rs. ${Number(order.totalPrice).toFixed(2)}</b>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: #047857;">
            <span>Advance Settled (${order.advancePaymentMode}):</span>
            <span>Rs. ${Number(order.advancePaid).toFixed(2)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; border-top: 1px solid #000; margin-top: 4px; padding-top: 4px;">
            <span>Balance Paid (${mode}):</span>
            <span>Rs. ${Number(order.balanceDue).toFixed(2)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; color: #047857; margin-top: 4px;">
            <span>Balance Due:</span>
            <span>Rs. 0.00</span>
          </div>
        </div>

        <div style="text-align: center; border-top: 2px dashed #000; padding-top: 8px; font-size: 11px;">
          <div style="font-weight: bold;">ORDER COMPLETED & DELIVERED</div>
          <div style="margin-top: 4px;">Thank you for celebrating with Amora!</div>
        </div>
      </div>
    `;

    try {
      await printHtmlOrFallback(html);
    } catch (e: any) {
      console.warn('Final tax bill print error:', e);
    }
  };

  const handleSettle = async () => {
    if (!settlingOrder) return;
    setIsSubmittingSettle(true);
    try {
      const billNumber = `CK-BILL-${Date.now().toString().slice(-6)}`;
      const res = await restaurantApi.post(`/mainpos/cake-orders/${settlingOrder.id}/settle`, {
        balancePaymentMode: settleMode,
        billNumber,
      });

      if (res.data?.success) {
        toast.success(`🎉 Cake Order #${settlingOrder.orderNumber} Settled & Delivered!`);
        await printFinalTaxBill(settlingOrder, billNumber, settleMode);
        setSettlingOrder(null);
        fetchOrders();
      } else {
        toast.error(res.data?.error || 'Failed to settle order');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Settlement error');
    } finally {
      setIsSubmittingSettle(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className={`relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden border ${
          isLight ? 'bg-white text-slate-900 border-slate-200' : 'bg-gray-900 text-white border-gray-700'
        }`}
      >
        {/* Header */}
        <div className={`px-5 py-3.5 border-b flex items-center justify-between ${
          isLight ? 'bg-pink-50/70 border-pink-100' : 'bg-pink-950/40 border-pink-900/50'
        }`}>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-pink-500 text-white shadow-xs">
              <Cake className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                Cake Orders & Pickups
                <span className="text-xs px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-600 dark:text-pink-400 font-semibold">
                  {orders.filter((o) => o.status !== 'COMPLETED').length} Pending
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Search order, collect balance payment, take final bill, & notify Bakery Kitchen.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search and Tabs */}
        <div className="p-4 border-b flex flex-wrap gap-3 items-center justify-between">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by customer phone, name, or #CK order..."
              className={`w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border outline-hidden transition ${
                isLight ? 'bg-slate-50 border-slate-300 focus:border-pink-500' : 'bg-gray-800 border-gray-700 focus:border-pink-500'
              }`}
            />
          </div>

          <div className="flex gap-1.5 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            <button
              onClick={() => setFilterTab('pending')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                filterTab === 'pending'
                  ? 'bg-pink-600 text-white shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'
              }`}
            >
              Pending Pickups
            </button>
            <button
              onClick={() => setFilterTab('today')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                filterTab === 'today'
                  ? 'bg-pink-600 text-white shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'
              }`}
            >
              Due Today
            </button>
            <button
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                filterTab === 'all'
                  ? 'bg-pink-600 text-white shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'
              }`}
            >
              All Orders
            </button>
          </div>
        </div>

        {/* Orders List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="text-center py-12 text-sm text-muted-foreground animate-pulse">
              Loading Cake Orders...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <Cake className="w-10 h-10 mx-auto text-gray-400 mb-2" />
              <div className="text-sm font-semibold">No Cake Orders Found</div>
              <div className="text-xs text-muted-foreground mt-1">
                {searchTerm ? 'Try a different search query' : 'New orders booked will appear here'}
              </div>
            </div>
          ) : (
            filteredOrders.map((o) => {
              const isDueToday = o.deliveryDate === todayStr;
              const hasBalance = Number(o.balanceDue || 0) > 0;
              const isCompleted = o.status === 'COMPLETED';

              return (
                <div
                  key={o.id}
                  className={`p-4 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    isCompleted
                      ? isLight ? 'bg-slate-50 border-slate-200 opacity-75' : 'bg-gray-800/40 border-gray-800 opacity-75'
                      : isDueToday
                      ? isLight ? 'bg-amber-50/70 border-amber-300' : 'bg-amber-950/20 border-amber-700/60'
                      : isLight ? 'bg-white border-slate-200 hover:border-pink-300' : 'bg-gray-800/80 border-gray-700 hover:border-pink-500/50'
                  }`}
                >
                  {/* Order Details */}
                  <div className="flex-1 min-w-[280px]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700">
                        {o.orderNumber}
                      </span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        isCompleted
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                          : o.status === 'READY'
                          ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                          : o.status === 'BAKING'
                          ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400'
                          : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                      }`}>
                        {o.status}
                      </span>
                      {isDueToday && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500 text-white animate-pulse">
                          DUE TODAY
                        </span>
                      )}
                    </div>

                    <div className="font-bold text-sm flex items-center gap-2">
                      <span>{o.cakeFlavor}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        ({o.weightKg} kg, {o.cakeShape}, {o.isEggless ? '🌱 Eggless' : 'Regular'})
                      </span>
                    </div>

                    {o.messageOnCake && (
                      <div className="text-xs text-pink-600 dark:text-pink-400 italic mt-0.5">
                        "{o.messageOnCake}"
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 font-medium text-black dark:text-white">
                        <Phone className="w-3.5 h-3.5 text-gray-400" /> {o.customerName} ({o.customerPhone})
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-gray-400" /> Pickup: {o.deliveryDate} @ {o.deliveryTime || 'Evening'}
                      </span>
                    </div>
                  </div>

                  {/* Financials & Actions */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="text-right sm:min-w-[130px]">
                      <div className="text-xs text-muted-foreground">Total: ₹{Number(o.totalPrice).toFixed(0)}</div>
                      <div className="text-xs text-emerald-600 dark:text-emerald-400">
                        Adv: ₹{Number(o.advancePaid).toFixed(0)}
                      </div>
                      <div className={`text-sm font-bold ${hasBalance ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'}`}>
                        {hasBalance ? `Due: ₹${Number(o.balanceDue).toFixed(0)}` : 'Fully Paid'}
                      </div>
                    </div>

                    <div>
                      {isCompleted ? (
                        <div className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                          <CheckCircle2 className="w-4 h-4" /> Delivered ({o.billNumber || 'Billed'})
                        </div>
                      ) : (
                        <button
                          onClick={() => setSettlingOrder(o)}
                          className="px-4 py-2 text-xs font-bold rounded-lg bg-pink-600 hover:bg-pink-700 text-white shadow-md shadow-pink-600/20 flex items-center gap-1.5 transition"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          <span>{hasBalance ? 'Collect & Take Bill' : 'Mark Delivered'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Settlement Popup Modal */}
      {settlingOrder && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
          <div className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl ${
            isLight ? 'bg-white text-slate-900 border-slate-200' : 'bg-gray-900 text-white border-gray-700'
          }`}>
            <div className="flex items-center justify-between mb-3 pb-2 border-b">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Cake className="w-5 h-5 text-pink-500" />
                Customer Pickup & Final Bill
              </h3>
              <button
                onClick={() => setSettlingOrder(null)}
                className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 mb-4 text-sm">
              <div className="p-3 rounded-xl bg-pink-500/10 border border-pink-500/20">
                <div className="font-bold">{settlingOrder.cakeFlavor} ({settlingOrder.weightKg} kg)</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Order #{settlingOrder.orderNumber} • {settlingOrder.customerName} ({settlingOrder.customerPhone})
                </div>
              </div>

              <div className="flex justify-between text-sm">
                <span>Total Amount:</span>
                <span className="font-bold">₹{Number(settlingOrder.totalPrice).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Advance Paid:</span>
                <span className="font-bold">- ₹{Number(settlingOrder.advancePaid).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t text-rose-600 dark:text-rose-400">
                <span>Balance to Collect:</span>
                <span>₹{Number(settlingOrder.balanceDue).toFixed(2)}</span>
              </div>

              {Number(settlingOrder.balanceDue) > 0 && (
                <div className="pt-2">
                  <label className="text-xs font-semibold block mb-1.5">Payment Method for Balance</label>
                  <div className="flex gap-2">
                    {['Cash', 'UPI', 'Card'].map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSettleMode(mode)}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg border transition ${
                          settleMode === mode
                            ? 'bg-pink-600 text-white border-pink-600'
                            : isLight
                            ? 'bg-slate-100 border-slate-200'
                            : 'bg-gray-800 border-gray-700'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSettlingOrder(null)}
                disabled={isSubmittingSettle}
                className="flex-1 py-2 text-xs font-semibold rounded-xl border border-gray-300 dark:border-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSettle}
                disabled={isSubmittingSettle}
                className="flex-2 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md flex items-center justify-center gap-1.5 transition disabled:opacity-50"
              >
                {isSubmittingSettle ? (
                  <span>Settling...</span>
                ) : (
                  <>
                    <Printer className="w-4 h-4" />
                    <span>Settle & Print Final Bill</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

