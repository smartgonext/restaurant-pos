import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { buildApp, prisma } from '../src/app.js';
import { setupSocketIO } from '../src/plugins/socket.js';

let app;
const created = {
  uploadsDir: path.resolve('uploads'),
  uploadedMarkers: [],
};

const autoImageByName = (itemName) => {
  const safe = encodeURIComponent(String(itemName || 'food').trim() || 'food');
  const lock = Math.abs(String(itemName || 'food').split('').reduce((s, ch) => s + ch.charCodeAt(0), 0));
  return `https://image.pollinations.ai/prompt/delicious,indian,restaurant,food,dish,${safe},high,quality,professional,culinary,photography?width=800&height=800&seed=${lock}&nologo=true&model=flux`;
};

const buildMultipartPayload = ({ fields, fileFieldName, fileName, fileContent, fileContentType }) => {
  const boundary = `----NodeTestBoundary${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const chunks = [];
  const push = (v) => chunks.push(Buffer.isBuffer(v) ? v : Buffer.from(v));

  for (const [key, value] of Object.entries(fields || {})) {
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${key}"\r\n\r\n`);
    push(String(value));
    push('\r\n');
  }

  push(`--${boundary}\r\n`);
  push(`Content-Disposition: form-data; name="${fileFieldName}"; filename="${fileName}"\r\n`);
  push(`Content-Type: ${fileContentType || 'application/octet-stream'}\r\n\r\n`);
  push(fileContent);
  push('\r\n');
  push(`--${boundary}--\r\n`);

  const payload = Buffer.concat(chunks);
  return {
    payload,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(payload.length),
    },
  };
};

before(async () => {
  app = await buildApp();
  try {
    const fakeIo = {
      on: () => {},
      to: () => ({ emit: () => {} }),
    };
    setupSocketIO(fakeIo);
  } catch {
    // ignore socket setup failures in tests
  }
  if (!fs.existsSync(created.uploadsDir)) {
    fs.mkdirSync(created.uploadsDir, { recursive: true });
  }
});

after(async () => {
  try {
    if (created.restaurantId) {
      await prisma.itemModifier.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.menuItem.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.itemCategory.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.itemGroup.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.menu.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.branch.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.staff.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
      await prisma.restaurant.deleteMany({ where: { id: created.restaurantId } }).catch(() => {});
    }

    if (fs.existsSync(created.uploadsDir)) {
      const files = await fs.promises.readdir(created.uploadsDir).catch(() => []);
      for (const file of files) {
        if (created.uploadedMarkers.some((marker) => file.includes(marker))) {
          await fs.promises.unlink(path.join(created.uploadsDir, file)).catch(() => {});
        }
      }
    }
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
});

test('Export then re-import menu items: Group decides KOT/Non-KOT and AI/LIB images are assigned correctly', { timeout: 120_000 }, async () => {
  const unique = `bulk-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  created.uploadedMarkers.push(unique);

  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Bulk Test ${unique}`,
      slug: `bulk-test-${unique}`,
      email: `bulk-test-${unique}@example.com`,
      status: 'active',
      enabledModules: '',
    },
  });
  created.restaurantId = restaurant.id;

  const branch = await prisma.branch.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Main Branch',
      branchCode: `BR-${unique}`,
      isDefault: true,
      isActive: true,
    },
  });

  const password = 'Pass@1234';
  const hash = await bcrypt.hash(password, 10);
  const staffEmail = `bulk-staff-${unique}@example.com`;
  await prisma.staff.create({
    data: {
      restaurantId: restaurant.id,
      branchId: branch.id,
      name: 'Bulk Staff',
      email: staffEmail,
      password: hash,
      role: 'restaurant_admin',
      isActive: true,
    },
  });

  const loginResp = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: staffEmail, password },
  });
  assert.equal(loginResp.statusCode, 200, `Login failed: ${loginResp.body}`);
  const token = loginResp.json()?.data?.token;
  assert.ok(token, 'Auth token missing');

  const menu = await prisma.menu.create({
    data: { restaurantId: restaurant.id, name: 'General Menu', isActive: true, sortOrder: 1 },
  });

  const kotGroup = await prisma.itemGroup.create({
    data: { restaurantId: restaurant.id, name: 'KOT', isKOTEnabled: true, sortOrder: 1 },
  });
  const nonKotGroup = await prisma.itemGroup.create({
    data: { restaurantId: restaurant.id, name: 'Non KOT', isKOTEnabled: false, sortOrder: 2 },
  });

  const kotCategoryName = `KOT Cat ${unique}`;
  const nonKotCategoryName = `Stock Cat ${unique}`;

  const kotCategory = await prisma.itemCategory.create({
    data: {
      restaurantId: restaurant.id,
      name: kotCategoryName,
      isKOTEnabled: true,
      groupId: kotGroup.id,
    },
  });
  const nonKotCategory = await prisma.itemCategory.create({
    data: {
      restaurantId: restaurant.id,
      name: nonKotCategoryName,
      isKOTEnabled: false,
      groupId: nonKotGroup.id,
    },
  });

  const aiItemName = `AI KOT Item ${unique}`;
  const libItemName = `LIB Stock Item ${unique}`;
  const aiSeedFilename = `ai-seed-${unique}.jpg`;
  const libHintFilename = `lib-hint-${unique}.jpg`;
  const libHintBase = path.parse(libHintFilename).name;

  const seededAiPath = path.join(created.uploadsDir, aiSeedFilename);
  const seededLibPath = path.join(created.uploadsDir, libHintFilename);
  await fs.promises.writeFile(seededAiPath, Buffer.from(`seed-ai-${unique}`));
  await fs.promises.writeFile(seededLibPath, Buffer.from(`seed-${unique}`));

  await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      menuId: menu.id,
      categoryId: kotCategory.id,
      name: aiItemName,
      description: 'AI source item',
      price: '140',
      isVeg: true,
      isAvailable: true,
      image: `/static/${aiSeedFilename}`,
      productQR: `AI-${unique}`,
      isAutoImage: true,
    },
  });

  await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      menuId: menu.id,
      categoryId: nonKotCategory.id,
      name: libItemName,
      description: 'LIB source item',
      price: '95',
      isVeg: true,
      isAvailable: true,
      image: `/static/${libHintFilename}`,
      productQR: `LIB-${unique}`,
      isAutoImage: false,
    },
  });

  const exportResp = await app.inject({
    method: 'GET',
    url: '/api/restaurant/menu-items/export',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(exportResp.statusCode, 200, `Export failed: ${exportResp.body}`);

  const exportedWorkbook = new ExcelJS.Workbook();
  await exportedWorkbook.xlsx.load(exportResp.rawPayload);
  const exportedSheet = exportedWorkbook.worksheets[0];
  assert.ok(exportedSheet, 'Export sheet missing');

  const exportedNames = [];
  for (let i = 2; i <= exportedSheet.rowCount; i++) {
    const row = exportedSheet.getRow(i);
    const name = String(row.getCell(2).text || row.getCell(2).value || '').trim();
    if (name) exportedNames.push(name);
  }
  assert.ok(exportedNames.includes(aiItemName), 'AI item missing from export');
  assert.ok(exportedNames.includes(libItemName), 'LIB item missing from export');

  const importWorkbook = new ExcelJS.Workbook();
  const importSheet = importWorkbook.addWorksheet('Menu Items Import');
  importSheet.addRow([
    'SignatureName',
    'SellingPrice',
    'ChefNote',
    'ImageMode',
    'Image',
    'AssignedMenu',
    'Group',
    'Category',
    'KitchenPrepMin',
    'VegetarianOption',
    'InstantlyAvailable',
    'ModifierGroup',
    'ProductQR',
  ]);

  importSheet.addRow([
    aiItemName,
    '155',
    'AI image item',
    'ai',
    '',
    menu.name,
    'KOT',
    kotCategoryName,
    '10',
    'true',
    'true',
    '',
    `AI-${unique}`,
  ]);

  importSheet.addRow([
    libItemName,
    '110',
    'LIB image item',
    'lib',
    libHintBase,
    menu.name,
    'Non KOT',
    nonKotCategoryName,
    '',
    'true',
    'true',
    '',
    `LIB-${unique}`,
  ]);

  const importBuffer = Buffer.from(await importWorkbook.xlsx.writeBuffer());
  const multipart = buildMultipartPayload({
    fields: { template: 'non-kot' },
    fileFieldName: 'file',
    fileName: `import-${unique}.xlsx`,
    fileContent: importBuffer,
    fileContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const uploadResp = await app.inject({
    method: 'POST',
    url: '/api/restaurant/menu-items/bulk-upload?template=non-kot',
    headers: {
      authorization: `Bearer ${token}`,
      ...multipart.headers,
    },
    payload: multipart.payload,
  });

  assert.equal(uploadResp.statusCode, 200, `Bulk import failed: ${uploadResp.body}`);
  const uploadJson = uploadResp.json();
  assert.equal(uploadJson.success, true, `Bulk upload success=false: ${uploadResp.body}`);

  const itemsResp = await app.inject({
    method: 'GET',
    url: '/api/restaurant/menu-items',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(itemsResp.statusCode, 200, `Fetch items failed: ${itemsResp.body}`);
  const items = itemsResp.json()?.data || [];

  const aiItem = items.find((it) => it.name === aiItemName);
  const libItem = items.find((it) => it.name === libItemName);

  assert.ok(aiItem, 'AI item missing after import');
  assert.ok(libItem, 'LIB item missing after import');

  assert.equal(Boolean(aiItem?.category?.isKOTEnabled), true, 'AI item category should be KOT');
  assert.equal(Boolean(libItem?.category?.isKOTEnabled), false, 'LIB item category should be Non-KOT');

  const expectedAiImage = autoImageByName(aiItemName);
  assert.equal(aiItem.image, expectedAiImage, `AI image mismatch. Expected ${expectedAiImage}, got ${aiItem.image}`);

  assert.equal(typeof libItem.image, 'string', 'LIB item image should be a string');
  assert.ok(libItem.image.startsWith('/static/'), `LIB item image must be local static path, got: ${libItem.image}`);
  assert.notEqual(libItem.image, expectedAiImage, `LIB item image should not be AI-generated URL, got: ${libItem.image}`);
  assert.equal(Boolean(libItem.isAutoImage), false, 'LIB item should not be flagged as auto AI image');
});
