export interface UpdaterStatusPayload {
  status: 'checking' | 'available' | 'not-available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  message?: string;
  isFastUpdate?: boolean;
}

declare global {
  interface Window {
    electronAPI?: {
      send: (channel: string, data?: any) => void;
      receive: (channel: string, func: (...args: any[]) => void) => void;
      silentPrint: (data: any, callback: (err: any) => void) => void;
      getPrinters?: () => Promise<any[]>;
      getDisplayInfo?: () => Promise<{ count: number; hasSecondary: boolean; displays: any[] }>;
      openCashDrawer?: (config: any) => void;
      openCustomerDisplay?: (url: string) => void;
    };
    electron?: {
      printBill: (html?: string, options?: any) => Promise<{ success: boolean; message?: string }>;
      saveBillTxt?: (filename: string, content: string) => Promise<{ success: boolean; message?: string }>;
      getPrinters?: () => Promise<any[]>;
      getDisplayInfo?: () => Promise<{ count: number; hasSecondary: boolean; displays: any[] }>;
      getPrinterInfo?: () => Promise<any>;
      onPrintStatus: (callback: (payload: { success: boolean; message?: string }) => void) => () => void;
      openCustomerDisplay: (url: string) => void;
      getAppVersion?: () => Promise<string>;
      checkForUpdates?: () => Promise<{ success: boolean; updateInfo?: any; error?: string }>;
      downloadUpdate?: () => Promise<{ success: boolean; error?: string }>;
      installUpdate?: () => Promise<{ success: boolean; error?: string }>;
      revertFactoryUpdate?: () => Promise<{ success: boolean; error?: string }>;
      onUpdaterStatus?: (callback: (payload: UpdaterStatusPayload) => void) => () => void;
    };
  }
}
