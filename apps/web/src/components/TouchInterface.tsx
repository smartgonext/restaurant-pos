import React, { useCallback } from 'react';
import { Barcode, AlertTriangle, CheckCircle, ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Touch-Friendly Components for Bakery POS
 * Designed for non-tech-savvy staff with intuitive interface
 * Large buttons, clear feedback, minimal text
 */

interface TouchButtonProps {
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  children?: React.ReactNode;
  icon?: React.ReactNode;
}

export const TouchButton: React.FC<TouchButtonProps> = ({
  onClick,
  disabled = false,
  variant = 'primary',
  size = 'md',
  children,
  icon,
}) => {
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-600 hover:bg-gray-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    success: 'bg-green-600 hover:bg-green-700 text-white',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white',
  };

  const sizes = {
    sm: 'px-3 py-2 text-sm rounded-lg',
    md: 'px-4 py-3 text-base rounded-xl',
    lg: 'px-6 py-4 text-lg rounded-2xl font-bold',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'transition-all duration-150 flex items-center gap-2 justify-center',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'active:scale-95 touch-none',
        variants[variant],
        sizes[size]
      )}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children && <span>{children}</span>}
    </button>
  );
};

interface QuantityPickerProps {
  quantity: number;
  onQuantityChange: (qty: number) => void;
  min?: number;
  max?: number;
  presets?: number[];
}

export const TouchQuantityPicker: React.FC<QuantityPickerProps> = ({
  quantity,
  onQuantityChange,
  min = 1,
  max = 999,
  presets = [1, 2, 5, 10],
}) => {
  const handleIncrease = useCallback(() => {
    if (quantity < max) onQuantityChange(quantity + 1);
  }, [quantity, max, onQuantityChange]);

  const handleDecrease = useCallback(() => {
    if (quantity > min) onQuantityChange(quantity - 1);
  }, [quantity, min, onQuantityChange]);

  return (
    <div className="flex items-center gap-2 bg-gray-800 rounded-xl p-2">
      <TouchButton
        onClick={handleDecrease}
        disabled={quantity <= min}
        variant="secondary"
        size="md"
        icon={<ChevronDown className="w-5 h-5" />}
      >
        -
      </TouchButton>

      <div className="flex-1 text-center bg-gray-700 rounded-lg py-2 px-3">
        <div className="text-2xl font-bold text-white">{quantity}</div>
      </div>

      <TouchButton
        onClick={handleIncrease}
        disabled={quantity >= max}
        variant="secondary"
        size="md"
        icon={<ChevronUp className="w-5 h-5" />}
      >
        +
      </TouchButton>

      {/* Quick presets */}
      <div className="flex gap-1 ml-2">
        {presets.map(preset => (
          <button
            key={preset}
            onClick={() => onQuantityChange(preset)}
            className={cn(
              'w-10 h-10 rounded-lg font-bold transition-all',
              quantity === preset
                ? 'bg-blue-600 text-white scale-110'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            )}
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
};

interface BarcodeInputProps {
  onSubmit: (barcode: string) => void;
  placeholder?: string;
}

export const TouchBarcodeInput: React.FC<BarcodeInputProps> = ({
  onSubmit,
  placeholder = 'Scan barcode...',
}) => {
  const [input, setInput] = React.useState('');

  const handleSubmit = useCallback(() => {
    if (input.trim()) {
      onSubmit(input.trim());
      setInput('');
    }
  }, [input, onSubmit]);

  return (
    <div className="flex gap-2 bg-gray-800 rounded-xl p-3">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder={placeholder}
        autoFocus
        className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <TouchButton
        onClick={handleSubmit}
        variant="primary"
        size="md"
        icon={<Barcode className="w-5 h-5" />}
      >
        Scan
      </TouchButton>
    </div>
  );
};

interface InventoryItemCardProps {
  name: string;
  image?: string | null;
  price: number;
  stock: number;
  expiryStatus?: 'good' | 'warning' | 'expired';
  onSelect: () => void;
  disabled?: boolean;
}

export const TouchInventoryCard: React.FC<InventoryItemCardProps> = ({
  name,
  image,
  price,
  stock,
  expiryStatus = 'good',
  onSelect,
  disabled = stock <= 0,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'warning':
        return 'bg-amber-900 text-amber-100 border-amber-700';
      case 'expired':
        return 'bg-red-900 text-red-100 border-red-700';
      default:
        return 'bg-green-900 text-green-100 border-green-700';
    }
  };

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'relative w-full p-4 rounded-xl border-2 transition-all duration-200',
        'touch-none active:scale-95',
        disabled
          ? 'opacity-50 cursor-not-allowed border-gray-700 bg-gray-800'
          : 'border-gray-700 bg-gray-800 hover:border-blue-600 hover:bg-gray-700'
      )}
    >
      {/* Image */}
      {image && (
        <div className="mb-2 h-32 bg-gray-900 rounded-lg overflow-hidden">
          <img
            src={image}
            alt={name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Name */}
      <h3 className="font-bold text-white text-sm line-clamp-2 mb-1">{name}</h3>

      {/* Price and Stock */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-xl font-bold text-green-400">₹{price.toFixed(0)}</span>
        <span className={cn(
          'text-sm font-bold',
          stock > 0 ? 'text-green-300' : 'text-red-300'
        )}>
          {stock > 0 ? `${stock} left` : 'Out'}
        </span>
      </div>

      {/* Expiry Status Badge */}
      {expiryStatus !== 'good' && (
        <div className={cn('px-2 py-1 rounded text-xs font-bold flex items-center gap-1', getStatusColor(expiryStatus))}>
          {expiryStatus === 'expired' ? (
            <>
              <AlertTriangle className="w-3 h-3" />
              Expired
            </>
          ) : (
            <>
              <AlertTriangle className="w-3 h-3" />
              Expiring Soon
            </>
          )}
        </div>
      )}
    </button>
  );
};

interface CartItemDisplayProps {
  name: string;
  quantity: number;
  unit?: string;
  price: number;
  total: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
  expiryWarning?: string;
}

export const TouchCartItem: React.FC<CartItemDisplayProps> = ({
  name,
  quantity,
  unit,
  price,
  total,
  onIncrement,
  onDecrement,
  onRemove,
  expiryWarning,
}) => {
  return (
    <div className={cn(
      'bg-gray-800 rounded-xl p-3 border-l-4 transition-colors',
      expiryWarning ? 'border-l-red-500' : 'border-l-blue-500'
    )}>
      {/* Main content */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <h3 className="font-bold text-white text-sm">{name}</h3>
          {expiryWarning && (
            <p className="text-xs text-red-300 mt-1">{expiryWarning}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-green-400 font-bold">₹{total.toFixed(2)}</p>
          <p className="text-xs text-gray-400">@₹{price.toFixed(2)}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2 items-center">
        <div className="flex items-center gap-1 bg-gray-700 rounded-lg">
          <TouchButton
            onClick={onDecrement}
            variant="secondary"
            size="sm"
            icon={<ChevronDown className="w-4 h-4" />}
          >
            -
          </TouchButton>
          <span className="w-8 text-center font-bold text-white">{quantity}</span>
          <TouchButton
            onClick={onIncrement}
            variant="secondary"
            size="sm"
            icon={<ChevronUp className="w-4 h-4" />}
          >
            +
          </TouchButton>
        </div>

        {unit && <span className="text-xs text-gray-400 ml-auto">{unit}</span>}

        <TouchButton
          onClick={onRemove}
          variant="danger"
          size="sm"
          icon={<Trash2 className="w-4 h-4" />}
        />
      </div>
    </div>
  );
};

interface StatusIndicatorProps {
  status: 'online' | 'offline' | 'syncing' | 'error';
  message?: string;
}

export const TouchStatusIndicator: React.FC<StatusIndicatorProps> = ({ status, message }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'online':
        return 'bg-green-900 text-green-100 border-green-700';
      case 'offline':
        return 'bg-amber-900 text-amber-100 border-amber-700';
      case 'syncing':
        return 'bg-blue-900 text-blue-100 border-blue-700 animate-pulse';
      case 'error':
        return 'bg-red-900 text-red-100 border-red-700';
      default:
        return 'bg-gray-700 text-gray-100';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'online':
        return '📡';
      case 'offline':
        return '📴';
      case 'syncing':
        return '⟳';
      case 'error':
        return '❌';
      default:
        return '❓';
    }
  };

  return (
    <div className={cn('px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2', getStatusColor())}>
      <span>{getStatusIcon()}</span>
      <span>{message || status.toUpperCase()}</span>
    </div>
  );
};
