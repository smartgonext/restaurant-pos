import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { 
  Printer, QrCode, Barcode, Tag, Sparkles, Store, Check, Trash2, Plus, Minus, Search, Layers, AlertCircle, RefreshCw, XCircle, Wallet
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

// -------------------------------------------------------------
// 1D Barcode Code 39 Encoder
// -------------------------------------------------------------
const CODE39_MAP: Record<string, string> = {
  '0': '101001101101',
  '1': '110100101011',
  '2': '101100101011',
  '3': '110110010101',
  '4': '101001101011',
  '5': '110100110101',
  '6': '101100110101',
  '7': '101001011011',
  '8': '110100101101',
  '9': '101100101101',
  'A': '110101001011',
  'B': '101101001011',
  'C': '110110100101',
  'D': '101011001011',
  'E': '110101100101',
  'F': '101101100101',
  'G': '101010011011',
  'H': '110101001101',
  'I': '101101001101',
  'J': '101011001101',
  'K': '110101010011',
  'L': '101101010011',
  'M': '110110101001',
  'N': '101011010011',
  'O': '110101101001',
  'P': '101101101001',
  'Q': '101010110011',
  'R': '110101011001',
  'S': '101101011001',
  'T': '101011011001',
  'U': '110010101011',
  'V': '100110101011',
  'W': '110011010101',
  'X': '100101101011',
  'Y': '110010110101',
  'Z': '100110110101',
  '-': '100101011011',
  '.': '110010101101',
  ' ': '100110101101',
  '*': '100101101101', // Start/stop
  '$': '100100100101',
  '/': '100100101001',
  '+': '100101001001',
  '%': '101001001001'
};

function encodeCode39(value: string): string {
  const sanitized = value.toUpperCase().replace(/[^0-9A-Z\-.\s$/+*%]/g, '');
  if (!sanitized) return '';
  
  const formatted = `*${sanitized}*`;
  let binaryString = '';
  
  for (let i = 0; i < formatted.length; i++) {
    const char = formatted[i];
    const encoded = CODE39_MAP[char];
    if (encoded) {
      binaryString += encoded;
      if (i < formatted.length - 1) {
        binaryString += '0';
      }
    }
  }
  
  return binaryString;
}

// -------------------------------------------------------------
// Barcode SVG Renderer Component
// -------------------------------------------------------------
interface BarcodeSVGProps {
  value: string;
  width?: number;
  height?: number;
}

function BarcodeSVG({ value, width = 200, height = 60 }: BarcodeSVGProps) {
  const binaryString = encodeCode39(value);
  
  if (!binaryString) {
    return (
      <div className="flex flex-col items-center justify-center border border-dashed border-border/50 rounded-xl p-2 bg-bg-tertiary">
        <Barcode className="w-6 h-6 text-text-muted opacity-40 animate-pulse" />
        <span className="text-[9px] text-text-muted mt-0.5 uppercase font-bold tracking-wider">No Barcode</span>
      </div>
    );
  }

  const binaryLength = binaryString.length;
  const unitWidth = Math.max(1.2, width / binaryLength);
  const actualWidth = binaryLength * unitWidth;

  return (
    <svg 
      width="100%" 
      height={height} 
      viewBox={`0 0 ${actualWidth} ${height}`} 
      preserveAspectRatio="none"
      className="mx-auto block"
    >
      {binaryString.split('').map((bit, idx) => {
        if (bit === '1') {
          return (
            <rect 
              key={idx} 
              x={idx * unitWidth} 
              y={0} 
              width={unitWidth + 0.1}
              height={height} 
              fill="black" 
            />
          );
        }
        return null;
      })}
    </svg>
  );
}

// -------------------------------------------------------------
// Label Dimension Presets
// -------------------------------------------------------------
interface LabelPreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
  description: string;
}

const LABEL_PRESETS: LabelPreset[] = [
  { 
    id: 'jewelry', 
    name: 'Compact Shelf Tag', 
    widthMm: 30, 
    heightMm: 15, 
    widthPx: 165, 
    heightPx: 90, 
    description: '30 x 15 mm — ideal for compact items or shelf edge pricing tags.' 
  },
  { 
    id: 'retail_standard', 
    name: 'Standard Retail Tag', 
    widthMm: 50, 
    heightMm: 25, 
    widthPx: 250, 
    heightPx: 140, 
    description: '50 x 25 mm (2" x 1") — most common retail pricing label.' 
  },
  { 
    id: 'medium_product', 
    name: 'Medium Product Sticker', 
    widthMm: 40, 
    heightMm: 30, 
    widthPx: 230, 
    heightPx: 165, 
    description: '40 x 30 mm — balanced layout for general packaging.' 
  },
  { 
    id: 'warehouse_large', 
    name: 'Large Shipping / Box Label', 
    widthMm: 80, 
    heightMm: 50, 
    widthPx: 380, 
    heightPx: 240, 
    description: '80 x 50 mm — large formats for high-visibility barcodes.' 
  }
];

// -------------------------------------------------------------
// Print Batch Item Structure
// -------------------------------------------------------------
interface PrintBatchItem {
  id: string;
  name: string;
  barcode: string;
  price: string;
  quantity: number;
}

export default function BarcodeSettings() {
  const [activeSettingsTab, setActiveSettingsTab] = useState<'shelf_tags' | 'weigh_scale' | 'cash_drawer'>('shelf_tags');
  
  // Cash Drawer Configuration States
  const [drawerType, setDrawerType] = useState<'usb' | 'network'>(() => {
    try {
      const saved = localStorage.getItem('cash_drawer_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.type || 'usb';
      }
    } catch {}
    return 'usb';
  });

  const [drawerIp, setDrawerIp] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('cash_drawer_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.ip || '192.168.1.200';
      }
    } catch {}
    return '192.168.1.200';
  });

  const [drawerPort, setDrawerPort] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('cash_drawer_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.port || 9100;
      }
    } catch {}
    return 9100;
  });

  const [drawerKickCodePreset, setDrawerKickCodePreset] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('cash_drawer_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        const codeStr = JSON.stringify(parsed.kickCode || [27, 112, 0, 25, 250]);
        if (codeStr === JSON.stringify([27, 112, 0, 25, 250])) return 'epson';
        if (codeStr === JSON.stringify([27, 112, 1, 25, 250])) return 'pin5';
        if (codeStr === JSON.stringify([7])) return 'star';
        return 'custom';
      }
    } catch {}
    return 'epson';
  });

  const [drawerCustomKickCode, setDrawerCustomKickCode] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('cash_drawer_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return (parsed.kickCode || [27, 112, 0, 25, 250]).join(',');
      }
    } catch {}
    return '27,112,0,25,250';
  });

  const handleSaveDrawerSettings = () => {
    let kickCode = [27, 112, 0, 25, 250]; // Epson default
    if (drawerKickCodePreset === 'pin5') {
      kickCode = [27, 112, 1, 25, 250];
    } else if (drawerKickCodePreset === 'star') {
      kickCode = [7];
    } else if (drawerKickCodePreset === 'custom') {
      kickCode = drawerCustomKickCode
        .split(',')
        .map((x) => parseInt(x.trim(), 10))
        .filter((x) => !isNaN(x));
    }

    const config = {
      type: drawerType,
      ip: drawerIp,
      port: Number(drawerPort),
      kickCode,
    };

    localStorage.setItem('cash_drawer_settings', JSON.stringify(config));
    toast.success('Cash drawer settings saved successfully!');
  };

  const handleTestDrawerKick = () => {
    let kickCode = [27, 112, 0, 25, 250];
    if (drawerKickCodePreset === 'pin5') {
      kickCode = [27, 112, 1, 25, 250];
    } else if (drawerKickCodePreset === 'star') {
      kickCode = [7];
    } else if (drawerKickCodePreset === 'custom') {
      kickCode = drawerCustomKickCode
        .split(',')
        .map((x) => parseInt(x.trim(), 10))
        .filter((x) => !isNaN(x));
    }

    const config = {
      type: drawerType,
      ip: drawerIp,
      port: Number(drawerPort),
      kickCode,
    };

    const electron = (window as any).electron || (window as any).electronAPI;
    if (electron?.openCashDrawer) {
      electron.openCashDrawer(config);
      toast.success('Test signal sent to cash drawer!');
    } else {
      toast.error('Cash drawer trigger is only available in Desktop App mode.');
    }
  };

  // Existing Shelf Tag Batch Printer States
  const [batchItems, setBatchItems] = useState<PrintBatchItem[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  
  const [barcodeType, setBarcodeType] = useState<'1d' | 'qr'>('1d');
  const [presetId, setPresetId] = useState<string>('retail_standard');
  const [storeHeader, setStoreHeader] = useState<string>('SUMA BAKERY & RESTAURANT');
  
  const [showStoreHeader, setShowStoreHeader] = useState<boolean>(true);
  const [showItemName, setShowItemName] = useState<boolean>(true);
  const [showBarcodeText, setShowBarcodeText] = useState<boolean>(true);
  const [showPrice, setShowPrice] = useState<boolean>(true);

  // Weighing Scale Configuration & Simulator States
  const [weighPrefix, setWeighPrefix] = useState<string>(() => localStorage.getItem('weigh_scale_prefix') || '22');
  const [weighSku, setWeighSku] = useState<string>('001');
  const [weighWeight, setWeighWeight] = useState<number>(1.000);
  const [testScannedCode, setTestScannedCode] = useState<string>('');
  const [testResult, setTestResult] = useState<any>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch all menu items
  const { data: menuItems = [], isLoading } = useQuery<any[]>({
    queryKey: ['menu-items-for-batch-barcodes'],
    queryFn: () => api.get('/restaurant/menu-items').then((r) => r.data.data || []),
  });

  const activePreset = LABEL_PRESETS.find((p) => p.id === presetId) || LABEL_PRESETS[1];

  // Save weighing scale prefix setting to localStorage
  const handleSavePrefix = (prefix: string) => {
    const sanitized = prefix.replace(/\D/g, '').substring(0, 2);
    setWeighPrefix(sanitized);
    localStorage.setItem('weigh_scale_prefix', sanitized);
    toast.success(`Weighing scale prefix set to "${sanitized}"! POS scanner is now configured.`);
  };

  // Calculate EAN-13 checksum/check digit
  const calculateEan13Checksum = (code12: string): number => {
    if (code12.length !== 12) return 0;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(code12[i], 10);
      if (isNaN(digit)) return 0;
      // Multiply odd position digits (index is even) by 1, even positions (index is odd) by 3
      sum += digit * (i % 2 === 0 ? 1 : 3);
    }
    const remainder = sum % 10;
    return remainder === 0 ? 0 : 10 - remainder;
  };

  // Generate Simulated EAN-13 String
  const generateSimulatedBarcode = (): { prefix: string; sku: string; weight: string; checkDigit: number; fullCode: string } => {
    const pref = weighPrefix.padStart(2, '2').substring(0, 2);
    const sku = weighSku.replace(/\D/g, '').padStart(5, '0').substring(0, 5);
    
    // Weight in grams, e.g., 1.250 kg -> 01250 grams
    const grams = Math.round(weighWeight * 1000);
    const weightStr = String(grams).padStart(5, '0').substring(0, 5);
    
    const base12 = `${pref}${sku}${weightStr}`;
    const checkDigit = calculateEan13Checksum(base12);
    
    return {
      prefix: pref,
      sku,
      weight: weightStr,
      checkDigit,
      fullCode: `${base12}${checkDigit}`
    };
  };

  const simulated = generateSimulatedBarcode();

  // Test Decode parsed barcode
  const handleTestDecode = () => {
    const code = testScannedCode.trim();
    if (!code || code.length !== 13 || !/^\d+$/.test(code)) {
      toast.error('Please enter a valid 13-digit EAN-13 weighing scale barcode.');
      return;
    }

    const pref = code.substring(0, 2);
    const skuRaw = code.substring(2, 7);
    const weightRaw = code.substring(7, 12);
    const checkDigit = parseInt(code.substring(12, 13), 10);
    
    const parsedSkuInt = parseInt(skuRaw, 10);
    const parsedWeightKg = parseInt(weightRaw, 10) / 1000;

    // Search for matching item in menuItems
    const matched = menuItems.find((item: any) => {
      const itemQR = String(item.productQR || '').trim();
      const invBarcode = String(item.inventoryItem?.barcode || '').trim();
      const invSku = String(item.inventoryItem?.sku || '').trim();
      
      const targetSKUs = [
        skuRaw, 
        String(parsedSkuInt), 
        skuRaw.replace(/^0+/, ''),
        itemQR,
        itemQR.padStart(5, '0')
      ].map(s => s.toLowerCase());

      return targetSKUs.includes(itemQR.toLowerCase()) || 
             targetSKUs.includes(invBarcode.toLowerCase()) || 
             targetSKUs.includes(invSku.toLowerCase());
    });

    setTestResult({
      success: true,
      barcode: code,
      prefix: pref,
      skuRaw,
      parsedSkuInt,
      weightRaw,
      parsedWeightKg,
      checkDigit,
      matchedItem: matched || null
    });

    if (matched) {
      toast.success(`Successfully matched with ${matched.name}!`);
    } else {
      toast.error(`SKU code "${skuRaw}" (integer: ${parsedSkuInt}) was decoded, but no matching product was found in your menu inventory.`);
    }
  };

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Normalizes base products and pack options into a uniform list of searchable/selectable items
  const selectableItems = useMemo(() => {
    const list: any[] = [];
    menuItems.forEach((item: any) => {
      // Add base item choice
      list.push({
        id: String(item.id),
        name: item.name || '',
        barcode: item.productQR || `ITM-${item.id}`,
        price: item.price ? Number(item.price).toFixed(2) : '0.00',
        categoryName: item.category?.name || 'Uncategorized',
        isPackOption: false
      });

      // Add each pack option as its own searchable choice
      if (item.enablePackOptions && Array.isArray(item.packOptions)) {
        item.packOptions.forEach((opt: any) => {
          list.push({
            id: `pack-${item.id}-${opt.id || Math.random()}`,
            name: `${item.name} (${opt.label || 'Pack Variant'})`,
            barcode: opt.productQR || item.productQR || `ITM-${item.id}-PK`,
            price: Number(opt.sellingPrice ?? opt.price ?? 0).toFixed(2),
            categoryName: item.category?.name || 'Uncategorized',
            isPackOption: true
          });
        });
      }
    });
    return list;
  }, [menuItems]);

  // Filter items in dropdown based on input
  const filteredDropdownItems = selectableItems.filter(item => {
    const nameMatch = (item.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const qrMatch = (item.barcode || '').toLowerCase().includes(searchTerm.toLowerCase());
    return nameMatch || qrMatch;
  });

  // Add item from dropdown into batch ledger
  const handleAddMenuItem = (item: any) => {
    const itemId = String(item.id);
    setBatchItems((prev) => {
      const existing = prev.find((x) => x.id === itemId);
      if (existing) {
        return prev.map((x) => x.id === itemId ? { ...x, quantity: x.quantity + 1 } : x);
      }
      return [
        ...prev,
        {
          id: itemId,
          name: item.name || '',
          barcode: item.barcode || '000000',
          price: item.price || '0.00',
          quantity: 1
        }
      ];
    });
    setSearchTerm('');
    setShowDropdown(false);
    toast.success(`${item.name} added to print batch!`);
  };

  // Add a brand new custom one-off item to batch ledger
  const handleAddCustomItem = () => {
    const customId = `custom-${Date.now()}`;
    setBatchItems((prev) => [
      ...prev,
      {
        id: customId,
        name: 'Custom Product Tag',
        barcode: 'PRD-CUSTOM-01',
        price: '99.00',
        quantity: 1
      }
    ]);
    toast.success('Custom product added to print batch!');
  };

  // Remove item from batch ledger
  const handleRemoveItem = (id: string) => {
    setBatchItems((prev) => prev.filter((x) => x.id !== id));
  };

  // Clear entire batch list
  const handleClearBatch = () => {
    if (batchItems.length === 0) return;
    if (confirm('Are you sure you want to clear all items from the print queue?')) {
      setBatchItems([]);
      toast.success('Print batch ledger cleared.');
    }
  };

  // Modify quantity of item in ledger
  const handleUpdateQuantity = (id: string, qty: number) => {
    const validatedQty = Math.max(1, qty);
    setBatchItems((prev) => prev.map((x) => x.id === id ? { ...x, quantity: validatedQty } : x));
  };

  // Update other fields in ledger (e.g. edited barcode, name, price directly)
  const handleUpdateField = (id: string, field: keyof PrintBatchItem, value: string) => {
    setBatchItems((prev) => prev.map((x) => x.id === id ? { ...x, [field]: value } : x));
  };

  // Trigger print
  const handlePrint = () => {
    if (batchItems.length === 0) {
      toast.error('Your print batch is empty! Add items first.');
      return;
    }
    window.print();
  };

  // Calculate totals
  const totalLabelsToPrint = batchItems.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div className="space-y-6">
      {/* Dynamic Print-Media Style Overrides */}
      <style>{`
        @media print {
          @page {
            margin: 2mm 0 0 0;
          }
          /* Hide everything in UI */
          body * {
            visibility: hidden !important;
            background: none !important;
          }
          /* Show only the print utility zone */
          #barcode-label-print-zone-container, #barcode-label-print-zone-container * {
            visibility: visible !important;
          }
          #barcode-label-print-zone-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            background: white !important;
            color: black !important;
            display: block !important;
          }
          .print-single-label {
            margin: 0 !important;
            padding: 3px 2px 2px 2px !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: flex-start !important;
            text-align: center !important;
            box-sizing: border-box !important;
            
            /* Physical label sizing presets */
            width: ${activePreset.widthMm}mm !important;
            height: ${activePreset.heightMm}mm !important;
            max-width: ${activePreset.widthMm}mm !important;
            max-height: ${activePreset.heightMm}mm !important;
            overflow: hidden !important;
            
            /* Clean thermal cutter support */
            page-break-inside: avoid !important;
            break-after: page !important;
            page-break-after: always !important;
          }
          /* Print sizing scaling overrides */
          .print-header-text {
            font-size: ${Math.max(6, activePreset.widthMm * 0.16)}px !important;
            line-height: 1.25 !important;
            font-weight: 800 !important;
            text-transform: uppercase !important;
            color: black !important;
            margin-bottom: 1px !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            max-width: 95% !important;
            display: block !important;
          }
          .print-title-text {
            font-size: ${Math.max(8, activePreset.widthMm * 0.22)}px !important;
            line-height: 1.25 !important;
            font-weight: 900 !important;
            color: black !important;
            margin-bottom: 2px !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            max-width: 95% !important;
            display: block !important;
          }
          .print-barcode-container {
            width: 85% !important;
            margin: 2px 0 !important;
          }
          .print-value-text {
            font-size: ${Math.max(6, activePreset.widthMm * 0.16)}px !important;
            letter-spacing: 1px !important;
            font-weight: bold !important;
            color: black !important;
            margin-top: 1px !important;
            line-height: 1.2 !important;
          }
          .print-price-text {
            font-size: ${Math.max(10, activePreset.widthMm * 0.28)}px !important;
            font-weight: 900 !important;
            color: black !important;
            margin-top: 2px !important;
            line-height: 1.2 !important;
          }
        }
      `}</style>

      {/* Hidden Master Print zone (Used strictly by printer) */}
      <div id="barcode-label-print-zone-container" className="hidden">
        {batchItems.map((item) => 
          Array.from({ length: item.quantity }).map((_, repeatIdx) => (
            <div 
              key={`${item.id}-${repeatIdx}`} 
              className="print-single-label"
            >
              {/* Header */}
              {showStoreHeader && storeHeader && (
                <span className="print-header-text font-black uppercase text-[10px] tracking-wide text-slate-800">
                  {storeHeader}
                </span>
              )}

              {/* Product Name */}
              {showItemName && (
                <span className="print-title-text font-black text-xs text-black tracking-tight mt-0.5">
                  {item.name || 'STORE PRODUCT'}
                </span>
              )}

              {/* Graphic */}
              <div className="print-barcode-container w-[90%] my-1 flex justify-center items-center">
                {barcodeType === 'qr' ? (
                  <QRCodeSVG 
                    value={item.barcode || '000000'}
                    size={Math.min(activePreset.heightPx * 0.45, 90)}
                    level="M"
                    includeMargin={false}
                  />
                ) : (
                  <div className="w-full">
                    <BarcodeSVG 
                      value={item.barcode} 
                      width={activePreset.widthPx * 0.8}
                      height={Math.min(activePreset.heightPx * 0.35, 45)}
                    />
                  </div>
                )}
              </div>

              {/* Readability value */}
              {showBarcodeText && barcodeType === '1d' && item.barcode && (
                <span className="print-value-text text-[9px] font-black tracking-widest text-slate-700 uppercase">
                  {item.barcode}
                </span>
              )}

              {/* Pricing tag */}
              {showPrice && (
                <span className="print-price-text text-base font-black text-black leading-none mt-1">
                  ₹{Number(item.price || 0).toFixed(2)}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Header View */}
      <div className="border-b border-border/50 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-text-primary">Barcode & Scale Management</h2>
          <p className="text-xs text-text-muted mt-1">Batch print barcode price tags for shelf items, or configure weigh-scale barcode parsing formats for products sold by weight.</p>
        </div>

        {/* Premium Tab Switcher */}
        <div className="flex bg-[#0f111a] border border-border/60 rounded-xl p-1 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSettingsTab('shelf_tags')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${activeSettingsTab === 'shelf_tags' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/10' : 'text-text-muted hover:text-text-primary'}`}
          >
            <Printer size={13} /> Shelf Tags
          </button>
          <button
            type="button"
            onClick={() => setActiveSettingsTab('weigh_scale')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${activeSettingsTab === 'weigh_scale' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/10' : 'text-text-muted hover:text-text-primary'}`}
          >
            <Layers size={13} /> Weigh Scale Format
          </button>
          <button
            type="button"
            onClick={() => setActiveSettingsTab('cash_drawer')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${activeSettingsTab === 'cash_drawer' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/10' : 'text-text-muted hover:text-text-primary'}`}
          >
            <Wallet size={13} /> Cash Drawer & Printer
          </button>
        </div>
      </div>

      {activeSettingsTab === 'shelf_tags' ? (
        /* TAB 1: SHELF TAG BATCH PRINTER MODULE (Original View) */
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* PRINT BATCH LEDGER PANEL (Left Panel - 7 columns) */}
          <div className="xl:col-span-7 space-y-5">
            
            {/* Search & Add Component */}
            <Card className="relative z-30 bg-[#121424]/50 border border-border/40 p-4 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-blue-400">
                  <Search size={16} className="shrink-0" />
                  <h3 className="text-xs font-bold uppercase tracking-wider">Search & Add Items</h3>
                  {!isLoading && menuItems.length > 0 && (
                    <span className="text-[9px] bg-blue-500/15 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded font-black tracking-wider uppercase">
                      Ready: {menuItems.length} Products
                    </span>
                  )}
                </div>
                
                <Button 
                  size="sm" 
                  variant="secondary" 
                  icon={<Plus className="w-3 h-3" />}
                  onClick={handleAddCustomItem}
                >
                  Add Custom Label
                </Button>
              </div>

              {/* Search Dropdown Input */}
              <div ref={dropdownRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="text"
                    className="glass-input h-10 pl-9 pr-4 text-xs w-full focus:ring-1 focus:ring-blue-500/50"
                    placeholder="Type a product name or scan barcode to add to print batch..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                  />
                </div>

                {/* Filtered Search List Dropdown */}
                {showDropdown && searchTerm.trim() && (
                  <div className="absolute left-0 right-0 top-11 bg-[#141628] border border-border/60 rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-200">
                    {isLoading ? (
                      <div className="p-4 text-center text-xs text-text-muted flex items-center justify-center gap-2">
                        <RefreshCw size={14} className="animate-spin text-blue-400" />
                        <span>Loading inventory sync...</span>
                      </div>
                    ) : filteredDropdownItems.length === 0 ? (
                      <div className="p-4 text-center text-xs text-text-muted">
                        No matching items found. Click <span className="font-bold text-text-primary">"Add Custom Label"</span> above to print a unique custom tag.
                      </div>
                    ) : (
                      filteredDropdownItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleAddMenuItem(item)}
                          className={cn(
                            "w-full flex items-center justify-between px-4 py-2.5 text-left text-xs transition-colors border-b border-border/20 last:border-b-0",
                            item.isPackOption 
                              ? "text-text-secondary hover:text-text-primary hover:bg-[#23274c]/85 bg-[#16182c]/40" 
                              : "text-text-secondary hover:text-text-primary hover:bg-[#1f223f]/80"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-bold truncate text-text-primary">{item.name}</p>
                              {item.isPackOption && (
                                <span className="text-[8px] bg-blue-500/15 text-blue-400 border border-blue-500/25 px-1.5 py-0.5 rounded uppercase font-black tracking-wider shrink-0 shadow-sm">
                                  Pack Variant
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-text-muted truncate mt-0.5">
                              SKU/Barcode: {item.barcode || 'None'} | Cat: {item.categoryName}
                            </p>
                          </div>
                          <span className="text-xs font-black text-blue-400 shrink-0 ml-3">
                            ₹{Number(item.price || 0).toFixed(2)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </Card>

            {/* Active Ledger List */}
            <Card className="relative z-20 bg-[#121424]/50 border border-border/40 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-blue-400">
                  <Layers size={16} className="shrink-0" />
                  <h3 className="text-xs font-bold uppercase tracking-wider">Print Batch Ledger</h3>
                </div>
                <div className="flex items-center gap-2">
                  {batchItems.length > 0 && (
                    <button 
                      type="button"
                      onClick={handleClearBatch}
                      className="text-[10px] text-danger hover:text-danger-hover font-bold px-2 py-0.5 border border-danger/25 hover:border-danger/45 bg-danger/5 rounded uppercase transition-colors shrink-0"
                    >
                      Clear Queue
                    </button>
                  )}
                  <span className="text-[10px] bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded uppercase shrink-0">
                    {batchItems.length} Products | {totalLabelsToPrint} Labels
                  </span>
                </div>
              </div>

              {batchItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border/30 rounded-2xl text-center p-4">
                  <AlertCircle className="w-8 h-8 text-text-muted opacity-30 mb-2" />
                  <p className="text-xs font-bold text-text-secondary">Your print batch queue is currently empty!</p>
                  <p className="text-[10px] text-text-muted mt-1 leading-normal max-w-xs">
                    Search product names in the panel above or add one-off custom items to queue labels.
                  </p>
                </div>
              ) : (
                <div className="max-h-[340px] overflow-y-auto space-y-2.5 pr-1.5 custom-scrollbar">
                  {batchItems.map((item) => (
                    <div 
                      key={item.id} 
                      className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-xl border border-border/50 bg-[#16182c]/40 hover:border-blue-500/25 transition-all shadow-sm"
                    >
                      <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-3">
                        <div className="md:col-span-6 min-w-0 space-y-1">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => handleUpdateField(item.id, 'name', e.target.value)}
                            className="font-bold text-xs bg-transparent hover:bg-white/5 focus:bg-[#1f223f] px-2 py-1 rounded-lg border border-transparent hover:border-white/10 focus:border-blue-500/50 text-text-primary focus:outline-none w-full truncate transition-all cursor-pointer"
                            title="Click to edit name on label"
                          />
                          <div className="flex items-center gap-1.5 px-2">
                            <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider">SKU:</span>
                            <input
                              type="text"
                              value={item.barcode}
                              onChange={(e) => handleUpdateField(item.id, 'barcode', e.target.value.toUpperCase())}
                              className="text-[9px] text-text-muted bg-transparent hover:bg-white/5 focus:bg-[#1f223f] px-1 py-0.5 rounded border border-transparent hover:border-white/10 focus:border-blue-500/50 focus:outline-none w-36 uppercase tracking-widest font-mono transition-all cursor-pointer"
                              title="Click to edit barcode"
                            />
                          </div>
                        </div>

                        <div className="md:col-span-6 flex items-center gap-2 pl-2">
                          <span className="text-[10px] text-text-muted font-black uppercase tracking-wider shrink-0">Price:</span>
                          <div className="relative w-28">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-black text-text-muted">₹</span>
                            <input
                              type="text"
                              value={item.price}
                              onChange={(e) => handleUpdateField(item.id, 'price', e.target.value)}
                              className="glass-input h-8 pl-6 pr-2 text-xs font-black text-text-secondary w-full focus:ring-1 focus:ring-blue-500/40 cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-3 shrink-0 border-t md:border-t-0 border-border/20 pt-2 md:pt-0">
                        <div className="flex items-center bg-[#0d0f1c] rounded-lg border border-border/50 h-8">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                            className="w-8 h-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors rounded-l-lg"
                          >
                            <Minus size={12} />
                          </button>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => handleUpdateQuantity(item.id, Number(e.target.value))}
                            className="w-10 h-full bg-transparent text-center text-xs font-black text-text-primary focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                            className="w-8 h-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors rounded-r-lg"
                          >
                            <Plus size={12} />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="w-8 h-8 rounded-lg bg-danger/10 text-danger hover:bg-danger/25 flex items-center justify-center transition-all"
                          title="Remove product"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Form Configuration Settings */}
            <Card className="relative z-10 bg-[#121424]/50 border border-border/40 p-4 space-y-4">
              <div className="flex items-center gap-2 text-blue-400">
                <Printer size={16} className="shrink-0" />
                <h3 className="text-xs font-bold uppercase tracking-wider">Format & Label Presets</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-muted uppercase">Barcode Layout Type</label>
                  <div className="grid grid-cols-2 gap-2 h-10">
                    <button
                      type="button"
                      onClick={() => setBarcodeType('1d')}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border text-xs font-black uppercase transition-all ${barcodeType === '1d' ? 'border-blue-500/50 bg-blue-500/10 text-blue-400' : 'border-border/50 text-text-muted hover:text-text-primary bg-bg-tertiary/40'}`}
                    >
                      <Barcode size={14} /> 1D Linear
                    </button>
                    <button
                      type="button"
                      onClick={() => setBarcodeType('qr')}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border text-xs font-black uppercase transition-all ${barcodeType === 'qr' ? 'border-blue-500/50 bg-blue-500/10 text-blue-400' : 'border-border/50 text-text-muted hover:text-text-primary bg-bg-tertiary/40'}`}
                    >
                      <QrCode size={14} /> 2D QR Code
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-muted uppercase">Select Print Sizing Preset</label>
                  <select
                    className="glass-input h-10 text-xs w-full"
                    value={presetId}
                    onChange={(e) => setPresetId(e.target.value)}
                  >
                    {LABEL_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name} ({preset.widthMm}x{preset.heightMm} mm)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-border/30 grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { state: showStoreHeader, set: setShowStoreHeader, label: 'Store Header' },
                  { state: showItemName, set: setShowItemName, label: 'Item Name' },
                  { state: showBarcodeText, set: setShowBarcodeText, label: 'Barcode Text' },
                  { state: showPrice, set: setShowPrice, label: 'Show Price' }
                ].map((ctrl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => ctrl.set(!ctrl.state)}
                    className={`flex items-center justify-between p-2 rounded-lg border text-xs transition-all ${ctrl.state ? 'bg-blue-500/5 border-blue-500/30 text-blue-400 font-bold' : 'bg-bg-tertiary border-border/50 text-text-muted'}`}
                  >
                    <span>{ctrl.label}</span>
                    {ctrl.state && <Check size={12} className="text-blue-400 shrink-0" />}
                  </button>
                ))}
              </div>
            </Card>

          </div>

          {/* SIDE LIVE PRINT PREVIEWS */}
          <div className="xl:col-span-5 flex flex-col gap-5">
            <Card className="flex-1 bg-[#121424]/50 border border-border/40 p-5 flex flex-col justify-between min-h-[400px]">
              <div className="w-full flex items-center justify-between border-b border-border/30 pb-3 mb-4 shrink-0">
                <span className="text-xs font-bold uppercase text-text-muted tracking-wider">Live Printed Batch Previews</span>
                <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded font-black tracking-wider uppercase">
                  {activePreset.widthMm} x {activePreset.heightMm} mm
                </span>
              </div>

              <div className="flex-1 w-full overflow-y-auto max-h-[380px] custom-scrollbar pr-2 py-2 flex flex-col gap-4 items-center justify-start min-h-[250px]">
                {batchItems.length === 0 ? (
                  <div className="m-auto text-center p-4">
                    <Printer className="w-10 h-10 text-text-muted opacity-25 mx-auto mb-2 animate-pulse" />
                    <p className="text-xs text-text-muted font-bold">Previews appear here when items are added.</p>
                  </div>
                ) : (
                  batchItems.map((item) => (
                    <div key={item.id} className="w-full flex flex-col items-center gap-1.5 border-b border-border/20 last:border-b-0 pb-4 last:pb-0">
                      <div className="w-full flex justify-between px-2 text-[9px] font-bold text-text-muted uppercase">
                        <span className="truncate max-w-[65%]">{item.name}</span>
                        <span className="text-blue-400 shrink-0">{item.quantity} Copies</span>
                      </div>
                      
                      <div className="w-full overflow-x-auto flex justify-center py-1 scrollbar-none">
                        <div 
                          style={{ 
                            width: `${activePreset.widthPx}px`, 
                            height: `${activePreset.heightPx}px`, 
                          }}
                          className="bg-white text-black rounded-lg shadow-2xl border border-slate-300 p-2.5 flex flex-col items-center justify-center text-center select-none overflow-hidden shrink-0"
                        >
                          {showStoreHeader && storeHeader && (
                            <p 
                              style={{ fontSize: `${Math.max(6, activePreset.widthPx * 0.038)}px` }} 
                              className="print-header-text font-black uppercase text-[10px] tracking-wide text-slate-850 line-clamp-1 select-none"
                            >
                              {storeHeader}
                            </p>
                          )}

                          {showItemName && (
                            <h4 
                              style={{ fontSize: `${Math.max(8, activePreset.widthPx * 0.048)}px` }} 
                              className="print-title-text font-black text-xs text-black tracking-tight mt-0.5 leading-tight line-clamp-1 select-none"
                            >
                              {item.name || 'STORE PRODUCT'}
                            </h4>
                          )}

                          <div className="print-barcode-container w-[90%] my-1.5 flex justify-center items-center">
                            {barcodeType === 'qr' ? (
                              <QRCodeSVG 
                                value={item.barcode || '000000'}
                                size={Math.min(activePreset.heightPx * 0.45, 90)}
                                level="M"
                                includeMargin={false}
                              />
                            ) : (
                              <div className="w-full">
                                <BarcodeSVG 
                                  value={item.barcode} 
                                  width={activePreset.widthPx * 0.8}
                                  height={Math.min(activePreset.heightPx * 0.35, 45)}
                                />
                              </div>
                            )}
                          </div>

                          {showBarcodeText && barcodeType === '1d' && item.barcode && (
                            <p 
                              style={{ fontSize: `${Math.max(6, activePreset.widthPx * 0.035)}px` }} 
                              className="print-value-text text-[9px] font-black tracking-widest text-slate-700 leading-none select-none uppercase"
                            >
                              {item.barcode}
                            </p>
                          )}

                          {showPrice && (
                            <p 
                              style={{ fontSize: `${Math.max(10, activePreset.widthPx * 0.065)}px` }} 
                              className="print-price-text text-base font-black text-black leading-none mt-1 select-none"
                            >
                              ₹{Number(item.price || 0).toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="w-full pt-4 border-t border-border/30 mt-4 shrink-0">
                <Button 
                  className="w-full shadow-glow-sm bg-gradient-primary text-white font-black tracking-wider" 
                  icon={<Printer className="w-4 h-4" />}
                  onClick={handlePrint}
                  disabled={batchItems.length === 0}
                >
                  Send Batch to Thermal Printer ({totalLabelsToPrint} Labels)
                </Button>
              </div>
            </Card>
          </div>

        </div>
      ) : activeSettingsTab === 'weigh_scale' ? (
        /* TAB 2: WEIGHING MACHINE BARCODE FORMAT & SIMULATOR (New Premium View) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
          
          {/* SIMULATOR & CONFIGURATION PANEL (Left Panel - 7 columns) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Configuration Form */}
            <Card className="bg-[#121424]/50 border border-border/40 p-5 space-y-4">
              <div className="flex items-center gap-2 text-blue-400">
                <Layers className="w-4 h-4 shrink-0" />
                <h3 className="text-xs font-bold uppercase tracking-wider">Weight Scale Parser Settings</h3>
              </div>

              <p className="text-[11px] text-text-muted leading-relaxed">
                When you weigh items (vegetables, sweets, bakery) on a digital scale, the scale prints an <strong>EAN-13 (13-digit)</strong> barcode.
                To integrate this with the POS scanner, configure the barcode prefix here.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                
                {/* Prefix selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-muted uppercase">Weighing Scale Prefix (2 Digits)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={2}
                      className="glass-input h-10 w-24 text-center font-mono font-black text-sm tracking-widest text-blue-400 focus:ring-1 focus:ring-blue-500/50"
                      value={weighPrefix}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setWeighPrefix(val);
                      }}
                      placeholder="22"
                    />
                    <Button 
                      size="sm"
                      onClick={() => handleSavePrefix(weighPrefix)}
                      disabled={weighPrefix.length !== 2}
                      className="h-10 text-xs uppercase tracking-wider font-bold"
                    >
                      Apply & Link POS
                    </Button>
                  </div>
                  <span className="text-[10px] text-text-muted">Standard prefixes are: <span className="font-bold text-text-secondary">22, 20, 21, 24</span>. Default is 22.</span>
                </div>

                {/* SKU Code Simulator */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-muted uppercase">Test Product QR/SKU Code</label>
                  <input
                    type="text"
                    className="glass-input h-10 px-3 font-mono text-xs tracking-wider"
                    value={weighSku}
                    onChange={(e) => setWeighSku(e.target.value.replace(/\D/g, '').substring(0, 5))}
                    placeholder="e.g. 001"
                  />
                  <span className="text-[10px] text-text-muted">Matches item QR in POS. Max 5 digits. Will pad with leading zeros.</span>
                </div>

              </div>

              {/* Slider for simulated weight */}
              <div className="space-y-2 pt-2 border-t border-border/20">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-text-muted uppercase">Simulated Measured Weight (kg)</span>
                  <span className="font-mono font-black text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 text-sm">
                    {weighWeight.toFixed(3)} kg ({Math.round(weighWeight * 1000)}g)
                  </span>
                </div>
                
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0.05"
                    max="5.00"
                    step="0.05"
                    value={weighWeight}
                    onChange={(e) => setWeighWeight(parseFloat(e.target.value))}
                    className="flex-1 accent-blue-500 h-1.5 bg-[#0f111a] rounded-lg cursor-pointer"
                  />
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    className="glass-input h-8 w-20 text-center font-mono text-xs"
                    value={weighWeight}
                    onChange={(e) => setWeighWeight(Math.max(0.001, parseFloat(e.target.value) || 0))}
                  />
                </div>
              </div>
            </Card>

            {/* Interactive Visual Breakdown Card */}
            <Card className="bg-[#121424]/50 border border-border/40 p-5 space-y-4">
              <div className="flex items-center gap-2 text-blue-400">
                <Sparkles className="w-4 h-4 shrink-0" />
                <h3 className="text-xs font-bold uppercase tracking-wider">Simulated Barcode Digits Breakdown</h3>
              </div>

              {/* Color-Coded Digit Blocks */}
              <div className="flex flex-col items-center justify-center p-6 bg-[#0c0e17] border border-border/30 rounded-2xl space-y-4 select-none">
                
                {/* Digits Display */}
                <div className="flex items-stretch font-mono font-black text-2xl md:text-3xl tracking-widest text-center shadow-lg rounded-xl overflow-hidden border border-white/5">
                  <div className="bg-purple-500/20 text-purple-400 px-3.5 py-2.5 border-r border-white/5" title="Prefix: 2 Digits">
                    {simulated.prefix}
                  </div>
                  <div className="bg-blue-500/20 text-blue-400 px-4 py-2.5 border-r border-white/5" title="Product SKU: 5 Digits">
                    {simulated.sku}
                  </div>
                  <div className="bg-emerald-500/20 text-emerald-400 px-4 py-2.5 border-r border-white/5" title="Weight in Grams: 5 Digits">
                    {simulated.weight}
                  </div>
                  <div className="bg-amber-500/20 text-amber-400 px-3.5 py-2.5" title="Checksum Digit: 1 Digit">
                    {simulated.checkDigit}
                  </div>
                </div>

                {/* Labels Grid */}
                <div className="w-full max-w-md grid grid-cols-4 gap-2 pt-2 text-[9px] font-black tracking-wider uppercase text-center">
                  <div className="text-purple-400 flex flex-col items-center">
                    <span className="w-2 h-2 rounded-full bg-purple-500 mb-1" />
                    Prefix ({simulated.prefix})
                  </div>
                  <div className="text-blue-400 flex flex-col items-center">
                    <span className="w-2 h-2 rounded-full bg-blue-500 mb-1" />
                    Product SKU ({simulated.sku})
                  </div>
                  <div className="text-emerald-400 flex flex-col items-center">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 mb-1" />
                    Weight ({simulated.weight}g)
                  </div>
                  <div className="text-amber-400 flex flex-col items-center">
                    <span className="w-2 h-2 rounded-full bg-amber-500 mb-1" />
                    EAN-13 Check ({simulated.checkDigit})
                  </div>
                </div>

                {/* Simulated Barcode Print Preview */}
                <div className="w-full max-w-[280px] bg-white text-black p-3 rounded-lg shadow-xl border border-slate-300 mt-4 flex flex-col items-center justify-center">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Scale Label</span>
                  <div className="w-[85%]">
                    <BarcodeSVG value={simulated.fullCode} width={200} height={45} />
                  </div>
                  <span className="text-[10px] font-bold tracking-[0.25em] font-mono text-slate-800 leading-none mt-1">
                    {simulated.prefix} {simulated.sku} {simulated.weight} {simulated.checkDigit}
                  </span>
                  <span className="text-[8px] font-black text-slate-700 mt-1 uppercase">WT: {weighWeight.toFixed(3)} kg</span>
                </div>

              </div>
            </Card>

          </div>

          {/* INTERACTIVE SCANNER & TESTING PANEL (Right Panel - 5 columns) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Live Scan Parser Test */}
            <Card className="bg-[#121424]/50 border border-border/40 p-5 space-y-4">
              <div className="flex items-center gap-2 text-blue-400">
                <Search className="w-4 h-4 shrink-0" />
                <h3 className="text-xs font-bold uppercase tracking-wider">POS Scanner Integration Tester</h3>
              </div>

              <p className="text-[11px] text-text-muted leading-relaxed">
                Scan a weighing scale barcode directly with your scanner (or copy the generated code above and paste it here) to verify the integration.
              </p>

              <div className="space-y-3 pt-2">
                <div className="relative">
                  <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="text"
                    className="glass-input h-10 pl-9 pr-24 font-mono text-xs tracking-wider uppercase"
                    placeholder="Enter EAN-13 code..."
                    value={testScannedCode}
                    onChange={(e) => setTestScannedCode(e.target.value.replace(/\D/g, '').substring(0, 13))}
                  />
                  <button
                    type="button"
                    onClick={handleTestDecode}
                    disabled={testScannedCode.length !== 13}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-[9px] font-black uppercase tracking-wider px-3.5 py-1.5 rounded-lg transition-colors h-7 flex items-center justify-center"
                  >
                    Test Decode
                  </button>
                </div>
                <div className="flex justify-between text-[9px] text-text-muted font-bold uppercase px-1">
                  <span>Input: 13-digit EAN code</span>
                  <button 
                    type="button" 
                    onClick={() => setTestScannedCode(simulated.fullCode)}
                    className="text-blue-400 hover:underline"
                  >
                    Load Simulated Code
                  </button>
                </div>
              </div>

              {/* Parsed Result Display */}
              {testResult && (
                <div className="p-4 bg-[#0d0f19] border border-border/60 rounded-xl space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-border/20 pb-2">
                    <span className="text-[10px] font-black uppercase text-blue-400 tracking-wider">Parsed Data Output</span>
                    <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-black tracking-wider uppercase">
                      Calculated
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-[10px] font-mono leading-normal">
                    <div>
                      <p className="text-[9px] text-text-muted uppercase font-bold">Prefix Checked</p>
                      <p className="text-text-primary font-black">{testResult.prefix}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-text-muted uppercase font-bold">Extracted Product SKU</p>
                      <p className="text-blue-400 font-black">{testResult.skuRaw} (int: {testResult.parsedSkuInt})</p>
                    </div>
                    <div className="col-span-2 pt-1.5 border-t border-border/10">
                      <p className="text-[9px] text-text-muted uppercase font-bold">Parsed Weight</p>
                      <p className="text-emerald-400 font-black text-sm">{testResult.parsedWeightKg.toFixed(3)} kg ({parseInt(testResult.weightRaw, 10)} grams)</p>
                    </div>
                  </div>

                  {/* Matching Product Result card */}
                  <div className="pt-3 border-t border-border/20">
                    {testResult.matchedItem ? (
                      <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-2">
                        <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[10px] uppercase">
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>Product Matched Successfully!</span>
                        </div>
                        <div className="text-xs">
                          <p className="font-black text-text-primary uppercase leading-tight">{testResult.matchedItem.name}</p>
                          <p className="text-[9px] text-text-muted mt-0.5">
                            SKU/QR: {testResult.matchedItem.productQR || 'None'} | Standard Price: ₹{Number(testResult.matchedItem.price).toFixed(2)}/kg
                          </p>
                        </div>
                        <div className="p-2 bg-emerald-500/10 rounded-lg text-[10px] leading-relaxed text-emerald-300 font-bold border border-emerald-500/10">
                          🔥 POS will automatically add <span className="underline">{testResult.parsedWeightKg.toFixed(3)} kg</span> of this item to the cart, calculating a cost of <span className="underline">₹{(Number(testResult.matchedItem.price) * testResult.parsedWeightKg).toFixed(2)}</span>!
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-2 text-xs">
                        <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[10px] uppercase leading-tight">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Decoded but Product Not Found!</span>
                        </div>
                        <p className="text-[10px] text-text-muted leading-relaxed">
                          We successfully extracted SKU <span className="font-black text-text-secondary">"{testResult.skuRaw}"</span>, but no menu item has this QR/barcode.
                        </p>
                        <div className="p-2.5 bg-amber-500/10 rounded-lg text-[9px] leading-relaxed text-amber-300 font-semibold border border-amber-500/10">
                          💡 <strong>How to fix:</strong> Go to the menu builder and set the Product QR code of your item to <strong>"{testResult.skuRaw}"</strong> (or unpadded <strong>"{testResult.parsedSkuInt}"</strong>). Then scan again!
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>

            {/* Weighing scale config guide */}
            <Card className="bg-[#121424]/50 border border-border/40 p-5 space-y-4">
              <div className="flex items-center gap-2 text-blue-400">
                <Printer className="w-4 h-4 shrink-0" />
                <h3 className="text-xs font-bold uppercase tracking-wider">Standard Scale Config Guide</h3>
              </div>

              <div className="text-[10px] text-text-muted space-y-2.5 leading-normal">
                <p>
                  To make your physical weighing scale print barcodes compatible with this POS, configure the scale's label formatting settings as follows:
                </p>

                <div className="space-y-1.5 p-2 bg-[#0c0e17] rounded-lg font-mono text-[9px]">
                  <p className="font-bold text-text-secondary">Recommended CAS / Essae / Phoenix Setup:</p>
                  <p>• Label Format Type: <span className="text-blue-400">EAN-13 (13 digits)</span></p>
                  <p>• Code Format Scheme: <span className="text-emerald-400">22 AAAAA WWWWW C</span></p>
                  <p>• 22 = Flag / Prefix</p>
                  <p>• AAAAA = Item code / SKU</p>
                  <p>• WWWWW = Weight in grams (e.g. 1000 for 1kg)</p>
                  <p>• C = EAN Check Digit (Auto-calculated by scale)</p>
                </div>

                <p className="text-[9.5px]">
                  Once configured, simply paste the printed label's EAN-13 barcode into the POS search or scan it with your handheld laser scanner. The system will handle the rest!
                </p>
              </div>
            </Card>

          </div>

        </div>
      ) : (
        /* TAB 3: CASH DRAWER & PRINTER INTEGRATION SYSTEM (Premium View) */
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-in fade-in duration-200">
          
          {/* HARDWARE CONNECTION GUIDE PANEL (Left Panel - 7 columns) */}
          <div className="xl:col-span-7 space-y-6">
            
            {/* Visual Hardware Guide */}
            <Card className="bg-[#121424]/50 border border-border/40 p-5 space-y-5">
              <div className="flex items-center gap-2 text-blue-400">
                <Layers className="w-4 h-4 shrink-0" />
                <h3 className="text-xs font-bold uppercase tracking-wider">How to physically connect your cash drawer</h3>
              </div>

              <div className="p-4 bg-danger/10 border border-danger/25 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-danger font-black text-[10px] uppercase">
                  <XCircle className="w-4 h-4 shrink-0" />
                  <span>CRITICAL CONNECTION WARNING</span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Do <strong>NOT</strong> plug the telephone-style cash drawer cable (RJ11/RJ12 connector) directly into your PC's Ethernet network port! 
                  A computer network card cannot supply the 12V/24V electricity needed to trigger the cash drawer solenoid, and doing so can damage your network port.
                </p>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-text-muted leading-relaxed">
                  To open your cash drawer automatically, connect your hardware in this exact path:
                </p>

                {/* Connection Flow Diagram */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center py-2">
                  <div className="p-3 bg-[#0d0f1a] border border-border/40 rounded-xl flex flex-col items-center justify-center space-y-1">
                    <span className="text-lg">💵</span>
                    <span className="text-[10px] font-black text-text-primary uppercase">1. Cash Drawer</span>
                    <span className="text-[9px] text-text-muted">Has telephone (RJ11) cable</span>
                  </div>
                  
                  <div className="flex items-center justify-center text-blue-400 font-bold text-lg select-none py-1 md:py-0">
                    <span className="rotate-90 md:rotate-0">➔</span>
                  </div>

                  <div className="p-3 bg-[#0d0f1a] border border-border/40 rounded-xl flex flex-col items-center justify-center space-y-1">
                    <span className="text-lg">🖨️</span>
                    <span className="text-[10px] font-black text-text-primary uppercase">2. Thermal Printer</span>
                    <span className="text-[9px] text-text-muted">Plug RJ11 into DK (Drawer Kick) Port</span>
                  </div>
                </div>

                <div className="p-4 bg-blue-600/5 border border-blue-500/25 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-blue-400 font-bold text-[10px] uppercase">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>How it works:</span>
                  </div>
                  <p className="text-text-secondary leading-relaxed text-[11px]">
                    When you process a Cash sale on the POS terminal, the software sends an escape command to the <strong>Receipt Printer</strong>.
                    The printer then sends an electrical pulse through the RJ11 cable, popping open your <strong>Cash Drawer</strong> instantly!
                  </p>
                </div>
              </div>
            </Card>

            {/* In-Depth Troubleshoot Tips */}
            <Card className="bg-[#121424]/50 border border-border/40 p-5 space-y-3">
              <div className="flex items-center gap-2 text-blue-400">
                <Sparkles className="w-4 h-4 shrink-0" />
                <h3 className="text-xs font-bold uppercase tracking-wider">Troubleshooting & Calibration</h3>
              </div>

              <ul className="text-xs text-text-muted space-y-2.5 leading-relaxed list-disc pl-4">
                <li>
                  <strong>Lock Position:</strong> Ensure your cash drawer key is turned to the <strong>electronic/open</strong> position (vertical/middle). If it is locked completely horizontal, the electronic signal cannot open it.
                </li>
                <li>
                  <strong>Open Only on Cash (UPI/GPay Isolation):</strong> If your drawer opens on every print job (like UPI/Card), open your Windows <strong>Printers & Scanners</strong> settings ➔ Printer Properties ➔ Device Settings, and set <strong>"Cash Drawer" / "Drawer Kick"</strong> to <strong>"None" or "Disabled"</strong>. This disables automatic driver-level kicks, allowing our software to trigger the drawer <em>exclusively</em> when "Cash" is clicked!
                </li>
                <li>
                  <strong>Noisy/Double Click:</strong> If the drawer sounds like it's clicking twice but doesn't pop, reduce the duration values in your Custom escape command sequence.
                </li>
                <li>
                  <strong>Default Printer:</strong> For USB printers, ensure the thermal receipt printer is set as your <strong>"Default Printer"</strong> in the Windows Control Panel.
                </li>
              </ul>
            </Card>

          </div>

          {/* SOFTWARE CALIBRATION PANEL (Right Panel - 5 columns) */}
          <div className="xl:col-span-5 space-y-6">
            
            <Card className="bg-[#121424]/50 border border-border/40 p-5 space-y-5 shadow-2xl">
              <div className="flex items-center gap-2 text-blue-400 border-b border-border/30 pb-3">
                <Printer size={16} className="shrink-0" />
                <h3 className="text-xs font-bold uppercase tracking-wider">Software Kick Configuration</h3>
              </div>

              <div className="space-y-4">
                {/* Printer Type Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-muted uppercase">Printer Connection Interface</label>
                  <div className="grid grid-cols-2 gap-2 h-10">
                    <button
                      type="button"
                      onClick={() => setDrawerType('usb')}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border text-xs font-black uppercase transition-all ${drawerType === 'usb' ? 'border-blue-500/50 bg-blue-500/10 text-blue-400' : 'border-border/50 text-text-muted hover:text-text-primary bg-bg-tertiary/40'}`}
                    >
                      <Printer size={14} /> USB / Local
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrawerType('network')}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border text-xs font-black uppercase transition-all ${drawerType === 'network' ? 'border-blue-500/50 bg-blue-500/10 text-blue-400' : 'border-border/50 text-text-muted hover:text-text-primary bg-bg-tertiary/40'}`}
                    >
                      <Layers size={14} /> Network (IP)
                    </button>
                  </div>
                </div>

                {/* Conditional Network Inputs */}
                {drawerType === 'network' && (
                  <div className="grid grid-cols-3 gap-3 animate-in slide-in-from-top-2 duration-150">
                    <div className="col-span-2 flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-text-muted uppercase">Printer IP Address</label>
                      <input
                        type="text"
                        value={drawerIp}
                        onChange={(e) => setDrawerIp(e.target.value)}
                        placeholder="192.168.1.200"
                        className="glass-input h-9 px-3 text-xs w-full font-mono text-text-primary"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-text-muted uppercase">Port</label>
                      <input
                        type="number"
                        value={drawerPort}
                        onChange={(e) => setDrawerPort(Number(e.target.value))}
                        placeholder="9100"
                        className="glass-input h-9 px-3 text-xs w-full font-mono text-text-primary"
                      />
                    </div>
                  </div>
                )}

                {/* Kick Code Preset Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-muted uppercase">Solenoid Kick Escape Preset</label>
                  <select
                    className="glass-input h-10 text-xs w-full"
                    value={drawerKickCodePreset}
                    onChange={(e) => setDrawerKickCodePreset(e.target.value)}
                  >
                    <option value="epson">Epson / Generic Standard (Pin 2: 27,112,0,25,250)</option>
                    <option value="pin5">Epson Alternate (Pin 5: 27,112,1,25,250)</option>
                    <option value="star">Star Micronics Standard (7)</option>
                    <option value="custom">Custom Decimal Bytes</option>
                  </select>
                </div>

                {/* Custom Escape Code Input */}
                {drawerKickCodePreset === 'custom' && (
                  <div className="flex flex-col gap-1.5 animate-in slide-in-from-top-2 duration-150">
                    <label className="text-[10px] font-bold text-text-muted uppercase">Custom Decimal Commands (Comma separated)</label>
                    <input
                      type="text"
                      value={drawerCustomKickCode}
                      onChange={(e) => setDrawerCustomKickCode(e.target.value)}
                      placeholder="27,112,0,25,250"
                      className="glass-input h-9 px-3 text-xs w-full font-mono text-blue-400"
                    />
                    <span className="text-[9px] text-text-muted leading-relaxed">
                      Enter the sequence as decimal values separated by commas (e.g. 27,112,0,25,250).
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-border/30 space-y-3">
                <Button
                  onClick={handleTestDrawerKick}
                  type="button"
                  variant="secondary"
                  className="w-full text-xs font-black tracking-wider uppercase bg-[#1f223f] border border-border/50 text-text-primary hover:bg-[#2c3059] h-10 transition-all"
                >
                  ⚡ Test Cash Drawer Kick (Open Now)
                </Button>

                <Button
                  onClick={handleSaveDrawerSettings}
                  type="button"
                  className="w-full text-xs font-black tracking-wider uppercase shadow-glow-sm bg-gradient-primary text-white h-10 transition-all"
                >
                  💾 Save Printer & Drawer Settings
                </Button>
              </div>
            </Card>

          </div>

        </div>
      )}

    </div>
  );
}
