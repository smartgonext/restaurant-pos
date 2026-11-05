/**
 * Intelligent POS Menu Item Search & Relevance Ranking
 * 
 * Ensures that when cashiers or users search by name, barcode, or SKU:
 * 1. Exact item name matches come FIRST (#1 position)
 * 2. Items starting with the query come next
 * 3. Items containing the query word come next
 * 4. Multi-word searches match across terms
 * 5. Barcodes, SKUs, and MRP barcodes match reliably
 * 6. Searches search across all categories (with active category given priority bonus)
 *    so items are never hidden or lost.
 */

export interface SearchableItem {
  id: number;
  name: string;
  price?: number;
  categoryId?: number | null;
  category?: { id?: number; name?: string; [key: string]: any } | null;
  productQR?: string | null;
  inventoryItem?: {
    id?: number;
    name?: string;
    sku?: string | null;
    barcode?: string | null;
    inventoryMRPs?: Array<{
      id?: number;
      barcode?: string | null;
      mrp?: number;
      sellingPrice?: number;
      [key: string]: any;
    }>;
    [key: string]: any;
  } | null;
  [key: string]: any;
}

export interface ScoredItem<T> {
  item: T;
  score: number;
}

/**
 * Computes a relevance score for an item against a normalized search query.
 * Lower score = higher relevance (Tier 0 is best). Returns null if not matched.
 */
export function getItemSearchScore(
  item: SearchableItem,
  normalizedQuery: string,
  weightProductQR?: string
): number | null {
  const q = String(normalizedQuery || '').trim().toLowerCase();
  if (!q) return 0;

  const name = String(item.name || '').trim().toLowerCase();
  const productQR = String(item.productQR || '').trim().toLowerCase();
  const invBarcode = String(item.inventoryItem?.barcode || '').trim().toLowerCase();
  const invSku = String(item.inventoryItem?.sku || '').trim().toLowerCase();
  const catName = String(item.category?.name || '').trim().toLowerCase();
  const idStr = String(item.id);

  const mrpBarcodes: string[] = Array.isArray(item.inventoryItem?.inventoryMRPs)
    ? item.inventoryItem.inventoryMRPs
        .map((m: any) => String(m?.barcode || '').trim().toLowerCase())
        .filter(Boolean)
    : [];

  // ── Tier 0: Exact Barcode, QR, SKU, or ID match ──
  if (productQR === q || invBarcode === q || invSku === q || idStr === q || mrpBarcodes.includes(q)) {
    return 10;
  }
  if (weightProductQR) {
    const normW = weightProductQR.toLowerCase();
    if (productQR === normW || idStr === normW) {
      return 15;
    }
  }

  // ── Tier 1: Exact Name Match (Guaranteed #1) ──
  if (name === q) {
    return 100;
  }

  // ── Tier 2: Item Name starts with query ──
  if (name.startsWith(q)) {
    return 200 + Math.min(name.length - q.length, 90);
  }

  // ── Tier 3: Any word in item name starts with query ──
  const words = name.split(/[\s\-_/.,+()]+/);
  const wordIdx = words.findIndex((w) => w.startsWith(q));
  if (wordIdx !== -1) {
    return 300 + Math.min(wordIdx * 10, 40) + Math.min(name.length - q.length, 50);
  }

  // ── Tier 4: Multi-word query (all words appear in item name) ──
  const queryTerms = q.split(/[\s\-_/.,+]+/).filter(Boolean);
  if (queryTerms.length > 1 && queryTerms.every((term) => name.includes(term))) {
    return 400 + Math.min(name.length - q.length, 90);
  }

  // ── Tier 5: Substring anywhere in item name ──
  const substrIdx = name.indexOf(q);
  if (substrIdx !== -1) {
    return 500 + Math.min(substrIdx * 2, 40) + Math.min(name.length, 50);
  }

  // ── Tier 6: Barcode, SKU, or QR contains the query ──
  if (
    (productQR && productQR.includes(q)) ||
    (invBarcode && invBarcode.includes(q)) ||
    (invSku && invSku.includes(q)) ||
    mrpBarcodes.some((b) => b.includes(q))
  ) {
    return 600;
  }

  // ── Tier 7: Category name matches (lower priority so items always rank first) ──
  if (catName && q.length >= 2) {
    if (catName === q) return 700;
    if (catName.startsWith(q)) return 720;
    if (catName.includes(q)) return 750;
  }

  // ── Tier 8: Multi-word cross-field match (name + category + sku) ──
  if (queryTerms.length > 1) {
    const combined = `${name} ${catName} ${invSku} ${productQR}`;
    if (queryTerms.every((term) => combined.includes(term))) {
      return 800;
    }
  }

  return null;
}

/**
 * Filters and sorts items by relevance score so the closest and exact matches ALWAYS come first.
 */
export function filterAndRankMenuItems<T extends SearchableItem>(
  items: T[],
  searchQuery: string,
  selectedCategoryId?: number | string | null,
  weightProductQR?: string
): T[] {
  if (!Array.isArray(items)) return [];

  const rawQ = String(searchQuery || '').trim();
  const q = rawQ.toLowerCase();

  // Browsing mode (no active search query)
  if (!q) {
    if (
      selectedCategoryId !== undefined &&
      selectedCategoryId !== null &&
      selectedCategoryId !== 'all'
    ) {
      const catId = Number(selectedCategoryId);
      return items.filter((it) => it.categoryId === catId);
    }
    return items;
  }

  // Search mode: compute scores and rank
  const scored: ScoredItem<T>[] = [];
  const targetCatId =
    selectedCategoryId !== undefined &&
    selectedCategoryId !== null &&
    selectedCategoryId !== 'all'
      ? Number(selectedCategoryId)
      : null;

  for (const item of items) {
    let score = getItemSearchScore(item, q, weightProductQR);
    if (score === null) continue;

    // Give priority boost to items in the currently active category (if one is selected)
    if (targetCatId !== null && item.categoryId === targetCatId) {
      score = Math.max(1, score - 60);
    }

    scored.push({ item, score });
  }

  // Sort by score ascending (lowest score = highest rank)
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    // Tie-breaker: shorter names rank first
    const aLen = a.item.name ? a.item.name.length : 999;
    const bLen = b.item.name ? b.item.name.length : 999;
    if (aLen !== bLen) return aLen - bLen;
    // Alphabetical tie-breaker
    return String(a.item.name || '').localeCompare(String(b.item.name || ''));
  });

  return scored.map((s) => s.item);
}

