import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface POSActionBarProps {
  isSubmitting: boolean;
  cartItemsCount: number;
  onPlaceOrder: (options: { kot: boolean; bill: boolean; pay: boolean; print: boolean }) => void;
}

export const POSActionBar = memo(function POSActionBar({
  isSubmitting,
  cartItemsCount,
  onPlaceOrder,
}: POSActionBarProps) {
  const disabled = isSubmitting || cartItemsCount === 0;

  return (
    <div className="flex-shrink-0 bg-[#0f1014] border-t border-gray-800 p-2 space-y-1.5">
      {isSubmitting && (
        <div className="flex items-center justify-center gap-2 text-[10px] text-purple-400 font-bold py-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Processing...
        </div>
      )}

      {/* KOT Row */}
      <div className="grid grid-cols-3 gap-1">
        <button
          onClick={() => onPlaceOrder({ kot: true, bill: false, pay: false, print: false })}
          disabled={disabled}
          className="bg-[#3a3f51] hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white py-1.5 rounded text-[9px] font-black uppercase transition-colors"
        >
          KOT
        </button>
        <button
          onClick={() => onPlaceOrder({ kot: true, bill: false, pay: false, print: true })}
          disabled={disabled}
          className="bg-[#3a3f51] hover:bg-gray-600 disabled:opacity-40 text-white py-1.5 rounded text-[9px] font-black uppercase transition-colors"
        >
          KOT+Print
        </button>
        <button
          onClick={() => onPlaceOrder({ kot: true, bill: true, pay: true, print: true })}
          disabled={disabled}
          className="bg-[#3a3f51] hover:bg-gray-600 disabled:opacity-40 text-white py-1.5 rounded text-[8px] font-black uppercase leading-tight transition-colors"
        >
          KOT+Bill+Pay
        </button>
      </div>

      {/* Bill/Pay Row */}
      <div className="grid grid-cols-3 gap-1">
        <button
          onClick={() => onPlaceOrder({ kot: false, bill: true, pay: false, print: false })}
          disabled={disabled}
          className="bg-[#9b59b6] hover:bg-[#8e44ad] disabled:opacity-40 text-white py-1.5 rounded text-[9px] font-black uppercase transition-colors"
        >
          Bill
        </button>
        <button
          onClick={() => onPlaceOrder({ kot: false, bill: true, pay: true, print: false })}
          disabled={disabled}
          className="bg-[#2ecc71] hover:bg-[#27ae60] disabled:opacity-40 text-white py-1.5 rounded text-[9px] font-black uppercase transition-colors"
        >
          Bill+Pay
        </button>
        <button
          onClick={() => onPlaceOrder({ kot: false, bill: true, pay: false, print: true })}
          disabled={disabled}
          className="bg-[#3498db] hover:bg-[#2980b9] disabled:opacity-40 text-white py-1.5 rounded text-[9px] font-black uppercase transition-colors"
        >
          Bill+Print
        </button>
      </div>
    </div>
  );
});