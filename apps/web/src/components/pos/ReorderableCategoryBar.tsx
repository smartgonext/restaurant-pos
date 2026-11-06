import React, { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

export interface CategoryItem {
  id: number | string;
  name: string;
  isKOTEnabled?: boolean;
  sortOrder?: number;
  [key: string]: any;
}

interface ReorderableCategoryBarProps {
  categories: CategoryItem[];
  activeCategoryId: string | number | null;
  onSelectCategory: (id: string | number | null) => void;
  storageKey?: string;
  isLight?: boolean;
  className?: string;
}

export function ReorderableCategoryBar({
  categories,
  activeCategoryId,
  onSelectCategory,
  storageKey = 'pos_category_order_v2',
  isLight = false,
  className,
}: ReorderableCategoryBarProps) {
  const [orderedCategories, setOrderedCategories] = useState<CategoryItem[]>([]);
  const [draggedId, setDraggedId] = useState<string | number | null>(null);
  const [dragOverId, setDragOverId] = useState<string | number | null>(null);
  const [isTouchDragging, setIsTouchDragging] = useState(false);

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const activeTouchIdRef = useRef<string | number | null>(null);
  const didDragRef = useRef(false);

  // Helper to arrange categories: KOT categories first, then all others
  const sortCategoriesKotFirst = useCallback((cats: CategoryItem[]): CategoryItem[] => {
    return [...cats].sort((a, b) => {
      const aKot = Boolean(a.isKOTEnabled);
      const bKot = Boolean(b.isKOTEnabled);
      if (aKot !== bKot) return aKot ? -1 : 1; // KOT categories first
      return (Number(a.sortOrder || 0)) - (Number(b.sortOrder || 0));
    });
  }, []);

  // Load and apply persistent category order from localStorage
  useEffect(() => {
    if (!categories || categories.length === 0) {
      setOrderedCategories([]);
      return;
    }

    try {
      const savedRaw = localStorage.getItem(storageKey);
      if (savedRaw) {
        const savedIds: Array<string | number> = JSON.parse(savedRaw);
        if (Array.isArray(savedIds) && savedIds.length > 0) {
          const idMap = new Map<string, number>();
          savedIds.forEach((id, idx) => idMap.set(String(id), idx));

          const sorted = [...categories].sort((a, b) => {
            const hasA = idMap.has(String(a.id));
            const hasB = idMap.has(String(b.id));
            if (hasA && hasB) {
              return idMap.get(String(a.id))! - idMap.get(String(b.id))!;
            }
            if (hasA && !hasB) return -1;
            if (!hasA && hasB) return 1;
            // Any items not in saved custom order: sort KOT first
            const aKot = Boolean(a.isKOTEnabled);
            const bKot = Boolean(b.isKOTEnabled);
            if (aKot !== bKot) return aKot ? -1 : 1;
            return (Number(a.sortOrder || 0)) - (Number(b.sortOrder || 0));
          });

          setOrderedCategories(sorted);
          return;
        }
      }
    } catch (e) {
      console.warn('[ReorderableCategoryBar] Failed to read saved category order', e);
    }

    // Starting arrangement: KOT categories first, then other categories
    setOrderedCategories(sortCategoriesKotFirst(categories));
  }, [categories, storageKey, sortCategoriesKotFirst]);

  // Persist new order into localStorage
  const saveNewOrder = useCallback(
    (newOrder: CategoryItem[]) => {
      setOrderedCategories(newOrder);
      try {
        const ids = newOrder.map((c) => c.id);
        localStorage.setItem(storageKey, JSON.stringify(ids));
        toast.success('Category order saved!', { id: 'cat-order-saved', duration: 1500 });
      } catch (e) {
        console.error('[ReorderableCategoryBar] Failed to save category order', e);
      }
    },
    [storageKey]
  );

  // Core reorder helper
  const moveCategory = useCallback(
    (fromId: string | number, toId: string | number) => {
      if (fromId === toId) return;
      setOrderedCategories((prev) => {
        const fromIndex = prev.findIndex((c) => String(c.id) === String(fromId));
        const toIndex = prev.findIndex((c) => String(c.id) === String(toId));
        if (fromIndex === -1 || toIndex === -1) return prev;

        const updated = [...prev];
        const [movedItem] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, movedItem);

        saveNewOrder(updated);
        return updated;
      });
    },
    [saveNewOrder]
  );

  // ── HTML5 Drag & Drop (Mouse) ──
  const handleDragStart = (e: React.DragEvent, id: string | number) => {
    setDraggedId(id);
    didDragRef.current = true;
    e.dataTransfer.setData('text/plain', String(id));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string | number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== id) {
      setDragOverId(id);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string | number) => {
    e.preventDefault();
    if (draggedId && draggedId !== targetId) {
      moveCategory(draggedId, targetId);
    }
    setDraggedId(null);
    setDragOverId(null);
    setTimeout(() => {
      didDragRef.current = false;
    }, 100);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
    setTimeout(() => {
      didDragRef.current = false;
    }, 100);
  };

  // ── Touch & Hold Drag (Touchscreen) ──
  const handleTouchStart = (id: string | number, e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    activeTouchIdRef.current = id;
    didDragRef.current = false;

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);

    // Hold for 250ms to activate drag
    longPressTimerRef.current = setTimeout(() => {
      setIsTouchDragging(true);
      setDraggedId(id);
      didDragRef.current = true;
      try {
        if ('vibrate' in navigator) navigator.vibrate(40);
      } catch (_) {}
    }, 250);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];

    // If hold threshold hasn't triggered yet, check if finger moved significantly (> 10px) - if so, cancel hold (user is scrolling)
    if (!isTouchDragging && touchStartPosRef.current) {
      const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
      const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
      if (dx > 10 || dy > 10) {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      }
      return;
    }

    // Touch drag active: prevent page scroll while moving category
    if (isTouchDragging) {
      e.preventDefault();
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const targetBtn = el?.closest('[data-category-id]');
      if (targetBtn) {
        const targetId = targetBtn.getAttribute('data-category-id');
        if (targetId && targetId !== String(dragOverId)) {
          setDragOverId(targetId);
        }
      }
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);

    if (isTouchDragging && draggedId && dragOverId && String(draggedId) !== String(dragOverId)) {
      moveCategory(draggedId, dragOverId);
    }

    setIsTouchDragging(false);
    setDraggedId(null);
    setDragOverId(null);
    activeTouchIdRef.current = null;
    touchStartPosRef.current = null;

    setTimeout(() => {
      didDragRef.current = false;
    }, 200);
  };

  const chipClass =
    'shrink-0 whitespace-nowrap rounded-lg border px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-[13px] font-black uppercase tracking-wide transition-all snap-start leading-tight select-none cursor-grab active:cursor-grabbing min-h-[38px] sm:min-h-[42px] flex items-center justify-center shadow-sm';

  const isAllActive = activeCategoryId === 'all' || activeCategoryId === null || activeCategoryId === 0;

  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto custom-scrollbar no-scrollbar py-1.5 scroll-smooth snap-x snap-mandatory flex-nowrap items-center",
        className
      )}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* "All Items" Category Button (Pinned at front) */}
      <button
        type="button"
        onClick={() => onSelectCategory('all')}
        className={cn(
          chipClass,
          isAllActive
            ? (isLight ? 'bg-purple-600 border-purple-600 text-white font-black shadow-sm' : 'bg-purple-500/20 border-purple-500 text-purple-300 font-black')
            : (isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-200 hover:text-slate-900 shadow-sm' : 'bg-[#1a1c23] border-gray-800 text-gray-400 hover:bg-gray-800')
        )}
      >
        All Items
      </button>

      {/* Reorderable Category Buttons */}
      {orderedCategories.map((cat) => {
        const catIdStr = String(cat.id);
        const isActive = String(activeCategoryId) === catIdStr;
        const isCurrentDragged = String(draggedId) === catIdStr;
        const isCurrentOver = String(dragOverId) === catIdStr && !isCurrentDragged;

        return (
          <button
            key={cat.id}
            data-category-id={cat.id}
            type="button"
            draggable
            onDragStart={(e) => handleDragStart(e, cat.id)}
            onDragOver={(e) => handleDragOver(e, cat.id)}
            onDrop={(e) => handleDrop(e, cat.id)}
            onDragEnd={handleDragEnd}
            onTouchStart={(e) => handleTouchStart(cat.id, e)}
            onClick={(e) => {
              if (didDragRef.current) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              onSelectCategory(cat.id);
            }}
            title="Click to filter • Hold and drag to reorder"
            className={cn(
              chipClass,
              isActive
                ? (isLight ? 'bg-purple-600 border-purple-600 text-white font-black shadow-sm' : 'bg-purple-500/20 border-purple-500 text-purple-300 font-black')
                : (isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-200 hover:text-slate-900 shadow-sm' : 'bg-[#1a1c23] border-gray-800 text-gray-400 hover:bg-gray-800'),
              isCurrentDragged && 'opacity-40 scale-105 border-purple-400 border-dashed shadow-xl ring-2 ring-purple-400',
              isCurrentOver && 'border-purple-400 border-2 scale-105 shadow-md bg-purple-500/10'
            )}
          >
            {cat.name}
          </button>
        );
      })}
    </div>
  );
}

