import { FastifyInstance } from 'fastify';
import { prisma } from '../../app.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantScope } from '../../middleware/tenantScope.js';

export async function inventoryRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', tenantScope);

  // --- Items ---
  app.get('/items', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const items = await prisma.inventoryItem.findMany({
      where: { restaurantId },
      include: { category: true, unit: true }
    });
    return { success: true, data: items };
  });

  app.post('/items', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const item = await prisma.inventoryItem.create({
      data: { ...body, restaurantId }
    });
    return { success: true, data: item };
  });

  // --- Categories ---
  app.get('/categories', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const categories = await prisma.inventoryItemCategory.findMany({
      where: { restaurantId }
    });
    return { success: true, data: categories };
  });

  app.post('/categories', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId;
    const { z } = await import('zod');
    const schema = z.object({ name: z.string().min(1) });
    try {
      const body = schema.parse(request.body);
      const category = await prisma.inventoryItemCategory.create({ data: { restaurantId, name: body.name } });
      return { success: true, data: category };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message || String(err) });
    }
  });

  // --- Units ---
  app.get('/units', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const units = await prisma.inventoryUnit.findMany({
      where: { restaurantId }
    });
    return { success: true, data: units };
  });

  app.post('/units', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId;
    const { z } = await import('zod');
    const schema = z.object({ name: z.string().min(1), symbol: z.string().optional() });
    try {
      const body = schema.parse(request.body);
      const unit = await prisma.inventoryUnit.create({ data: { restaurantId, name: body.name, symbol: body.symbol || body.name } });
      return { success: true, data: unit };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message || String(err) });
    }
  });

  // --- Suppliers ---
  app.get('/suppliers', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const suppliers = await prisma.supplier.findMany({
      where: { restaurantId }
    });
    return { success: true, data: suppliers };
  });

  app.post('/suppliers', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const supplier = await prisma.supplier.create({
      data: { ...body, restaurantId }
    });
    return { success: true, data: supplier };
  });

  // --- Recipes ---
  app.get('/recipes', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const recipes = await prisma.recipe.findMany({
      where: { restaurantId },
      include: { 
        ingredients: { 
          include: { inventoryItem: true } 
        }
      }
    });
    return { success: true, data: recipes };
  });

  // --- Movements ---
  app.get('/movements', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const movements = await prisma.inventoryMovement.findMany({
      where: { restaurantId },
      include: { item: true },
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, data: movements };
  });

  // --- Get single item ---
  app.get('/items/:id', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId;
    const { id } = request.params as { id: string };
    const item = await prisma.inventoryItem.findFirst({ where: { id: Number(id), restaurantId }, include: { category: true, unit: true } });
    if (!item) return reply.status(404).send({ success: false, error: 'Item not found' });
    return { success: true, data: item };
  });

  // --- Update item ---
  app.put('/items/:id', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId;
    const { id } = request.params as { id: string };
    try {
      const body = request.body as any;
      const item = await prisma.inventoryItem.update({ where: { id: Number(id), restaurantId }, data: body });
      return { success: true, data: item };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message || String(err) });
    }
  });

  // --- Create movement (adjust stock) ---
  app.post('/items/:id/movements', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId;
    const { id } = request.params as { id: string };
    const { z } = await import('zod');
    const schema = z.object({ type: z.string(), quantity: z.number(), note: z.string().optional(), referenceId: z.number().optional() });
    try {
      const body = schema.parse(request.body);
      const qty = body.quantity;
      const isIncrement = ['purchase', 'adjustment', 'stock_in'].includes(body.type);

      const result = await prisma.$transaction(async (tx) => {
        const mv = await tx.inventoryMovement.create({ data: { restaurantId, itemId: Number(id), type: body.type, quantity: qty, note: body.note, referenceId: body.referenceId } });
        await tx.inventoryItem.update({ where: { id: Number(id) }, data: { currentStock: isIncrement ? { increment: qty } : { decrement: qty } } });
        return mv;
      });

      return { success: true, data: result };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message || String(err) });
    }
  });

  // --- Export inventory (csv/json/xlsx) ---
  app.get('/export', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId;
    const format = (request.query?.format || 'csv').toLowerCase();
    const items = await prisma.inventoryItem.findMany({ where: { restaurantId }, include: { category: true, unit: true } });

    if (format === 'json') {
      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', 'attachment; filename="inventory.json"');
      return reply.send(items);
    }

    if (format === 'csv') {
      const header = ['id', 'name', 'category', 'unit', 'currentStock', 'thresholdQty', 'costPerUnit'].join(',') + '\n';
      const rows = items.map(it => {
        const name = String(it.name || '').replace(/"/g, '""');
        const category = it.category?.name ? String(it.category.name).replace(/"/g, '""') : '';
        const unit = it.unit?.symbol || it.unit?.name || '';
        return `${it.id},"${name}","${category}","${unit}",${it.currentStock},${it.thresholdQty},${it.costPerUnit}`;
      }).join('\n');
      const csv = header + rows;
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', 'attachment; filename="inventory.csv"');
      return reply.send(csv);
    }

    if (format === 'xlsx') {
      try {
        const ExcelJS = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Inventory');
        sheet.addRow(['ID', 'Name', 'Category', 'Unit', 'Current Stock', 'Threshold', 'Cost Per Unit']);
        for (const it of items) {
          sheet.addRow([it.id, it.name, it.category?.name || '', it.unit?.symbol || it.unit?.name || '', Number(it.currentStock), Number(it.thresholdQty), Number(it.costPerUnit)]);
        }
        const buf = await workbook.xlsx.writeBuffer();
        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', 'attachment; filename="inventory.xlsx"');
        return reply.send(Buffer.from(buf));
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: 'Failed to generate xlsx: ' + (err?.message || String(err)) });
      }
    }

    return reply.status(400).send({ success: false, error: 'Unsupported format' });
  });

  // --- Bulk upload items (CSV / XLSX) ---
  app.post('/bulk-upload', async (request: any, reply: any) => {
    const restaurantId = (request as any).restaurantId;
    try {
      if (!request.isMultipart || !request.isMultipart()) {
        return reply.status(400).send({ success: false, error: 'Expected multipart/form-data' });
      }
      const data = await request.file();
      if (!data) return reply.status(400).send({ success: false, error: 'No file uploaded' });

      const filename = data.filename || '';
      const chunks: Uint8Array[] = [];
      for await (const chunk of data.file) chunks.push(chunk as Uint8Array);
      const buf = Buffer.concat(chunks);

      const ext = (filename.split('.').pop() || '').toLowerCase();
      const rows: any[] = [];

      const splitCSV = (line: string) => {
        const out: string[] = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
            else inQuotes = !inQuotes;
          } else if (ch === ',' && !inQuotes) {
            out.push(cur);
            cur = '';
          } else {
            cur += ch;
          }
        }
        out.push(cur);
        return out.map(s => s.trim().replace(/^"|"$/g, ''));
      };

      if (ext === 'xlsx' || ext === 'xls') {
        try {
          const ExcelJS = await import('exceljs');
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(buf);
          const worksheet = workbook.worksheets[0];
          if (!worksheet) return reply.status(400).send({ success: false, error: 'No worksheet found' });
          const headerRow = worksheet.getRow(1);
          const header = (headerRow.values || []).slice(1).map((v: any) => String(v || '').trim().toLowerCase());
          worksheet.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
            if (rowNumber === 1) return;
            const vals = (row.values || []).slice(1);
            const obj: any = {};
            for (let i = 0; i < header.length; i++) obj[header[i]] = vals[i] ?? '';
            rows.push(obj);
          });
        } catch (err: any) {
          return reply.status(500).send({ success: false, error: 'Failed to parse xlsx: ' + (err?.message || String(err)) });
        }
      } else {
        const s = buf.toString('utf8');
        const lines = s.split(/\r?\n/).filter((l: string) => l.trim() !== '');
        if (lines.length === 0) return reply.status(400).send({ success: false, error: 'CSV is empty' });
        const header = splitCSV(lines[0]).map(h => String(h || '').trim().toLowerCase());
        for (let i = 1; i < lines.length; i++) {
          const values = splitCSV(lines[i]);
          if (values.every(v => v === '')) continue;
          const obj: any = {};
          for (let j = 0; j < header.length; j++) obj[header[j]] = values[j] ?? '';
          rows.push(obj);
        }
      }

      const results: any = { created: 0, updated: 0, errors: [] };

      for (let idx = 0; idx < rows.length; idx++) {
        const r = rows[idx];
        try {
          const name = String(r.name || r['item name'] || r.item || r.title || '').trim();
          if (!name) { results.errors.push({ row: idx + 2, error: 'Missing name' }); continue; }
          const categoryName = String(r.category || r['category name'] || 'Uncategorized').trim();
          const unitSymbol = String(r.unit || r['unit symbol'] || r.unit_symbol || 'pcs').trim();
          const thresholdQty = Number(r.threshold || r.thresholdqty || r['threshold qty'] || r['threshold'] || 0) || 0;
          const currentStock = Number(r.currentstock || r.stock || r['current stock'] || 0) || 0;
          const costPerUnit = Number(r.cost || r.costperunit || 0) || 0;

          let category = await prisma.inventoryItemCategory.findFirst({ where: { restaurantId, name: categoryName } });
          if (!category) category = await prisma.inventoryItemCategory.create({ data: { restaurantId, name: categoryName } });

          let unit = await prisma.inventoryUnit.findFirst({ where: { restaurantId, OR: [{ name: unitSymbol }, { symbol: unitSymbol }] } });
          if (!unit) unit = await prisma.inventoryUnit.create({ data: { restaurantId, name: unitSymbol, symbol: unitSymbol } });

          const existing = await prisma.inventoryItem.findFirst({ where: { restaurantId, name } });
          if (existing) {
            await prisma.inventoryItem.update({ where: { id: existing.id }, data: { categoryId: category.id, unitId: unit.id, thresholdQty, currentStock, costPerUnit } });
            results.updated++;
          } else {
            await prisma.inventoryItem.create({ data: { restaurantId, name, categoryId: category.id, unitId: unit.id, thresholdQty, currentStock, costPerUnit } });
            results.created++;
          }
        } catch (err: any) {
          results.errors.push({ row: idx + 2, error: err?.message || String(err) });
        }
      }

      return { success: true, data: results };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err?.message || String(err) });
    }
  });

  // --- Dashboard summary (low-stock) ---
  app.get('/summary', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const all = await prisma.inventoryItem.findMany({ where: { restaurantId }, include: { unit: true } });
    const low = all.filter((it: any) => Number(it.currentStock) <= Number(it.thresholdQty));
    return { success: true, data: { totalItems: all.length, lowStockCount: low.length, lowStock: low } };
  });
}
