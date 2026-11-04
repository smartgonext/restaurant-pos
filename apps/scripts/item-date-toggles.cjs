const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'web', 'src', 'pages', 'restaurant', 'settings', 'BarcodeSettings.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Update PrintBatchItem interface to include individual ON/OFF flags
content = content.replace(
  `interface PrintBatchItem {
  id: string;
  name: string;
  barcode: string;
  price: string;
  quantity: number;
  mfgDate?: string;
  bestBeforeDays?: number | string;
  expDate?: string;
}`,
  `interface PrintBatchItem {
  id: string;
  name: string;
  barcode: string;
  price: string;
  quantity: number;
  includeMfgDate?: boolean;
  mfgDate?: string;
  includeExpDate?: boolean;
  bestBeforeDays?: number | string;
  expDate?: string;
}`
);

// 2. Add modalIncludeMfg and modalIncludeExp states
content = content.replace(
  `  const [modalQty, setModalQty] = useState<number>(1);
  const [modalMfgDate, setModalMfgDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [modalBestBeforeDays, setModalBestBeforeDays] = useState<string>('');
  const [modalExpDate, setModalExpDate] = useState<string>('');
  const [editingLedgerId, setEditingLedgerId] = useState<string | null>(null);`,
  `  const [modalQty, setModalQty] = useState<number>(1);
  const [modalIncludeMfg, setModalIncludeMfg] = useState<boolean>(false);
  const [modalMfgDate, setModalMfgDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [modalIncludeExp, setModalIncludeExp] = useState<boolean>(false);
  const [modalBestBeforeDays, setModalBestBeforeDays] = useState<string>('');
  const [modalExpDate, setModalExpDate] = useState<string>('');
  const [editingLedgerId, setEditingLedgerId] = useState<string | null>(null);`
);

// 3. Update handleOpenAddItemModal
content = content.replace(
  `  // Open item modal for new item from search
  const handleOpenAddItemModal = (item: any) => {
    setActiveModalItem(item);
    setModalQty(1);
    const today = new Date().toISOString().split('T')[0];
    const initialMfg = item.mfgDate 
      ? new Date(item.mfgDate).toISOString().split('T')[0] 
      : today;
    const initialExp = item.expiryDate 
      ? new Date(item.expiryDate).toISOString().split('T')[0] 
      : '';
    const initialBB = item.bestBeforeDays ? String(item.bestBeforeDays) : '';

    setModalMfgDate(initialMfg);
    setModalBestBeforeDays(initialBB);
    setModalExpDate(initialExp);
    setEditingLedgerId(null);
    setIsItemModalOpen(true);
    setShowDropdown(false);
    setSearchTerm('');
  };`,
  `  // Open item modal for new item from search
  const handleOpenAddItemModal = (item: any) => {
    setActiveModalItem(item);
    setModalQty(1);
    const today = new Date().toISOString().split('T')[0];
    const hasMfg = Boolean(item.mfgDate);
    const hasExp = Boolean(item.expiryDate || item.bestBeforeDays);
    const initialMfg = item.mfgDate 
      ? new Date(item.mfgDate).toISOString().split('T')[0] 
      : today;
    const initialExp = item.expiryDate 
      ? new Date(item.expiryDate).toISOString().split('T')[0] 
      : '';
    const initialBB = item.bestBeforeDays ? String(item.bestBeforeDays) : '';

    setModalIncludeMfg(hasMfg);
    setModalMfgDate(initialMfg);
    setModalIncludeExp(hasExp);
    setModalBestBeforeDays(initialBB);
    setModalExpDate(initialExp);
    setEditingLedgerId(null);
    setIsItemModalOpen(true);
    setShowDropdown(false);
    setSearchTerm('');
  };`
);

// 4. Update handleOpenEditItemModal
content = content.replace(
  `  // Open item modal for editing existing item in ledger
  const handleOpenEditItemModal = (item: PrintBatchItem) => {
    setActiveModalItem(item);
    setModalQty(item.quantity || 1);
    setModalMfgDate(item.mfgDate || new Date().toISOString().split('T')[0]);
    setModalBestBeforeDays(item.bestBeforeDays ? String(item.bestBeforeDays) : '');
    setModalExpDate(item.expDate || '');
    setEditingLedgerId(item.id);
    setIsItemModalOpen(true);
  };`,
  `  // Open item modal for editing existing item in ledger
  const handleOpenEditItemModal = (item: PrintBatchItem) => {
    setActiveModalItem(item);
    setModalQty(item.quantity || 1);
    setModalIncludeMfg(item.includeMfgDate !== undefined ? item.includeMfgDate : Boolean(item.mfgDate));
    setModalMfgDate(item.mfgDate || new Date().toISOString().split('T')[0]);
    setModalIncludeExp(item.includeExpDate !== undefined ? item.includeExpDate : Boolean(item.expDate || item.bestBeforeDays));
    setModalBestBeforeDays(item.bestBeforeDays ? String(item.bestBeforeDays) : '');
    setModalExpDate(item.expDate || '');
    setEditingLedgerId(item.id);
    setIsItemModalOpen(true);
  };`
);

// 5. Update handleSaveModalItem with include flags
content = content.replace(
  `    if (editingLedgerId) {
      setBatchItems(prev => prev.map(x => x.id === editingLedgerId ? {
        ...x,
        quantity: qty,
        mfgDate: modalMfgDate,
        bestBeforeDays: modalBestBeforeDays ? Number(modalBestBeforeDays) : undefined,
        expDate: finalExpDate || undefined,
      } : x));
      toast.success(\`Updated \${activeModalItem.name}!\`);
    } else {
      const itemId = String(activeModalItem.id);
      setBatchItems(prev => {
        const existingIdx = prev.findIndex(x => x.id === itemId);
        if (existingIdx >= 0) {
          return prev.map((x, i) => i === existingIdx ? {
            ...x,
            quantity: x.quantity + qty,
            mfgDate: modalMfgDate,
            bestBeforeDays: modalBestBeforeDays ? Number(modalBestBeforeDays) : undefined,
            expDate: finalExpDate || undefined,
          } : x);
        }
        return [
          ...prev,
          {
            id: itemId,
            name: activeModalItem.name || '',
            barcode: activeModalItem.barcode || '000000',
            price: activeModalItem.price || '0.00',
            quantity: qty,
            mfgDate: modalMfgDate,
            bestBeforeDays: modalBestBeforeDays ? Number(modalBestBeforeDays) : undefined,
            expDate: finalExpDate || undefined,
          }
        ];
      });`,
  `    if (editingLedgerId) {
      setBatchItems(prev => prev.map(x => x.id === editingLedgerId ? {
        ...x,
        quantity: qty,
        includeMfgDate: modalIncludeMfg,
        mfgDate: modalIncludeMfg ? modalMfgDate : undefined,
        includeExpDate: modalIncludeExp,
        bestBeforeDays: modalIncludeExp && modalBestBeforeDays ? Number(modalBestBeforeDays) : undefined,
        expDate: modalIncludeExp ? finalExpDate : undefined,
      } : x));
      toast.success(\`Updated \${activeModalItem.name}!\`);
    } else {
      const itemId = String(activeModalItem.id);
      setBatchItems(prev => {
        const existingIdx = prev.findIndex(x => x.id === itemId);
        if (existingIdx >= 0) {
          return prev.map((x, i) => i === existingIdx ? {
            ...x,
            quantity: x.quantity + qty,
            includeMfgDate: modalIncludeMfg,
            mfgDate: modalIncludeMfg ? modalMfgDate : undefined,
            includeExpDate: modalIncludeExp,
            bestBeforeDays: modalIncludeExp && modalBestBeforeDays ? Number(modalBestBeforeDays) : undefined,
            expDate: modalIncludeExp ? finalExpDate : undefined,
          } : x);
        }
        return [
          ...prev,
          {
            id: itemId,
            name: activeModalItem.name || '',
            barcode: activeModalItem.barcode || '000000',
            price: activeModalItem.price || '0.00',
            quantity: qty,
            includeMfgDate: modalIncludeMfg,
            mfgDate: modalIncludeMfg ? modalMfgDate : undefined,
            includeExpDate: modalIncludeExp,
            bestBeforeDays: modalIncludeExp && modalBestBeforeDays ? Number(modalBestBeforeDays) : undefined,
            expDate: modalIncludeExp ? finalExpDate : undefined,
          }
        ];
      });`
);

// 6. Update database sync to respect modalIncludeMfg and modalIncludeExp
content = content.replace(
  `    if (Number.isFinite(targetMenuItemId) && targetMenuItemId > 0 && !String(activeModalItem.id).startsWith('custom-')) {
      api.put(\`/restaurant/menu-items/\${targetMenuItemId}\`, {
        mfgDate: modalMfgDate ? new Date(modalMfgDate).toISOString() : null,
        expiryDate: finalExpDate ? new Date(finalExpDate).toISOString() : null,
        bestBeforeDays: modalBestBeforeDays && Number(modalBestBeforeDays) > 0 ? Number(modalBestBeforeDays) : null,
      })`,
  `    if (Number.isFinite(targetMenuItemId) && targetMenuItemId > 0 && !String(activeModalItem.id).startsWith('custom-')) {
      api.put(\`/restaurant/menu-items/\${targetMenuItemId}\`, {
        mfgDate: modalIncludeMfg && modalMfgDate ? new Date(modalMfgDate).toISOString() : null,
        expiryDate: modalIncludeExp && finalExpDate ? new Date(finalExpDate).toISOString() : null,
        bestBeforeDays: modalIncludeExp && modalBestBeforeDays && Number(modalBestBeforeDays) > 0 ? Number(modalBestBeforeDays) : null,
      })`
);

// 7. Update DOM label structure in #barcode-label-print-zone-container
content = content.replace(
  `              {/* Bottom Row: Dates (Left) & Price (Right) */}
              <div className="print-bottom-row w-[94%] mx-auto mt-auto flex items-end justify-between">
                {(showMfgDate || showExpDate) && (
                  <div className="print-date-col flex flex-col text-left leading-tight">
                    {showMfgDate && (
                      <span className="print-date-text text-[7.5px] font-bold text-slate-800">
                        Mfg: {formatTagDate(item.mfgDate || new Date().toISOString().split('T')[0])}
                      </span>
                    )}
                    {showExpDate && (item.expDate || item.bestBeforeDays) && (
                      <span className="print-date-text text-[7.5px] font-bold text-slate-800">
                        {item.bestBeforeDays 
                          ? \`BB: \${item.bestBeforeDays}D (\${formatTagDate(item.expDate, 'short')})\` 
                          : \`Exp: \${formatTagDate(item.expDate)}\`}
                      </span>
                    )}
                  </div>
                )}`,
  `              {/* Bottom Row: Dates (Left) & Price (Right) */}
              <div className="print-bottom-row w-[94%] mx-auto mt-auto flex items-end justify-between">
                {((showMfgDate && item.includeMfgDate && item.mfgDate) || (showExpDate && item.includeExpDate && (item.expDate || item.bestBeforeDays))) && (
                  <div className="print-date-col flex flex-col text-left leading-tight">
                    {showMfgDate && item.includeMfgDate && item.mfgDate && (
                      <span className="print-date-text text-[7.5px] font-bold text-slate-800">
                        Mfg: {formatTagDate(item.mfgDate)}
                      </span>
                    )}
                    {showExpDate && item.includeExpDate && (item.expDate || item.bestBeforeDays) && (
                      <span className="print-date-text text-[7.5px] font-bold text-slate-800">
                        {item.bestBeforeDays 
                          ? \`BB: \${item.bestBeforeDays}D (\${formatTagDate(item.expDate, 'short')})\` 
                          : \`Exp: \${formatTagDate(item.expDate)}\`}
                      </span>
                    )}
                  </div>
                )}`
);

// 8. Update on-screen live preview card (right panel)
content = content.replace(
  `<div className="print-bottom-row w-[94%] mx-auto mt-auto flex items-end justify-between select-none">
                            {(showMfgDate || showExpDate) && (
                              <div className="print-date-col flex flex-col text-left leading-tight">
                                {showMfgDate && (
                                  <span style={{ fontSize: \`\${Math.max(5.5, activePreset.widthPx * 0.032)}px\` }} className="print-date-text font-bold text-slate-800">
                                    Mfg: {formatTagDate(item.mfgDate || new Date().toISOString().split('T')[0])}
                                  </span>
                                )}
                                {showExpDate && (item.expDate || item.bestBeforeDays) && (
                                  <span style={{ fontSize: \`\${Math.max(5.5, activePreset.widthPx * 0.032)}px\` }} className="print-date-text font-bold text-slate-800">
                                    {item.bestBeforeDays 
                                      ? \`BB: \${item.bestBeforeDays}D (\${formatTagDate(item.expDate, 'short')})\` 
                                      : \`Exp: \${formatTagDate(item.expDate)}\`}
                                  </span>
                                )}
                              </div>
                            )}`,
  `<div className="print-bottom-row w-[94%] mx-auto mt-auto flex items-end justify-between select-none">
                            {((showMfgDate && item.includeMfgDate && item.mfgDate) || (showExpDate && item.includeExpDate && (item.expDate || item.bestBeforeDays))) && (
                              <div className="print-date-col flex flex-col text-left leading-tight">
                                {showMfgDate && item.includeMfgDate && item.mfgDate && (
                                  <span style={{ fontSize: \`\${Math.max(5.5, activePreset.widthPx * 0.032)}px\` }} className="print-date-text font-bold text-slate-800">
                                    Mfg: {formatTagDate(item.mfgDate)}
                                  </span>
                                )}
                                {showExpDate && item.includeExpDate && (item.expDate || item.bestBeforeDays) && (
                                  <span style={{ fontSize: \`\${Math.max(5.5, activePreset.widthPx * 0.032)}px\` }} className="print-date-text font-bold text-slate-800">
                                    {item.bestBeforeDays 
                                      ? \`BB: \${item.bestBeforeDays}D (\${formatTagDate(item.expDate, 'short')})\` 
                                      : \`Exp: \${formatTagDate(item.expDate)}\`}
                                  </span>
                                )}
                              </div>
                            )}`
);

// 9. Update the Modal content to provide clean ON / OFF switches for Mfg Date and Expiry Date
const modalFormTarget = `          {/* Form inputs */}
          <div className="grid grid-cols-2 gap-3.5">
            {/* Quantity */}
            <div>
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-1.5">
                Labels to Print (Qty)
              </label>
              <input 
                type="number"
                min="1"
                max="999"
                value={modalQty}
                onChange={(e) => setModalQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="glass-input w-full h-10 text-sm font-black text-center"
              />
            </div>

            {/* Manufacture Date */}
            <div>
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                <span>Manufacture Date</span>
                <button 
                  type="button" 
                  onClick={() => setModalMfgDate(new Date().toISOString().split('T')[0])}
                  className="text-[10px] text-blue-400 hover:underline lowercase"
                >
                  today
                </button>
              </label>
              <input 
                type="date"
                value={modalMfgDate}
                onChange={(e) => {
                  setModalMfgDate(e.target.value);
                  if (modalBestBeforeDays && Number(modalBestBeforeDays) > 0) {
                    setModalExpDate(computeExpiryFromDays(e.target.value, modalBestBeforeDays));
                  }
                }}
                className="glass-input w-full h-10 text-xs font-semibold"
              />
            </div>

            {/* Best Before (Days) */}
            <div>
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-1.5">
                Best Before (Days)
              </label>
              <div className="relative">
                <input 
                  type="number"
                  min="1"
                  max="3650"
                  placeholder="e.g. 5 or 6"
                  value={modalBestBeforeDays}
                  onChange={(e) => {
                    const val = e.target.value;
                    setModalBestBeforeDays(val);
                    if (val && Number(val) > 0) {
                      const calculated = computeExpiryFromDays(modalMfgDate, val);
                      setModalExpDate(calculated);
                    }
                  }}
                  className="glass-input w-full h-10 text-xs font-semibold pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted font-bold">Days</span>
              </div>
              <p className="text-[10px] text-text-muted mt-1">Type 5 or 6 for auto date calculation</p>
            </div>

            {/* Expiry Date (Calculated or Custom) */}
            <div>
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-1.5">
                Expiry Date
              </label>
              <input 
                type="date"
                value={modalExpDate}
                onChange={(e) => {
                  setModalExpDate(e.target.value);
                  setModalBestBeforeDays('');
                }}
                className="glass-input w-full h-10 text-xs font-semibold"
              />
              {modalBestBeforeDays && modalExpDate ? (
                <p className="text-[10px] text-emerald-400 font-semibold mt-1">
                  Auto-calculated: {formatTagDate(modalExpDate, 'short')}
                </p>
              ) : (
                <p className="text-[10px] text-text-muted mt-1">Leave empty or pick date</p>
              )}
            </div>
          </div>`;

const modalFormReplacement = `          {/* Form inputs */}
          <div className="space-y-4">
            {/* Quantity Selector */}
            <div className="bg-[#141628] p-3 rounded-xl border border-border/40 flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-text-primary uppercase tracking-wider block">
                  Labels to Print (Quantity)
                </label>
                <p className="text-[10px] text-text-muted">How many sticker copies to print for this product</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  type="button" 
                  onClick={() => setModalQty(Math.max(1, modalQty - 1))}
                  className="w-8 h-8 rounded bg-bg-tertiary border border-border/50 text-text-primary hover:bg-bg-hover flex items-center justify-center font-bold"
                >
                  -
                </button>
                <input 
                  type="number"
                  min="1"
                  max="999"
                  value={modalQty}
                  onChange={(e) => setModalQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="glass-input w-16 h-8 text-sm font-black text-center"
                />
                <button 
                  type="button" 
                  onClick={() => setModalQty(modalQty + 1)}
                  className="w-8 h-8 rounded bg-bg-tertiary border border-border/50 text-text-primary hover:bg-bg-hover flex items-center justify-center font-bold"
                >
                  +
                </button>
              </div>
            </div>

            {/* SECTION 1: MANUFACTURE DATE WITH ON/OFF TOGGLE */}
            <div className={\`p-3.5 rounded-xl border transition-all \${modalIncludeMfg ? 'bg-blue-500/5 border-blue-500/30' : 'bg-[#141628]/60 border-border/30'}\`}>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Manufacture Date (Mfg)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setModalIncludeMfg(!modalIncludeMfg)}
                  className={\`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all \${modalIncludeMfg ? 'bg-emerald-500 text-black shadow-md' : 'bg-bg-tertiary text-text-muted hover:text-text-primary border border-border/50'}\`}
                >
                  {modalIncludeMfg ? '✓ ON (Print Mfg)' : '✕ OFF (No Mfg)'}
                </button>
              </div>

              {modalIncludeMfg ? (
                <div className="flex items-center gap-3 pt-1 animate-in fade-in duration-150">
                  <input 
                    type="date"
                    value={modalMfgDate}
                    onChange={(e) => {
                      setModalMfgDate(e.target.value);
                      if (modalIncludeExp && modalBestBeforeDays && Number(modalBestBeforeDays) > 0) {
                        setModalExpDate(computeExpiryFromDays(e.target.value, modalBestBeforeDays));
                      }
                    }}
                    className="glass-input flex-1 h-9 text-xs font-semibold"
                  />
                  <button 
                    type="button" 
                    onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setModalMfgDate(today);
                      if (modalIncludeExp && modalBestBeforeDays && Number(modalBestBeforeDays) > 0) {
                        setModalExpDate(computeExpiryFromDays(today, modalBestBeforeDays));
                      }
                    }}
                    className="px-2.5 h-9 rounded bg-bg-tertiary border border-border/50 text-[11px] font-bold text-blue-400 hover:bg-bg-hover shrink-0"
                  >
                    Today
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-text-muted italic">This item will not print any manufacturing date.</p>
              )}
            </div>

            {/* SECTION 2: EXPIRY / BEST BEFORE WITH ON/OFF TOGGLE */}
            <div className={\`p-3.5 rounded-xl border transition-all \${modalIncludeExp ? 'bg-amber-500/5 border-amber-500/30' : 'bg-[#141628]/60 border-border/30'}\`}>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Expiry / Best Before</span>
                </div>
                <button
                  type="button"
                  onClick={() => setModalIncludeExp(!modalIncludeExp)}
                  className={\`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all \${modalIncludeExp ? 'bg-amber-400 text-black shadow-md' : 'bg-bg-tertiary text-text-muted hover:text-text-primary border border-border/50'}\`}
                >
                  {modalIncludeExp ? '✓ ON (Print Exp/BB)' : '✕ OFF (No Expiry)'}
                </button>
              </div>

              {modalIncludeExp ? (
                <div className="space-y-3 pt-1 animate-in fade-in duration-150">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-text-muted uppercase block mb-1">
                        Best Before (Days)
                      </label>
                      <div className="relative">
                        <input 
                          type="number"
                          min="1"
                          max="3650"
                          placeholder="e.g. 5 or 6"
                          value={modalBestBeforeDays}
                          onChange={(e) => {
                            const val = e.target.value;
                            setModalBestBeforeDays(val);
                            if (val && Number(val) > 0) {
                              const calculated = computeExpiryFromDays(modalMfgDate, val);
                              setModalExpDate(calculated);
                            }
                          }}
                          className="glass-input w-full h-9 text-xs font-semibold pr-12"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-text-muted font-bold">Days</span>
                      </div>
                      <p className="text-[9px] text-text-muted mt-0.5">Type 5 or 6 to calculate date</p>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-text-muted uppercase block mb-1">
                        Calculated Expiry Date
                      </label>
                      <input 
                        type="date"
                        value={modalExpDate}
                        onChange={(e) => {
                          setModalExpDate(e.target.value);
                          setModalBestBeforeDays('');
                        }}
                        className="glass-input w-full h-9 text-xs font-semibold"
                      />
                      {modalBestBeforeDays && modalExpDate ? (
                        <p className="text-[9px] text-emerald-400 font-semibold mt-0.5">
                          Calculated: {formatTagDate(modalExpDate, 'short')}
                        </p>
                      ) : (
                        <p className="text-[9px] text-text-muted mt-0.5">Or set date directly</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-text-muted italic">This item will not print any expiry or best before date.</p>
              )}
            </div>
          </div>`;

content = content.replace(modalFormTarget, modalFormReplacement);

// 10. Update modal preview live render
content = content.replace(
  `                  <div className="flex flex-col text-left leading-none">
                    {showMfgDate && (
                      <span className="text-[7px] font-bold text-slate-800">
                        Mfg: {formatTagDate(modalMfgDate)}
                      </span>
                    )}
                    {showExpDate && (modalExpDate || modalBestBeforeDays) && (
                      <span className="text-[7px] font-bold text-slate-800">
                        {modalBestBeforeDays 
                          ? \`BB: \${modalBestBeforeDays}D (\${formatTagDate(modalExpDate, 'short')})\` 
                          : \`Exp: \${formatTagDate(modalExpDate)}\`}
                      </span>
                    )}
                  </div>`,
  `                  <div className="flex flex-col text-left leading-none">
                    {showMfgDate && modalIncludeMfg && modalMfgDate && (
                      <span className="text-[7px] font-bold text-slate-800">
                        Mfg: {formatTagDate(modalMfgDate)}
                      </span>
                    )}
                    {showExpDate && modalIncludeExp && (modalExpDate || modalBestBeforeDays) && (
                      <span className="text-[7px] font-bold text-slate-800">
                        {modalBestBeforeDays 
                          ? \`BB: \${modalBestBeforeDays}D (\${formatTagDate(modalExpDate, 'short')})\` 
                          : \`Exp: \${formatTagDate(modalExpDate)}\`}
                      </span>
                    )}
                  </div>`
);

fs.writeFileSync(file, content, 'utf8');
console.log('Individual item ON/OFF date switches added successfully!');

