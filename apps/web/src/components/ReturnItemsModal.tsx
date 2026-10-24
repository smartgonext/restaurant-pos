import React, { useState, useEffect } from 'react';
import { X, Search, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import axios from 'axios';

interface ReturnItem {
  tokenItemId: number;
  menuItemId: number;
  menuItemName: string;
  quantity: number;
  price: number;
  totalReturn: number;
  availableQty: number;
}

interface ReturnItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    returns: ReturnItem[],
    reason: string,
    originalTokenId?: number,
    totalReturnAmount?: number
  ) => void;
  restaurantId: number;
}

export const ReturnItemsModal: React.FC<ReturnItemsModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  restaurantId,
}) => {
  const [billOrTokenNumber, setBillOrTokenNumber] = useState('');
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [tokenId, setTokenId] = useState<number | null>(null);
  const [selectedItems, setSelectedItems] = useState<{ [key: number]: number }>({});
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'search' | 'select' | 'confirm'>('search');

  const searchBillOrToken = async () => {
    if (!billOrTokenNumber.trim()) {
      setError('Please enter a bill or token number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Try to fetch from token API
      const response = await axios.get(
        `/api/bakery-tokens/${billOrTokenNumber}?restaurantId=${restaurantId}`
      );

      if (response.data && response.data.items) {
        setTokenId(response.data.id ?? null);
        const returnItems: ReturnItem[] = response.data.items.map(
          (item: any, idx: number) => ({
            tokenItemId: item.id || idx,
            menuItemId: item.menuItemId,
            menuItemName: item.menuItemName,
            quantity: Number(item.quantity),
            price: Number(item.price),
            totalReturn: Number(item.price) * Number(item.quantity),
            availableQty: Number(item.quantity),
          })
        );

        setItems(returnItems);
        setStep('select');
      } else {
        setError('No items found for this bill/token number');
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          'Failed to fetch bill/token details. Please check the number and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReturnQtyChange = (tokenItemId: number, qty: number) => {
    setSelectedItems(prev => ({
      ...prev,
      [tokenItemId]: Math.max(0, Math.min(qty, items.find(i => i.tokenItemId === tokenItemId)?.availableQty || 0)),
    }));
  };

  const handleConfirm = () => {
    const returnsToProcess = items.filter(
      item => selectedItems[item.tokenItemId] && selectedItems[item.tokenItemId] > 0
    );

    if (returnsToProcess.length === 0) {
      setError('Please select at least one item to return');
      return;
    }

    if (!reason.trim()) {
      setError('Please provide a return reason');
      return;
    }

    // Update quantities and compute total
    const processedReturns = returnsToProcess.map(item => {
      const qty = selectedItems[item.tokenItemId] || 0;
      return {
        ...item,
        quantity: qty,
        totalReturn: item.price * qty,
      };
    });

    const totalAmount = processedReturns.reduce((sum, it) => sum + it.totalReturn, 0);

    onConfirm(processedReturns, reason, tokenId ?? undefined, totalAmount);
    resetModal();
  };

  const resetModal = () => {
    setBillOrTokenNumber('');
    setItems([]);
    setSelectedItems({});
    setReason('');
    setError('');
    setTokenId(null);
    setStep('search');
  };

  const totalReturnAmount = items
    .filter(item => selectedItems[item.tokenItemId] && selectedItems[item.tokenItemId] > 0)
    .reduce((sum, item) => sum + item.price * (selectedItems[item.tokenItemId] || 0), 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1c23] rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#14151a] border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Return Items</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500 rounded-lg flex items-start gap-2">
              <AlertCircle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          {step === 'search' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Bill or Token Number
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={billOrTokenNumber}
                    onChange={e => setBillOrTokenNumber(e.target.value)}
                    placeholder="Enter bill/token number..."
                    className="flex-1 px-4 py-2 bg-[#14151a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                    onKeyPress={e => e.key === 'Enter' && searchBillOrToken()}
                  />
                  <button
                    onClick={searchBillOrToken}
                    disabled={loading}
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-700 transition-colors font-medium"
                  >
                    {loading ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'select' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-white mb-4">Items from Token/Bill: {billOrTokenNumber}</h3>
                <div className="space-y-3">
                  {items.map(item => (
                    <div
                      key={item.tokenItemId}
                      className="p-4 bg-[#14151a] border border-gray-800 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-medium text-white">{item.menuItemName}</p>
                          <p className="text-sm text-gray-400">₹{item.price.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-400">
                            Available: {item.availableQty}
                          </span>
                          <div className="flex items-center gap-2 bg-[#1a1c23] px-3 py-1 rounded">
                            <input
                              type="number"
                              min="0"
                              max={item.availableQty}
                              value={selectedItems[item.tokenItemId] || 0}
                              onChange={e =>
                                handleReturnQtyChange(item.tokenItemId, Number(e.target.value))
                              }
                              className="w-12 bg-transparent text-white text-center focus:outline-none"
                            />
                            <span className="text-gray-500">/</span>
                            <span className="text-gray-400">{item.availableQty}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Return Reason
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Why are these items being returned?"
                  className="w-full px-4 py-2 bg-[#14151a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors resize-none"
                  rows={3}
                />
              </div>

              <div className="pt-4 border-t border-gray-800">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-gray-300">Total Return Amount:</span>
                  <span className="text-xl font-bold text-white">₹{totalReturnAmount.toFixed(2)}</span>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('search')}
                    className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleConfirm}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                  >
                    Process Return
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
