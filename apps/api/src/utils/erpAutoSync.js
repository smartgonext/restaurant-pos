import axios from 'axios';

const DEFAULT_ERP_URL = process.env.ERP_URL || 'https://amorabake.tech';
const DEFAULT_API_KEY = process.env.ERP_API_KEY || '0c7c394c7d164588a2665c5daf0503a5280b4f67c824471bb07554ff8b4b9ca3';

/**
 * 1. Push Restaurant KOT items + Amora Own-Barcode items into Bakery ERP
 * 
 * Strict Filtering Rules:
 * - Kitchen Order Ticket (KOT) items (isKOTEnabled == true): ALWAYS INCLUDED (fresh bakery/kitchen production).
 * - Non-KOT retail items: ONLY include shop's own 5-digit base barcodes (e.g. 00001, 00010, ^\d{1,6}$).
 * - Commercial barcodes: EXCLUDE all 13-digit commercial EAN-13 / 890... retail goods.
 * - Guard against corrupt URLs and numeric overflow (price < 999999).
 */
export async function pushRestaurantItemsToErp(prisma, erpUrl = DEFAULT_ERP_URL, apiKey = DEFAULT_API_KEY) {
  try {
    // Fetch all active menu items with category and inventory details
    const items = await prisma.menuItem.findMany({
      where: {
        isDeleted: false
      },
      include: {
        category: true,
        inventoryItem: true
      }
    });

    if (!items || items.length === 0) {
      console.info('[ErpAutoSync] No active menu items found in Restaurant POS.');
      return 0;
    }

    const payloadItems = items
      .filter((m) => {
        const name = (m.name || '').trim();
        // Drop empty names or corrupt URL records
        if (!name || name.startsWith('http:') || name.startsWith('https:')) {
          return false;
        }

        const isKot = Boolean(m.category?.isKOTEnabled);
        if (isKot) {
          // KOT production items (puffs, momos, samosas, burgers, rolls) always accepted
          return true;
        }

        const barcode = String(m.productQR || m.inventoryItem?.barcode || m.inventoryItem?.sku || '').trim();
        
        // Strict non-KOT rule:
        // 1. Explicitly reject 13-digit commercial barcodes (e.g. 8903754000123)
        if (barcode.length === 13 || barcode.startsWith('890')) {
          return false;
        }

        // 2. Allow ONLY own 5-digit base barcodes (1-6 digits numeric like 00001, 00010, 001)
        return /^\d{1,6}$/.test(barcode);
      })
      .map((m) => {
        const barcode = String(m.productQR || m.inventoryItem?.barcode || m.inventoryItem?.sku || '').trim();
        const isKot = Boolean(m.category?.isKOTEnabled);
        
        // Guard against barcode placed in price column (> 100,000)
        let sellingPrice = Number(m.price || 0);
        if (sellingPrice > 999999 || isNaN(sellingPrice)) sellingPrice = 0;
        
        let costPrice = Number(m.inventoryItem?.costPerUnit || 0);
        if (costPrice > 999999 || isNaN(costPrice)) costPrice = 0;
        
        const stock = Number(m.inventoryItem?.currentStock || 0);

        return {
          id: String(m.id),
          name: m.name.substring(0, 140).trim(),
          barcode: barcode ? barcode.substring(0, 60) : '',
          sku: m.inventoryItem?.sku ? String(m.inventoryItem.sku).substring(0, 60) : (barcode ? barcode.substring(0, 60) : ''),
          category_name: m.category?.name || 'General',
          is_kot_item: isKot,
          cost_price: costPrice,
          selling_price: sellingPrice,
          restaurant_stock: stock
        };
      });

    const url = `${erpUrl.replace(/\/+$/, '')}/api/v1/store/sync-restaurant-catalog`;
    let totalUpserted = 0;

    // Send in chunks of 100 to avoid payload size/timeout issues
    for (let i = 0; i < payloadItems.length; i += 100) {
      const chunk = payloadItems.slice(i, i + 100);
      const isFirstChunk = (i === 0);
      const res = await axios.post(
        url,
        {
          items: chunk,
          replace: isFirstChunk // replace on first chunk to prune unwanted 13-digit products
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
          },
          timeout: 25000
        }
      );
      totalUpserted += res.data?.data?.upserted_count || chunk.length;
    }

    console.info(`[ErpAutoSync] Successfully synced ${totalUpserted} items (${payloadItems.length} valid KOT & 5-digit own barcode products) to Bakery ERP.`);
    return totalUpserted;
  } catch (err) {
    console.error('[ErpAutoSync] Failed to push items to Bakery ERP:', err.message, err.response?.data || '');
    return 0;
  }
}

/**
 * 2. Pull Bakery ERP finished products into Restaurant POS menu
 */
export async function pullErpProductsToRestaurant(prisma, erpUrl = DEFAULT_ERP_URL, apiKey = DEFAULT_API_KEY) {
  try {
    const url = `${erpUrl.replace(/\/+$/, '')}/api/v1/store/products`;
    const res = await axios.get(url, {
      headers: { 'X-API-Key': apiKey },
      timeout: 10000
    });

    const products = res.data?.data?.products || [];
    if (!Array.isArray(products) || products.length === 0) {
      return 0;
    }

    // Find or create default bakery category in Restaurant POS
    let bakeryCategory = await prisma.itemCategory.findFirst({
      where: { name: { contains: 'Bakery' } }
    });
    if (!bakeryCategory) {
      const rest = await prisma.restaurant.findFirst();
      if (!rest) return 0;
      bakeryCategory = await prisma.itemCategory.create({
        data: {
          restaurantId: rest.id,
          name: 'Cakes & Bakery',
          isKOTEnabled: false
        }
      });
    }

    const rest = await prisma.restaurant.findFirst();
    if (!rest) return 0;

    let importedCount = 0;
    for (const p of products) {
      const barcode = p.sku || p.barcode || '';
      const existing = await prisma.menuItem.findFirst({
        where: {
          restaurantId: rest.id,
          OR: [
            { name: p.name },
            ...(barcode ? [{ productQR: barcode }] : [])
          ]
        }
      });

      if (!existing) {
        await prisma.menuItem.create({
          data: {
            restaurantId: rest.id,
            menuId: 1,
            categoryId: bakeryCategory.id,
            name: p.name,
            description: p.description || 'Bakery Fresh Product',
            price: Number(p.selling_price || 0),
            productQR: barcode,
            isAvailable: true,
            isDeleted: false
          }
        });
        importedCount++;
      } else {
        // Update price
        await prisma.menuItem.update({
          where: { id: existing.id },
          data: {
            price: Number(p.selling_price || existing.price),
            isAvailable: true
          }
        });
      }
    }

    if (importedCount > 0) {
      console.info(`[ErpAutoSync] Imported ${importedCount} new Bakery ERP products into Restaurant POS.`);
    }
    return importedCount;
  } catch (err) {
    console.error('[ErpAutoSync] Failed to pull products from Bakery ERP:', err.message);
    return 0;
  }
}

/**
 * 3. Start Background Auto-Sync Worker
 */
export function startErpAutoSyncWorker(app) {
  const prisma = app.prisma;
  if (!prisma) return;

  const runTwoWaySync = async () => {
    await pushRestaurantItemsToErp(prisma);
    await pullErpProductsToRestaurant(prisma);
  };

  // Run initial sync after 5 seconds
  setTimeout(runTwoWaySync, 5000);

  // Repeat automatically every 60 seconds
  const interval = setInterval(runTwoWaySync, 60000);
  interval.unref();

  console.info(`[ErpAutoSync] Two-way background synchronization active with ${DEFAULT_ERP_URL}`);
}
