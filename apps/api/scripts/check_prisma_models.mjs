import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

(async () => {
  try {
    console.log('cwd:', process.cwd());
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    try {
      const pkgPath = req.resolve('@prisma/client/package.json');
      console.log('@prisma/client package.json resolved to:', pkgPath);
      const pkg = req('@prisma/client/package.json');
      console.log('@prisma/client version:', pkg.version);
    } catch (e) {
      console.warn('Could not resolve @prisma/client package.json:', e?.message || e);
    }

    console.log('Prisma _dmmf modelMap keys:');
    console.log(Object.keys(p._dmmf?.modelMap || {}));
    console.log('prisma.purchaseOrderPayment exists:', !!p.purchaseOrderPayment, 'type:', typeof p.purchaseOrderPayment);
  } catch (e) {
    console.error('Error reading _dmmf:', e);
  } finally {
    await p.$disconnect();
  }
})();
