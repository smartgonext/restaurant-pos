import toast from 'react-hot-toast';
import { soundManager } from './sounds';
import api from './api';

export const isElectronRuntime = () => typeof window !== 'undefined' && !!(window.electron || (window as any).electronAPI);

export interface PrinterInfo {
  name: string;
  displayName?: string;
  isDefault?: boolean;
}

export interface AppPrinterSettings {
  billPrinterName: string;
  kotPrinterName: string;
  autoPrintKot: boolean;
  autoPrintBill: boolean;
}

/**
 * Read saved printer settings from localStorage with optional fallback defaults
 */
export function getPrinterSettings(globalDefaults?: any): AppPrinterSettings {
  let local: any = {};
  try {
    const raw = localStorage.getItem('printer_settings');
    if (raw) local = JSON.parse(raw);
  } catch (e) {}

  return {
    billPrinterName: local.billPrinterName ?? localStorage.getItem('bill_printer_name') ?? globalDefaults?.billPrinterName ?? '',
    kotPrinterName: local.kotPrinterName ?? localStorage.getItem('kot_printer_name') ?? globalDefaults?.kotPrinterName ?? '',
    autoPrintKot: local.autoPrintKot ?? (localStorage.getItem('auto_print_kot') !== null ? localStorage.getItem('auto_print_kot') === 'true' : (globalDefaults?.autoPrintKot ?? true)),
    autoPrintBill: local.autoPrintBill ?? (localStorage.getItem('auto_print_bill') !== null ? localStorage.getItem('auto_print_bill') === 'true' : (globalDefaults?.autoPrintBill ?? true)),
  };
}

/**
 * Save printer settings to localStorage
 */
export function savePrinterSettings(settings: Partial<AppPrinterSettings>) {
  try {
    const current = getPrinterSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem('printer_settings', JSON.stringify(updated));
    if (updated.billPrinterName !== undefined) localStorage.setItem('bill_printer_name', updated.billPrinterName);
    if (updated.kotPrinterName !== undefined) localStorage.setItem('kot_printer_name', updated.kotPrinterName);
    if (updated.autoPrintKot !== undefined) localStorage.setItem('auto_print_kot', String(updated.autoPrintKot));
    if (updated.autoPrintBill !== undefined) localStorage.setItem('auto_print_bill', String(updated.autoPrintBill));
  } catch (e) {
    console.error('Failed to save printer settings to localStorage:', e);
  }
}

/**
 * Get all available installed printers on the operating system
 */
export async function getAvailablePrinters(): Promise<PrinterInfo[]> {
  const electron = (window as any).electron || (window as any).electronAPI;
  if (electron?.getPrinters) {
    try {
      const list = await electron.getPrinters();
      if (Array.isArray(list) && list.length > 0) {
        return list.map((p: any) => ({
          name: p.name || p.displayName,
          displayName: p.displayName || p.name,
          isDefault: Boolean(p.isDefault),
        }));
      }
    } catch (e) {
      console.warn('[POS] Failed to fetch printers via Electron:', e);
    }
  }

  // Web API fallback to backend (which runs Windows PowerShell to detect printers)
  try {
    const res = await api.get('/restaurant/printers');
    if (res.data?.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
      return res.data.data;
    }
  } catch (e) {
    // ignore
  }

  return [];
}

/**
 * Opens cash drawer via Electron IPC (ESC/POS signal through printer)
 * Falls back silently if not in Electron
 */
export function openCashDrawer() {
  const electron = (window as any).electron || (window as any).electronAPI;
  
  // Read saved printer/drawer settings from localStorage
  let config = { type: 'usb', ip: '192.168.1.200', port: 9100, kickCode: [27, 112, 0, 25, 250] };
  try {
    const saved = localStorage.getItem('cash_drawer_settings');
    if (saved) {
      config = JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to parse cash drawer settings:', e);
  }

  if (electron?.openCashDrawer) {
    electron.openCashDrawer(config);
    return;
  }
  // Web fallback: log detailed config
  console.log('[POS] Cash drawer signal sent (browser mode - no-op):', config);
}

/**
 * Silent print — no dialog.
 * In Electron: uses ipcRenderer silentPrint channel with optional deviceName targeting.
 * In browser: falls back to window.print() with onafterprint cleanup.
 */
export async function printHtmlOrFallback(html: string, options?: any): Promise<void> {
  const electron = (window as any).electron || (window as any).electronAPI;

  // ── Electron silent print ──────────────────────────────────────────────────
  if (electron?.silentPrint) {
    return new Promise((resolve, reject) => {
      electron.silentPrint({ html, options }, (err: any) => {
        if (err) reject(new Error(err));
        else resolve();
      });
    });
  }

  // ── Browser fallback: hidden iframe, auto-print, auto-remove ──────────────
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) { document.body.removeChild(iframe); reject(new Error('iframe unavailable')); return; }

    doc.open();
    doc.write(html);
    doc.close();

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print(); // Browser shows dialog here — unavoidable without Electron
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch {}
        }, 2000);
      }
    };
  });
}

export async function printCurrentPageOrFallback() {
  if (isElectronRuntime()) {
    const res = await (window as any).electron!.printBill();
    if (!res?.success) throw new Error(res?.message || 'Print failed');
    return true;
  }
  window.print();
  return true;
}

export function setupElectronPrintNotifications() {
  const electron = (window as any).electron;
  if (!isElectronRuntime() || !electron?.onPrintStatus) return () => {};
  return electron.onPrintStatus((payload: any) => {
    if (payload?.success) {
      soundManager.playSuccess();
      toast.success('Printed successfully');
    } else {
      soundManager.playError();
      toast.error(payload?.message || 'Print failed');
    }
  });
}

export interface KOTPrintItem {
  name: string;
  quantity: number | string;
  unit?: string | null;
  notes?: string | null;
  modifiers?: string | null;
}

export interface KOTPrintData {
  tokenNumber?: number | string;
  orderNumber?: string | number;
  tableName?: string;
  orderType?: string;
  customerName?: string;
  customerPhone?: string;
  waiterName?: string;
  time?: string | Date;
  items: KOTPrintItem[];
}

/**
 * Print a dedicated Kitchen Order Ticket (KOT) directly to the configured KOT printer.
 * Contains ONLY KOT items with quantities and instructions (NO prices, NO retail items, NO taxes).
 */
export async function printKOTTicket(
  data: KOTPrintData,
  bakeryName = 'SMARTGONEXT Bakery',
  settings?: any
): Promise<boolean> {
  const items = (data.items || []).filter(i => Number(i.quantity) > 0);
  if (items.length === 0) {
    console.log('[KOT] No items to print for KOT ticket.');
    return false;
  }

  const pSettings = getPrinterSettings(settings);
  const targetPrinter = pSettings.kotPrinterName || undefined;

  const orderTitle = data.tokenNumber
    ? `TOKEN #${data.tokenNumber}`
    : (data.orderNumber ? `ORDER #${data.orderNumber}` : 'KITCHEN ORDER');

  const formattedTime = data.time
    ? new Date(data.time).toLocaleString('en-IN')
    : new Date().toLocaleString('en-IN');

  const itemRows = items.map((it) => {
    const qty = typeof it.quantity === 'number'
      ? (Number.isInteger(it.quantity) ? it.quantity : it.quantity.toFixed(2))
      : it.quantity;
    const unitText = it.unit ? ` ${it.unit}` : '';
    return `
      <tr style="border-bottom:1px dashed #555;">
        <td style="width:25%;vertical-align:top;font-size:16pt;font-weight:900;padding:6px 4px 6px 0;text-align:center;">
          ${qty}${unitText}
        </td>
        <td style="width:75%;vertical-align:top;font-size:13pt;font-weight:700;padding:6px 0 6px 4px;word-break:break-word;">
          ${it.name}
          ${it.modifiers ? `<div style="font-size:10pt;font-weight:normal;color:#333;margin-top:2px;">[${it.modifiers}]</div>` : ''}
          ${it.notes ? `<div style="font-size:10pt;font-weight:bold;color:#000;margin-top:2px;">Note: ${it.notes}</div>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  const totalQty = items.reduce((s, i) => s + Number(i.quantity || 0), 0);

  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"/><title>KOT Ticket</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: 'Courier New', monospace; background:#fff; color:#000; padding:8px 6px; width:80mm; font-size:11pt; }
      .center { text-align:center; }
      .bold { font-weight:700; }
      .divider { border-top:2px dashed #000; margin:6px 0; }
      .double-divider { border-top:3px double #000; margin:8px 0; }
      table { width:100%; border-collapse:collapse; margin:4px 0; }
      @media print { body { width:80mm; } }
    </style>
    </head><body>
      <div class="center">
        <div style="font-size:11pt;font-weight:700;text-transform:uppercase;">${bakeryName}</div>
        <div style="font-size:13pt;font-weight:900;letter-spacing:1px;margin-top:3px;border:2px solid #000;display:inline-block;padding:2px 8px;">KITCHEN ORDER TICKET (KOT)</div>
        <div style="font-size:18pt;font-weight:900;margin-top:6px;">${orderTitle}</div>
      </div>
      <div class="divider"></div>
      <table style="font-size:10pt;margin:2px 0;">
        <tr><td class="bold">Time:</td><td style="text-align:right;">${formattedTime}</td></tr>
        ${data.tableName ? `<tr><td class="bold">Table:</td><td style="text-align:right;font-weight:900;font-size:12pt;">${data.tableName}</td></tr>` : ''}
        ${data.orderType ? `<tr><td class="bold">Type:</td><td style="text-align:right;font-weight:700;text-transform:uppercase;">${data.orderType}</td></tr>` : ''}
        ${data.customerName ? `<tr><td class="bold">Customer:</td><td style="text-align:right;">${data.customerName}${data.customerPhone ? ' (' + data.customerPhone + ')' : ''}</td></tr>` : ''}
        ${data.waiterName ? `<tr><td class="bold">Staff:</td><td style="text-align:right;">${data.waiterName}</td></tr>` : ''}
      </table>
      <div class="divider"></div>
      <div style="font-size:11pt;font-weight:900;text-transform:uppercase;margin-bottom:4px;">ITEMS TO PREPARE:</div>
      <table>
        <thead>
          <tr style="border-bottom:2px solid #000;font-size:10pt;">
            <th style="width:25%;text-align:center;padding:2px 0;">QTY</th>
            <th style="width:75%;text-align:left;padding:2px 4px;">ITEM</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>
      <div class="divider"></div>
      <div style="font-size:11pt;font-weight:700;display:flex;justify-content:space-between;padding:2px 0;">
        <span>Total Items: ${items.length}</span>
        <span style="font-weight:900;">Total Qty: ${Number.isInteger(totalQty) ? totalQty : totalQty.toFixed(2)}</span>
      </div>
      <div class="double-divider"></div>
      <div class="center" style="font-size:9pt;font-weight:700;letter-spacing:1px;margin-top:6px;">
        *** KITCHEN COPY ONLY ***
      </div>
    </body></html>
  `;

  await printHtmlOrFallback(html, { deviceName: targetPrinter });
  console.log(`[KOT] Printed ticket to KOT printer: "${targetPrinter || 'Default'}"`);
  return true;
}
