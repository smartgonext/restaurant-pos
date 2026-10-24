import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ExpiryDateBannerProps {
  isVisible: boolean;
  onDismiss: () => void;
  expiredItemsCount?: number;
}

export const ExpiryDateBanner: React.FC<ExpiryDateBannerProps> = ({
  isVisible,
  onDismiss,
  expiredItemsCount = 0,
}) => {
  if (!isVisible || expiredItemsCount === 0) {
    return null;
  }

  return (
    <div className="bg-amber-500/20 border-l-4 border-amber-500 p-4 rounded flex items-start gap-3 mb-4 animate-pulse">
      <AlertTriangle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-semibold text-amber-200">
          ⚠️ {expiredItemsCount} item(s) have expired
        </p>
        <p className="text-sm text-amber-100/80 mt-1">
          These items are no longer available for sale. Please remove them from inventory.
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="text-amber-200 hover:text-amber-100 transition-colors flex-shrink-0"
      >
        <X size={18} />
      </button>
    </div>
  );
};
