import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buildApp, prisma } from '../src/app.js';
import { setupSocketIO } from '../src/plugins/socket.js';

let app;
const created = {};

before(async () => {
    app = await buildApp();
    try {
        const fakeIo = {
            on: (_, __) => {},
            to: (_room) => ({ emit: (_event, _data) => {} }),
        };
        setupSocketIO(fakeIo);
    } catch (e) {
        // ignore
    }
});

after(async () => {
    try {
        if (created.restaurantId) {
            // Delete order payments
            if (created.orderId) {
                await prisma.orderPayment.deleteMany({ where: { orderId: created.orderId } }).catch(() => {});
            }
            await prisma.reservation.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.deliveryExecutive.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.expense.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.expenseCategory.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.order.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.table.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.area.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.itemModifier.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.modifierGroup.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.menuItem.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.itemCategory.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.itemGroup.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.menu.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.customer.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.staff.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.branch.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.restaurantSettings.deleteMany({ where: { restaurantId: created.restaurantId } }).catch(() => {});
            await prisma.restaurant.deleteMany({ where: { id: created.restaurantId } }).catch(() => {});
        }
    } catch (err) {
        console.error('Cleanup error:', err?.message || err);
    } finally {
        await app.close();
        await prisma.$disconnect();
    }
});

test('Comprehensive Restaurant CRUD Operations Test', { timeout: 120_000 }, async () => {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    console.log('CRUD comprehensive test starting', unique);

    // 1. Create Restaurant & initial objects
    const restaurant = await prisma.restaurant.create({
        data: {
            name: `CRUD Test Restaurant ${unique}`,
            slug: `crud-test-${unique}`,
            email: `crud-test-${unique}@example.com`,
            status: 'active',
            enabledModules: '[]',
        },
    });
    created.restaurantId = restaurant.id;

    const branch = await prisma.branch.create({
        data: {
            restaurantId: restaurant.id,
            name: 'CRUD Main Branch',
            branchCode: `BR-${unique}`,
            isDefault: true,
            isActive: true,
        },
    });
    created.branchId = branch.id;

    // create staff and login to get admin authorization
    const staffPassword = 'Pass@1234';
    const staffHash = await bcrypt.hash(staffPassword, 10);
    const staffEmail = `crud-staff-${unique}@example.com`;
    const adminStaff = await prisma.staff.create({
        data: {
            restaurantId: restaurant.id,
            branchId: branch.id,
            name: 'CRUD Admin Staff',
            email: staffEmail,
            password: staffHash,
            role: 'restaurant_admin',
            isActive: true,
        },
    });
    created.adminStaffId = adminStaff.id;

    const loginResp = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: staffEmail, password: staffPassword }
    });
    assert.equal(loginResp.statusCode, 200, 'Staff login failed');
    const token = loginResp.json().data?.token;
    assert.ok(token, 'Authorization token missing');
    const authHeader = { authorization: `Bearer ${token}` };

    // 2. Dashboard
    console.log('Testing Dashboard...');
    const dashboardResp = await app.inject({
        method: 'GET',
        url: '/api/restaurant/dashboard',
        headers: authHeader
    });
    assert.equal(dashboardResp.statusCode, 200, 'Dashboard GET failed');
    assert.ok(dashboardResp.json().success, 'Dashboard success should be true');

    // 3. Branches CRUD
    console.log('Testing Branches CRUD...');
    const newBranchCode = `BR-CRUD-${unique}`;
    const createBranch = await app.inject({
        method: 'POST',
        url: '/api/restaurant/branches',
        headers: authHeader,
        payload: { name: 'CRUD Branch 2', branchCode: newBranchCode, isActive: true }
    });
    assert.equal(createBranch.statusCode, 200, 'Create branch failed');
    const branch2 = createBranch.json().data;
    assert.equal(branch2.name, 'CRUD Branch 2');

    const getBranches = await app.inject({
        method: 'GET',
        url: '/api/restaurant/branches',
        headers: authHeader
    });
    assert.equal(getBranches.statusCode, 200, 'Get branches failed');
    assert.ok(getBranches.json().data.length >= 2, 'Should have at least 2 branches');

    const updateBranch = await app.inject({
        method: 'PUT',
        url: `/api/restaurant/branches/${branch2.id}`,
        headers: authHeader,
        payload: { name: 'CRUD Branch 2 Updated', isActive: false }
    });
    assert.equal(updateBranch.statusCode, 200, 'Update branch failed');
    assert.equal(updateBranch.json().data.name, 'CRUD Branch 2 Updated');

    const deleteBranch = await app.inject({
        method: 'DELETE',
        url: `/api/restaurant/branches/${branch2.id}`,
        headers: authHeader
    });
    assert.equal(deleteBranch.statusCode, 200, 'Delete branch failed');

    // 4. Staff CRUD
    console.log('Testing Staff CRUD...');
    const testStaffEmail = `test-staff-${unique}@example.com`;
    const createStaff = await app.inject({
        method: 'POST',
        url: '/api/restaurant/staff',
        headers: authHeader,
        payload: { name: 'Test Waiter', email: testStaffEmail, password: 'Pass@1234password', role: 'waiter', branchId: branch.id }
    });
    assert.equal(createStaff.statusCode, 200, 'Create staff failed');
    const staffId = createStaff.json().data.id;

    const getStaff = await app.inject({
        method: 'GET',
        url: '/api/restaurant/staff',
        headers: authHeader
    });
    assert.equal(getStaff.statusCode, 200, 'Get staff failed');

    const updateStaff = await app.inject({
        method: 'PUT',
        url: `/api/restaurant/staff/${staffId}`,
        headers: authHeader,
        payload: { name: 'Test Waiter Updated', isActive: false }
    });
    assert.equal(updateStaff.statusCode, 200, 'Update staff failed');
    assert.equal(updateStaff.json().data.name, 'Test Waiter Updated');

    const deleteStaff = await app.inject({
        method: 'DELETE',
        url: `/api/restaurant/staff/${staffId}`,
        headers: authHeader
    });
    assert.equal(deleteStaff.statusCode, 200, 'Delete staff failed');

    // 5. Menus CRUD
    console.log('Testing Menus CRUD...');
    const createMenu = await app.inject({
        method: 'POST',
        url: '/api/restaurant/menus',
        headers: authHeader,
        payload: { name: 'CRUD Menu', description: 'Test Description', isActive: true, sortOrder: 1 }
    });
    assert.equal(createMenu.statusCode, 200, 'Create menu failed');
    const menu = createMenu.json().data;
    assert.equal(menu.name, 'CRUD Menu');
    created.menuId = menu.id;

    const getMenus = await app.inject({
        method: 'GET',
        url: '/api/restaurant/menus',
        headers: authHeader
    });
    assert.equal(getMenus.statusCode, 200, 'Get menus failed');

    const updateMenu = await app.inject({
        method: 'PUT',
        url: `/api/restaurant/menus/${menu.id}`,
        headers: authHeader,
        payload: { name: 'CRUD Menu Updated', description: 'Updated Desc', isActive: true }
    });
    assert.equal(updateMenu.statusCode, 200, 'Update menu failed');
    assert.equal(updateMenu.json().data.name, 'CRUD Menu Updated');

    // 6. Item Groups CRUD
    console.log('Testing Item Groups CRUD...');
    const createGroup = await app.inject({
        method: 'POST',
        url: '/api/restaurant/item-groups',
        headers: authHeader,
        payload: { name: `CRUD Group ${unique}`, description: 'Test Group', isKOTEnabled: true, sortOrder: 1 }
    });
    assert.equal(createGroup.statusCode, 200, 'Create item group failed');
    const group = createGroup.json().data;
    assert.equal(group.name, `CRUD Group ${unique}`);
    created.groupId = group.id;

    const getGroups = await app.inject({
        method: 'GET',
        url: '/api/restaurant/item-groups',
        headers: authHeader
    });
    assert.equal(getGroups.statusCode, 200, 'Get item groups failed');

    const updateGroup = await app.inject({
        method: 'PUT',
        url: `/api/restaurant/item-groups/${group.id}`,
        headers: authHeader,
        payload: { name: `CRUD Group Updated ${unique}`, description: 'Updated Group Desc', isKOTEnabled: true }
    });
    assert.equal(updateGroup.statusCode, 200, 'Update item group failed');
    assert.equal(updateGroup.json().data.name, `CRUD Group Updated ${unique}`);

    // 7. Item Categories CRUD
    console.log('Testing Item Categories CRUD...');
    const createCategory = await app.inject({
        method: 'POST',
        url: '/api/restaurant/item-categories',
        headers: authHeader,
        payload: { name: `CRUD Cat ${unique}`, description: 'Test Category', groupId: group.id, sortOrder: 1, isKOTEnabled: true }
    });
    assert.equal(createCategory.statusCode, 200, 'Create category failed');
    const category = createCategory.json().data;
    assert.equal(category.name, `CRUD Cat ${unique}`);
    created.categoryId = category.id;

    const getCategories = await app.inject({
        method: 'GET',
        url: '/api/restaurant/item-categories',
        headers: authHeader
    });
    assert.equal(getCategories.statusCode, 200, 'Get categories failed');

    const updateCategory = await app.inject({
        method: 'PUT',
        url: `/api/restaurant/item-categories/${category.id}`,
        headers: authHeader,
        payload: { name: `CRUD Cat Updated ${unique}`, description: 'Updated Cat Desc', groupId: group.id }
    });
    assert.equal(updateCategory.statusCode, 200, 'Update category failed');
    assert.equal(updateCategory.json().data.name, `CRUD Cat Updated ${unique}`);

    // 8. Menu Items CRUD
    console.log('Testing Menu Items CRUD...');
    const createItem = await app.inject({
        method: 'POST',
        url: '/api/restaurant/menu-items',
        headers: authHeader,
        payload: { name: 'CRUD Item', price: 15.5, menuId: menu.id, categoryId: category.id, description: 'Yummy food', isVeg: true, isAvailable: true }
    });
    assert.equal(createItem.statusCode, 200, 'Create menu item failed');
    const menuItem = createItem.json().data;
    assert.equal(menuItem.name, 'CRUD Item');
    created.menuItemId = menuItem.id;

    const getItems = await app.inject({
        method: 'GET',
        url: '/api/restaurant/menu-items',
        headers: authHeader
    });
    assert.equal(getItems.statusCode, 200, 'Get menu items failed');

    const updateItem = await app.inject({
        method: 'PUT',
        url: `/api/restaurant/menu-items/${menuItem.id}`,
        headers: authHeader,
        payload: { name: 'CRUD Item Updated', price: 18.0 }
    });
    assert.equal(updateItem.statusCode, 200, 'Update menu item failed');
    assert.equal(Number(updateItem.json().data.price), 18.0);

    // 9. Modifier Groups CRUD
    console.log('Testing Modifier Groups CRUD...');
    const createModifier = await app.inject({
        method: 'POST',
        url: '/api/restaurant/modifier-groups',
        headers: authHeader,
        payload: { name: 'CRUD Modifier Group', options: '[]' }
    });
    assert.equal(createModifier.statusCode, 200, 'Create modifier group failed');
    const modifier = createModifier.json().data;
    created.modifierId = modifier.id;

    const getModifiers = await app.inject({
        method: 'GET',
        url: '/api/restaurant/modifier-groups',
        headers: authHeader
    });
    assert.equal(getModifiers.statusCode, 200, 'Get modifier groups failed');

    const updateModifier = await app.inject({
        method: 'PUT',
        url: `/api/restaurant/modifier-groups/${modifier.id}`,
        headers: authHeader,
        payload: { name: 'CRUD Modifier Group Updated', options: '[]' }
    });
    assert.equal(updateModifier.statusCode, 200, 'Update modifier group failed');

    // 10. Areas & Tables CRUD (using our new endpoints)
    console.log('Testing Areas & Tables CRUD...');
    const createArea = await app.inject({
        method: 'POST',
        url: '/api/restaurant/areas',
        headers: authHeader,
        payload: { name: 'CRUD Area', sortOrder: 1 }
    });
    assert.equal(createArea.statusCode, 200, 'Create area failed');
    const area = createArea.json().data;
    assert.equal(area.name, 'CRUD Area');
    created.areaId = area.id;

    const getAreas = await app.inject({
        method: 'GET',
        url: '/api/restaurant/areas',
        headers: authHeader
    });
    assert.equal(getAreas.statusCode, 200, 'Get areas failed');

    const updateArea = await app.inject({
        method: 'PUT',
        url: `/api/restaurant/areas/${area.id}`,
        headers: authHeader,
        payload: { name: 'CRUD Area Updated', sortOrder: 2 }
    });
    assert.equal(updateArea.statusCode, 200, 'Update area failed');
    assert.equal(updateArea.json().data.name, 'CRUD Area Updated');

    const createTable = await app.inject({
        method: 'POST',
        url: '/api/restaurant/tables',
        headers: authHeader,
        payload: { name: 'CRUD Table', capacity: 4, areaId: area.id }
    });
    assert.equal(createTable.statusCode, 200, 'CreateTable failed');
    const table = createTable.json().data;
    assert.equal(table.name, 'CRUD Table');
    created.tableId = table.id;

    const getTables = await app.inject({
        method: 'GET',
        url: '/api/restaurant/tables',
        headers: authHeader
    });
    assert.equal(getTables.statusCode, 200, 'Get tables failed');

    const updateTable = await app.inject({
        method: 'PUT',
        url: `/api/restaurant/tables/${table.id}`,
        headers: authHeader,
        payload: { name: 'CRUD Table Updated', capacity: 6 }
    });
    assert.equal(updateTable.statusCode, 200, 'Update table failed');
    assert.equal(updateTable.json().data.name, 'CRUD Table Updated');

    // 11. Customers CRUD (using our new endpoints)
    console.log('Testing Customers CRUD...');
    const customerPhone = `999${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
    const createCustomer = await app.inject({
        method: 'POST',
        url: '/api/restaurant/customers',
        headers: authHeader,
        payload: { name: 'CRUD Customer', email: `customer-${unique}@example.com`, phone: customerPhone, address: '123 Test St' }
    });
    assert.equal(createCustomer.statusCode, 200, 'Create customer failed');
    const customer = createCustomer.json().data;
    assert.equal(customer.name, 'CRUD Customer');
    created.customerId = customer.id;

    const getCustomers = await app.inject({
        method: 'GET',
        url: '/api/restaurant/customers',
        headers: authHeader
    });
    assert.equal(getCustomers.statusCode, 200, 'Get customers failed');

    const updateCustomer = await app.inject({
        method: 'PUT',
        url: `/api/restaurant/customers/${customer.id}`,
        headers: authHeader,
        payload: { name: 'CRUD Customer Updated', address: '456 Updated St' }
    });
    assert.equal(updateCustomer.statusCode, 200, 'Update customer failed');
    assert.equal(updateCustomer.json().data.name, 'CRUD Customer Updated');

    // 12. Reservations CRUD (using our new endpoints)
    console.log('Testing Reservations CRUD...');
    const createReservation = await app.inject({
        method: 'POST',
        url: '/api/restaurant/reservations',
        headers: authHeader,
        payload: { customerName: 'CRUD Res Customer', customerPhone, partySize: 4, date: new Date().toISOString(), startTime: '18:00', tableId: table.id }
    });
    assert.equal(createReservation.statusCode, 200, 'Create reservation failed');
    const reservation = createReservation.json().data;
    created.reservationId = reservation.id;

    const getReservations = await app.inject({
        method: 'GET',
        url: '/api/restaurant/reservations',
        headers: authHeader
    });
    assert.equal(getReservations.statusCode, 200, 'Get reservations failed');

    const updateReservation = await app.inject({
        method: 'PUT',
        url: `/api/restaurant/reservations/${reservation.id}`,
        headers: authHeader,
        payload: { customerName: 'CRUD Res Customer Updated', partySize: 5 }
    });
    assert.equal(updateReservation.statusCode, 200, 'Update reservation failed');
    assert.equal(updateReservation.json().data.customerName, 'CRUD Res Customer Updated');

    // 13. Delivery Executives CRUD
    console.log('Testing Delivery Executive CRUD...');
    const createDelivery = await app.inject({
        method: 'POST',
        url: '/api/restaurant/delivery-executives',
        headers: authHeader,
        payload: { name: 'CRUD Delivery Boy', phone: '1234567890', status: 'available', partnerCode: `PARTNER-${unique}` }
    });
    assert.equal(createDelivery.statusCode, 200, 'Create delivery executive failed');
    const delivery = createDelivery.json().data;
    assert.equal(delivery.name, 'CRUD Delivery Boy');
    created.deliveryId = delivery.id;

    const getDeliveries = await app.inject({
        method: 'GET',
        url: '/api/restaurant/delivery-executives',
        headers: authHeader
    });
    assert.equal(getDeliveries.statusCode, 200, 'Get delivery executives failed');

    const updateDelivery = await app.inject({
        method: 'PUT',
        url: `/api/restaurant/delivery-executives/${delivery.id}`,
        headers: authHeader,
        payload: { name: 'CRUD Delivery Boy Updated', status: 'busy' }
    });
    assert.equal(updateDelivery.statusCode, 200, 'Update delivery executive failed');
    assert.equal(updateDelivery.json().data.name, 'CRUD Delivery Boy Updated');

    const deleteDelivery = await app.inject({
        method: 'DELETE',
        url: `/api/restaurant/delivery-executives/${delivery.id}`,
        headers: authHeader
    });
    assert.equal(deleteDelivery.statusCode, 200, 'Delete delivery executive failed');

    // 14. Expenses CRUD
    console.log('Testing Expenses CRUD...');
    const createExpCategory = await app.inject({
        method: 'POST',
        url: '/api/restaurant/expense-categories',
        headers: authHeader,
        payload: { name: `CRUD Exp Cat ${unique}`, description: 'Expense Category for CRUD' }
    });
    assert.equal(createExpCategory.statusCode, 200, 'Create expense category failed');
    const expCategory = createExpCategory.json().data;
    created.expCategoryId = expCategory.id;

    const getExpCategories = await app.inject({
        method: 'GET',
        url: '/api/restaurant/expense-categories',
        headers: authHeader
    });
    assert.equal(getExpCategories.statusCode, 200, 'Get expense categories failed');

    const createExpense = await app.inject({
        method: 'POST',
        url: '/api/restaurant/expenses',
        headers: authHeader,
        payload: { categoryId: expCategory.id, title: 'CRUD Rent Expense', amount: 500.5, expenseDate: new Date().toISOString(), paymentStatus: 'pending' }
    });
    assert.equal(createExpense.statusCode, 200, 'Create expense failed');
    const expense = createExpense.json().data;
    assert.equal(expense.title, 'CRUD Rent Expense');
    created.expenseId = expense.id;

    const getExpenses = await app.inject({
        method: 'GET',
        url: '/api/restaurant/expenses',
        headers: authHeader
    });
    assert.equal(getExpenses.statusCode, 200, 'Get expenses failed');

    // 15. Orders and Payments CRUD
    console.log('Testing Orders and Payments CRUD...');
    const createOrder = await app.inject({
        method: 'POST',
        url: '/api/restaurant/orders',
        headers: authHeader,
        payload: {
            orderNumber: `ORD-CRUD-${unique}`,
            type: 'dine_in',
            status: 'placed',
            pax: 2,
            subtotal: 100.0,
            total: 105.0,
            tableId: table.id,
            customerId: customer.id,
            staffId: adminStaff.id,
            items: []
        }
    });
    assert.equal(createOrder.statusCode, 200, 'Create order failed');
    const order = createOrder.json().data;
    assert.ok(order.orderNumber, 'Order number should be generated');
    created.orderId = order.id;

    const getOrders = await app.inject({
        method: 'GET',
        url: '/api/restaurant/orders',
        headers: authHeader
    });
    assert.equal(getOrders.statusCode, 200, 'Get orders failed');

    const getOrderDetails = await app.inject({
        method: 'GET',
        url: `/api/restaurant/orders/${order.id}`,
        headers: authHeader
    });
    assert.equal(getOrderDetails.statusCode, 200, 'Get order details failed');

    const updateOrder = await app.inject({
        method: 'PUT',
        url: `/api/restaurant/orders/${order.id}`,
        headers: authHeader,
        payload: { note: 'Order Note Updated' }
    });
    assert.equal(updateOrder.statusCode, 200, 'Update order failed');

    // Payment post
    const makePayment = await app.inject({
        method: 'POST',
        url: `/api/restaurant/orders/${order.id}/payment`,
        headers: authHeader,
        payload: { amount: 105.0, method: 'cash' }
    });
    assert.equal(makePayment.statusCode, 200, 'Make order payment failed');
    assert.ok(makePayment.json().success, 'Payment response success should be true');

    const getPayments = await app.inject({
        method: 'GET',
        url: '/api/restaurant/payments',
        headers: authHeader
    });
    assert.equal(getPayments.statusCode, 200, 'Get payments failed');
    assert.ok(getPayments.json().data.length >= 1, 'Should have at least 1 payment recorded');

    // 16. Deleting/cleanup via DELETE endpoints where supported
    console.log('Deleting entities to complete CRUD lifecycle...');
    const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/restaurant/reservations/${reservation.id}`,
        headers: authHeader
    });
    assert.equal(deleteRes.statusCode, 200, 'Delete reservation failed');

    const deleteTable = await app.inject({
        method: 'DELETE',
        url: `/api/restaurant/tables/${table.id}`,
        headers: authHeader
    });
    assert.equal(deleteTable.statusCode, 200, 'Delete table failed');

    const deleteArea = await app.inject({
        method: 'DELETE',
        url: `/api/restaurant/areas/${area.id}`,
        headers: authHeader
    });
    assert.equal(deleteArea.statusCode, 200, 'Delete area failed');

    const deleteItem = await app.inject({
        method: 'DELETE',
        url: `/api/restaurant/menu-items/${menuItem.id}`,
        headers: authHeader
    });
    assert.equal(deleteItem.statusCode, 200, 'Delete menu item failed');

    const deleteCategory = await app.inject({
        method: 'DELETE',
        url: `/api/restaurant/item-categories/${category.id}`,
        headers: authHeader
    });
    assert.equal(deleteCategory.statusCode, 200, 'Delete item category failed');

    const deleteGroup = await app.inject({
        method: 'DELETE',
        url: `/api/restaurant/item-groups/${group.id}`,
        headers: authHeader
    });
    assert.equal(deleteGroup.statusCode, 200, 'Delete item group failed');

    const deleteModifier = await app.inject({
        method: 'DELETE',
        url: `/api/restaurant/modifier-groups/${modifier.id}`,
        headers: authHeader
    });
    assert.equal(deleteModifier.statusCode, 200, 'Delete modifier group failed');

    const deleteMenu = await app.inject({
        method: 'DELETE',
        url: `/api/restaurant/menus/${menu.id}`,
        headers: authHeader
    });
    assert.equal(deleteMenu.statusCode, 200, 'Delete menu failed');

    const deleteCustomer = await app.inject({
        method: 'DELETE',
        url: `/api/restaurant/customers/${customer.id}`,
        headers: authHeader
    });
    assert.equal(deleteCustomer.statusCode, 200, 'Delete customer failed');

    console.log('✅ All CRUD operations successfully completed and verified!');
});
