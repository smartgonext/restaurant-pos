import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useCartStore } from '@/stores/cartStore';
import { ArrowLeft, Trash2, Plus, Minus, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CustomerCart() {
  const { restaurantSlug, tableToken } = useParams<{ restaurantSlug: string; tableToken: string }>();
  const navigate = useNavigate();
  const { items, removeItem, updateQuantity, clearCart } = useCartStore();
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const subtotal = items.reduce((sum, item) => {
    const modTotal = item.modifiers?.reduce((ms, m) => ms + (m.price || 0), 0) || 0;
    return sum + (item.price + modTotal) * item.quantity;
  }, 0);

  const settings = (globalThis as any).__RESTAURANT_SETTINGS__ || {};
  const sgstRate = Number(settings.sgstRate ?? 2.5);
  const cgstRate = Number(settings.cgstRate ?? 2.5);
  const sgst = subtotal * (sgstRate / 100);
  const cgst = subtotal * (cgstRate / 100);
  const total = subtotal + sgst + cgst;

  const handlePlaceOrder = async () => {
    if (items.length === 0) return;
    setLoading(true);
    try {
      const payload = {
        items: items.map(item => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          modifiers: item.modifiers,
          note: item.note,
        })),
      };
      const res = await api.post(`/customer/${restaurantSlug}/${tableToken}/order`, payload);
      if (res.data.success) {
        setOrderId(res.data.data.id.toString());
        setConfirmed(true);
        clearCart();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  if (confirmed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-8 text-center">
        <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mb-6 shadow-xl shadow-green-500/20">
          <CheckCircle2 className="text-green-600" size={48} />
        </div>
        <h2 className="text-3xl font-bold text-slate-900 mb-3 tracking-tight">Order Placed! 🎉</h2>
        <p className="text-slate-500 mb-10 text-lg">Your food is being prepared with care.</p>
        <button
          onClick={() => navigate(`/menu/${restaurantSlug}/${tableToken}/status`)}
          className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-blue-600/20 active:scale-95 transition-transform"
        >
          Track Order Status
        </button>
        <button
          onClick={() => navigate(`/menu/${restaurantSlug}/${tableToken}`)}
          className="mt-4 w-full py-4 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold text-lg active:scale-95 transition-transform"
        >
          Back to Menu
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 pb-48">
      <header className="sticky top-0 bg-white border-b border-slate-200 px-4 py-4 flex items-center justify-between z-10">
        <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 active:scale-95">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-slate-900">Your Cart</h1>
        <span className="text-sm font-semibold bg-blue-100 text-blue-700 px-3 py-1 rounded-full">{items.length} items</span>
      </header>

      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center text-slate-400">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
             <Trash2 size={32} />
          </div>
          <p className="text-xl font-medium mb-6">Your cart is empty</p>
          <button onClick={() => navigate(-1)} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-md shadow-blue-600/20">
            Browse Menu
          </button>
        </div>
      ) : (
        <div className="px-4 py-6 space-y-4">
          {items.map((item, i) => {
            const modTotal = item.modifiers?.reduce((ms, m) => ms + (m.price || 0), 0) || 0;
            const lineTotal = (item.price + modTotal) * item.quantity;
            return (
              <div key={i} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] flex flex-col gap-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-900 text-lg leading-tight">{item.name}</h4>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <p className="text-sm text-slate-500 mt-1">+ {item.modifiers.map(m => m.name).join(', ')}</p>
                    )}
                  </div>
                  <span className="font-bold text-slate-900 text-lg">${lineTotal.toFixed(2)}</span>
                </div>
                
                <div className="flex items-center justify-between mt-2 pt-4 border-t border-slate-50">
                  <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-1 border border-slate-100">
                    <button onClick={() => updateQuantity(item.id, -1)} className="w-9 h-9 bg-white shadow-sm flex items-center justify-center rounded-lg text-slate-600 active:scale-95 transition-transform">
                      <Minus size={16} />
                    </button>
                    <span className="text-base font-bold w-6 text-center text-slate-900">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, 1)} className="w-9 h-9 bg-white shadow-sm flex items-center justify-center rounded-lg text-slate-600 active:scale-95 transition-transform">
                      <Plus size={16} />
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="flex items-center gap-2 text-red-500 bg-red-50 px-3 py-2 rounded-xl text-sm font-semibold active:scale-95 transition-colors"
                  >
                    <Trash2 size={16} /> Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-5 pt-5 pb-8 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-20">
          <div className="space-y-3 mb-5 text-sm font-medium text-slate-500 px-2">
            <div className="flex justify-between"><span>Subtotal</span><span className="text-slate-900">${subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>SGST (2.5%)</span><span className="text-slate-900">${sgst.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>CGST (2.5%)</span><span className="text-slate-900">${cgst.toFixed(2)}</span></div>
            <div className="flex justify-between font-bold text-xl text-slate-900 pt-3 border-t border-slate-100">
              <span>Total to Pay</span><span>${total.toFixed(2)}</span>
            </div>
          </div>
          <button
            onClick={handlePlaceOrder}
            disabled={loading}
            className="w-full py-4 bg-blue-600 disabled:bg-blue-400 text-white rounded-[2rem] font-bold text-lg shadow-xl shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {loading ? 'Processing...' : `Place Order • $${total.toFixed(2)}`}
          </button>
        </div>
      )}
    </div>
  );
}