import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X, Utensils, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CategorySearchSelectProps {
  categories: any[];
  value: number;
  onChange: (categoryId: number) => void;
  isKOTEnabled?: (cat: any) => boolean;
  className?: string;
  placeholder?: string;
  autoFocusNextOnSelect?: boolean;
}

export const CategorySearchSelect: React.FC<CategorySearchSelectProps> = ({
  categories = [],
  value,
  onChange,
  isKOTEnabled,
  className,
  placeholder = 'Search or select category...',
  autoFocusNextOnSelect = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'kot' | 'non'>('all');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [alignRight, setAlignRight] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Helper to determine if a category is KOT
  const checkIsKOT = (cat: any) => {
    if (isKOTEnabled) return isKOTEnabled(cat);
    if (cat?.group && typeof cat.group.isKOTEnabled === 'boolean') {
      return Boolean(cat.group.isKOTEnabled);
    }
    return Boolean(cat?.isKOTEnabled ?? true);
  };

  // Currently selected category object
  const selectedCategory = useMemo(() => {
    return categories.find((c) => Number(c.id) === Number(value)) || null;
  }, [categories, value]);

  // When value changes from outside, sync input text if not open
  useEffect(() => {
    if (!isOpen) {
      setSearch(selectedCategory ? selectedCategory.name : '');
    }
  }, [selectedCategory, isOpen]);

  // Detect edge collision and adjust dropdown alignment
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const screenWidth = window.innerWidth;
      const spaceOnRight = screenWidth - rect.left;
      // If less than 380px space on the right, align right
      setAlignRight(spaceOnRight < 380 && rect.right > 380);
    }
  }, [isOpen]);

  // Filtered categories based on search text and type filter
  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories.filter((cat) => {
      // Type filter
      if (typeFilter === 'kot' && !checkIsKOT(cat)) return false;
      if (typeFilter === 'non' && checkIsKOT(cat)) return false;

      // Text search
      if (!q) return true;
      const name = (cat.name || '').toLowerCase();
      const groupName = (cat.group?.name || '').toLowerCase();
      return name.includes(q) || groupName.includes(q);
    });
  }, [categories, search, typeFilter]);

  // Reset highlight index when filtered list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredCategories.length]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-category-item]');
      const target = items[highlightedIndex] as HTMLElement;
      if (target) {
        target.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch(selectedCategory ? selectedCategory.name : '');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedCategory]);

  const handleSelect = (cat: any) => {
    onChange(Number(cat.id));
    setSearch(cat.name);
    setIsOpen(false);

    // If autoFocusNextOnSelect is enabled, focus next form element on Enter/Select
    if (autoFocusNextOnSelect && inputRef.current) {
      setTimeout(() => {
        const formElements = Array.from(
          document.querySelectorAll<HTMLElement>(
            'input:not([type="hidden"]):not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), button[type="submit"]'
          )
        ).filter((el) => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0;
        });

        const currentIndex = formElements.indexOf(inputRef.current as HTMLElement);
        if (currentIndex !== -1 && currentIndex + 1 < formElements.length) {
          const next = formElements[currentIndex + 1];
          next.focus();
          if (next instanceof HTMLInputElement) next.select?.();
        }
      }, 50);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(0);
    setSearch('');
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
    }

    if (isOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1 < filteredCategories.length ? prev + 1 : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredCategories.length - 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (filteredCategories.length > 0 && filteredCategories[highlightedIndex]) {
          handleSelect(filteredCategories[highlightedIndex]);
        } else {
          setIsOpen(false);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        setSearch(selectedCategory ? selectedCategory.name : '');
        return;
      }
    }
  };

  // Counts for filter pills
  const counts = useMemo(() => {
    let kot = 0;
    let non = 0;
    categories.forEach((c) => {
      if (checkIsKOT(c)) kot++;
      else non++;
    });
    return { all: categories.length, kot, non };
  }, [categories]);

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div className="relative group">
        <input
          ref={inputRef}
          type="text"
          value={search}
          title={search}
          placeholder={placeholder}
          onFocus={() => {
            setIsOpen(true);
            inputRef.current?.select();
          }}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            'glass-input h-10 w-full pl-8 pr-14 text-xs font-bold transition-all truncate',
            'hover:border-blue-500/50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30',
            selectedCategory ? 'text-text-primary' : 'text-text-muted'
          )}
        />

        {/* Left search icon */}
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted">
          <Search size={13} />
        </div>

        {/* Right badges & buttons */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {selectedCategory && (
            <span
              className={cn(
                'text-[8px] font-black uppercase px-1 py-0.5 rounded tracking-wider',
                checkIsKOT(selectedCategory)
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              )}
            >
              {checkIsKOT(selectedCategory) ? 'KOT' : 'Non'}
            </span>
          )}

          {selectedCategory && (
            <button
              type="button"
              tabIndex={-1}
              data-enter-ignore="true"
              onClick={handleClear}
              className="p-1 rounded-full text-text-muted hover:text-white hover:bg-white/10 transition-colors"
              title="Clear category"
            >
              <X size={11} />
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            data-enter-ignore="true"
            onClick={() => {
              setIsOpen(!isOpen);
              if (!isOpen) inputRef.current?.focus();
            }}
            className="p-1 text-text-muted hover:text-text-primary transition-colors"
          >
            <ChevronDown size={13} className={cn('transition-transform duration-200', isOpen && 'rotate-180')} />
          </button>
        </div>
      </div>

      {/* Dropdown Menu - Wide comfortable container for full names */}
      {isOpen && (
        <div
          className={cn(
            'absolute top-full mt-1.5 z-[9999] bg-[#141722] border border-border/80 rounded-xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-150',
            // Generous width: minimum 360px up to 420px, never constrained by narrow 150px input
            'w-[360px] sm:w-[400px] max-w-[92vw]',
            alignRight ? 'right-0' : 'left-0'
          )}
        >
          {/* Filter Pills with ample room */}
          <div className="p-2 border-b border-border/50 bg-[#1a1f2e] flex items-center gap-2">
            <button
              type="button"
              tabIndex={-1}
              data-enter-ignore="true"
              onClick={() => setTypeFilter('all')}
              className={cn(
                'flex-1 py-1 px-2 rounded-md text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer text-center',
                typeFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary hover:bg-white/5'
              )}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              tabIndex={-1}
              data-enter-ignore="true"
              onClick={() => setTypeFilter('kot')}
              className={cn(
                'flex-1 py-1 px-2 rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer text-center',
                typeFilter === 'kot'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-amber-400/80 hover:text-amber-400 hover:bg-amber-500/10'
              )}
            >
              <Utensils size={10} /> KOT ({counts.kot})
            </button>
            <button
              type="button"
              tabIndex={-1}
              data-enter-ignore="true"
              onClick={() => setTypeFilter('non')}
              className={cn(
                'flex-1 py-1 px-2 rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer text-center',
                typeFilter === 'non'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-400/80 hover:text-emerald-400 hover:bg-emerald-500/10'
              )}
            >
              <Package size={10} /> Non-KOT ({counts.non})
            </button>
          </div>

          {/* List of categories - Clean full category names without truncation */}
          <div ref={listRef} className="max-h-64 overflow-y-auto custom-scrollbar p-1.5 space-y-1">
            {filteredCategories.length === 0 ? (
              <div className="py-6 text-center text-xs text-text-muted font-bold">
                No categories match "{search}"
                <div className="mt-2">
                  <button
                    type="button"
                    tabIndex={-1}
                    data-enter-ignore="true"
                    onClick={() => {
                      setSearch('');
                      setTypeFilter('all');
                    }}
                    className="text-[10px] uppercase font-black text-blue-400 hover:underline cursor-pointer"
                  >
                    Reset Filter
                  </button>
                </div>
              </div>
            ) : (
              filteredCategories.map((cat, idx) => {
                const isCatKOT = checkIsKOT(cat);
                const isSelected = Number(cat.id) === Number(value);
                const isHighlighted = idx === highlightedIndex;

                return (
                  <button
                    key={cat.id}
                    type="button"
                    tabIndex={-1}
                    data-enter-ignore="true"
                    data-category-item="true"
                    onClick={() => handleSelect(cat)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between transition-colors cursor-pointer gap-3',
                      isSelected
                        ? 'bg-blue-600/25 border border-blue-500/40 text-white font-black'
                        : isHighlighted
                        ? 'bg-white/10 text-white font-bold'
                        : 'text-text-primary hover:bg-white/5 font-medium'
                    )}
                  >
                    {/* Full clean Category Name with no truncation */}
                    <div className="flex-1 min-w-0 pr-1">
                      <div className="text-xs font-bold text-white leading-snug whitespace-normal break-words">
                        {cat.name}
                      </div>
                      {cat.group?.name && cat.group.name !== cat.name && (
                        <div className="text-[10px] text-text-muted mt-0.5 font-medium">
                          {cat.group.name}
                        </div>
                      )}
                    </div>

                    {/* Badge & Checkmark */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={cn(
                          'text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-wider',
                          isCatKOT
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        )}
                      >
                        {isCatKOT ? 'KOT' : 'Non-KOT'}
                      </span>
                      {isSelected && <Check size={14} className="text-blue-400 shrink-0" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
