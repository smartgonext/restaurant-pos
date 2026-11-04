import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useState, useRef, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { 
  Printer, QrCode, Barcode, Tag, Sparkles, Store, Check, Trash2, Plus, Minus, Search, Layers, AlertCircle, RefreshCw, XCircle, Wallet
, Calendar, Edit2, Clock, CalendarDays } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { QRCodeSVG } from 'qrcode.react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { printHtmlOrFallback, getPrinterSettings, getAvailablePrinters, PrinterInfo } from '@/lib/electronPrint';

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
    id: 'retail_standard', 
    name: '50 x 25 mm (Standard 2"x1")', 
    widthMm: 50, 
    heightMm: 25, 
    widthPx: 250, 
    heightPx: 140, 
    description: '50 x 25 mm — most common retail pricing label (supports 1-Up & 2-Up).' 
  },
  { 
    id: 'compact_38x25', 
    name: '38 x 25 mm (Compact 1.5"x1")', 
    widthMm: 38, 
    heightMm: 25, 
    widthPx: 210, 
    heightPx: 140, 
    description: '38 x 25 mm — popular 2-Up twin roll size (80mm web width).' 
  },
  { 
    id: 'compact_35x25', 
    name: '35 x 25 mm (Mini 1.4"x1")', 
    widthMm: 35, 
    heightMm: 25, 
    widthPx: 195, 
    heightPx: 140, 
    description: '35 x 25 mm — popular 2-Up twin roll size (72mm web width).' 
  },
  { 
    id: 'jewelry', 
    name: '30 x 15 mm (Compact Shelf Tag)', 
    widthMm: 30, 
    heightMm: 15, 
    widthPx: 165, 
    heightPx: 90, 
    description: '30 x 15 mm — ideal for compact items or shelf edge pricing tags.' 
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
  includeMfgDate?: boolean;
  mfgDate?: string;
  includeBestBefore?: boolean;
  bestBeforeDays?: number | string;
  includeExpDate?: boolean;
  expDate?: string;
}

export default function BarcodeSettings() {
  const [activeSettingsTab, setActiveSettingsTab] = useState<'shelf_tags' | 'weigh_scale' | 'cash_drawer' | 'sequential_barcode'>('shelf_tags');
  const [seqDigits, setSeqDigits] = useState<number>(() => Number(localStorage.getItem('barcode_seq_padding') || 5));
  const [seqCustomStart, setSeqCustomStart] = useState<string>(() => localStorage.getItem('barcode_seq_start') || '1');
  const [liveSeqPreview, setLiveSeqPreview] = useState<string>('00001');

  useEffect(() => {
    const qParams = new URLSearchParams({ digits: String(seqDigits) });
    if (seqCustomStart && Number(seqCustomStart) > 0) qParams.set('start', seqCustomStart);
    api.get(`/restaurant/menu-items/next-barcode?${qParams.toString()}`)
      .then(res => {
        if (res.data?.success && res.data?.barcode) {
          setLiveSeqPreview(res.data.barcode);
        }
      })
      .catch(() => {});
  }, [seqDigits, seqCustomStart]);

  const handleSaveSequenceConfig = () => {
    localStorage.setItem('barcode_seq_padding', String(seqDigits));
    if (seqCustomStart && Number(seqCustomStart) > 0) {
      localStorage.setItem('barcode_seq_start', seqCustomStart);
    } else {
      localStorage.removeItem('barcode_seq_start');
    }
    toast.success(`Sequential barcode set to start at ${liveSeqPreview}!`);
  };

  const handleResetTo0001 = () => {
    setSeqCustomStart('1');
    localStorage.setItem('barcode_seq_start', '1');
    toast.success(`Reset sequence to 1 (${String(1).padStart(seqDigits, '0')})!`);
  };
  const [availablePrinters, setAvailablePrinters] = useState<PrinterInfo[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>(() => {
    return localStorage.getItem('label_printer_name') || getPrinterSettings().billPrinterName || '';
  });
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  useEffect(() => {
    getAvailablePrinters().then((printers) => {
      setAvailablePrinters(printers);
      if (!selectedPrinter && printers.length > 0) {
        const defaultPrinter = printers.find(p => p.isDefault)?.name || printers[0].name;
        setSelectedPrinter(defaultPrinter);
      }
    });
  }, []);
  
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
  const [is2Up, setIs2Up] = useState<boolean>(() => {
    try { return localStorage.getItem('barcode_is_2up') === 'true'; } catch { return false; }
  });
  const [gapMm, setGapMm] = useState<number>(() => {
    try { return Number(localStorage.getItem('barcode_2up_gap') || 2); } catch { return 2; }
  });
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { data: restaurantSettings } = useQuery({
    queryKey: ['restaurant-settings'],
    queryFn: () => api.get('/restaurant/settings').then((r) => r.data.data ?? {}).catch(() => ({})),
  });

  const effectiveCompanyName = useMemo(() => {
    const raw = restaurantSettings?.restaurantName || user?.restaurant?.name;
    if (raw && typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
    return 'AMORA';
  }, [restaurantSettings?.restaurantName, user?.restaurant?.name]);

  const [storeHeader, setStoreHeader] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('barcode_store_header');
      if (saved && saved.trim() && !saved.toUpperCase().includes('SUMA')) {
        return saved.trim();
      }
    } catch {}
    return '';
  });

  useEffect(() => {
    if (!storeHeader || storeHeader.toUpperCase().includes('SUMA')) {
      const saved = localStorage.getItem('barcode_store_header');
      if (saved && saved.trim() && !saved.toUpperCase().includes('SUMA')) {
        setStoreHeader(saved.trim());
      } else if (effectiveCompanyName) {
        const comp = effectiveCompanyName.toUpperCase();
        setStoreHeader(comp);
        try { localStorage.setItem('barcode_store_header', comp); } catch {}
      }
    }
  }, [effectiveCompanyName, storeHeader]);

  const handleUpdateStoreHeader = (val: string) => {
    setStoreHeader(val);
    try { localStorage.setItem('barcode_store_header', val); } catch {}
  };

  const handleSyncCompanyName = () => {
    if (effectiveCompanyName) {
      handleUpdateStoreHeader(effectiveCompanyName.toUpperCase());
      toast.success(`Barcode header set to "${effectiveCompanyName.toUpperCase()}"!`);
    }
  };
  
  const [showStoreHeader, setShowStoreHeader] = useState<boolean>(true);
  const [showItemName, setShowItemName] = useState<boolean>(true);
  const [showBarcodeText, setShowBarcodeText] = useState<boolean>(true);
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showMfgDate, setShowMfgDate] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('barcode_show_mfg');
      return v !== null ? v === 'true' : true;
    } catch { return true; }
  });
  const [showExpDate, setShowExpDate] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('barcode_show_exp');
      return v !== null ? v === 'true' : true;
    } catch { return true; }
  });
  const [showBestBefore, setShowBestBefore] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('barcode_show_bb');
      return v !== null ? v === 'true' : true;
    } catch { return true; }
  });

  // Modal State for setting Qty, Mfg Date, Best Before days when adding/editing item
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [activeModalItem, setActiveModalItem] = useState<any>(null);
  const [modalQty, setModalQty] = useState<number>(1);
  const [modalIncludeMfg, setModalIncludeMfg] = useState<boolean>(false);
  const [modalMfgDate, setModalMfgDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [modalIncludeBestBefore, setModalIncludeBestBefore] = useState<boolean>(false);
  const [modalIncludeExp, setModalIncludeExp] = useState<boolean>(false);
  const [modalBestBeforeDays, setModalBestBeforeDays] = useState<string>('');
  const [modalExpDate, setModalExpDate] = useState<string>('');
  const [editingLedgerId, setEditingLedgerId] = useState<string | null>(null);

  // Compute Expiry Date dynamically from Mfg Date + Best Before Days
  const computeExpiryFromDays = (mfgStr: string, daysVal: number | string) => {
    const d = parseInt(String(daysVal), 10);
    if (!Number.isFinite(d) || d <= 0) return '';
    const base = mfgStr ? new Date(mfgStr) : new Date();
    if (isNaN(base.getTime())) return '';
    const exp = new Date(base.getTime() + d * 24 * 60 * 60 * 1000);
    return exp.toISOString().split('T')[0];
  };

  // Format date: Month and Year only for standard Mfg/Exp; Date and Month for Best Before
  const formatItemDate = (dateStr?: string, hasBestBefore: boolean = false) => {
    if (!dateStr) return '';
    const trimmed = dateStr.trim();
    if (/^\d{1,2}\/\d{4}$/.test(trimmed)) return trimmed;
    if (/^\d{1,2}\/\d{1,2}$/.test(trimmed)) return trimmed;

    // Handle YYYY-MM-DD cleanly without timezone shift
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(trimmed)) {
      const parts = trimmed.split('T')[0].split('-');
      const yyyy = parts[0];
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      const mm = String(m).padStart(2, '0');
      if (hasBestBefore) {
        return `${d}/${m}`;
      }
      return `${mm}/${yyyy}`;
    }

    const dt = new Date(trimmed);
    if (isNaN(dt.getTime())) return trimmed;
    const d = dt.getDate();
    const m = dt.getMonth() + 1;
    const yyyy = dt.getFullYear();
    const mm = String(m).padStart(2, '0');

    // If Best Before is specified, show Date and Month (e.g. 4/11, 9/11)
    if (hasBestBefore) {
      return `${d}/${m}`;
    }
    // Standard Mfg & Expiry: show Month and Year only (e.g. 11/2026, 08/2026)
    return `${mm}/${yyyy}`;
  };

  // Open item modal for new item from search
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

    // Outside ON automatically sets inside ON!
    setModalIncludeMfg(showMfgDate);
    setModalMfgDate(initialMfg);
    setModalIncludeBestBefore(showBestBefore);
    setModalBestBeforeDays(initialBB);
    setModalIncludeExp(showExpDate);
    setModalExpDate(initialExp);
    setEditingLedgerId(null);
    setIsItemModalOpen(true);
    setShowDropdown(false);
    setSearchTerm('');
  };

  // Open item modal for editing existing item in ledger
  const handleOpenEditItemModal = (item: PrintBatchItem) => {
    setActiveModalItem(item);
    setModalQty(item.quantity || 1);
    setModalIncludeMfg(item.includeMfgDate !== undefined ? item.includeMfgDate : Boolean(item.mfgDate));
    setModalMfgDate(item.mfgDate || new Date().toISOString().split('T')[0]);
    setModalIncludeBestBefore(item.includeBestBefore !== undefined ? item.includeBestBefore : Boolean(item.bestBeforeDays));
    setModalBestBeforeDays(item.bestBeforeDays ? String(item.bestBeforeDays) : '');
    setModalIncludeExp(item.includeExpDate !== undefined ? item.includeExpDate : Boolean(item.expDate));
    setModalExpDate(item.expDate || '');
    setEditingLedgerId(item.id);
    setIsItemModalOpen(true);
  };

  // Save / Confirm item in batch
  const handleSaveModalItem = () => {
    if (!activeModalItem) return;
    const qty = Math.max(1, modalQty);
    let finalExpDate = modalExpDate;
    if (modalIncludeBestBefore && modalBestBeforeDays && Number(modalBestBeforeDays) > 0 && !finalExpDate) {
      finalExpDate = computeExpiryFromDays(modalMfgDate, modalBestBeforeDays);
    }

    if (editingLedgerId) {
      setBatchItems(prev => prev.map(x => x.id === editingLedgerId ? {
        ...x,
        quantity: qty,
        includeMfgDate: modalIncludeMfg,
        mfgDate: modalIncludeMfg ? modalMfgDate : undefined,
        includeBestBefore: modalIncludeBestBefore,
        bestBeforeDays: modalIncludeBestBefore && modalBestBeforeDays ? Number(modalBestBeforeDays) : undefined,
        includeExpDate: modalIncludeExp,
        expDate: modalIncludeExp ? finalExpDate : undefined,
      } : x));
      toast.success(`Updated ${activeModalItem.name}!`);
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
            includeBestBefore: modalIncludeBestBefore,
            bestBeforeDays: modalIncludeBestBefore && modalBestBeforeDays ? Number(modalBestBeforeDays) : undefined,
            includeExpDate: modalIncludeExp,
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
            includeBestBefore: modalIncludeBestBefore,
            bestBeforeDays: modalIncludeBestBefore && modalBestBeforeDays ? Number(modalBestBeforeDays) : undefined,
            includeExpDate: modalIncludeExp,
            expDate: modalIncludeExp ? finalExpDate : undefined,
          }
        ];
      });
      toast.success(`${activeModalItem.name} (${qty} labels) added to print batch!`);
    }

    // Sync changed dates back into Menu Item inside database!
    const targetMenuItemId = activeModalItem.menuItemId || (
      typeof activeModalItem.id === 'string' && activeModalItem.id.startsWith('pack-')
        ? parseInt(activeModalItem.id.split('-')[1], 10)
        : parseInt(String(activeModalItem.id), 10)
    );

    if (Number.isFinite(targetMenuItemId) && targetMenuItemId > 0 && !String(activeModalItem.id).startsWith('custom-')) {
      api.put(`/restaurant/menu-items/${targetMenuItemId}`, {
        mfgDate: modalIncludeMfg && modalMfgDate ? new Date(modalMfgDate).toISOString() : null,
        bestBeforeDays: modalIncludeBestBefore && modalBestBeforeDays && Number(modalBestBeforeDays) > 0 ? Number(modalBestBeforeDays) : null,
        expiryDate: modalIncludeExp && finalExpDate ? new Date(finalExpDate).toISOString() : null,
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['menu-items-for-batch-barcodes'] });
      }).catch(err => {
        console.error('Failed to sync dates to menuItem:', err);
      });
    }

    setIsItemModalOpen(false);
    setActiveModalItem(null);
  };

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
    handleOpenAddItemModal({
      id: customId,
      name: 'Custom Product Tag',
      barcode: 'PRD-CUSTOM-01',
      price: '99.00'
    });
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

  // Trigger print directly via isolated HTML document (no blank pages)
  const handlePrint = async () => {
    if (batchItems.length === 0) {
      toast.error('Your print batch is empty! Add items first.');
      return;
    }

    const container = document.getElementById('barcode-label-print-zone-container');
    if (!container) {
      toast.error('Print container not found in DOM.');
      return;
    }

    const labelsHtml = container.innerHTML;
    const printPageWidthMm = is2Up ? (activePreset.widthMm * 2 + gapMm) : activePreset.widthMm;
    const printDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Barcode Price Labels ${is2Up ? '(2-Up Twin Roll)' : ''}</title>
  <style>
    @page {
      size: ${printPageWidthMm}mm ${activePreset.heightMm}mm;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: ${printPageWidthMm}mm;
      background: #ffffff;
      color: #000000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    }
    .print-row-2up {
      width: ${printPageWidthMm}mm !important;
      height: ${activePreset.heightMm}mm !important;
      max-width: ${printPageWidthMm}mm !important;
      max-height: ${activePreset.heightMm}mm !important;
      margin: 0 !important;
      padding: 0 !important;
      display: flex !important;
      flex-direction: row !important;
      justify-content: space-between !important;
      align-items: center !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      page-break-after: always !important;
      break-after: page !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      background: #ffffff !important;
    }
    .print-single-label {
      width: ${activePreset.widthMm}mm !important;
      height: ${activePreset.heightMm}mm !important;
      max-width: ${activePreset.widthMm}mm !important;
      max-height: ${activePreset.heightMm}mm !important;
      padding: 1.2mm 1.5mm 0.8mm 1.5mm !important;
      margin: 0 !important;
      box-sizing: border-box !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: flex-start !important;
      text-align: center !important;
      overflow: hidden !important;
      background: #ffffff !important;
      color: #000000 !important;
      ${!is2Up ? 'page-break-inside: avoid !important; break-inside: avoid !important; page-break-after: always !important; break-after: page !important;' : ''}
    }
    .print-empty-slot {
      visibility: hidden !important;
      opacity: 0 !important;
      border: none !important;
    }
    .print-header-text {
      font-size: 7pt !important;
      line-height: 1.15 !important;
      font-weight: 800 !important;
      text-transform: uppercase !important;
      color: #000000 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      max-width: 98% !important;
      margin: 0 0 0.3mm 0 !important;
      display: block !important;
    }
    .print-title-text {
      font-size: 8.5pt !important;
      line-height: 1.15 !important;
      font-weight: 900 !important;
      color: #000000 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      max-width: 98% !important;
      margin: 0 0 0.4mm 0 !important;
      display: block !important;
    }
    .print-barcode-container {
      width: 88% !important;
      margin: 0.4mm auto !important;
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
    }
    .print-barcode-container svg {
      display: block !important;
      margin: 0 auto !important;
      width: 100% !important;
      height: 5.5mm !important;
      max-height: 6mm !important;
    }
    .print-value-text {
      font-size: 6.5pt !important;
      letter-spacing: 0.8px !important;
      font-weight: 800 !important;
      color: #000000 !important;
      line-height: 1.1 !important;
      margin: 0.2mm 0 0 0 !important;
      text-transform: uppercase !important;
      display: block !important;
    }
    .print-bottom-row {
      width: 96% !important;
      margin-top: auto !important;
      border: 0 !important;
      border-collapse: collapse !important;
      padding: 0 !important;
    }
    .print-date-col {
      text-align: left !important;
      vertical-align: bottom !important;
      padding: 0 !important;
      line-height: 1.1 !important;
    }
    .print-date-text {
      font-size: 6.5pt !important;
      font-weight: 700 !important;
      line-height: 1.1 !important;
      color: #000000 !important;
      white-space: nowrap !important;
      display: block !important;
    }
    .print-price-col {
      text-align: right !important;
      vertical-align: bottom !important;
      padding: 0 !important;
      white-space: nowrap !important;
    }
    .print-price-text {
      font-size: 11pt !important;
      font-weight: 900 !important;
      color: #000000 !important;
      line-height: 1 !important;
      margin: 0 !important;
      white-space: nowrap !important;
    }
  </style>
</head>
<body>
  ${labelsHtml}
</body>
</html>`;

    setIsPrinting(true);
    const toastId = toast.loading('Sending barcode labels to printer...');
    try {
      await printHtmlOrFallback(printDoc, { deviceName: selectedPrinter || undefined });
      toast.success(`Successfully sent ${totalLabelsToPrint} labels to printer!`, { id: toastId });
    } catch (err: any) {
      console.error('Failed to print labels:', err);
      toast.error(err?.message || 'Print error. Falling back to browser print...', { id: toastId });
      window.print();
    } finally {
      setIsPrinting(false);
    }
  };

  // Calculate totals
  const totalLabelsToPrint = batchItems.reduce((acc, item) => acc + item.quantity, 0);

  // Flattened array of individual labels
  const flattenedLabels = useMemo(() => {
    const list: PrintBatchItem[] = [];
    batchItems.forEach((item) => {
      for (let i = 0; i < item.quantity; i++) {
        list.push(item);
      }
    });
    return list;
  }, [batchItems]);

  // Group into pairs of 2 for 2-Up (Twin Roll) printing
  const labelPairs2Up = useMemo(() => {
    const pairs: Array<[PrintBatchItem, PrintBatchItem | null]> = [];
    for (let i = 0; i < flattenedLabels.length; i += 2) {
      pairs.push([flattenedLabels[i], flattenedLabels[i + 1] || null]);
    }
    return pairs;
  }, [flattenedLabels]);

  // Reusable label preview card renderer
  const renderPreviewCard = (item: PrintBatchItem, widthPx: number = 160, heightPx: number = 95) => (
    <div 
      style={{ width: `${widthPx}px`, height: `${heightPx}px` }}
      className="bg-white text-black rounded-lg shadow-xl border border-slate-300 p-2 flex flex-col items-center justify-between text-center select-none overflow-hidden shrink-0"
    >
      {showStoreHeader && storeHeader && (
        <p 
          style={{ fontSize: `${Math.max(5.5, widthPx * 0.038)}px` }} 
          className="print-header-text font-black uppercase text-[9px] tracking-wide text-slate-850 line-clamp-1 select-none m-0"
        >
          {storeHeader}
        </p>
      )}

      {showItemName && (
        <h4 
          style={{ fontSize: `${Math.max(7, widthPx * 0.046)}px` }} 
          className="print-title-text font-black text-[11px] text-black tracking-tight mt-0.5 leading-tight line-clamp-1 select-none m-0"
        >
          {item.name || 'STORE PRODUCT'}
        </h4>
      )}

      <div className="print-barcode-container w-[90%] my-1 flex justify-center items-center">
        {barcodeType === 'qr' ? (
          <QRCodeSVG 
            value={item.barcode || '000000'}
            size={Math.min(heightPx * 0.30, 44)}
            level="M"
            includeMargin={false}
          />
        ) : (
          <div className="w-full">
            <BarcodeSVG 
              value={item.barcode} 
              width={widthPx * 0.8}
              height={Math.min(heightPx * 0.20, 22)}
            />
          </div>
        )}
      </div>

      {showBarcodeText && barcodeType === '1d' && item.barcode && (
        <p 
          style={{ fontSize: `${Math.max(5.5, widthPx * 0.034)}px` }} 
          className="print-value-text text-[8px] font-black tracking-widest text-slate-700 leading-none select-none uppercase m-0"
        >
          {item.barcode}
        </p>
      )}

      <table 
        className="print-bottom-row w-[95%] mx-auto mt-auto border-0 border-collapse select-none"
        style={{ width: '95%', marginTop: 'auto', border: 0, borderCollapse: 'collapse' }}
      >
        <tbody>
          <tr>
            <td 
              className="print-date-col text-left align-bottom p-0"
              style={{ textAlign: 'left', verticalAlign: 'bottom', padding: 0 }}
            >
              {((showMfgDate && (item.includeMfgDate ?? true) && item.mfgDate) || 
                (showBestBefore && (item.includeBestBefore ?? true) && item.bestBeforeDays) || 
                (showExpDate && (item.includeExpDate ?? true) && item.expDate)) && (
                <div className="flex flex-col text-left leading-tight">
                  {showMfgDate && (item.includeMfgDate ?? true) && item.mfgDate && (
                    <span style={{ fontSize: `${Math.max(5, widthPx * 0.030)}px` }} className="print-date-text font-bold text-slate-800">
                      Mfg: {formatItemDate(item.mfgDate, Boolean(showBestBefore && (item.includeBestBefore ?? true) && item.bestBeforeDays))}
                    </span>
                  )}
                  {showBestBefore && (item.includeBestBefore ?? true) && item.bestBeforeDays && (
                    <span style={{ fontSize: `${Math.max(5, widthPx * 0.030)}px` }} className="print-date-text font-bold text-slate-800">
                      BB: {item.bestBeforeDays}d {item.expDate ? `(${formatItemDate(item.expDate, true)})` : ''}
                    </span>
                  )}
                  {showExpDate && (item.includeExpDate ?? true) && item.expDate && !item.bestBeforeDays && (
                    <span style={{ fontSize: `${Math.max(5, widthPx * 0.030)}px` }} className="print-date-text font-bold text-slate-800">
                      Exp: {formatItemDate(item.expDate, false)}
                    </span>
                  )}
                </div>
              )}
            </td>
            <td 
              className="print-price-col text-right align-bottom p-0 whitespace-nowrap"
              style={{ textAlign: 'right', verticalAlign: 'bottom', padding: 0, whiteSpace: 'nowrap' }}
            >
              {showPrice && (
                <span 
                  style={{ fontSize: `${Math.max(8.5, widthPx * 0.052)}px` }} 
                  className="print-price-text text-xs font-black text-black leading-none select-none"
                >
                  ₹{Number(item.price || 0).toFixed(2)}
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Dynamic Print-Media Style Overrides */}
      <style>{`
        @media print {
          @page {
            size: ${is2Up ? (activePreset.widthMm * 2 + gapMm) : activePreset.widthMm}mm ${activePreset.heightMm}mm !important;
            margin: 0 !important;
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
          .print-row-2up {
            width: ${is2Up ? (activePreset.widthMm * 2 + gapMm) : activePreset.widthMm}mm !important;
            height: ${activePreset.heightMm}mm !important;
            max-width: ${is2Up ? (activePreset.widthMm * 2 + gapMm) : activePreset.widthMm}mm !important;
            max-height: ${activePreset.heightMm}mm !important;
            margin: 0 !important;
            padding: 0 !important;
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            align-items: center !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: always !important;
            break-after: page !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            background: white !important;
          }
          .print-single-label {
            margin: 0 !important;
            padding: 1.2mm 1.5mm 0.8mm 1.5mm !important;
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
            width: ${activePreset.widthMm}mm !important;
            height: ${activePreset.heightMm}mm !important;
            max-width: ${activePreset.widthMm}mm !important;
            max-height: ${activePreset.heightMm}mm !important;
            overflow: hidden !important;
            ${!is2Up ? 'page-break-inside: avoid !important; break-after: page !important; page-break-after: always !important;' : ''}
          }
          .print-empty-slot {
            visibility: hidden !important;
            opacity: 0 !important;
          }
          .print-header-text {
            font-size: 7pt !important;
            line-height: 1.15 !important;
            font-weight: 800 !important;
            text-transform: uppercase !important;
            color: black !important;
            margin: 0 0 0.3mm 0 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            max-width: 98% !important;
            display: block !important;
          }
          .print-title-text {
            font-size: 8.5pt !important;
            line-height: 1.15 !important;
            font-weight: 900 !important;
            color: black !important;
            margin: 0 0 0.4mm 0 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            max-width: 98% !important;
            display: block !important;
          }
          .print-barcode-container {
            width: 88% !important;
            margin: 0.4mm auto !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
          }
          .print-barcode-container svg {
            display: block !important;
            margin: 0 auto !important;
            width: 100% !important;
            height: 5.5mm !important;
            max-height: 6mm !important;
          }
          .print-value-text {
            font-size: 6.5pt !important;
            letter-spacing: 0.8px !important;
            font-weight: 800 !important;
            color: black !important;
            margin: 0.2mm 0 0 0 !important;
            line-height: 1.1 !important;
            text-transform: uppercase !important;
            display: block !important;
          }
          .print-bottom-row {
            width: 96% !important;
            margin-top: auto !important;
            border: 0 !important;
            border-collapse: collapse !important;
            padding: 0 !important;
          }
          .print-date-col {
            text-align: left !important;
            vertical-align: bottom !important;
            padding: 0 !important;
            line-height: 1.1 !important;
          }
          .print-date-text {
            font-size: 6.5pt !important;
            font-weight: 700 !important;
            line-height: 1.1 !important;
            color: black !important;
            white-space: nowrap !important;
            display: block !important;
          }
          .print-price-col {
            text-align: right !important;
            vertical-align: bottom !important;
            padding: 0 !important;
            white-space: nowrap !important;
          }
          .print-price-text {
            font-size: 11pt !important;
            font-weight: 900 !important;
            color: black !important;
            margin: 0 !important;
            line-height: 1 !important;
            white-space: nowrap !important;
          }
        }
      `}</style>

      {/* Master Print zone (Rendered offscreen for DOM capture & direct print) */}
      <div 
        id="barcode-label-print-zone-container" 
        style={{ position: 'fixed', left: '-9999px', top: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}
      >
        {is2Up ? (
          /* 2-UP TWIN ROLL: Pairs of 2 labels across */
          labelPairs2Up.map(([leftItem, rightItem], pairIdx) => (
            <div 
              key={`pair-${pairIdx}`}
              className="print-row-2up"
              style={{
                width: `${activePreset.widthMm * 2 + gapMm}mm`,
                height: `${activePreset.heightMm}mm`,
                maxWidth: `${activePreset.widthMm * 2 + gapMm}mm`,
                maxHeight: `${activePreset.heightMm}mm`,
                margin: 0,
                padding: 0,
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#ffffff',
                overflow: 'hidden'
              }}
            >
              
              <div 
                key={`left-${pairIdx}`} 
                className="print-single-label"
                style={{
                  width: `${activePreset.widthMm}mm`,
                  height: `${activePreset.heightMm}mm`,
                  maxWidth: `${activePreset.widthMm}mm`,
                  maxHeight: `${activePreset.heightMm}mm`,
                  padding: '1.2mm 1.5mm 0.8mm 1.5mm',
                  margin: 0,
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  textAlign: 'center',
                  overflow: 'hidden',
                  background: '#ffffff',
                  color: '#000000',
                }}
              >
                {/* Header */}
                {showStoreHeader && storeHeader && (
                  <span 
                    className="print-header-text"
                    style={{
                      fontSize: '7pt',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      lineHeight: 1.15,
                      margin: '0 0 0.3mm 0',
                      maxWidth: '98%',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: '#000000',
                      display: 'block'
                    }}
                  >
                    {storeHeader}
                  </span>
                )}

                {/* Product Name */}
                {showItemName && (
                  <span 
                    className="print-title-text"
                    style={{
                      fontSize: '8.5pt',
                      fontWeight: 900,
                      lineHeight: 1.15,
                      margin: '0 0 0.4mm 0',
                      maxWidth: '98%',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: '#000000',
                      display: 'block'
                    }}
                  >
                    {leftItem.name || 'STORE PRODUCT'}
                  </span>
                )}

                {/* Graphic */}
                <div 
                  className="print-barcode-container"
                  style={{
                    width: '88%',
                    margin: '0.4mm auto',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  {barcodeType === 'qr' ? (
                    <QRCodeSVG 
                      value={leftItem.barcode || '000000'}
                      size={Math.min(activePreset.heightPx * 0.32, 50)}
                      level="M"
                      includeMargin={false}
                    />
                  ) : (
                    <div className="w-full">
                      <BarcodeSVG 
                        value={leftItem.barcode} 
                        width={activePreset.widthPx * 0.8}
                        height={18}
                      />
                    </div>
                  )}
                </div>

                {/* Readability value */}
                {showBarcodeText && barcodeType === '1d' && leftItem.barcode && (
                  <span 
                    className="print-value-text"
                    style={{
                      fontSize: '6.5pt',
                      fontWeight: 800,
                      letterSpacing: '0.8px',
                      lineHeight: 1.1,
                      margin: '0.2mm 0 0 0',
                      color: '#000000',
                      textTransform: 'uppercase',
                      display: 'block'
                    }}
                  >
                    {leftItem.barcode}
                  </span>
                )}

                {/* Bottom Row: 2-Column Table (Date Left, Price Right) */}
                <table 
                  className="print-bottom-row"
                  style={{
                    width: '96%',
                    marginTop: 'auto',
                    border: 0,
                    borderCollapse: 'collapse',
                    padding: 0
                  }}
                >
                  <tbody>
                    <tr>
                      <td 
                        className="print-date-col"
                        style={{
                          textAlign: 'left',
                          verticalAlign: 'bottom',
                          padding: 0,
                          lineHeight: 1.1
                        }}
                      >
                        {((showMfgDate && (leftItem.includeMfgDate ?? true) && leftItem.mfgDate) || 
                          (showBestBefore && (leftItem.includeBestBefore ?? true) && leftItem.bestBeforeDays) || 
                          (showExpDate && (leftItem.includeExpDate ?? true) && leftItem.expDate)) && (
                          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', lineHeight: 1.1 }}>
                            {showMfgDate && (leftItem.includeMfgDate ?? true) && leftItem.mfgDate && (
                              <span 
                                className="print-date-text"
                                style={{
                                  fontSize: '6.5pt',
                                  fontWeight: 700,
                                  color: '#000000',
                                  whiteSpace: 'nowrap',
                                  lineHeight: 1.1
                                }}
                              >
                                Mfg: {formatItemDate(leftItem.mfgDate, Boolean(showBestBefore && (leftItem.includeBestBefore ?? true) && leftItem.bestBeforeDays))}
                              </span>
                            )}
                            {showBestBefore && (leftItem.includeBestBefore ?? true) && leftItem.bestBeforeDays && (
                              <span 
                                className="print-date-text"
                                style={{
                                  fontSize: '6.5pt',
                                  fontWeight: 700,
                                  color: '#000000',
                                  whiteSpace: 'nowrap',
                                  lineHeight: 1.1
                                }}
                              >
                                BB: {leftItem.bestBeforeDays}d {leftItem.expDate ? `(${formatItemDate(leftItem.expDate, true)})` : ''}
                              </span>
                            )}
                            {showExpDate && (leftItem.includeExpDate ?? true) && leftItem.expDate && !leftItem.bestBeforeDays && (
                              <span 
                                className="print-date-text"
                                style={{
                                  fontSize: '6.5pt',
                                  fontWeight: 700,
                                  color: '#000000',
                                  whiteSpace: 'nowrap',
                                  lineHeight: 1.1
                                }}
                              >
                                Exp: {formatItemDate(leftItem.expDate, false)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td 
                        className="print-price-col"
                        style={{
                          textAlign: 'right',
                          verticalAlign: 'bottom',
                          padding: 0,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {showPrice && (
                          <span 
                            className="print-price-text"
                            style={{
                              fontSize: '11pt',
                              fontWeight: 900,
                              color: '#000000',
                              lineHeight: 1,
                              margin: 0,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            ₹{Number(leftItem.price || 0).toFixed(2)}
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {rightItem ? (
                
              <div 
                key={`right-${pairIdx}`} 
                className="print-single-label"
                style={{
                  width: `${activePreset.widthMm}mm`,
                  height: `${activePreset.heightMm}mm`,
                  maxWidth: `${activePreset.widthMm}mm`,
                  maxHeight: `${activePreset.heightMm}mm`,
                  padding: '1.2mm 1.5mm 0.8mm 1.5mm',
                  margin: 0,
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  textAlign: 'center',
                  overflow: 'hidden',
                  background: '#ffffff',
                  color: '#000000',
                }}
              >
                {/* Header */}
                {showStoreHeader && storeHeader && (
                  <span 
                    className="print-header-text"
                    style={{
                      fontSize: '7pt',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      lineHeight: 1.15,
                      margin: '0 0 0.3mm 0',
                      maxWidth: '98%',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: '#000000',
                      display: 'block'
                    }}
                  >
                    {storeHeader}
                  </span>
                )}

                {/* Product Name */}
                {showItemName && (
                  <span 
                    className="print-title-text"
                    style={{
                      fontSize: '8.5pt',
                      fontWeight: 900,
                      lineHeight: 1.15,
                      margin: '0 0 0.4mm 0',
                      maxWidth: '98%',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: '#000000',
                      display: 'block'
                    }}
                  >
                    {rightItem.name || 'STORE PRODUCT'}
                  </span>
                )}

                {/* Graphic */}
                <div 
                  className="print-barcode-container"
                  style={{
                    width: '88%',
                    margin: '0.4mm auto',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  {barcodeType === 'qr' ? (
                    <QRCodeSVG 
                      value={rightItem.barcode || '000000'}
                      size={Math.min(activePreset.heightPx * 0.32, 50)}
                      level="M"
                      includeMargin={false}
                    />
                  ) : (
                    <div className="w-full">
                      <BarcodeSVG 
                        value={rightItem.barcode} 
                        width={activePreset.widthPx * 0.8}
                        height={18}
                      />
                    </div>
                  )}
                </div>

                {/* Readability value */}
                {showBarcodeText && barcodeType === '1d' && rightItem.barcode && (
                  <span 
                    className="print-value-text"
                    style={{
                      fontSize: '6.5pt',
                      fontWeight: 800,
                      letterSpacing: '0.8px',
                      lineHeight: 1.1,
                      margin: '0.2mm 0 0 0',
                      color: '#000000',
                      textTransform: 'uppercase',
                      display: 'block'
                    }}
                  >
                    {rightItem.barcode}
                  </span>
                )}

                {/* Bottom Row: 2-Column Table (Date Left, Price Right) */}
                <table 
                  className="print-bottom-row"
                  style={{
                    width: '96%',
                    marginTop: 'auto',
                    border: 0,
                    borderCollapse: 'collapse',
                    padding: 0
                  }}
                >
                  <tbody>
                    <tr>
                      <td 
                        className="print-date-col"
                        style={{
                          textAlign: 'left',
                          verticalAlign: 'bottom',
                          padding: 0,
                          lineHeight: 1.1
                        }}
                      >
                        {((showMfgDate && (rightItem.includeMfgDate ?? true) && rightItem.mfgDate) || 
                          (showBestBefore && (rightItem.includeBestBefore ?? true) && rightItem.bestBeforeDays) || 
                          (showExpDate && (rightItem.includeExpDate ?? true) && rightItem.expDate)) && (
                          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', lineHeight: 1.1 }}>
                            {showMfgDate && (rightItem.includeMfgDate ?? true) && rightItem.mfgDate && (
                              <span 
                                className="print-date-text"
                                style={{
                                  fontSize: '6.5pt',
                                  fontWeight: 700,
                                  color: '#000000',
                                  whiteSpace: 'nowrap',
                                  lineHeight: 1.1
                                }}
                              >
                                Mfg: {formatItemDate(rightItem.mfgDate, Boolean(showBestBefore && (rightItem.includeBestBefore ?? true) && rightItem.bestBeforeDays))}
                              </span>
                            )}
                            {showBestBefore && (rightItem.includeBestBefore ?? true) && rightItem.bestBeforeDays && (
                              <span 
                                className="print-date-text"
                                style={{
                                  fontSize: '6.5pt',
                                  fontWeight: 700,
                                  color: '#000000',
                                  whiteSpace: 'nowrap',
                                  lineHeight: 1.1
                                }}
                              >
                                BB: {rightItem.bestBeforeDays}d {rightItem.expDate ? `(${formatItemDate(rightItem.expDate, true)})` : ''}
                              </span>
                            )}
                            {showExpDate && (rightItem.includeExpDate ?? true) && rightItem.expDate && !rightItem.bestBeforeDays && (
                              <span 
                                className="print-date-text"
                                style={{
                                  fontSize: '6.5pt',
                                  fontWeight: 700,
                                  color: '#000000',
                                  whiteSpace: 'nowrap',
                                  lineHeight: 1.1
                                }}
                              >
                                Exp: {formatItemDate(rightItem.expDate, false)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td 
                        className="print-price-col"
                        style={{
                          textAlign: 'right',
                          verticalAlign: 'bottom',
                          padding: 0,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {showPrice && (
                          <span 
                            className="print-price-text"
                            style={{
                              fontSize: '11pt',
                              fontWeight: 900,
                              color: '#000000',
                              lineHeight: 1,
                              margin: 0,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            ₹{Number(rightItem.price || 0).toFixed(2)}
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              ) : (
                <div 
                  className="print-single-label print-empty-slot"
                  style={{
                    width: `${activePreset.widthMm}mm`,
                    height: `${activePreset.heightMm}mm`,
                    visibility: 'hidden',
                    opacity: 0
                  }}
                />
              )}
            </div>
          ))
        ) : (
          /* 1-UP SINGLE ROLL: 1 label per page */
          flattenedLabels.map((item, idx) => (
            
              <div 
                key={`single-${idx}`} 
                className="print-single-label"
                style={{
                  width: `${activePreset.widthMm}mm`,
                  height: `${activePreset.heightMm}mm`,
                  maxWidth: `${activePreset.widthMm}mm`,
                  maxHeight: `${activePreset.heightMm}mm`,
                  padding: '1.2mm 1.5mm 0.8mm 1.5mm',
                  margin: 0,
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  textAlign: 'center',
                  overflow: 'hidden',
                  background: '#ffffff',
                  color: '#000000',
                }}
              >
                {/* Header */}
                {showStoreHeader && storeHeader && (
                  <span 
                    className="print-header-text"
                    style={{
                      fontSize: '7pt',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      lineHeight: 1.15,
                      margin: '0 0 0.3mm 0',
                      maxWidth: '98%',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: '#000000',
                      display: 'block'
                    }}
                  >
                    {storeHeader}
                  </span>
                )}

                {/* Product Name */}
                {showItemName && (
                  <span 
                    className="print-title-text"
                    style={{
                      fontSize: '8.5pt',
                      fontWeight: 900,
                      lineHeight: 1.15,
                      margin: '0 0 0.4mm 0',
                      maxWidth: '98%',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: '#000000',
                      display: 'block'
                    }}
                  >
                    {item.name || 'STORE PRODUCT'}
                  </span>
                )}

                {/* Graphic */}
                <div 
                  className="print-barcode-container"
                  style={{
                    width: '88%',
                    margin: '0.4mm auto',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  {barcodeType === 'qr' ? (
                    <QRCodeSVG 
                      value={item.barcode || '000000'}
                      size={Math.min(activePreset.heightPx * 0.32, 50)}
                      level="M"
                      includeMargin={false}
                    />
                  ) : (
                    <div className="w-full">
                      <BarcodeSVG 
                        value={item.barcode} 
                        width={activePreset.widthPx * 0.8}
                        height={18}
                      />
                    </div>
                  )}
                </div>

                {/* Readability value */}
                {showBarcodeText && barcodeType === '1d' && item.barcode && (
                  <span 
                    className="print-value-text"
                    style={{
                      fontSize: '6.5pt',
                      fontWeight: 800,
                      letterSpacing: '0.8px',
                      lineHeight: 1.1,
                      margin: '0.2mm 0 0 0',
                      color: '#000000',
                      textTransform: 'uppercase',
                      display: 'block'
                    }}
                  >
                    {item.barcode}
                  </span>
                )}

                {/* Bottom Row: 2-Column Table (Date Left, Price Right) */}
                <table 
                  className="print-bottom-row"
                  style={{
                    width: '96%',
                    marginTop: 'auto',
                    border: 0,
                    borderCollapse: 'collapse',
                    padding: 0
                  }}
                >
                  <tbody>
                    <tr>
                      <td 
                        className="print-date-col"
                        style={{
                          textAlign: 'left',
                          verticalAlign: 'bottom',
                          padding: 0,
                          lineHeight: 1.1
                        }}
                      >
                        {((showMfgDate && (item.includeMfgDate ?? true) && item.mfgDate) || 
                          (showBestBefore && (item.includeBestBefore ?? true) && item.bestBeforeDays) || 
                          (showExpDate && (item.includeExpDate ?? true) && item.expDate)) && (
                          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', lineHeight: 1.1 }}>
                            {showMfgDate && (item.includeMfgDate ?? true) && item.mfgDate && (
                              <span 
                                className="print-date-text"
                                style={{
                                  fontSize: '6.5pt',
                                  fontWeight: 700,
                                  color: '#000000',
                                  whiteSpace: 'nowrap',
                                  lineHeight: 1.1
                                }}
                              >
                                Mfg: {formatItemDate(item.mfgDate, Boolean(showBestBefore && (item.includeBestBefore ?? true) && item.bestBeforeDays))}
                              </span>
                            )}
                            {showBestBefore && (item.includeBestBefore ?? true) && item.bestBeforeDays && (
                              <span 
                                className="print-date-text"
                                style={{
                                  fontSize: '6.5pt',
                                  fontWeight: 700,
                                  color: '#000000',
                                  whiteSpace: 'nowrap',
                                  lineHeight: 1.1
                                }}
                              >
                                BB: {item.bestBeforeDays}d {item.expDate ? `(${formatItemDate(item.expDate, true)})` : ''}
                              </span>
                            )}
                            {showExpDate && (item.includeExpDate ?? true) && item.expDate && !item.bestBeforeDays && (
                              <span 
                                className="print-date-text"
                                style={{
                                  fontSize: '6.5pt',
                                  fontWeight: 700,
                                  color: '#000000',
                                  whiteSpace: 'nowrap',
                                  lineHeight: 1.1
                                }}
                              >
                                Exp: {formatItemDate(item.expDate, false)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td 
                        className="print-price-col"
                        style={{
                          textAlign: 'right',
                          verticalAlign: 'bottom',
                          padding: 0,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {showPrice && (
                          <span 
                            className="print-price-text"
                            style={{
                              fontSize: '11pt',
                              fontWeight: 900,
                              color: '#000000',
                              lineHeight: 1,
                              margin: 0,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            ₹{Number(item.price || 0).toFixed(2)}
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
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
          <button
            type="button"
            onClick={() => setActiveSettingsTab('sequential_barcode')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${activeSettingsTab === 'sequential_barcode' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/10' : 'text-text-muted hover:text-text-primary'}`}
          >
            <Barcode size={13} /> Auto-Barcode Sequence (0001)
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
                          onClick={() => handleOpenAddItemModal(item)}
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
                          {((item.includeMfgDate && item.mfgDate) || (item.includeBestBefore && item.bestBeforeDays) || (item.includeExpDate && item.expDate)) && (
                            <div className="flex flex-wrap items-center gap-1.5 px-2 pt-0.5">
                              {item.includeMfgDate && item.mfgDate && (
                                <span className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-mono font-bold">
                                  Mfg: {formatItemDate(item.mfgDate, Boolean(item.includeBestBefore && item.bestBeforeDays))}
                                </span>
                              )}
                              {item.includeBestBefore && item.bestBeforeDays && (
                                <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono font-bold">
                                  BB: {item.bestBeforeDays}d
                                </span>
                              )}
                              {item.includeExpDate && item.expDate && !item.bestBeforeDays && (
                                <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono font-bold">
                                  Exp: {formatItemDate(item.expDate, false)}
                                </span>
                              )}
                            </div>
                          )}
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
                          onClick={() => handleOpenEditItemModal(item)}
                          className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30 flex items-center justify-center transition-all shadow-sm"
                          title="Edit dates, best before & label configuration"
                        >
                          <Edit2 size={13} />
                        </button>

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

              {/* 1-Up Single vs 2-Up Twin Roll Layout Switcher */}
              <div className="pt-3 border-t border-border/30 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-text-muted uppercase flex items-center gap-1.5">
                    <Layers size={13} className="text-blue-400" />
                    Roll Column Layout (1-Up vs 2-Up)
                  </label>
                  <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">
                    {is2Up ? `2-Up (${activePreset.widthMm * 2 + gapMm}mm Web Width)` : `1-Up (${activePreset.widthMm}mm Web Width)`}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 h-10">
                  <button
                    type="button"
                    onClick={() => {
                      setIs2Up(false);
                      try { localStorage.setItem('barcode_is_2up', 'false'); } catch {}
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border text-xs font-black uppercase transition-all ${!is2Up ? 'border-blue-500/50 bg-blue-500/10 text-blue-400 shadow-sm' : 'border-border/50 text-text-muted hover:text-text-primary bg-bg-tertiary/40'}`}
                  >
                    <Tag size={14} /> 1-Up (Single Roll)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIs2Up(true);
                      try { localStorage.setItem('barcode_is_2up', 'true'); } catch {}
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border text-xs font-black uppercase transition-all ${is2Up ? 'border-blue-500/50 bg-blue-500/10 text-blue-400 shadow-sm' : 'border-border/50 text-text-muted hover:text-text-primary bg-bg-tertiary/40'}`}
                  >
                    <Layers size={14} /> 2-Up (Twin Roll / 2 Across)
                  </button>
                </div>

                {is2Up && (
                  <div className="flex items-center justify-between px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs animate-in fade-in duration-150">
                    <span className="text-text-muted font-bold">Gap Between Twin Labels:</span>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4].map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => {
                            setGapMm(g);
                            try { localStorage.setItem('barcode_2up_gap', String(g)); } catch {}
                          }}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${gapMm === g ? 'bg-blue-600 text-white shadow-sm' : 'bg-bg-secondary text-text-muted hover:text-text-primary border border-border/40'}`}
                        >
                          {g}mm
                        </button>
                      ))}
                      <span className="text-[10px] text-blue-300 font-mono font-bold ml-1">
                        (= {activePreset.widthMm * 2 + gapMm}mm total web)
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Company / Store Header Input */}
              <div className="pt-3 border-t border-border/30 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-text-muted uppercase flex items-center gap-1.5">
                    <Store size={13} className="text-blue-400" />
                    Label Company / Store Header
                  </label>
                  <button
                    type="button"
                    onClick={handleSyncCompanyName}
                    className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 uppercase tracking-wider transition-colors"
                    title="Reset to registered company name from settings"
                  >
                    <RefreshCw size={10} /> Reset from Settings ({effectiveCompanyName})
                  </button>
                </div>
                <input
                  type="text"
                  value={storeHeader}
                  onChange={(e) => handleUpdateStoreHeader(e.target.value)}
                  placeholder={effectiveCompanyName || 'AMORA'}
                  className="glass-input h-10 text-xs font-bold uppercase tracking-wide w-full"
                />
              </div>

              <div className="pt-3 border-t border-border/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
                    Label Display Elements (ON / OFF)
                  </span>
                  <span className="text-[10px] text-blue-400 font-mono font-bold">50 x 25 mm format</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {[
                    { state: showStoreHeader, set: setShowStoreHeader, label: 'Store Header' },
                    { state: showItemName, set: setShowItemName, label: 'Item Name' },
                    { state: showBarcodeText, set: setShowBarcodeText, label: 'Barcode Text' },
                    { state: showPrice, set: setShowPrice, label: 'Price (₹)' },
                    { 
                      state: showMfgDate, 
                      set: (v: boolean) => {
                        setShowMfgDate(v);
                        try { localStorage.setItem('barcode_show_mfg', String(v)); } catch {}
                      }, 
                      label: 'Mfg Date' 
                    },
                    { 
                      state: showBestBefore, 
                      set: (v: boolean) => {
                        setShowBestBefore(v);
                        try { localStorage.setItem('barcode_show_bb', String(v)); } catch {}
                      }, 
                      label: 'Best Before' 
                    },
                    { 
                      state: showExpDate, 
                      set: (v: boolean) => {
                        setShowExpDate(v);
                        try { localStorage.setItem('barcode_show_exp', String(v)); } catch {}
                      }, 
                      label: 'Expiry Date' 
                    }
                  ].map((ctrl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => ctrl.set(!ctrl.state)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-all ${
                        ctrl.state 
                          ? 'bg-blue-500/10 border-blue-500/40 text-blue-400 font-bold shadow-sm' 
                          : 'bg-bg-tertiary/70 border-border/40 text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      <span className="truncate">{ctrl.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-black tracking-wider uppercase ${
                        ctrl.state ? 'bg-blue-500 text-white' : 'bg-bg-secondary text-text-muted border border-border/30'
                      }`}>
                        {ctrl.state ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </Card>

          </div>

          {/* SIDE LIVE PRINT PREVIEWS */}
          <div className="xl:col-span-5 flex flex-col gap-5">
            <Card className="flex-1 bg-[#121424]/50 border border-border/40 p-5 flex flex-col justify-between min-h-[400px]">
              <div className="w-full flex items-center justify-between border-b border-border/30 pb-3 mb-4 shrink-0">
                <span className="text-xs font-bold uppercase text-text-muted tracking-wider">Live Printed Batch Previews</span>
                <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded font-black tracking-wider uppercase">
                  {is2Up ? `2-Up (${activePreset.widthMm * 2 + gapMm}x${activePreset.heightMm} mm)` : `1-Up (${activePreset.widthMm}x${activePreset.heightMm} mm)`}
                </span>
              </div>

              <div className="flex-1 w-full overflow-y-auto max-h-[380px] custom-scrollbar pr-2 py-2 flex flex-col gap-4 items-center justify-start min-h-[250px]">
                {batchItems.length === 0 ? (
                  <div className="m-auto text-center p-4">
                    <Printer className="w-10 h-10 text-text-muted opacity-25 mx-auto mb-2 animate-pulse" />
                    <p className="text-xs text-text-muted font-bold">Previews appear here when items are added.</p>
                  </div>
                ) : is2Up ? (
                  /* 2-UP TWIN ROLL PREVIEW: EXACT 1 ROW WITH 2 LABELS SIDE BY SIDE */
                  labelPairs2Up.map(([leftItem, rightItem], pairIdx) => (
                    <div key={`pair-preview-${pairIdx}`} className="w-full flex flex-col items-center gap-1.5 border-b border-border/20 last:border-b-0 pb-4 last:pb-0">
                      <div className="w-full flex justify-between px-2 text-[9px] font-bold text-text-muted uppercase">
                        <span className="text-blue-400 font-mono font-bold">Row #{pairIdx + 1} (Twin Roll: 2 Labels in 1 Row)</span>
                        <span className="text-emerald-400 font-black">2 Across</span>
                      </div>
                      
                      {/* One Horizontal Row with 2 Labels Side by Side */}
                      <div className="w-full overflow-x-auto flex justify-center items-center gap-2 py-1 scrollbar-none bg-[#0a0c16]/50 p-2 rounded-xl border border-blue-500/20 shadow-inner">
                        {/* Left Label in Row */}
                        <div className="flex flex-col items-center">
                          <span className="text-[8px] font-bold text-blue-400 uppercase mb-1">Left Label</span>
                          {renderPreviewCard(leftItem, 160, 95)}
                        </div>

                        {/* Gap Line between twin labels */}
                        <div className="w-1.5 h-20 bg-blue-500/25 border-l border-r border-blue-500/40 rounded-full flex items-center justify-center" title="Twin roll gap" />

                        {/* Right Label in Row */}
                        <div className="flex flex-col items-center">
                          <span className="text-[8px] font-bold text-blue-400 uppercase mb-1">Right Label</span>
                          {rightItem ? (
                            renderPreviewCard(rightItem, 160, 95)
                          ) : (
                            <div 
                              style={{ width: '160px', height: '95px' }}
                              className="border-2 border-dashed border-border/40 rounded-lg flex flex-col items-center justify-center p-2 text-center bg-bg-tertiary/20 text-text-muted select-none"
                            >
                              <span className="text-[9px] font-bold uppercase tracking-wider text-text-muted">Blank Sticker</span>
                              <span className="text-[8px] opacity-60 mt-0.5">(Odd count - left only)</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  /* 1-UP SINGLE ROLL PREVIEW: 1 LABEL PER ROW */
                  batchItems.map((item) => (
                    <div key={item.id} className="w-full flex flex-col items-center gap-1.5 border-b border-border/20 last:border-b-0 pb-4 last:pb-0">
                      <div className="w-full flex justify-between px-2 text-[9px] font-bold text-text-muted uppercase">
                        <span className="truncate max-w-[65%]">{item.name}</span>
                        <span className="text-blue-400 shrink-0">{item.quantity} Copies</span>
                      </div>
                      
                      <div className="w-full overflow-x-auto flex justify-center py-1 scrollbar-none">
                        {renderPreviewCard(item, activePreset.widthPx, activePreset.heightPx)}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="w-full pt-4 border-t border-border/30 mt-4 shrink-0 space-y-3">
                {availablePrinters.length > 0 && (
                  <div className="flex flex-col gap-1.5 bg-bg-tertiary/40 p-2.5 rounded-xl border border-border/40">
                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><Printer className="w-3.5 h-3.5 text-blue-400" /> Target Printer</span>
                      <span className="text-[10px] text-blue-400 font-mono font-bold truncate max-w-[140px]">{selectedPrinter || 'System Default'}</span>
                    </label>
                    <select
                      value={selectedPrinter}
                      onChange={(e) => {
                        setSelectedPrinter(e.target.value);
                        localStorage.setItem('label_printer_name', e.target.value);
                      }}
                      className="glass-input h-9 text-xs font-semibold bg-bg-secondary text-text-primary rounded-lg px-2 border border-border/50 focus:ring-1 focus:ring-blue-500/50"
                    >
                      <option value="">System Default Printer</option>
                      {availablePrinters.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.displayName || p.name} {p.isDefault ? '(Default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <Button 
                  className="w-full shadow-glow-sm bg-gradient-primary text-white font-black tracking-wider h-11" 
                  icon={<Printer className="w-4 h-4" />}
                  onClick={handlePrint}
                  disabled={batchItems.length === 0 || isPrinting}
                >
                  {isPrinting ? 'Sending to Printer...' : `Send Batch to Thermal Printer (${totalLabelsToPrint} Labels)`}
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
      ) : activeSettingsTab === 'cash_drawer' ? (
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
      ) : (
        /* TAB 4: SEQUENTIAL AUTO-BARCODE CONFIG & 0001 RESET */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
          
          {/* CONFIGURATION PANEL (7 Columns) */}
          <div className="lg:col-span-7 space-y-6">
            <Card className="bg-[#121424]/50 border border-border/40 p-5 space-y-5">
              <div className="flex items-center gap-2 text-blue-400">
                <Barcode className="w-5 h-5 shrink-0" />
                <h3 className="text-sm font-black uppercase tracking-wider">Sequential Auto-Barcode Settings</h3>
              </div>

              <p className="text-xs text-text-muted leading-relaxed">
                When you add new products or bakery items without a manufacturer barcode, the POS automatically assigns sequential barcodes like <span className="text-blue-400 font-mono font-bold">00001, 00002, 00003...</span>
                Manufacturer barcodes (e.g. 8-digit and 13-digit retail items like Coke, Kinley, Roshen) are strictly isolated so they never distort your store numbers.
              </p>

              {/* Digits length selector */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-bold text-text-muted uppercase">Barcode Digit Length Format</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { digits: 4, sample: '0001' },
                    { digits: 5, sample: '00001 (Standard)' },
                    { digits: 6, sample: '000001' }
                  ].map((opt) => (
                    <button
                      key={opt.digits}
                      type="button"
                      onClick={() => setSeqDigits(opt.digits)}
                      className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
                        seqDigits === opt.digits
                          ? 'border-blue-500 bg-blue-500/10 text-blue-400 shadow-md shadow-blue-500/5'
                          : 'border-border/50 bg-[#161824]/60 text-text-muted hover:text-text-primary'
                      }`}
                    >
                      <span className="text-xs font-black">{opt.digits} Digits</span>
                      <span className="text-[10px] font-mono mt-0.5 opacity-80">{opt.sample}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Starting Sequence Number & Reset */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-bold text-text-muted uppercase">Next Starting Sequence Number</label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="number"
                    min="1"
                    max="99999"
                    value={seqCustomStart}
                    onChange={(e) => setSeqCustomStart(e.target.value)}
                    className="glass-input h-11 w-full sm:w-36 text-center font-mono font-black text-base tracking-widest text-blue-400 focus:ring-1 focus:ring-blue-500/50"
                    placeholder="1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleResetTo0001}
                    className="h-11 px-4 text-xs font-black uppercase tracking-wider bg-[#1f223f] hover:bg-[#2b3058] text-white border border-border/50 shrink-0"
                  >
                    🔄 Reset to 1 ({String(1).padStart(seqDigits, '0')})
                  </Button>
                </div>
                <span className="text-[11px] text-text-muted block">
                  Click <strong>Reset to 1</strong> if you want your next newly created item to start from <span className="text-blue-400 font-mono font-bold">{String(1).padStart(seqDigits, '0')}</span>.
                </span>
              </div>

              {/* Save & Apply Button */}
              <div className="pt-4 border-t border-border/30">
                <Button
                  type="button"
                  onClick={handleSaveSequenceConfig}
                  className="w-full h-11 text-xs font-black uppercase tracking-wider shadow-glow-sm bg-gradient-primary text-white"
                >
                  💾 Save & Apply Sequence Settings
                </Button>
              </div>
            </Card>
          </div>

          {/* PREVIEW & EXPLANATION PANEL (5 Columns) */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="bg-[#121424]/50 border border-border/40 p-5 space-y-4">
              <div className="flex items-center gap-2 text-purple-400">
                <Sparkles className="w-5 h-5 shrink-0" />
                <h3 className="text-sm font-black uppercase tracking-wider">Live Next Barcode Preview</h3>
              </div>

              <div className="p-4 bg-white rounded-xl flex flex-col items-center justify-center space-y-2 text-center shadow-inner">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-800">AMORA BAKES</span>
                <span className="text-xs font-black text-black">NEXT NEW PRODUCT</span>
                <div className="w-[90%] my-1 flex justify-center">
                  <BarcodeSVG value={liveSeqPreview} width={200} height={40} />
                </div>
                <span className="text-[10px] font-mono font-black text-slate-700 tracking-widest uppercase">
                  {liveSeqPreview}
                </span>
                <span className="text-sm font-black text-black leading-none">₹0.00</span>
              </div>

              <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-1.5 text-xs">
                <span className="text-blue-400 font-bold block uppercase text-[10px]">✅ Why 9**** occurred & How it is fixed:</span>
                <p className="text-text-muted text-[11px] leading-relaxed">
                  Some pre-seeded manufacturer products (like Dryco Health Mix Jar <code className="text-blue-300 font-mono">90311017</code>) had 8-digit EAN barcodes starting with 9. The generator previously saw that as a store sequential number and tried to create 90311018.
                </p>
                <p className="text-text-muted text-[11px] leading-relaxed">
                  We have strictly separated manufacturer barcodes from store codes. Now, your store sequence operates cleanly starting from <strong className="text-blue-400 font-mono">{liveSeqPreview}</strong>, incrementing one by one!
                </p>
              </div>
            </Card>
          </div>

        </div>
      )}
      {/* ITEM DATE & QUANTITY POP-UP MODAL */}
      <Modal 
        open={isItemModalOpen} 
        onClose={() => setIsItemModalOpen(false)} 
        title={editingLedgerId ? `Edit Print Tag: ${activeModalItem?.name || ''}` : `Configure Label: ${activeModalItem?.name || ''}`}
        size="md"
      >
        <div className="space-y-4 p-1">
          {/* Product info banner */}
          <div className="p-3 bg-[#121424] rounded-xl border border-border/40 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-black text-text-primary">{activeModalItem?.name}</h4>
              <p className="text-[11px] font-mono text-blue-400 mt-0.5">Barcode: {activeModalItem?.barcode || '000000'}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-text-muted uppercase font-bold block">Rate / Price</span>
              <span className="text-sm font-black text-white">₹{Number(activeModalItem?.price || 0).toFixed(2)}</span>
            </div>
          </div>

          {/* Form inputs */}
          <div className="space-y-3.5">
            {/* Quantity */}
            <div className="bg-[#141628] p-3 rounded-xl border border-border/40 flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-text-primary uppercase tracking-wider block">
                  Labels to Print (Quantity)
                </label>
                <p className="text-[10px] text-text-muted">Number of stickers to generate</p>
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

            {/* OPTION 1: MANUFACTURE DATE (ON / OFF) */}
            <div className={`p-3 rounded-xl border transition-all ${modalIncludeMfg ? 'bg-blue-500/5 border-blue-500/30' : 'bg-[#141628]/60 border-border/30'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Manufacture Date (Mfg)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setModalIncludeMfg(!modalIncludeMfg)}
                  className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${modalIncludeMfg ? 'bg-emerald-500 text-black shadow-md' : 'bg-bg-tertiary text-text-muted hover:text-text-primary border border-border/50'}`}
                >
                  {modalIncludeMfg ? '✓ ON (Print Mfg)' : '✕ OFF (No Mfg)'}
                </button>
              </div>

              {modalIncludeMfg ? (
                <div className="flex items-center gap-2.5 pt-1 animate-in fade-in duration-150">
                  <input 
                    type="date"
                    value={modalMfgDate}
                    onChange={(e) => {
                      setModalMfgDate(e.target.value);
                      if (modalIncludeBestBefore && modalBestBeforeDays && Number(modalBestBeforeDays) > 0) {
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
                      if (modalIncludeBestBefore && modalBestBeforeDays && Number(modalBestBeforeDays) > 0) {
                        setModalExpDate(computeExpiryFromDays(today, modalBestBeforeDays));
                      }
                    }}
                    className="px-2.5 h-9 rounded bg-bg-tertiary border border-border/50 text-[11px] font-bold text-blue-400 hover:bg-bg-hover shrink-0"
                  >
                    Today
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-text-muted italic">No manufacture date will be printed on this tag.</p>
              )}
            </div>

            {/* OPTION 2: BEST BEFORE (ON / OFF) */}
            <div className={`p-3 rounded-xl border transition-all ${modalIncludeBestBefore ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-[#141628]/60 border-border/30'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Best Before (BB Days)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setModalIncludeBestBefore(!modalIncludeBestBefore)}
                  className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${modalIncludeBestBefore ? 'bg-emerald-500 text-black shadow-md' : 'bg-bg-tertiary text-text-muted hover:text-text-primary border border-border/50'}`}
                >
                  {modalIncludeBestBefore ? '✓ ON (Print BB)' : '✕ OFF (No BB)'}
                </button>
              </div>

              {modalIncludeBestBefore ? (
                <div className="pt-1 animate-in fade-in duration-150 space-y-2">
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
                      className="glass-input w-full h-9 text-xs font-semibold pr-14"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted font-bold">Days</span>
                  </div>
                  {modalBestBeforeDays && (
                    <p className="text-[10px] text-emerald-400 font-semibold">
                      Label prints: <span className="font-mono font-bold">BB: {modalBestBeforeDays}d</span> {modalExpDate ? `(${formatItemDate(modalExpDate, true)})` : ''}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-text-muted italic">No Best Before days will be printed on this tag.</p>
              )}
            </div>

            {/* OPTION 3: EXPIRY DATE (ON / OFF) */}
            <div className={`p-3 rounded-xl border transition-all ${modalIncludeExp ? 'bg-amber-500/5 border-amber-500/30' : 'bg-[#141628]/60 border-border/30'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Expiry Date (Exp Date)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setModalIncludeExp(!modalIncludeExp)}
                  className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${modalIncludeExp ? 'bg-amber-400 text-black shadow-md' : 'bg-bg-tertiary text-text-muted hover:text-text-primary border border-border/50'}`}
                >
                  {modalIncludeExp ? '✓ ON (Print Exp)' : '✕ OFF (No Exp)'}
                </button>
              </div>

              {modalIncludeExp ? (
                <div className="pt-1 animate-in fade-in duration-150 space-y-1.5">
                  <input 
                    type="date"
                    value={modalExpDate}
                    onChange={(e) => setModalExpDate(e.target.value)}
                    className="glass-input w-full h-9 text-xs font-semibold"
                  />
                  {modalExpDate && (
                    <p className="text-[10px] text-amber-400 font-semibold">
                      Label prints: <span className="font-mono font-bold">Exp: {formatItemDate(modalExpDate, false)}</span> (Month & Year only)
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-text-muted italic">No expiry date will be printed on this tag.</p>
              )}
            </div>
          </div>

          {/* Live 50x25mm Label Preview in Modal */}
          <div className="pt-2 border-t border-border/30">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-2">
              Preview on 50 x 25 mm Label
            </span>
            <div className="p-3 bg-[#0d0f1c] rounded-xl flex justify-center items-center">
              <div 
                style={{ width: '220px', height: '110px' }}
                className="bg-white text-black rounded shadow p-2 flex flex-col items-center justify-between text-center select-none overflow-hidden"
              >
                {showStoreHeader && storeHeader && (
                  <span className="text-[9px] font-black uppercase text-slate-800 tracking-wide line-clamp-1">{storeHeader}</span>
                )}
                {showItemName && (
                  <span className="text-[10px] font-black text-black tracking-tight line-clamp-1 mt-0.5">{activeModalItem?.name}</span>
                )}
                <div className="w-[85%] my-1 flex justify-center items-center">
                  <BarcodeSVG value={activeModalItem?.barcode || '000000'} width={180} height={20} />
                </div>
                {showBarcodeText && (
                  <span className="text-[8px] font-mono font-bold tracking-widest text-slate-700 leading-none">{activeModalItem?.barcode || '000000'}</span>
                )}
                <div className="w-full mt-auto flex items-end justify-between px-1">
                  <div className="flex flex-col text-left leading-none">
                    {showMfgDate && modalIncludeMfg && modalMfgDate && (
                      <span className="text-[7px] font-bold text-slate-800">
                        Mfg: {formatItemDate(modalMfgDate, Boolean(modalIncludeBestBefore && modalBestBeforeDays))}
                      </span>
                    )}
                    {showBestBefore && modalIncludeBestBefore && modalBestBeforeDays && (
                      <span className="text-[7px] font-bold text-slate-800">
                        BB: {modalBestBeforeDays}d {modalExpDate ? `(${formatItemDate(modalExpDate, true)})` : ''}
                      </span>
                    )}
                    {showExpDate && modalIncludeExp && modalExpDate && !modalBestBeforeDays && (
                      <span className="text-[7px] font-bold text-slate-800">
                        Exp: {formatItemDate(modalExpDate, false)}
                      </span>
                    )}
                  </div>
                  {showPrice && (
                    <span className="text-xs font-black text-black leading-none ml-auto">₹{Number(activeModalItem?.price || 0).toFixed(2)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex justify-end gap-2.5 pt-3 border-t border-border/30">
            <Button variant="ghost" size="sm" onClick={() => setIsItemModalOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-500 font-bold px-6" size="sm" onClick={handleSaveModalItem}>
              {editingLedgerId ? 'Update Tag' : 'Add to Print Batch'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
