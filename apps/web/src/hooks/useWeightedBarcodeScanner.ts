import { useEffect, useRef, useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import {
  parseWeightFromBarcode,
  extractProductQR,
  isLikelyWeightBased,
  formatWeight,
  BARCODE_SCAN_TIMEOUT,
} from '@/lib/weightedBarcodeParser';

export interface WeightedScanResult {
  productQR: string;
  rawBarcode: string;
  isWeightBased: boolean;
  quantity?: number; // Only set if weight-based (in kg)
  weightGrams?: number;
  timestamp: number;
}

interface ScannerState {
  buffer: string;
  lastKeyTime: number;
  isScanning: boolean;
}

/**
 * Universal barcode scanner hook for 1D product barcodes, 2D token QRs, and scale items.
 */
export function useWeightedBarcodeScanner(
  onScan: (result: WeightedScanResult) => void,
  enabled = true
) {
  const scannerState = useRef<ScannerState>({
    buffer: '',
    lastKeyTime: 0,
    isScanning: false,
  });

  const [isScanActive, setIsScanActive] = useState(false);
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const debounceRef = useRef<NodeJS.Timeout>();

  // Validate barcode format (supports 1D barcodes, 2D QR codes, UUIDs, scale codes)
  const isValidBarcode = useCallback((barcode: string): { valid: boolean; reason?: string } => {
    if (!barcode || barcode.trim().length === 0) {
      return { valid: false, reason: 'Empty barcode' };
    }
    if (barcode.length > 256) {
      return { valid: false, reason: 'Too long - max 256 chars' };
    }
    return { valid: true };
  }, []);

  // Process barcode with weight extraction or general 1D/2D QR code
  const processScan = useCallback((barcode: string) => {
    const clean = barcode.trim();
    const validation = isValidBarcode(clean);
    
    if (!validation.valid) {
      console.warn('[WeightedScanner] Invalid format:', clean, validation.reason);
      return;
    }

    console.log('[WeightedScanner] Processing barcode/QR:', clean);

    // Try to extract weight if numeric and likely weight-based
    const weightResult = isLikelyWeightBased(clean) ? parseWeightFromBarcode(clean) : null;
    
    if (weightResult && weightResult.isWeightBased) {
      const result: WeightedScanResult = {
        productQR: weightResult.productQR,
        rawBarcode: clean,
        isWeightBased: true,
        quantity: weightResult.weightKg,
        weightGrams: weightResult.weightGrams,
        timestamp: Date.now(),
      };

      setLastScannedBarcode(clean);
      toast.success(
        `✓ Scanned: ${formatWeight(weightResult.weightGrams)}`,
        { duration: 800, icon: '📦' }
      );
      onScan(result);
    } else {
      // Standard 1D Barcode, 2D Product QR, or Token QR code
      const extracted = extractProductQR(clean);
      const result: WeightedScanResult = {
        productQR: extracted.productQR || clean,
        rawBarcode: clean,
        isWeightBased: false,
        timestamp: Date.now(),
      };

      setLastScannedBarcode(clean);
      onScan(result);
    }
  }, [isValidBarcode, onScan]);

  // Handle keyboard input from scanner
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is on an input or textarea field (that field handles it directly)
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        return;
      }

      const state = scannerState.current;
      const now = Date.now();

      // Reset buffer if timeout exceeded between keystrokes
      if (now - state.lastKeyTime > BARCODE_SCAN_TIMEOUT) {
        state.buffer = '';
      }

      state.lastKeyTime = now;

      // Handle Enter key - finalize scan
      if (e.key === 'Enter') {
        if (state.buffer.length > 0) {
          e.preventDefault();
          setIsScanActive(false);
          
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
          }
          
          processScan(state.buffer);
          state.buffer = '';
        }
        return;
      }

      // Collect all printable characters (digits, letters a-z, symbols -, :, / etc.)
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        setIsScanActive(true);
        state.buffer += e.key;

        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }

        // Auto-complete scan if no more input arrives for 200ms
        debounceRef.current = setTimeout(() => {
          if (state.buffer.length > 1) {
            setIsScanActive(false);
            processScan(state.buffer);
            state.buffer = '';
          }
        }, 150);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, processScan]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    isScanActive,
    lastScannedBarcode,
    isLikelyWeightBased: lastScannedBarcode ? isLikelyWeightBased(lastScannedBarcode) : false,
  };
}
