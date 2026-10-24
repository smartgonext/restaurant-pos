import React, { useState } from 'react';
import { X, Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Modifier {
  id: string | number;
  name: string;
  price: number;
}

interface ModifierGroup {
  id: number;
  name: string;
  isRequired?: boolean;
  allowMultiple?: boolean;
  options?: Modifier[];
}

type SelectedModifiers = Record<number, any>;

interface ModifierGroupsModalProps {
  isOpen: boolean;
  itemName: string;
  basePrice: number;
  modifierGroups: ModifierGroup[];
  onConfirm: (selectedModifiers: SelectedModifiers, totalPrice: number) => void;
  onClose: () => void;
}

export const ModifierGroupsModal: React.FC<ModifierGroupsModalProps> = ({
  isOpen,
  itemName,
  basePrice,
  modifierGroups,
  onConfirm,
  onClose,
}) => {
  const [selectedModifiers, setSelectedModifiers] = useState<SelectedModifiers>({});
  const [quantity, setQuantity] = useState(1);

  const calculateModifierPrice = (): number => {
    let totalModifierPrice = 0;

    modifierGroups.forEach(group => {
      const selected = selectedModifiers[group.id];
      if (!selected) return;

      const modifiersToCheck = Array.isArray(selected) ? selected : [selected];

      modifiersToCheck.forEach(modId => {
        const modifier = group.options?.find(
          opt => (opt.id === modId || opt.name === modId)
        );
        if (modifier) {
          totalModifierPrice += modifier.price;
        }
      });
    });

    return totalModifierPrice;
  };

  const totalPrice = (basePrice + calculateModifierPrice()) * quantity;

  const handleModifierSelect = (groupId: number, modifierId: string | number, allowMultiple: boolean) => {
    setSelectedModifiers((prev: SelectedModifiers) => {
      if (allowMultiple) {
        const current = Array.isArray(prev[groupId]) ? (prev[groupId] as Array<string | number>) : ([] as Array<string | number>);
        const isSelected = current.includes(modifierId as string | number);
        return {
          ...prev,
          [groupId]: isSelected
            ? current.filter((id: any) => id !== modifierId)
            : [...current, modifierId],
        } as SelectedModifiers;
      } else {
        return {
          ...prev,
          [groupId]: prev[groupId] === modifierId ? undefined : modifierId,
        } as SelectedModifiers;
      }
    });
  };

  const isModifierSelected = (groupId: number, modifierId: string | number, allowMultiple: boolean) => {
    const selected = selectedModifiers[groupId] as any;
    if (allowMultiple) {
      return Array.isArray(selected) && (selected as Array<string | number>).includes(modifierId as string | number);
    }
    return selected === modifierId;
  };

  const canConfirm = modifierGroups.every(group => {
    if (group.isRequired) {
      const selected = selectedModifiers[group.id];
      return selected !== undefined && selected !== null;
    }
    return true;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1c23] rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#14151a] border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{itemName}</h2>
            <p className="text-sm text-gray-400">₹{basePrice.toFixed(2)}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modifier Groups */}
        <div className="px-6 py-4 space-y-6">
          {modifierGroups.map(group => (
            <div key={group.id}>
              <div className="mb-3">
                <h3 className="font-semibold text-white">
                  {group.name}
                  {group.isRequired && <span className="text-red-500 ml-1">*</span>}
                </h3>
                {group.allowMultiple && (
                  <p className="text-xs text-gray-400 mt-1">Select multiple</p>
                )}
              </div>

              <div className="space-y-2">
                {group.options?.map(modifier => (
                  <button
                    key={modifier.id}
                    onClick={() =>
                      handleModifierSelect(group.id, modifier.id, group.allowMultiple || false)
                    }
                    className={cn(
                      'w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left',
                      isModifierSelected(group.id, modifier.id, group.allowMultiple || false)
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-gray-700 bg-[#14151a] hover:border-gray-600'
                    )}
                  >
                    <span className="text-white">{modifier.name}</span>
                    <div className="flex items-center gap-2">
                      {modifier.price > 0 && (
                        <span className="text-sm text-gray-400">+₹{modifier.price.toFixed(2)}</span>
                      )}
                      <div
                        className={cn(
                          'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
                          isModifierSelected(group.id, modifier.id, group.allowMultiple || false)
                            ? 'border-purple-500 bg-purple-500'
                            : 'border-gray-600'
                        )}
                      >
                        {isModifierSelected(group.id, modifier.id, group.allowMultiple || false) && (
                          <div className="w-2 h-2 bg-white rounded-sm" />
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Quantity Selector & Price */}
        <div className="sticky bottom-0 bg-[#14151a] border-t border-gray-800 px-6 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-300">Quantity</span>
            <div className="flex items-center gap-3 bg-[#1a1c23] rounded-lg p-2">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="text-gray-400 hover:text-white transition-colors p-1"
              >
                <Minus size={16} />
              </button>
              <span className="text-white font-semibold w-6 text-center">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="text-gray-400 hover:text-white transition-colors p-1"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-300">Total</span>
              <span className="text-xl font-bold text-white">₹{totalPrice.toFixed(2)}</span>
            </div>
            <button
              onClick={() => {
                onConfirm(selectedModifiers, totalPrice);
                setSelectedModifiers({});
                setQuantity(1);
              }}
              disabled={!canConfirm}
              className={cn(
                'w-full py-3 rounded-lg font-semibold transition-all',
                canConfirm
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              )}
            >
              Add to Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
