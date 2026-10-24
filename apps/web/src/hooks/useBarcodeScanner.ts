import { useEffect, useRef, useCallback, useState } from 'react';
import toast from 'react-hot-toast';

export interface ScanResult {
  barcode: string;
  timestamp: number;
  isValid: boolean;
  isComplete: boolean;
}

interface ScannerState {
  buffer: string;
  lastScanTime: number;
  isScanning: boolean;
}

/**
 * Hook for barcode scanning with error handling
 * Essential for bakeries - manual entry too slow for 50+ items
 * Supports physical barcode scanners via keyboard input
 * Debounces rapid scans and provides immediate feedback
 */
export function useBarcodeScanner(onScan: (result: ScanResult) => void, enabled = true) {
  const scannerState = useRef<ScannerState>({
    buffer: '',
    lastScanTime: 0,
    isScanning: false,
  });

  const [isScanActive, setIsScanActive] = useState(false);
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Validate barcode format (common formats)
  const isValidBarcode = useCallback((barcode: string): { valid: boolean; reason?: string } => {
    if (!barcode || barcode.length < 6) {
      return { valid: false, reason: 'Too short - min 6 digits' };
    }
    if (barcode.length > 20) {
      return { valid: false, reason: 'Too long - max 20 chars' };
    }
    // Check for common barcode patterns: EAN-13, EAN-8, UPC, etc.
    if (!/^[0-9]*$/.test(barcode)) {
      // Allow alphanumeric for QR codes
      if (!/^[A-Z0-9\-]*$/.test(barcode)) {
        return { valid: false, reason: 'Invalid characters' };
      }
    }
    return { valid: true };
  }, []);

  // Process barcode scan
  const processScan = useCallback((barcode: string) => {
    const validation = isValidBarcode(barcode);

    if (!validation.valid) {
      toast.error(`❌ Invalid barcode: ${validation.reason}`);
      console.warn('[Barcode] Invalid format:', barcode, validation.reason);
      return;
    }

    console.log('[Barcode] Scanned:', barcode);

    const result: ScanResult = {
      barcode,
      timestamp: Date.now(),
      isValid: true,
      isComplete: true,
    };

    setLastScannedBarcode(barcode);
    toast.success('✓ Barcode scanned');
    onScan(result);
  }, [isValidBarcode, onScan]);

  // Handle keyboard input from scanner
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is on input (user typing)
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        return;
      }

      const state = scannerState.current;
      const now = Date.now();

      // Reset buffer if too much time passed since last key (scanner timeout)
      if (now - state.lastScanTime > 100) {
        state.buffer = '';
      }

      // Collect characters until Enter
      if (e.key === 'Enter') {
        e.preventDefault();
        if (state.buffer.length > 0) {
          setIsScanActive(false);
          processScan(state.buffer);
          state.buffer = '';
        }
      } else if (e.key === 'Escape') {
        // Cancel scan
        state.buffer = '';
        setIsScanActive(false);
        toast('Scan cancelled');
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        // Add character to buffer
        state.buffer += e.key;
        state.lastScanTime = now;
        setIsScanActive(true);

        // Show visual feedback while scanning
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [enabled, processScan]);

  // Manual barcode entry fallback
  const enterManually = useCallback((barcode: string) => {
    const validation = isValidBarcode(barcode);
    if (!validation.valid) {
      toast.error(`❌ ${validation.reason}`);
      return;
    }
    processScan(barcode);
  }, [isValidBarcode, processScan]);

  // Get last scanned barcode
  const getLastScanned = useCallback(() => lastScannedBarcode, [lastScannedBarcode]);

  // Check if barcode matches pattern
  const matchesPattern = useCallback((barcode: string, pattern: string): boolean => {
    try {
      const regex = new RegExp(pattern);
      return regex.test(barcode);
    } catch {
      return false;
    }
  }, []);

  return {
    isScanActive,
    lastScannedBarcode: getLastScanned(),
    processScan,
    enterManually,
    matchesPattern,
    isValidBarcode,
  };
}
