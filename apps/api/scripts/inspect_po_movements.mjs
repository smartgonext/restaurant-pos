import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Check recent POs (you can add IDs you saw in logs)
  const ids = [17,18,19,20,21,22,23,26,37,38,40,41,42,43,44,45,46];
  const pos = await prisma.purchaseOrder.findMany({ where: { id: { in: ids } }, include: { items: true, supplier: true } });
  if (!pos.length) {
    console.log('No matching POs found for ids', ids);
    return;
  }

  for (const po of pos) {
    console.log('--- PO', po.id, 'orderNumber', po.orderNumber, 'status', po.status, 'total', po.total);
    for (const it of po.items) {
      console.log(' Item', it.id, 'inventoryItemId', it.inventoryItemId, 'qty', it.quantity, 'unitCost', it.unitCost, 'total', it.total);
      const mv = await prisma.inventoryMovement.findMany({ where: { referenceId: po.id, itemId: it.inventoryItemId, type: 'purchase' } });
      console.log('  Movements found for this PO+item:', mv.length);
      const item = await prisma.inventoryItem.findUnique({ where: { id: it.inventoryItemId } });
      console.log('  inventoryItem currentStock:', item?.currentStock);
    }

    const payments = await prisma.purchaseOrderPayment.findMany({ where: { purchaseOrderId: po.id } });
    console.log(' Payments:', payments.length ? payments.map(p => ({ id: p.id, amount: p.amount, method: p.method })) : 'none');
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
