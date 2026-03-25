import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useCartStore } from '@/stores/cartStore';
import { ArrowLeft, Trash2, Plus, Minus, CheckCircle } from 'lucide-react';
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

  const sgst = subtotal * 0.025;
  const cgst = subtotal * 0.025;
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
      <div className="flex flex-col items-center justify-center min-h-screen px-8 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-6">
          <CheckCircle className="text-green-600 dark:text-green-400" size={40} />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Order Placed! 🎉</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-8">Your order is being prepared. Please wait.</p>
        <button
          onClick={() => navigate(`/menu/${restaurantSlug}/${tableToken}/status`)}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold"
        >
          Track Order Status
        </button>
        <button
          onClick={() => navigate(`/menu/${restaurantSlug}/${tableToken}`)}
          className="mt-3 w-full py-3 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-semibold"
        >
          Back to Menu
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 pb-28">
      {/* Header */}
      <header className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 p-4 flex items-center gap-3 z-10">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">My Order</h1>
        <span className="ml-auto text-sm text-gray-500">{items.length} item(s)</span>
      </header>

      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center text-gray-400">
          <p className="text-lg font-medium mb-4">Your cart is empty</p>
          <button onClick={() => navigate(-1)} className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold">
            Browse Menu
          </button>
        </div>
      ) : (
        <>
          {/* Cart Items */}
          <div className="flex-1 px-4 py-4 space-y-3 overflow-y-auto">
            {items.map((item, i) => {
              const modTotal = item.modifiers?.reduce((ms, m) => ms + (m.price || 0), 0) || 0;
              const lineTotal = (item.price + modTotal) * item.quantity;
              return (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 flex gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 dark:text-white truncate">{item.name}</h4>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <p className="text-xs text-gray-400 truncate">+ {item.modifiers.map(m => m.name).join(', ')}</p>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
                        <button onClick={() => updateQuantity(item.id, -1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-gray-600 transition-colors">
                          <Minus size={14} />
                        </button>
                        <span className="text-sm font-semibold w-5 text-center">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-gray-600 transition-colors">
                          <Plus size={14} />
                        </button>
                      </div>
                      <span className="font-bold">${lineTotal.toFixed(2)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="self-start p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Summary + Checkout */}
          <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-4 pt-4 pb-8 shadow-2xl">
            <div className="space-y-2 mb-4 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex justify-between"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>SGST (2.5%)</span><span>${sgst.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>CGST (2.5%)</span><span>${cgst.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-base text-gray-900 dark:text-white pt-2 border-t border-dashed border-gray-200 dark:border-gray-700">
                <span>Total</span><span>${total.toFixed(2)}</span>
              </div>
            </div>
            <button
              onClick={handlePlaceOrder}
              disabled={loading}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-70 text-white rounded-2xl font-bold text-base transition-colors"
            >
              {loading ? 'Placing Order...' : `Place Order • $${total.toFixed(2)}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
