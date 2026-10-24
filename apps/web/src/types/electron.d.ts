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
}

declare global {
  interface Window {
    electron?: {
      printBill: (html?: string) => Promise<{ success: boolean; message?: string }>;
      saveBillTxt?: (filename: string, content: string) => Promise<{ success: boolean; message?: string }>;
      getPrinterInfo?: () => Promise<any>;
      onPrintStatus: (callback: (payload: { success: boolean; message?: string }) => void) => () => void;
      openCustomerDisplay: (url: string) => void;
      getAppVersion?: () => Promise<string>;
      checkForUpdates?: () => Promise<{ success: boolean; updateInfo?: any; error?: string }>;
      downloadUpdate?: () => Promise<{ success: boolean; error?: string }>;
      installUpdate?: () => Promise<{ success: boolean; error?: string }>;
      onUpdaterStatus?: (callback: (payload: UpdaterStatusPayload) => void) => () => void;
    };
  }
}

