# Weight-Based QR Code Scanner - Setup & Configuration Guide

## Overview

This feature enables **automatic weight-based quantity extraction** from QR/barcodes for Kg-measured items across MAINPOS, SUBPOS, and POS terminals. Users can now scan items rapidly, and quantities are automatically calculated from barcode weight codes.

### Features ✓
- ✅ **Weight extraction** from last 5 barcode digits
- ✅ **Automatic quantity calculation** (e.g., 10000 → 10kg)
- ✅ **Rapid consecutive scans** support  
- ✅ **Speed-optimized** with debouncing
- ✅ **Works across** MAINPOS, SUBPOS, POS terminals
- ✅ **Backwards compatible** with standard barcodes
- ✅ **Toast notifications** for scan feedback

---

## Barcode Format

### Weight-Based Barcode Structure
```
[Product QR Code] + [Last 5 Digits = Weight in Grams]
```

### Weight Mapping Examples
| Last 5 Digits | Weight | Quantity |
|---------------|--------|----------|
| 00100 | 100g | 0.1kg |
| 01000 | 1kg | 1kg |
| 02500 | 2.5kg | 2.5kg |
| 05000 | 5kg | 5kg |
| 09000 | 9kg | 9kg |
| 10000 | 10kg | 10kg |

### Example Barcode
```
Product QR: 000620228
Weight: 10kg (10000 grams)
Full Barcode: 00062022810000
                    └─────┘
                Last 5 digits
```

### Weight Validation
- **Minimum weight**: 50g (00050)
- **Maximum weight**: 50kg (50000)
- Weight outside this range is treated as standard barcode

---

## Setup Instructions

### 1. **Item Configuration (API/Database)**

Ensure items have:
- **salesUnit** = `"Kg"` (or "KILOGRAM", "KILOGRAMS" - case-insensitive)
- **productQR** = Item identifier (without weight digits)

**Example API Response**:
```json
{
  "id": 1,
  "name": "Ellu Black Super",
  "productQR": "000620228",
  "salesUnit": "Kg",
  "enablePackOptions": false,
  "inventoryItem": {
    "inventoryMRPs": [
      {
        "id": 101,
        "mrp": 400,
        "purchaseRate": 200,
        "profitPercent": 100,
        "sellingPrice": 400,
        "isActive": true
      }
    ]
  }
}
```

### 2. **Barcode/QR Labels**

Print labels with format:
```
Product: ELLU BLACK SUPER
Barcode: 00062022810000
        (UPC/EAN barcode format)
         
Unit Price: 400.00
Net WT: 10kg
```

The **last 5 digits (10000) represent 10kg weight**.

### 3. **Scanner Configuration**

No hardware configuration needed! Works with:
- ✅ Physical USB barcode scanners
- ✅ Keyboard input simulation
- ✅ Any HID-compliant barcode reader

---

## How It Works

### Scanning Flow

```
User scans barcode (e.g., "00062022810000")
                ↓
useWeightedBarcodeScanner hook captures input
                ↓
parseWeightFromBarcode extracts:
  - Product QR: "000620228"
  - Weight: 10000g → 10kg
                ↓
handleSearchKeyDown processing:
  1. Find item by productQR ("000620228")
  2. Check if salesUnit is "Kg"
  3. Extract MRP (if available)
  4. Add to cart with quantity = 10kg
                ↓
Toast: "✓ Added Ellu Black Super: 10.00kg"
Item appears in cart automatically
```

### Speed Management

The system handles rapid consecutive scans:
- **100ms timeout**: Detects end of single barcode
- **150ms debounce**: Auto-completes scans without Enter key
- **Debounce handling**: Processes one scan at a time

**Fast scanning scenario**:
```
Scan 1: 00062022810000 → Added 10kg
Scan 2: 00062022805000 → Added 5kg
Scan 3: 00062022801000 → Added 1kg
(All added automatically within 150ms each)
```

---

## Usage

### For MAINPOS & SUBPOS Terminals

1. **Open POS Terminal** (MainPOSTerminal or SubPOSTerminal)
2. **Position cursor** on search input
3. **Scan barcode** using physical scanner:
   - Barcode scanner transmits: `00062022810000`
   - System auto-detects weight (10kg)
   - Item added automatically with quantity 10kg

4. **No Enter key needed** - auto-completes after scan

### Manual Fallback

If scanner doesn't work, type barcode and press **Enter**:
```
Search input: 00062022810000
Press: Enter
Result: Item added with 10kg quantity
```

---

## Configuration Reference

### Weight Parser (`lib/weightedBarcodeParser.ts`)

```typescript
// Parse weight from barcode
const result = parseWeightFromBarcode("00062022810000");
// Returns:
{
  productQR: "000620228",
  weightGrams: 10000,
  weightKg: 10,
  quantity: 10,
  rawBarcode: "00062022810000",
  isWeightBased: true
}

// Check if barcode is likely weight-based
isLikelyWeightBased("00062022810000") // true

// Format for display
formatWeight(10000) // "10.00kg"
formatWeightQuantity(10) // "10kg"

// Validate item is Kg-measured
isKgMeasuredItem("Kg") // true
```

### Weight Scanning Hook (`hooks/useWeightedBarcodeScanner.ts`)

```typescript
import { useWeightedBarcodeScanner } from '@/hooks/useWeightedBarcodeScanner';

// In component:
useWeightedBarcodeScanner((scanResult) => {
  console.log(scanResult.productQR);      // "000620228"
  console.log(scanResult.quantity);       // 10
  console.log(scanResult.isWeightBased);  // true
});

// Result type:
interface WeightedScanResult {
  productQR: string;
  rawBarcode: string;
  isWeightBased: boolean;
  quantity?: number;           // Only if weight-based
  weightGrams?: number;
  timestamp: number;
}
```

---

## Testing

### Test Cases

#### ✅ Test 1: Weight-Based Scan
```
Barcode: 00062022810000
Expected: Item added with 10kg quantity
Toast: "✓ Added Ellu Black Super: 10.00kg"
```

#### ✅ Test 2: Rapid Consecutive Scans
```
Scan 1: 00062022801000 (1kg)
Scan 2: 00062022802500 (2.5kg)
Scan 3: 00062022805000 (5kg)
Expected: All three items added in sequence
```

#### ✅ Test 3: Standard Barcode Fallback
```
Barcode: 000620228 (no weight digits)
Expected: Item added with quantity 1 (standard behavior)
```

#### ✅ Test 4: Invalid Weight Range
```
Barcode: 000620228999999 (weight > 50kg)
Expected: Treated as standard barcode, not weight-based
```

#### ✅ Test 5: Manual Entry with Enter Key
```
Type in search: 00062022810000
Press: Enter
Expected: Same as scanned (item added with 10kg)
```

---

## Troubleshooting

### Issue: Items not auto-adding on scan

**Solution**: Check item's `salesUnit` field:
```json
{
  "name": "Item Name",
  "salesUnit": "Kg"  // Must be exactly "Kg"
}
```

If using different label like "kg" or "kilogram", it won't work. Normalize to "Kg" in API response or database.

### Issue: Barcode extracted as standard, not weight-based

**Solution**: Verify barcode format:
- Last 5 digits must be numeric
- Weight value must be 50-50000 grams
- Total barcode length must be 6-20 characters

Example that works:
```
✅ 000620228 + 10000 = 00062022810000 (14 chars, valid weight)
❌ 000620228 + ABC00 = 000620228ABC00 (invalid - non-numeric)
❌ 000620228 + 00010 = 00062022800010 (valid, weight = 10g < 50g minimum)
```

### Issue: Scanner not detected

**Solution**: The hook listens for keyboard input globally:
1. Ensure barcode scanner is configured as HID keyboard
2. Click on page (not in form field) before scanning
3. Check browser console for keyboard events

---

## Performance Notes

- **Debounce**: 150ms (auto-complete without Enter)
- **Timeout**: 100ms (detect end of barcode)
- **Memory**: Minimal - only buffers single barcode
- **CPU**: Negligible impact, regex validation only

---

## API Integration

### Backend Requirements

1. **Items must include**:
   - `productQR`: Item identifier
   - `salesUnit`: "Kg" for weight-measured items
   - `inventoryItem.inventoryMRPs[]`: Active MRP pricing

2. **Example endpoint**:
```
GET /api/mainpos/items
Response:
{
  "data": [
    {
      "id": 1,
      "name": "Ellu Black Super",
      "productQR": "000620228",
      "salesUnit": "Kg",
      "price": 400,
      "inventoryItem": {
        "id": 50,
        "inventoryMRPs": [...]
      }
    }
  ]
}
```

---

## File Structure

```
web/src/
├── lib/
│   └── weightedBarcodeParser.ts    # Weight parsing logic
├── hooks/
│   └── useWeightedBarcodeScanner.ts # Scanner hook
├── pages/
│   ├── mainpos/
│   │   └── MainPOSTerminal.tsx     # Updated with hook
│   └── subpos/
│       └── SubPOSTerminal.tsx      # Updated with hook
```

---

## Future Enhancements

- [ ] QR code generation utility (from product + weight)
- [ ] Batch barcode printing
- [ ] Weight-based pricing adjustment
- [ ] Inventory sync on quantity from scan
- [ ] Speed analytics dashboard
- [ ] Different weight formats (lbs, grams, etc.)

---

## Support

For issues or questions:
1. Check barcode format (14+ digits, numeric only)
2. Verify item has `salesUnit = "Kg"`
3. Test with manual barcode entry + Enter key
4. Check browser console for scan events
5. Verify scanner sends Enter key at end
