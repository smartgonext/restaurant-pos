import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Search, Plus, Trash2, ShieldAlert, BadgeInfo, Check } from 'lucide-react';
import { useToast } from '@/components/inventory/ToastProvider';
import { useWeightedBarcodeScanner } from '@/hooks/useWeightedBarcodeScanner';

interface EntryLine {
  id: number; // inventory item id
  name: string;
  unitSymbol: string;
  mrp: number;
  purchaseRate: number;
  qty: number;
  discountPercent?: number;
  taxPercent?: number;
}

interface SearchableSelectProps {
  options: { id: string | number; name: string }[];
  value: string | number;
  onChange: (val: string) => void;
  placeholder: string;
  height?: number;
}

function SearchableSelect({ options, value, onChange, placeholder, height }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => String(opt.id) === String(value));

  useEffect(() => {
    if (selectedOption) {
      setSearch(selectedOption.name);
    } else {
      setSearch('');
    }
  }, [value, selectedOption]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        if (selectedOption) {
          setSearch(selectedOption.name);
        } else {
          setSearch('');
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedOption]);

  const filtered = options.filter(opt =>
    (opt.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const finalHeight = height || 36;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setIsOpen(true);
            if (!e.target.value) {
              onChange('');
            }
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          style={{
            height: finalHeight,
            width: '100%',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: finalHeight === 30 ? 6 : 8,
            padding: '0 30px 0 10px',
            color: 'var(--text)',
            fontSize: 11,
            outline: 'none',
            transition: 'border-color 200ms'
          }}
        />
        <span
          onClick={() => setIsOpen(prev => !prev)}
          style={{
            position: 'absolute',
            right: 10,
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 9,
            display: 'flex',
            alignItems: 'center',
            pointerEvents: 'none'
          }}
        >
          ▼
        </span>
      </div>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: `${finalHeight + 4}px`,
            left: 0,
            right: 0,
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            maxHeight: 180,
            overflowY: 'auto',
            zIndex: 1200,
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 10, color: 'var(--text-muted)' }}>No matches found</div>
          ) : (
            filtered.map(opt => {
              const isSelected = String(opt.id) === String(value);
              return (
                <div
                  key={opt.id}
                  onClick={() => {
                    onChange(String(opt.id));
                    setSearch(opt.name);
                    setIsOpen(false);
                  }}
                  style={{
                    padding: '8px 12px',
                    fontSize: 11,
                    color: isSelected ? '#7c3aed' : '#fff',
                    background: isSelected ? 'rgba(124,58,237,0.1)' : 'transparent',
                    cursor: 'pointer',
                    fontWeight: isSelected ? 800 : 400,
                    transition: 'all 100ms',
                    borderBottom: '1px solid rgba(255,255,255,0.02)'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = isSelected ? 'rgba(124,58,237,0.1)' : 'transparent'}
                >
                  {opt.name}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function QuickStockEntry() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Core Entry Lines state
  const [lines, setLines] = useState<EntryLine[]>([]);

  // Footer / Checkout states
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [payAmount, setPayAmount] = useState<number | ''>('');
  const [payMethod, setPayMethod] = useState<'Cash' | 'UPI' | 'Card' | 'Bank'>('Cash');
  const [autoReceive, setAutoReceive] = useState(true);

  // MRP Modal/Popover states
  const [mrpModalItem, setMrpModalItem] = useState<any | null>(null);
  const [mrpPurchaseRate, setMrpPurchaseRate] = useState<number>(0);
  const [mrpProfitPercent, setMrpProfitPercent] = useState<number>(0);
  const [mrpSticker, setMrpSticker] = useState<number>(0);
  const [mrpEffectiveFrom, setMrpEffectiveFrom] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [mrpSupplierId, setMrpSupplierId] = useState<string>('');

  // Refs for keyboard controls
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const qtyInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const rateInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const lastAddRef = useRef<{ id: number; time: number }>({ id: 0, time: 0 });
  // Guards against a single physical scan being delivered more than once by the
  // scanner (debounced auto-complete + trailing Enter). Without this, repeated scans
  // of the same item show 1, 3, 5, 7 instead of 1, 2, 3, 4.
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  // Queries
  const { data: items = [] } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => api.get('/restaurant/inventory/items').then(r => r.data.data)
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['inventory-suppliers'],
    queryFn: () => api.get('/restaurant/inventory/suppliers').then(r => r.data.data)
  });

  // Keep search input focused on load
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Filter logic with 200ms debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setDropdownOpen(false);
      return;
    }

    const handler = setTimeout(() => {
      const q = searchQuery.toLowerCase().trim();
      const filtered = items.filter((item: any) => {
        return (
          item.name?.toLowerCase().includes(q) ||
          item.barcode?.toLowerCase().includes(q) ||
          item.sku?.toLowerCase().includes(q) ||
          item.category?.name?.toLowerCase().includes(q)
        );
      });
      setSearchResults(filtered.slice(0, 8)); // Limit to 8 dropdown options
      setHighlightedIndex(filtered.length > 0 ? 0 : -1);
      setDropdownOpen(true);
    }, 200);

    return () => clearTimeout(handler);
  }, [searchQuery, items]);

  // Handle selected item from search dropdown (with 400ms debounce guard to prevent double-add)
  const handleSelectItem = useCallback((item: any) => {
    if (!item) return;

    const now = Date.now();

    // Prevent the same item from being added twice
    // by scanner + Enter / scanner duplicate events.
    const DUPLICATE_ADD_WINDOW = 800;

    if (
      lastAddRef.current.id === item.id &&
      now - lastAddRef.current.time < DUPLICATE_ADD_WINDOW
    ) {
      return;
    }

    lastAddRef.current = {
      id: item.id,
      time: now,
    };

    setSearchQuery('');
    setDropdownOpen(false);

    const latestMRP = item.inventoryMRPs?.[0];

    const defaultMRP = latestMRP
      ? Number(latestMRP.mrp)
      : Number(item.costPerUnit || 0) * 1.3;

    const defaultRate = latestMRP
      ? Number(latestMRP.purchaseRate)
      : Number(item.costPerUnit || 0);

    setLines(prevLines => {
      const existingIdx = prevLines.findIndex(
        line => line.id === item.id
      );

      if (existingIdx !== -1) {
        const updated = [...prevLines];

        // EXACTLY +1
        updated[existingIdx] = {
          ...updated[existingIdx],
          qty: Number(updated[existingIdx].qty || 0) + 1,
        };

        setTimeout(() => {
          qtyInputRefs.current[item.id]?.focus();
          qtyInputRefs.current[item.id]?.select();
        }, 150);

        return updated;
      }

      const newLine: EntryLine = {
        id: item.id,
        name: item.name,
        unitSymbol: item.unit?.symbol || 'pc',
        mrp: defaultMRP,
        purchaseRate: defaultRate,
        qty: 1,
      };

      setTimeout(() => {
        qtyInputRefs.current[item.id]?.focus();
        qtyInputRefs.current[item.id]?.select();
      }, 150);

      return [...prevLines, newLine];
    });
  }, []);

  // Automatic Barcode / QR Scanner listener
  const processScannedCode = useCallback((rawCode: string) => {
    const code = String(rawCode || '').trim().toLowerCase();
    if (!code) return;

    const now = Date.now();

    // IMPORTANT:
    // One physical scanner read can generate barcode + Enter multiple times.
    // Ignore duplicate delivery of the same code for a short window.
    const DUPLICATE_SCAN_WINDOW = 800;

    if (
      lastScanRef.current.code === code &&
      now - lastScanRef.current.time < DUPLICATE_SCAN_WINDOW
    ) {
      return;
    }

    lastScanRef.current = {
      code,
      time: now,
    };

    const matched = items.find((it: any) => {
      const barcode = String(it.barcode || '').trim().toLowerCase();
      const sku = String(it.sku || '').trim().toLowerCase();
      const productQR = String(it.productQR || '').trim().toLowerCase();
      const id = String(it.id || '').trim().toLowerCase();

      return (
        (barcode && barcode === code) ||
        (sku && sku === code) ||
        (productQR && productQR === code) ||
        id === code
      );
    });

    if (matched) {
      handleSelectItem(matched);

      showToast(
        'success',
        'Scanned Item Added',
        `✓ ${matched.name} added (Qty +1)`
      );

      return;
    }

    // Not found: allow normal search
    setSearchQuery(rawCode);
    setDropdownOpen(true);
    searchInputRef.current?.focus();
  }, [items, handleSelectItem, showToast]);

  useWeightedBarcodeScanner((scanResult) => {
    processScannedCode(scanResult.rawBarcode || scanResult.productQR);
  });

  // Keyboard navigation for dropdown results
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (e.repeat) return;
      e.preventDefault();
      e.stopPropagation();

      const q = searchQuery.trim().toLowerCase();
      if (!q) {
        if (dropdownOpen && highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
          handleSelectItem(searchResults[highlightedIndex]);
        }
        return;
      }

      // Check exact match first
      const exactMatch = items.find((it: any) => {
        const bc = String(it.barcode || '').trim().toLowerCase();
        const sku = String(it.sku || '').trim().toLowerCase();
        const qr = String(it.productQR || '').trim().toLowerCase();
        const id = String(it.id).trim().toLowerCase();
        return (bc && bc === q) || (sku && sku === q) || (qr && qr === q) || id === q;
      });

      if (exactMatch) {
        handleSelectItem(exactMatch);
        return;
      }

      if (dropdownOpen && highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
        handleSelectItem(searchResults[highlightedIndex]);
      } else if (searchResults.length > 0) {
        handleSelectItem(searchResults[0]);
      }
    } else if (e.key === 'ArrowDown') {
      if (!dropdownOpen) return;
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % Math.max(1, searchResults.length));
    } else if (e.key === 'ArrowUp') {
      if (!dropdownOpen) return;
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + searchResults.length) % Math.max(1, searchResults.length));
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
    }
  };

  // Handle keypresses on the row inputs (MRP -> Qty -> Purchase Rate -> Search)
  const handleMrpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, itemId: number) => {
    if (e.key === 'Enter') {
      if (e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      setTimeout(() => {
        qtyInputRefs.current[itemId]?.focus();
        qtyInputRefs.current[itemId]?.select();
      }, 50);
    }
  };

  const handleQtyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, itemId: number) => {
    if (e.key === 'Enter') {
      if (e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      setTimeout(() => {
        rateInputRefs.current[itemId]?.focus();
        rateInputRefs.current[itemId]?.select();
      }, 50);
    }
  };

  const handleRateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, itemId: number) => {
    if (e.key === 'Enter') {
      if (e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      setSearchQuery('');
      setDropdownOpen(false);
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 100);
    }
  };

  const updateLine = (itemId: number, field: keyof EntryLine, val: number) => {
    setLines(prev => prev.map(l => {
      if (l.id === itemId) {
        return { ...l, [field]: val };
      }
      return l;
    }));
  };

  const removeLine = (itemId: number) => {
    setLines(prev => prev.filter(l => l.id !== itemId));
  };

  // Calculations
  const totalCount = lines.length;
  const totalQty = lines.reduce((acc, l) => acc + Number(l.qty || 0), 0);
  const subtotal = lines.reduce((acc, l) => acc + (Number(l.qty || 0) * Number(l.purchaseRate || 0)), 0);

  // Sync default payAmount when subtotal changes
  useEffect(() => {
    setPayAmount(subtotal);
  }, [subtotal]);

  // Selected supplier details
  const activeSupplier = suppliers.find((s: any) => String(s.id) === selectedSupplierId);
  const isCreditExceeded = activeSupplier 
    ? Number(activeSupplier.outstandingBalance || 0) > Number(activeSupplier.creditLimit || 0) && Number(activeSupplier.creditLimit || 0) > 0
    : false;

  // Confirm Purchase Mutation
  const confirmPurchaseMutation = useMutation({
    mutationFn: (payload: any) => api.post('/restaurant/inventory/purchase-orders', payload),
    onSuccess: (res: any) => {
      const poNum = res.data?.data?.orderNumber || '';
      showToast('success', 'Purchase Dispatched', `Stock received successfully! PO #${poNum} created.`);
      setLines([]);
      setSelectedSupplierId('');
      setPayAmount('');
      setSearchQuery('');
      setCheckoutOpen(false);
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      qc.invalidateQueries({ queryKey: ['inventory-pos'] });
      qc.invalidateQueries({ queryKey: ['inventory-suppliers'] });
      searchInputRef.current?.focus();
    },
    onError: (err: any) => {
      showToast('error', 'Purchase Failed', err?.response?.data?.error || 'Failed to dispatch purchase entry.');
    }
  });

  const handleConfirmPurchase = () => {
    if (lines.length === 0) {
      showToast('error', 'Validation Failure', 'Cannot checkout. Please select at least one material.');
      return;
    }
    if (!selectedSupplierId) {
      showToast('error', 'Supplier Required', 'Please assign a supplier to this purchase record.');
      return;
    }

    const payload = {
      supplierId: Number(selectedSupplierId),
      autoReceive: autoReceive,
      paidAmount: Number(payAmount || 0),
      paymentMethod: payMethod,
      note: 'Quick stock entry manual intake ledger record.',
      items: lines.map(l => ({
        inventoryItemId: l.id,
        quantity: Number(l.qty),
        unitCost: Number(l.purchaseRate),
        mrp: Number(l.mrp),
        taxPercent: 0,
        discountPercent: 0
      }))
    };

    confirmPurchaseMutation.mutate(payload);
  };

  // MRP Save mutation
  const saveMrpMutation = useMutation({
    mutationFn: ({ supplierId, data }: { supplierId: number; data: any }) => 
      api.post(`/restaurant/inventory/suppliers/${supplierId}/items`, data),
    onSuccess: () => {
      showToast('success', 'MRP Saved', `MRP contract registered successfully for ${mrpModalItem?.name}`);
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      setMrpModalItem(null);
    },
    onError: (err: any) => {
      showToast('error', 'Save Failed', err?.response?.data?.error || 'Failed to register MRP record.');
    }
  });

  const handleOpenMRP = (line: EntryLine) => {
    const rawItem = items.find((it: any) => it.id === line.id);
    setMrpModalItem(rawItem);
    setMrpPurchaseRate(line.purchaseRate);
    
    const latestMRP = rawItem?.inventoryMRPs?.[0];
    setMrpProfitPercent(latestMRP ? Number(latestMRP.profitPercent || 0) : 30);
    setMrpSticker(line.mrp);
    setMrpSupplierId(selectedSupplierId || String(rawItem?.inventoryMRPs?.[0]?.supplierId || ''));
  };

  const handleSaveMRP = () => {
    if (!mrpSupplierId) {
      showToast('error', 'Supplier Required', 'Please select a supplier to bind this pricing contract.');
      return;
    }
    if (!mrpModalItem) return;

    saveMrpMutation.mutate({
      supplierId: Number(mrpSupplierId),
      data: {
        inventoryItemId: mrpModalItem.id,
        mrp: Number(mrpSticker),
        purchaseRate: Number(mrpPurchaseRate),
        profitPercent: Number(mrpProfitPercent)
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 125px)', background: '#0a0a0d', color: 'var(--text)', overflow: 'hidden' }}>
      
      {/* SECTION 1: SEARCH BAR AREA */}
      <div style={{ padding: '16px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', position: 'relative', zIndex: 10 }}>
        <div style={{ position: 'relative', width: '100%' }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Scan barcode or type item name / category..."
            style={{
              width: '100%',
              height: 44,
              paddingLeft: 42,
              paddingRight: 16,
              background: '#0f1014',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--text)',
              fontSize: 13,
              outline: 'none',
              transition: 'border-color 200ms',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
            }}
          />
          
          {/* Dropdown search autocomplete results */}
          {dropdownOpen && searchResults.length > 0 && (
            <div
              ref={dropdownRef}
              style={{
                position: 'absolute',
                top: '50px',
                left: 0,
                right: 0,
                background: 'var(--bg-tertiary)',
                borderRadius: 10,
                border: '1px solid var(--border)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                overflow: 'hidden',
                zIndex: 100
              }}
            >
              {searchResults.map((item: any, idx) => {
                const isSelected = idx === highlightedIndex;
                const latestMRP = item.inventoryMRPs?.[0];
                const activePrice = latestMRP ? latestMRP.purchaseRate : item.costPerUnit;

                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectItem(item)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 14px',
                      background: isSelected ? 'rgba(124,58,237,0.15)' : 'transparent',
                      borderLeft: isSelected ? '3px solid #7c3aed' : '3px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 100ms'
                    }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: 6, background: '#121216', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {item.image ? (
                        <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>{item.name?.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: isSelected ? '#fff' : 'var(--text-primary)' }}>{item.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 6, marginTop: 2 }}>
                        <span>{item.category?.name || 'Raw'}</span>
                        <span>•</span>
                        <span>Unit: {item.unit?.symbol || 'pc'}</span>
                        {item.barcode && (
                          <>
                            <span>•</span>
                            <span style={{ color: '#a78bfa' }}>Code: {item.barcode}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>₹{Number(activePrice || 0).toFixed(2)}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 8,
                        background: Number(item.currentStock || 0) <= Number(item.thresholdQty || 0) ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                        color: Number(item.currentStock || 0) <= Number(item.thresholdQty || 0) ? '#ef4444' : '#10b981'
                      }}>
                        Stock: {item.currentStock} {item.unit?.symbol || 'pc'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2: ENTRY TABLE (Middle) */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column' }}>
        {lines.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 10 }}>
            <div style={{ width: 54, height: 54, borderRadius: '50%', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Search size={20} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Entry ledger empty. Scan or search raw materials to begin procurement.</span>
            <span style={{ fontSize: 10, color: '#62677b' }}>Barcode triggers automatically on scanner input + Enter.</span>
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-secondary)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#121216', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 650, color: 'var(--text-muted)', width: 40 }}>#</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 650, color: 'var(--text-muted)' }}>Material Name</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 650, color: 'var(--text-muted)', width: 70 }}>Unit</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 650, color: 'var(--text-muted)', width: 100 }}>MRP sticker</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 650, color: 'var(--text-muted)', width: 100 }}>Qty</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 650, color: 'var(--text-muted)', width: 110 }}>Purchase Rate (₹)</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 650, color: 'var(--text-muted)', width: 120 }}>Amount</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 650, color: 'var(--text-muted)', width: 90 }}>MRP Action</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 650, color: 'var(--text-muted)', width: 60 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const lineAmount = Number(line.qty || 0) * Number(line.purchaseRate || 0);

                  return (
                    <tr key={line.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 100ms' }}>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{index + 1}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--text)' }}>{line.name}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{line.unitSymbol}</td>
                      
                      {/* MRP Sticker input */}
                      <td style={{ padding: '10px 14px' }}>
                        <input
                          type="number"
                          step="any"
                          value={line.mrp}
                          onChange={e => updateLine(line.id, 'mrp', Number(e.target.value))}
                          style={{
                            height: 28,
                            width: '100%',
                            background: '#0f1014',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            padding: '0 8px',
                            color: 'var(--text)',
                            fontSize: 11,
                            outline: 'none'
                          }}
                        />
                      </td>

                      {/* Quantity Input */}
                      <td style={{ padding: '10px 14px' }}>
                        <input
                          ref={el => { qtyInputRefs.current[line.id] = el; }}
                          type="number"
                          step="any"
                          value={line.qty}
                          onChange={e => updateLine(line.id, 'qty', Number(e.target.value))}
                          onKeyDown={e => handleQtyKeyDown(e, line.id)}
                          style={{
                            height: 28,
                            width: '100%',
                            background: '#0f1014',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            padding: '0 8px',
                            color: 'var(--text)',
                            fontSize: 11,
                            fontWeight: 700,
                            outline: 'none'
                          }}
                        />
                      </td>

                      {/* Purchase Rate Input */}
                      <td style={{ padding: '10px 14px' }}>
                        <input
                          ref={el => { rateInputRefs.current[line.id] = el; }}
                          type="number"
                          step="any"
                          value={line.purchaseRate}
                          onChange={e => updateLine(line.id, 'purchaseRate', Number(e.target.value))}
                          onKeyDown={e => handleRateKeyDown(e, line.id)}
                          style={{
                            height: 28,
                            width: '100%',
                            background: '#0f1014',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            padding: '0 8px',
                            color: 'var(--text)',
                            fontSize: 11,
                            fontWeight: 700,
                            outline: 'none'
                          }}
                        />
                      </td>

                      {/* Line Amount */}
                      <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        ₹{lineAmount.toFixed(2)}
                      </td>

                      {/* Add/Update MRP button */}
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleOpenMRP(line)}
                          style={{
                            height: 24,
                            padding: '0 8px',
                            background: 'rgba(124,58,237,0.1)',
                            border: '1px solid rgba(124,58,237,0.2)',
                            borderRadius: 6,
                            color: '#a78bfa',
                            fontSize: 9,
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          + MRP Contract
                        </button>
                      </td>

                      {/* Delete */}
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <button
                          onClick={() => removeLine(line.id)}
                          style={{
                            height: 24,
                            width: 24,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            borderRadius: 6,
                            color: '#ef4444',
                            cursor: 'pointer',
                            transition: 'all 150ms'
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 3: FIXED FOOTER SUMMARY & CHECKOUT */}
      <div
        style={{
          background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border)',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          boxShadow: '0 -8px 24px rgba(0,0,0,0.25)'
        }}
      >
        {/* Left Side stats */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 650 }}>TOTAL MATERIALS</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text)' }}>{totalCount} distinct items</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 650 }}>TOTAL QUANTITY</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: '#7c3aed' }}>{totalQty} units</span>
          </div>
        </div>

        {/* Right Side Billing Summary & Checkout Trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 650 }}>NET SUB-TOTAL</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: '#10b981' }}>₹{subtotal.toFixed(2)}</span>
          </div>

          <button
            onClick={() => {
              if (lines.length === 0) {
                showToast('error', 'Validation Failure', 'Cannot checkout. Please select at least one material.');
                return;
              }
              setCheckoutOpen(true);
            }}
            style={{
              height: 38,
              padding: '0 20px',
              background: '#7c3aed',
              border: 'none',
              borderRadius: 8,
              color: 'var(--text)',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 4px 14px rgba(124,58,237,0.4)',
              transition: 'transform 100ms'
            }}
          >
            🛒 Confirm Purchase
          </button>
        </div>
      </div>

      {/* CHECKOUT CONFIRMATION POP-UP MODAL */}
      {checkoutOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setCheckoutOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }} />
          <div
            style={{
              position: 'relative',
              width: 440,
              background: 'var(--bg-primary)',
              borderRadius: 14,
              border: '1px solid var(--border)',
              padding: 24,
              boxShadow: '0 20px 48px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16
            }}
          >
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Finalize Purchase Intake</h3>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '4px 0 0' }}>Assign supplier and payment configuration to log raw items in directory</p>
            </div>

            {/* Total Billing Panel */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 650 }}>TOTAL BILL DUE</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{totalQty} items • {totalCount} distinct</span>
              </div>
              <span style={{ fontSize: 18, fontWeight: 900, color: '#10b981' }}>₹{subtotal.toFixed(2)}</span>
            </div>

            {/* Credit warning banner if exceeded */}
            {isCreditExceeded && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '8px 12px', borderRadius: 10, color: '#ef4444', fontSize: 10, lineHeight: '1.4' }}>
                <ShieldAlert size={16} style={{ flexShrink: 0 }} />
                <span><strong>Supplier Limit Exceeded:</strong> Outstanding balance of ₹{Number(activeSupplier?.outstandingBalance).toFixed(0)} exceeds limit of ₹{Number(activeSupplier?.creditLimit).toFixed(0)}. Proceeding will create overdraft.</span>
              </div>
            )}

            {/* Checkout Form Elements */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              
              {/* Select Supplier */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>SELECT SUPPLIER *</label>
                <SearchableSelect
                  options={suppliers}
                  value={selectedSupplierId}
                  onChange={setSelectedSupplierId}
                  placeholder="Type to search supplier..."
                />
              </div>

              {/* Payout Amount */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>PAYOUT AMOUNT (₹)</label>
                <input
                  type="number"
                  step="any"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value !== '' ? Number(e.target.value) : '')}
                  style={{
                    height: 36,
                    width: '100%',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '0 10px',
                    color: 'var(--text)',
                    fontSize: 11,
                    outline: 'none'
                  }}
                />
              </div>

              {/* Payout Method pills */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>PAYMENT METHOD</label>
                <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
                  {(['Cash', 'UPI', 'Card', 'Bank'] as const).map(m => {
                    const act = payMethod === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPayMethod(m)}
                        style={{
                          flex: 1,
                          height: 28,
                          background: act ? '#7c3aed' : 'none',
                          border: 'none',
                          borderRadius: 6,
                          color: act ? '#fff' : 'var(--text-muted)',
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 100ms'
                        }}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Auto-Receive Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: 8 }}>
                <input
                  type="checkbox"
                  id="modal-auto-rec"
                  checked={autoReceive}
                  onChange={e => setAutoReceive(e.target.checked)}
                  style={{ accentColor: '#7c3aed', cursor: 'pointer', width: 14, height: 14 }}
                />
                <label htmlFor="modal-auto-rec" style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer' }}>
                  <span style={{ fontSize: 10, color: 'var(--text)', fontWeight: 700 }}>Auto-Stock Directly</span>
                  <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>Bypasses intermediate PO; adds directly to branch stocks</span>
                </label>
              </div>

            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                style={{
                  flex: 1,
                  height: 38,
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 700
                }}
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleConfirmPurchase}
                disabled={confirmPurchaseMutation.isPending}
                style={{
                  flex: 1.2,
                  height: 38,
                  background: '#7c3aed',
                  border: 'none',
                  borderRadius: 8,
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 800,
                  boxShadow: '0 4px 14px rgba(124,58,237,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                {confirmPurchaseMutation.isPending ? 'Processing...' : '🛒 Confirm & Dispatch'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MRP UPDATE POP-UP MODAL */}
      {mrpModalItem && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setMrpModalItem(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }} />
          <div
            style={{
              position: 'relative',
              width: 440,
              background: 'var(--bg-primary)',
              borderRadius: 14,
              border: '1px solid var(--border)',
              padding: 20,
              boxShadow: '0 20px 48px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}
          >
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Add / Update MRP pricing contract</h3>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '4px 0 0' }}>For Raw Material: <strong style={{ color: '#a78bfa' }}>{mrpModalItem.name}</strong></p>
            </div>

            {/* Optional drop-down baseline choice based on previous patches */}
            {mrpModalItem.inventoryMRPs && mrpModalItem.inventoryMRPs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Base on patch (previous history)</span>
                <select
                  onChange={e => {
                    const idx = Number(e.target.value);
                    if (isNaN(idx)) return;
                    const patch = mrpModalItem.inventoryMRPs[idx];
                    setMrpPurchaseRate(Number(patch.purchaseRate || 0));
                    setMrpProfitPercent(Number(patch.profitPercent || 0));
                    setMrpSticker(Number(patch.mrp || 0));
                    setMrpSupplierId(String(patch.supplierId || ''));
                  }}
                  style={{
                    height: 28,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '0 8px',
                    color: 'var(--text)',
                    fontSize: 10,
                    outline: 'none'
                  }}
                >
                  <option value="">-- Start with empty baseline --</option>
                  {mrpModalItem.inventoryMRPs.map((p: any, idx: number) => (
                    <option key={idx} value={idx}>
                      Rate: ₹{Number(p.purchaseRate).toFixed(1)} | Margin: {Number(p.profitPercent).toFixed(0)}% ({p.supplier?.name || 'Supplier'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Form grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              
              {/* Purchase Rate */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 9, color: 'var(--text-muted)' }}>Purchase Rate (₹)</label>
                <input
                  type="number"
                  step="any"
                  value={mrpPurchaseRate}
                  onChange={e => setMrpPurchaseRate(Number(e.target.value))}
                  style={{ height: 30, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', color: 'var(--text)', fontSize: 11, outline: 'none' }}
                />
              </div>

              {/* Profit Margin */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 9, color: 'var(--text-muted)' }}>Profit margin (%)</label>
                <input
                  type="number"
                  step="any"
                  value={mrpProfitPercent}
                  onChange={e => setMrpProfitPercent(Number(e.target.value))}
                  style={{ height: 30, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', color: 'var(--text)', fontSize: 11, outline: 'none' }}
                />
              </div>

              {/* Selling price calculated */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 9, color: 'var(--text-muted)' }}>Calculated Selling Price</label>
                <div style={{ height: 30, background: '#121216', border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', color: '#10b981', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center' }}>
                  ₹{(mrpPurchaseRate * (1 + mrpProfitPercent / 100)).toFixed(2)}
                </div>
              </div>

              {/* MRP printed sticker */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 9, color: 'var(--text-muted)' }}>MRP printed sticker (₹)</label>
                <input
                  type="number"
                  step="any"
                  value={mrpSticker}
                  onChange={e => setMrpSticker(Number(e.target.value))}
                  style={{ height: 30, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', color: 'var(--text)', fontSize: 11, outline: 'none' }}
                />
              </div>

              {/* Effective From */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 9, color: 'var(--text-muted)' }}>Effective From</label>
                <input
                  type="date"
                  value={mrpEffectiveFrom}
                  onChange={e => setMrpEffectiveFrom(e.target.value)}
                  style={{ height: 30, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', color: 'var(--text)', fontSize: 11, outline: 'none' }}
                />
              </div>

              {/* Supplier Selection */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 9, color: 'var(--text-muted)' }}>Supplier Link *</label>
                <SearchableSelect
                  options={suppliers}
                  value={mrpSupplierId}
                  onChange={setMrpSupplierId}
                  placeholder="Type to search supplier..."
                  height={30}
                />
              </div>

            </div>

            {/* Modal actions */}
            <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setMrpModalItem(null)}
                style={{ flex: 1, height: 32, background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveMRP}
                disabled={saveMrpMutation.isPending}
                style={{ flex: 1, height: 32, background: '#7c3aed', border: 'none', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', fontSize: 10, fontWeight: 800 }}
              >
                {saveMrpMutation.isPending ? 'Saving...' : '💾 Save MRP'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
