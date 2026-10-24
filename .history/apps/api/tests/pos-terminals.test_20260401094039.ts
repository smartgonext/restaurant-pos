import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { buildApp, prisma } from '../src/app.js';

let app: any;
let baseUrl = '';
let jwtToken = '';
let restaurantId = 0;
let branchId = 0;

describe('POS terminal flows (MainPOS + SubPOS)', () => {
  beforeAll(async () => {
    app = await buildApp();
    await app.listen({ port: 0 });
    const addr = app.server.address();
    const port = typeof addr === 'string' ? Number(addr.split(':').pop()) : addr.port;
    baseUrl = `http://localhost:${port}`;

    // Clean up test data (if any)
    await prisma.subPOSTerminal.deleteMany({});
    await prisma.mainPOSTerminal.deleteMany({});
    await prisma.bakeryToken.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.branch.deleteMany({});
    await prisma.restaurant.deleteMany({});

    // Create restaurant + branch + staff
    const restaurant = await prisma.restaurant.create({
      data: {
        name: 'Test Restaurant',
        slug: 'test-restaurant',
        email: 'test-restaurant@example.com',
        status: 'active',
      },
    });
    restaurantId = restaurant.id;

    const branch = await prisma.branch.create({
      data: {
        restaurantId,
        name: 'Main Branch',
        isDefault: true,
      },
    });
    branchId = branch.id;

    const hashedPassword = await bcrypt.hash('staffSecret123', 10);
    await prisma.staff.create({
      data: {
        restaurantId,
        branchId,
        name: 'Test Staff',
        email: 'staff@test-restaurant.com',
        password: hashedPassword,
        role: 'manager',
      },
    });

    // Login and keep bearer token for protected restaurant routes
    const authRes = await request(baseUrl)
      .post('/api/auth/login')
      .send({ email: 'staff@test-restaurant.com', password: 'staffSecret123' });

    expect(authRes.status).toBe(200);
    expect(authRes.body.success).toBe(true);
    jwtToken = authRes.body.data.token;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('creates Main POS terminal and logs in', async () => {
    const mainposCreate = await request(baseUrl)
      .post('/api/restaurant/pos-terminals/mainpos')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        name: 'MainPOS Terminal 1',
        terminalCode: 'MAINPOS-1',
        pin: '1234',
        branchId,
      });

    expect(mainposCreate.status).toBe(200);
    expect(mainposCreate.body.success).toBe(true);
    expect(mainposCreate.body.data).toHaveProperty('id');

    const loginRes = await request(baseUrl).post('/api/mainpos/login').send({
      terminalCode: 'MAINPOS-1',
      pin: '1234',
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data).toHaveProperty('token');
  });

  it('creates Sub POS terminal and logs in', async () => {
    const subposCreate = await request(baseUrl)
      .post('/api/restaurant/pos-terminals/subpos')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        name: 'SubPOS Terminal 1',
        terminalCode: 'SUBPOS-1',
        pin: '4321',
        branchId,
        groupIds: [1],
      });

    expect(subposCreate.status).toBe(200);
    expect(subposCreate.body.success).toBe(true);

    const loginRes = await request(baseUrl).post('/api/subpos/login').send({
      terminalCode: 'SUBPOS-1',
      pin: '4321',
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data).toHaveProperty('token');
    expect(loginRes.body.data.terminal).toMatchObject({
      name: 'SubPOS Terminal 1',
      branchId,
    });
  });
});
