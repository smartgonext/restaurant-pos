import React, { useState, useEffect } from 'react';
import { Package, X, Plus, Minus, Check, Edit3, Flame, Utensils } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';

interface ModifierOption {
  id?: number | string;
  name: string;
  price?: number;
}

interface ModifierGroup {
  id?: number | string;
  name: string;
  minSelect?: number;
  maxSelect?: number;
  options: ModifierOption[];
}

interface ItemOptionsModalProps {
  isOpen: boolean;
  itemName: string;
  itemPrice: number;
  salesUnit?: string | null;
  existingQty?: number;
  existingIsParcel?: boolean;
  existingNotes?: string;
  existingSelectedModifiers?: { name: string; price: number }[];
  modifierGroups?: ModifierGroup[];
  isLight?: boolean;
  onSave: (result: {
    quantity: number;
    isParcel: boolean;
    notes: string;
    modifiers: { name: string; price: number }[];
  }) => void;
  onCancel: () => void;
  onEditProduct?: () => void;
}

const QUICK_NOTES = [
  '📦 Parcel',
  '🌶️ Less Spicy',
  '🌶️🌶️ Extra Spicy',
  '🧂 Less Salt',
  '🧅 No Onion',
  '🧄 No Garlic',
  '🧀 Extra Cheese',
  '🥡 Separate Packing',
  '🔥 Hot & Fresh',
];

export const ItemOptionsModal: React.FC<ItemOptionsModalProps> = ({
  isOpen,
  itemName,
  itemPrice,
  salesUnit,
  existingQty = 1,
  existingIsParcel = false,
  existingNotes = '',
  existingSelectedModifiers = [],
  modifierGroups = [],
  isLight = false,
  onSave,
  onCancel,
  onEditProduct,
}) => {
  const [qty, setQty] = useState<number>(existingQty);
  const [isParcel, setIsParcel] = useState<boolean>(existingIsParcel);
  const [notes, setNotes] = useState<string>(existingNotes);
  const [selectedMods, setSelectedMods] = useState<{ name: string; price: number }[]>(existingSelectedModifiers);

  useEffect(() => {
    if (isOpen) {
      setQty(existingQty || 1);
      setIsParcel(existingIsParcel || false);
      setNotes(existingNotes || '');
      setSelectedMods(existingSelectedModifiers || []);
    }
  }, [isOpen, existingQty, existingIsParcel, existingNotes, existingSelectedModifiers]);

  if (!isOpen) return null;

  const toggleQuickNote = (noteText: string) => {
    if (noteText.includes('Parcel')) {
      setIsParcel(!isParcel);
      return;
    }
    const cleanNote = noteText.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]\s*/u, '');
    if (notes.includes(cleanNote)) {
      setNotes(notes.replace(cleanNote, '').replace(/,\s*,/g, ',').replace(/^,\s*|\s*,\s*$/g, ''));
    } else {
      setNotes(notes ? `${notes}, ${cleanNote}` : cleanNote);
    }
  };

  const toggleModifierOption = (modName: string, modPrice = 0) => {
    const exists = selectedMods.some(m => m.name === modName);
    if (exists) {
      setSelectedMods(selectedMods.filter(m => m.name !== modName));
    } else {
      setSelectedMods([...selectedMods, { name: modName, price: modPrice }]);
    }
  };

  const modTotalExtra = selectedMods.reduce((sum, m) => sum + (m.price || 0), 0);
  const unitTotal = itemPrice + modTotalExtra;
  const grandTotal = unitTotal * qty;

  const validGroups = (modifierGroups || []).filter(g => Array.isArray(g.options) && g.options.length > 0);

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-[250] p-4 animate-in fade-in duration-150">
      <div
        className={cn(
          "rounded-3xl max-w-lg w-full p-6 shadow-2xl border flex flex-col max-h-[90vh] overflow-hidden",
          isLight ? "bg-white border-gray-200 text-gray-900" : "bg-[#161820] border-gray-800 text-white"
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-gray-800/50">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black tracking-tight">{itemName}</h3>
              {isParcel && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] font-black uppercase flex items-center gap-1">
                  <Package size={12} /> Parcel
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-emerald-400 mt-0.5">
              Base Price: {formatCurrency(itemPrice)} {salesUnit ? `per ${salesUnit}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onEditProduct && (
              <button
                type="button"
                onClick={onEditProduct}
                className={cn(
                  "px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all shadow-sm",
                  isLight 
                    ? "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100" 
                    : "bg-purple-950/40 text-purple-300 border-purple-800/60 hover:bg-purple-900/50"
                )}
                title="Edit item rates, MRP, barcode or category on the spot"
              >
                <Edit3 size={13} className="text-purple-400" />
                <span>Edit Item</span>
              </button>
            )}
            <button
              onClick={onCancel}
              className={cn(
                "p-2 rounded-full hover:bg-gray-800/50 transition-colors text-gray-400 hover:text-white"
              )}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1">
          {/* Quantity Controls */}
          <div className={cn("p-4 rounded-2xl border flex items-center justify-between", isLight ? "bg-gray-50 border-gray-200" : "bg-[#0f1015] border-gray-800")}>
            <span className="text-xs font-black uppercase tracking-wider text-gray-400">Select Quantity</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center justify-center font-bold text-lg border border-red-500/30 active:scale-95 transition"
              >
                <Minus size={18} />
              </button>
              <span className="font-mono text-xl font-black min-w-[2.5rem] text-center">{qty}</span>
              <button
                type="button"
                onClick={() => setQty(qty + 1)}
                className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 flex items-center justify-center font-bold text-lg border border-emerald-500/30 active:scale-95 transition"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* Quick Parcel / Takeaway Action Button */}
          <div>
            <label className="text-[11px] font-black uppercase text-gray-400 tracking-wider mb-2 block">Order Packing Mode</label>
            <button
              type="button"
              onClick={() => setIsParcel(!isParcel)}
              className={cn(
                "w-full py-3 px-4 rounded-2xl font-black text-sm uppercase tracking-wide border transition-all flex items-center justify-center gap-2.5 active:scale-98 shadow-md",
                isParcel
                  ? "bg-amber-500 text-black border-amber-400 shadow-amber-500/20 ring-2 ring-amber-400/50"
                  : isLight
                  ? "bg-gray-100 hover:bg-gray-200 border-gray-300 text-gray-700"
                  : "bg-[#0f1015] hover:bg-gray-800 border-gray-800 text-gray-300"
              )}
            >
              <Package size={18} className={isParcel ? "animate-bounce" : ""} />
              {isParcel ? '📦 Item Packed as PARCEL (Takeaway)' : '🍽️ Dine-In / Regular Plate'}
            </button>
          </div>

          {/* Modifier Groups (Rendered ONLY if configured) */}
          {validGroups.length > 0 && (
            <div className="space-y-4">
              <label className="text-[11px] font-black uppercase text-gray-400 tracking-wider block">Item Modifiers & Add-ons</label>
              {validGroups.map((group, idx) => (
                <div key={group.id || idx} className={cn("p-3.5 rounded-2xl border space-y-2.5", isLight ? "bg-gray-50 border-gray-200" : "bg-[#0f1015] border-gray-800")}>
                  <div className="text-xs font-black text-indigo-400 uppercase tracking-wide flex justify-between">
                    <span>{group.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {group.options.map((opt) => {
                      const isSelected = selectedMods.some(m => m.name === opt.name);
                      return (
                        <button
                          key={opt.name}
                          type="button"
                          onClick={() => toggleModifierOption(opt.name, opt.price || 0)}
                          className={cn(
                            "py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-between transition active:scale-95",
                            isSelected
                              ? "bg-indigo-600 text-white border-indigo-500 shadow-lg"
                              : isLight
                              ? "bg-white border-gray-300 text-gray-800 hover:bg-gray-100"
                              : "bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800"
                          )}
                        >
                          <span className="truncate">{opt.name}</span>
                          {opt.price ? <span className="font-mono text-[10px] text-emerald-400 ml-1">+₹{opt.price}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick Notes & Instructions */}
          <div className="space-y-2.5">
            <label className="text-[11px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-1.5">
              <Edit3 size={14} /> Quick KOT Instructions / Notes
            </label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_NOTES.map((qn) => {
                const isNoteParcel = qn.includes('Parcel');
                const isSelected = isNoteParcel ? isParcel : notes.includes(qn.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]\s*/u, ''));
                return (
                  <button
                    key={qn}
                    type="button"
                    onClick={() => toggleQuickNote(qn)}
                    className={cn(
                      "py-1.5 px-3 rounded-xl text-xs font-bold border transition active:scale-95 flex items-center gap-1",
                      isSelected
                        ? isNoteParcel
                          ? "bg-amber-500 text-black border-amber-400"
                          : "bg-purple-600 text-white border-purple-500 shadow-md"
                        : isLight
                        ? "bg-gray-100 hover:bg-gray-200 border-gray-300 text-gray-700"
                        : "bg-[#0f1015] hover:bg-gray-800 border-gray-800 text-gray-300"
                    )}
                  >
                    {qn}
                    {isSelected && <Check size={12} />}
                  </button>
                );
              })}
            </div>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Type any extra note for kitchen staff..."
              className={cn(
                "w-full rounded-xl p-3 text-xs font-medium border focus:outline-none transition resize-none",
                isLight
                  ? "bg-gray-50 border-gray-300 text-gray-900 focus:border-indigo-600"
                  : "bg-[#0f1015] border-gray-800 text-white focus:border-indigo-500"
              )}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-gray-800/50 flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase text-gray-400 block">Line Total ({qty}x)</span>
            <span className="font-mono text-xl font-black text-emerald-400">{formatCurrency(grandTotal)}</span>
          </div>
          <div className="flex gap-2.5 flex-1 justify-end">
            <button
              type="button"
              onClick={onCancel}
              className={cn(
                "py-3 px-5 rounded-2xl text-xs font-black uppercase transition border",
                isLight ? "bg-gray-200 hover:bg-gray-300 text-gray-800" : "bg-gray-800 hover:bg-gray-700 text-gray-300"
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSave({
                  quantity: qty,
                  isParcel,
                  notes: notes.trim(),
                  modifiers: selectedMods,
                });
              }}
              className="py-3 px-6 rounded-2xl text-xs font-black uppercase tracking-wider bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20 active:scale-95 transition flex items-center gap-2"
            >
              <Check size={16} /> Save Item to KOT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
