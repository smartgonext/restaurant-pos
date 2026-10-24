import toast from 'react-hot-toast';
import { soundManager } from './sounds';

export const isElectronRuntime = () => typeof window !== 'undefined' && !!window.electron;

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
 * In Electron: uses ipcRenderer silentPrint channel.
 * In browser: falls back to window.print() with onafterprint cleanup.
 */
export async function printHtmlOrFallback(html: string): Promise<void> {
  const electron = (window as any).electron || (window as any).electronAPI;

  // ── Electron silent print ──────────────────────────────────────────────────
  if (electron?.silentPrint) {
    // Electron main process handles this — sends to default printer, no dialog
    return new Promise((resolve, reject) => {
      electron.silentPrint(html, (err: any) => {
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
    const res = await window.electron!.printBill();
    if (!res?.success) throw new Error(res?.message || 'Print failed');
    return true;
  }
  window.print();
  return true;
}

export function setupElectronPrintNotifications() {
  if (!isElectronRuntime() || !window.electron?.onPrintStatus) return () => {};
  return window.electron.onPrintStatus((payload) => {
    if (payload?.success) {
      soundManager.playSuccess();
      toast.success('Printed successfully');
    } else {
      soundManager.playError();
      toast.error(payload?.message || 'Print failed');
    }
  });
}
