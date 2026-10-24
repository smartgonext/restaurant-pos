import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buildApp, prisma } from '../src/app.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let createdRestaurantId: number | null = null;
let createdCategoryId: number | null = null;

before(async () => {
  app = await buildApp();
});

after(async () => {
  if (createdCategoryId) {
    await prisma.itemCategory.deleteMany({ where: { id: createdCategoryId } });
  }
  if (createdRestaurantId) {
    await prisma.restaurant.deleteMany({ where: { id: createdRestaurantId } });
  }

  await app.close();
  await prisma.$disconnect();
});

test('create Main POS and Sub POS terminals and login successfully', async () => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const restaurant = await prisma.restaurant.create({
    data: {
      name: `Test Restaurant ${unique}`,
      slug: `test-restaurant-${unique}`,
      email: `test-${unique}@example.com`,
      status: 'active',
      enabledModules: [],
    },
  });
  createdRestaurantId = restaurant.id;

  const branch = await prisma.branch.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Main Branch',
      branchCode: `BR-${unique}`,
      isDefault: true,
      isActive: true,
    },
  });

  const category = await prisma.itemCategory.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Snacks',
      sortOrder: 1,
    },
  });
  createdCategoryId = category.id;

  const staffPassword = 'Pass@1234';
  const staffHash = await bcrypt.hash(staffPassword, 10);
  const staffEmail = `manager-${unique}@example.com`;

  await prisma.staff.create({
    data: {
      restaurantId: restaurant.id,
      branchId: branch.id,
      name: 'Manager',
      email: staffEmail,
      password: staffHash,
      role: 'restaurant_admin',
      isActive: true,
    },
  });

  const loginResp = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: staffEmail, password: staffPassword },
  });

  assert.equal(loginResp.statusCode, 200, `staff login failed: ${loginResp.body}`);
  const loginJson = loginResp.json();
  assert.equal(loginJson.success, true);
  const staffToken = loginJson.data?.token as string;
  assert.ok(staffToken, 'staff token missing');

  const mainTerminalCode = `MAIN-${unique}`;
  const mainPin = '1234';

  const createMainResp = await app.inject({
    method: 'POST',
    url: '/api/restaurant/pos-terminals/mainpos',
    headers: { authorization: `Bearer ${staffToken}` },
    payload: {
      name: 'Main POS 1',
      terminalCode: mainTerminalCode,
      pin: mainPin,
      branchId: branch.id,
    },
  });

  assert.equal(createMainResp.statusCode, 200, `mainpos create failed: ${createMainResp.body}`);
  assert.equal(createMainResp.json().success, true);

  const subTerminalCode = `SUB-${unique}`;
  const subPin = '5678';

  const createSubResp = await app.inject({
    method: 'POST',
    url: '/api/restaurant/pos-terminals/subpos',
    headers: { authorization: `Bearer ${staffToken}` },
    payload: {
      name: 'Sub POS 1',
      terminalCode: subTerminalCode,
      pin: subPin,
      branchId: branch.id,
      groupIds: [category.id],
    },
  });

  assert.equal(createSubResp.statusCode, 200, `subpos create failed: ${createSubResp.body}`);
  assert.equal(createSubResp.json().success, true);

  const mainLoginResp = await app.inject({
    method: 'POST',
    url: '/api/mainpos/login',
    payload: { terminalCode: mainTerminalCode, pin: mainPin },
  });

  assert.equal(mainLoginResp.statusCode, 200, `mainpos login failed: ${mainLoginResp.body}`);
  const mainLoginJson = mainLoginResp.json();
  assert.equal(mainLoginJson.success, true);
  assert.ok(mainLoginJson.data?.token, 'mainpos token missing');

  const subLoginResp = await app.inject({
    method: 'POST',
    url: '/api/subpos/login',
    payload: { terminalCode: subTerminalCode, pin: subPin },
  });

  assert.equal(subLoginResp.statusCode, 200, `subpos login failed: ${subLoginResp.body}`);
  const subLoginJson = subLoginResp.json();
  assert.equal(subLoginJson.success, true);
  assert.ok(subLoginJson.data?.token, 'subpos token missing');
});