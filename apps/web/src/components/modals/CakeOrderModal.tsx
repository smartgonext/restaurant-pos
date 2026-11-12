import React, { useState } from 'react';
import { X, Calendar, Clock, DollarSign, Printer, Cake, User, Phone, CheckCircle2 } from 'lucide-react';
import restaurantApi from '@/lib/api';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/utils';
import { printHtmlOrFallback } from '@/lib/electronPrint';

interface CakeOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCreated?: (order: any) => void;
  isLight?: boolean;
}

const COMMON_FLAVORS = [
  'Chocolate Truffle',
  'Black Forest',
  'Red Velvet',
  'Butterscotch',
  'Pineapple Fresh Cream',
  'White Forest',
  'Blueberry Glaze',
  'Mango Delight'
];

const WEIGHT_OPTIONS = [0.5, 1.0, 1.5, 2.0, 3.0];
const SHAPES = ['Round', 'Heart', 'Square', '2-Tier', 'Custom'];

export const CakeOrderModal: React.FC<CakeOrderModalProps> = ({
  isOpen,
  onClose,
  onOrderCreated,
  isLight = false,
}) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().split('T')[0];

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [cakeFlavor, setCakeFlavor] = useState('');
  const [weightKg, setWeightKg] = useState<number>(1.0);
  const [customWeight, setCustomWeight] = useState('');
  const [cakeShape, setCakeShape] = useState('Round');
  const [isEggless, setIsEggless] = useState(false);
  const [messageOnCake, setMessageOnCake] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(defaultDate);
  const [deliveryTime, setDeliveryTime] = useState('17:00');
  const [totalPrice, setTotalPrice] = useState<number | ''>(600);
  const [advancePaid, setAdvancePaid] = useState<number | ''>(200);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const currentWeight = customWeight ? parseFloat(customWeight) || 0 : weightKg;
  const numTotal = typeof totalPrice === 'number' ? totalPrice : 0;
  const numAdvance = typeof advancePaid === 'number' ? advancePaid : 0;
  const balanceDue = Math.max(0, numTotal - numAdvance);

  const printAdvanceReceipt = async (order: any) => {
    const html = `
      <div style="font-family: monospace; font-size: 13px; max-width: 300px; padding: 10px; margin: 0 auto; color: #000;">
        <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
          <h2 style="margin: 0; font-size: 18px; font-weight: bold;">AMORA BAKERY & CAFE</h2>
          <div style="font-size: 11px; margin-top: 2px;">*** CAKE ORDER ADVANCE BOOKING ***</div>
          <div style="font-weight: bold; font-size: 14px; margin-top: 4px;"># ${order.orderNumber}</div>
        </div>

        <div style="margin-bottom: 8px; font-size: 12px;">
          <div><b>Customer:</b> ${order.customerName}</div>
          <div><b>Phone:</b> ${order.customerPhone}</div>
          <div><b>Pickup Date:</b> <span style="font-size: 14px; font-weight: bold;">${order.deliveryDate}</span></div>
          <div><b>Pickup Time:</b> <span style="font-size: 14px; font-weight: bold;">${order.deliveryTime || 'Evening'}</span></div>
        </div>

        <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 8px 0; margin-bottom: 8px;">
          <div><b>Cake:</b> ${order.cakeFlavor} (${order.weightKg} kg)</div>
          <div><b>Shape:</b> ${order.cakeShape} | ${order.isEggless ? 'EGGLESS' : 'Regular'}</div>
          ${order.messageOnCake ? `<div style="margin-top: 4px; font-style: italic; background: #eee; padding: 4px;"><b>Message:</b> "${order.messageOnCake}"</div>` : ''}
          ${order.specialInstructions ? `<div style="margin-top: 4px; font-size: 11px;"><b>Notes:</b> ${order.specialInstructions}</div>` : ''}
        </div>

        <div style="margin-bottom: 8px; font-size: 13px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Total Amount:</span>
            <b>Rs. ${Number(order.totalPrice).toFixed(2)}</b>
          </div>
          <div style="display: flex; justify-content: space-between; color: #047857;">
            <span>Advance Paid (${order.advancePaymentMode}):</span>
            <b>Rs. ${Number(order.advancePaid).toFixed(2)}</b>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: bold; border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; color: #b91c1c;">
            <span>Balance Due:</span>
            <span>Rs. ${Number(order.balanceDue).toFixed(2)}</span>
          </div>
        </div>

        <div style="text-align: center; border-top: 2px dashed #000; padding-top: 8px; font-size: 11px;">
          <div>Please bring this slip or order # during pickup.</div>
          <div style="margin-top: 4px;">Thank you for ordering with us!</div>
        </div>
      </div>
    `;

    try {
      await printHtmlOrFallback(html);
    } catch (e: any) {
      console.warn('Advance slip print error:', e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      toast.error('Customer name is required');
      return;
    }
    if (!customerPhone.trim()) {
      toast.error('Customer phone number is required');
      return;
    }
    if (!cakeFlavor.trim()) {
      toast.error('Please specify the cake flavor');
      return;
    }
    if (!deliveryDate) {
      toast.error('Please pick a delivery date');
      return;
    }
    if (numTotal <= 0) {
      toast.error('Total price must be greater than 0');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        cakeFlavor: cakeFlavor.trim(),
        weightKg: currentWeight || 1.0,
        cakeShape,
        isEggless,
        messageOnCake: messageOnCake.trim(),
        specialInstructions: specialInstructions.trim(),
        deliveryDate,
        deliveryTime: deliveryTime || '17:00',
        totalPrice: numTotal,
        advancePaid: numAdvance,
        advancePaymentMode: paymentMode,
      };

      const res = await restaurantApi.post('/mainpos/cake-orders', payload);
      if (res.data?.success) {
        const order = res.data.data;
        toast.success(`🎂 Cake Order ${order.orderNumber} Booked & Sent to Bakery ERP!`);
        await printAdvanceReceipt(order);
        if (onOrderCreated) onOrderCreated(order);
        onClose();
      } else {
        toast.error(res.data?.error || 'Failed to create cake order');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Error booking cake order');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className={`relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden border ${
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
                Advance Cake Order Booking
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-600 dark:text-pink-400">
                  Live ERP Sync
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Books customized cake, collects advance slip, & dispatches real-time alert to Bakery Kitchen.
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

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Customer Details */}
          <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-gray-800/60 border-gray-700'}`}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-pink-500" /> Customer Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className={`w-full px-3 py-2 text-sm rounded-lg border outline-hidden transition ${
                    isLight ? 'bg-white border-slate-300 focus:border-pink-500' : 'bg-gray-900 border-gray-600 focus:border-pink-500'
                  }`}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Phone Number *</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="10-digit mobile"
                    className={`w-full pl-9 pr-3 py-2 text-sm rounded-lg border outline-hidden transition ${
                      isLight ? 'bg-white border-slate-300 focus:border-pink-500' : 'bg-gray-900 border-gray-600 focus:border-pink-500'
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Delivery & Pickup Schedule */}
          <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-gray-800/60 border-gray-700'}`}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-pink-500" /> Pickup Date & Time
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1">Pickup Date *</label>
                <input
                  type="date"
                  required
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className={`w-full px-3 py-2 text-sm rounded-lg border outline-hidden transition ${
                    isLight ? 'bg-white border-slate-300 focus:border-pink-500' : 'bg-gray-900 border-gray-600 focus:border-pink-500'
                  }`}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Pickup Time</label>
                <input
                  type="time"
                  value={deliveryTime}
                  onChange={(e) => setDeliveryTime(e.target.value)}
                  className={`w-full px-3 py-2 text-sm rounded-lg border outline-hidden transition ${
                    isLight ? 'bg-white border-slate-300 focus:border-pink-500' : 'bg-gray-900 border-gray-600 focus:border-pink-500'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Cake Customization Specs */}
          <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-gray-800/60 border-gray-700'}`}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Cake className="w-3.5 h-3.5 text-pink-500" /> Cake Specifications
            </h3>

            {/* Flavor */}
            <div className="mb-3">
              <label className="text-xs font-medium block mb-1">Flavor / Cake Name *</label>
              <input
                type="text"
                required
                value={cakeFlavor}
                onChange={(e) => setCakeFlavor(e.target.value)}
                placeholder="e.g. Dutch Chocolate Truffle"
                className={`w-full px-3 py-2 text-sm rounded-lg border outline-hidden transition mb-1.5 ${
                  isLight ? 'bg-white border-slate-300 focus:border-pink-500' : 'bg-gray-900 border-gray-600 focus:border-pink-500'
                }`}
              />
              <div className="flex flex-wrap gap-1.5">
                {COMMON_FLAVORS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setCakeFlavor(f)}
                    className={`text-[11px] px-2 py-0.5 rounded-md border transition ${
                      cakeFlavor === f
                        ? 'bg-pink-500 text-white border-pink-500'
                        : isLight
                        ? 'bg-white hover:bg-pink-50 border-slate-200 text-slate-700'
                        : 'bg-gray-900 hover:bg-gray-800 border-gray-700 text-gray-300'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Weight & Shape */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-medium block mb-1">Weight (Kg)</label>
                <div className="flex gap-1.5 mb-1.5">
                  {WEIGHT_OPTIONS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => {
                        setWeightKg(w);
                        setCustomWeight('');
                      }}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition ${
                        !customWeight && weightKg === w
                          ? 'bg-pink-500 text-white border-pink-500'
                          : isLight
                          ? 'bg-white border-slate-200 text-slate-700'
                          : 'bg-gray-900 border-gray-700 text-gray-300'
                      }`}
                    >
                      {w} kg
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  step="0.1"
                  placeholder="Custom Kg..."
                  value={customWeight}
                  onChange={(e) => setCustomWeight(e.target.value)}
                  className={`w-full px-2.5 py-1 text-xs rounded-md border outline-hidden ${
                    isLight ? 'bg-white border-slate-300' : 'bg-gray-900 border-gray-700'
                  }`}
                />
              </div>

              <div>
                <label className="text-xs font-medium block mb-1">Shape</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {SHAPES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setCakeShape(s)}
                      className={`py-1.5 text-xs font-medium rounded-lg border transition ${
                        cakeShape === s
                          ? 'bg-pink-500 text-white border-pink-500'
                          : isLight
                          ? 'bg-white border-slate-200 text-slate-700'
                          : 'bg-gray-900 border-gray-700 text-gray-300'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Eggless toggle */}
            <div className="mb-3 flex items-center justify-between p-2 rounded-lg bg-pink-500/10 border border-pink-500/20">
              <span className="text-xs font-bold flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${isEggless ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                Eggless Cake?
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsEggless(true)}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                    isEggless ? 'bg-emerald-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  🌱 Yes (Eggless)
                </button>
                <button
                  type="button"
                  onClick={() => setIsEggless(false)}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                    !isEggless ? 'bg-amber-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  🥚 Regular
                </button>
              </div>
            </div>

            {/* Message on Cake */}
            <div className="mb-3">
              <label className="text-xs font-medium block mb-1">Message on Cake (Piping)</label>
              <input
                type="text"
                value={messageOnCake}
                onChange={(e) => setMessageOnCake(e.target.value)}
                placeholder="e.g. Happy 10th Birthday Aarav! ❤️"
                className={`w-full px-3 py-2 text-sm rounded-lg border outline-hidden transition ${
                  isLight ? 'bg-white border-slate-300 focus:border-pink-500' : 'bg-gray-900 border-gray-600 focus:border-pink-500'
                }`}
              />
            </div>

            {/* Special Instructions */}
            <div>
              <label className="text-xs font-medium block mb-1">Kitchen Preparation Notes</label>
              <textarea
                rows={2}
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                placeholder="e.g. Light sugar, edible flowers, blue border piping, extra cherries"
                className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-hidden transition ${
                  isLight ? 'bg-white border-slate-300 focus:border-pink-500' : 'bg-gray-900 border-gray-600 focus:border-pink-500'
                }`}
              />
            </div>
          </div>

          {/* Pricing & Advance Settlement */}
          <div className={`p-4 rounded-xl border ${
            isLight ? 'bg-emerald-50/50 border-emerald-200' : 'bg-emerald-950/20 border-emerald-800/40'
          }`}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-3 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" /> Payment & Advance Collection
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-xs font-medium block mb-1">Total Price (₹) *</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  required
                  value={totalPrice}
                  onChange={(e) => setTotalPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="0.00"
                  className={`w-full px-3 py-2 text-base font-bold rounded-lg border outline-hidden ${
                    isLight ? 'bg-white border-slate-300' : 'bg-gray-900 border-gray-700'
                  }`}
                />
              </div>

              <div>
                <label className="text-xs font-medium block mb-1">Advance Received (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={advancePaid}
                  onChange={(e) => setAdvancePaid(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="0.00"
                  className={`w-full px-3 py-2 text-base font-bold rounded-lg border outline-hidden text-emerald-600 ${
                    isLight ? 'bg-white border-slate-300' : 'bg-gray-900 border-gray-700'
                  }`}
                />
              </div>

              <div>
                <label className="text-xs font-medium block mb-1">Balance Due at Pickup</label>
                <div className={`w-full px-3 py-2 text-base font-bold rounded-lg border flex items-center justify-between ${
                  balanceDue > 0
                    ? isLight ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-rose-950/40 border-rose-800 text-rose-400'
                    : isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
                }`}>
                  <span>₹</span>
                  <span>{formatCurrency(balanceDue)}</span>
                </div>
              </div>
            </div>

            {/* Advance payment mode */}
            {numAdvance > 0 && (
              <div>
                <label className="text-xs font-medium block mb-1">Advance Payment Mode</label>
                <div className="flex gap-2">
                  {['Cash', 'UPI', 'Card'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMode(mode)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition ${
                        paymentMode === mode
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : isLight
                          ? 'bg-white border-slate-200 text-slate-700'
                          : 'bg-gray-900 border-gray-700 text-gray-300'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300' : 'bg-gray-800 hover:bg-gray-700 border-gray-700'
              }`}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-sm font-bold bg-pink-600 hover:bg-pink-700 text-white shadow-lg shadow-pink-600/30 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Booking & Notifying ERP...</span>
              ) : (
                <>
                  <Printer className="w-4 h-4" />
                  <span>Book Order & Print Advance Slip</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

