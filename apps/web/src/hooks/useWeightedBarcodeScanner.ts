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
 * Enhanced barcode scanner hook for weight-based items
 * 
 * Features:
 * - Handles weight-based barcodes (last 5 digits = weight in grams)
 * - Auto-extracts quantity from barcode weight
 * - Supports rapid consecutive scans
 * - Debounces to handle scanning speed
 * - Toast feedback for scan status
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

  // Validate barcode format
  const isValidBarcode = useCallback((barcode: string): { valid: boolean; reason?: string } => {
    if (!barcode || barcode.length < 6) {
      return { valid: false, reason: 'Too short - min 6 digits' };
    }
    if (barcode.length > 20) {
      return { valid: false, reason: 'Too long - max 20 chars' };
    }
    // Only numeric allowed for weight-based barcodes
    if (!/^\d+$/.test(barcode)) {
      return { valid: false, reason: 'Non-numeric barcode' };
    }
    return { valid: true };
  }, []);

  // Process barcode with weight extraction
  const processScan = useCallback((barcode: string) => {
    const validation = isValidBarcode(barcode);
    
    if (!validation.valid) {
      toast.error(`❌ Invalid barcode: ${validation.reason}`);
      console.warn('[WeightedScanner] Invalid format:', barcode, validation.reason);
      return;
    }

    console.log('[WeightedScanner] Processing barcode:', barcode);

    // Try to extract weight
    const weightResult = parseWeightFromBarcode(barcode);
    
    if (weightResult) {
      // Weight-based barcode
      const result: WeightedScanResult = {
        productQR: weightResult.productQR,
        rawBarcode: barcode,
        isWeightBased: true,
        quantity: weightResult.weightKg,
        weightGrams: weightResult.weightGrams,
        timestamp: Date.now(),
      };

      setLastScannedBarcode(barcode);
      toast.success(
        `✓ Scanned: ${formatWeight(weightResult.weightGrams)}`,
        { duration: 800, icon: '📦' }
      );
      onScan(result);
    } else {
      // Standard barcode (no weight extraction)
      const extracted = extractProductQR(barcode);
      const result: WeightedScanResult = {
        productQR: extracted.productQR,
        rawBarcode: barcode,
        isWeightBased: false,
        timestamp: Date.now(),
      };

      setLastScannedBarcode(barcode);
      toast.success('✓ Barcode scanned', { duration: 800, icon: '🏷️' });
      onScan(result);
    }
  }, [isValidBarcode, onScan]);

  // Handle keyboard input from scanner
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is on input field (user typing)
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        return;
      }

      const state = scannerState.current;
      const now = Date.now();

      // Reset buffer if timeout exceeded (scanner sends all at once, but timeout handles slow scanners)
      if (now - state.lastKeyTime > BARCODE_SCAN_TIMEOUT) {
        state.buffer = '';
      }

      state.lastKeyTime = now;

      // Handle Enter key - finalize scan
      if (e.key === 'Enter') {
        e.preventDefault();
        if (state.buffer.length > 0) {
          setIsScanActive(false);
          
          // Clear pending debounce
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
          }
          
          processScan(state.buffer);
          state.buffer = '';
        }
        return;
      }

      // Collect numeric characters
      if (/^\d$/.test(e.key)) {
        setIsScanActive(true);
        state.buffer += e.key;

        // Debounce processing for rapid consecutive scans
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }

        // Auto-complete scan if we detect a complete barcode (no more input for 150ms)
        debounceRef.current = setTimeout(() => {
          if (state.buffer.length > 5) {
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
