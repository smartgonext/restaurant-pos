/**
 * Weight-Based Barcode Parser for Kg-measured items
 * 
 * Barcode format: [item-code][last-5-digits-as-weight]
 * Weight mapping (last 5 digits):
 * - 00100 = 100g (0.1kg)
 * - 01000 = 1kg
 * - 09000 = 9kg
 * - 10000 = 10kg
 * 
 * Example: "0006202280010000" → productQR="000620228", weight=10kg, quantity=10
 */

export interface WeightScanResult {
  productQR: string;      // Item identifier (barcode without weight)
  skuRaw?: string;        // Raw SKU code if EAN-13 format
  prefix?: string;        // Prefix code (e.g. "22") if EAN-13 format
  weightGrams: number;    // Weight in grams
  weightKg: number;       // Weight in kg
  quantity: number;       // Quantity to add (weight in kg)
  rawBarcode: string;     // Original scanned barcode
  isWeightBased: boolean; // Whether this is a weight-based scan
}

export interface BarcodeScanResult {
  productQR: string;
  rawBarcode: string;
  isWeightBased: boolean;
}

const WEIGHT_DIGITS = 5;  // Last 5 digits represent weight
const MIN_WEIGHT_GRAMS = 50;  // Minimum weight: 50g
const MAX_WEIGHT_GRAMS = 50000; // Maximum weight: 50kg

/**
 * Parse weight from barcode supporting dynamic Settings (weigh_scale_prefix)
 * Handles both 13-digit EAN-13 weigh scale format [Prefix(2)][SKU(5)][WeightGrams(5)][CheckDigit(1)]
 * as well as 14+ digit format [ProductQR][WeightGrams(5)]
 */
export function parseWeightFromBarcode(barcode: string): WeightScanResult | null {
  if (!barcode || typeof barcode !== 'string') return null;
  
  const normalized = barcode.trim();
  
  // Must be at least 6 characters
  if (normalized.length < 6) return null;
  
  // Must be numeric
  if (!/^\d+$/.test(normalized)) return null;

  // Retrieve user-configured weigh scale prefix from localStorage if available (default '22')
  let configuredPrefix = '22';
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('weigh_scale_prefix');
      if (saved) configuredPrefix = saved.trim();
    }
  } catch (_) {}

  // 1. EAN-13 Format: exactly 13 digits [Prefix(2)][SKU(5)][WeightGrams(5)][CheckDigit(1)]
  if (normalized.length === 13) {
    const prefix = normalized.substring(0, 2);
    const skuRaw = normalized.substring(2, 7);
    const weightStr = normalized.substring(7, 12);
    const weightGrams = parseInt(weightStr, 10);

    if (weightGrams >= MIN_WEIGHT_GRAMS && weightGrams <= MAX_WEIGHT_GRAMS) {
      const weightKg = weightGrams / 1000;
      return {
        productQR: skuRaw,
        skuRaw,
        prefix,
        weightGrams,
        weightKg,
        quantity: weightKg,
        rawBarcode: normalized,
        isWeightBased: true,
      };
    }
  }
  
  // 2. Standard / 14+ Digit Format: [productQR][last-5-digits-as-weight]
  const lastFiveDigits = normalized.slice(-WEIGHT_DIGITS);
  const productQR = normalized.slice(0, -WEIGHT_DIGITS);
  const weightGrams = parseInt(lastFiveDigits, 10);
  
  if (weightGrams >= MIN_WEIGHT_GRAMS && weightGrams <= MAX_WEIGHT_GRAMS) {
    const weightKg = weightGrams / 1000;
    return {
      productQR,
      skuRaw: undefined,
      prefix: undefined,
      weightGrams,
      weightKg,
      quantity: weightKg,
      rawBarcode: normalized,
      isWeightBased: true,
    };
  }

  return null;
}

/**
 * Extract product QR from a barcode (with or without weight)
 * Tries weight-based parsing first, falls back to full barcode as QR
 */
export function extractProductQR(barcode: string): BarcodeScanResult {
  const weighted = parseWeightFromBarcode(barcode);
  
  if (weighted) {
    return {
      productQR: weighted.productQR,
      rawBarcode: barcode,
      isWeightBased: true,
    };
  }
  
  // Not a weighted barcode, treat entire barcode as product QR
  return {
    productQR: barcode,
    rawBarcode: barcode,
    isWeightBased: false,
  };
}

/**
 * Check if a barcode could be weight-based
 * Returns true if last 5 digits are within valid weight range
 */
export function isLikelyWeightBased(barcode: string): boolean {
  if (!barcode || barcode.length < 6) return false;
  if (!/^\d+$/.test(barcode)) return false;
  
  const lastFiveDigits = barcode.slice(-WEIGHT_DIGITS);
  const weightGrams = parseInt(lastFiveDigits, 10);
  
  return weightGrams >= MIN_WEIGHT_GRAMS && weightGrams <= MAX_WEIGHT_GRAMS;
}

/**
 * Format weight for display
 */
export function formatWeight(grams: number): string {
  if (grams >= 1000) {
    return `${(grams / 1000).toFixed(2)}kg`;
  }
  return `${Math.round(grams)}g`;
}

/**
 * Format quantity with unit (Kg)
 */
export function formatWeightQuantity(kg: number): string {
  if (kg === Math.floor(kg)) {
    return `${Math.round(kg)}kg`;
  }
  return `${kg.toFixed(2)}kg`;
}

/**
 * Validate that an item has Kg as its sales unit
 */
export function isKgMeasuredItem(salesUnit?: string | null): boolean {
  if (!salesUnit) return false;
  const normalized = salesUnit.toUpperCase().trim();
  return normalized === 'KG' || normalized === 'KILOGRAM' || normalized === 'KILOGRAMS';
}

/**
 * Speed calculation for consecutive scans
 * Returns delay in ms before considering a scan complete
 * Supports rapid consecutive scans without requiring manual input
 */
export const BARCODE_SCAN_TIMEOUT = 100; // ms - time to wait for next character in scan
export const SCAN_COMPLETION_DEBOUNCE = 50; // ms - debounce before processing complete scan
