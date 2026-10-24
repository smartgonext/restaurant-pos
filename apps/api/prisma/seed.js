import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export async function runSeed() {
  console.log('🌱 Starting seed...');

  // 1. Seed Packages
  const defaultPackage = await prisma.package.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Lifetime Pro',
      description: 'All features included',
      lifetimePrice: 999.99,
      isRecommended: true,
      isDefault: true,
      modules: JSON.stringify(['pos', 'inventory', 'hotel', 'bakery']),
      trialDays: 30
    }
  });
  console.log('✅ Package seeded');

  // 2. Seed SuperAdmin
  const saEmail = 'admin@restaurant-saas.com';
  const saPassword = 'admin123';
  const saHashedPassword = await bcrypt.hash(saPassword, 10);

  const superAdmin = await prisma.superAdminUser.upsert({
    where: { email: saEmail },
    update: {},
    create: {
      name: 'Super Admin',
      email: saEmail,
      password: saHashedPassword,
      role: 'superadmin',
    },
  });
  console.log('✅ SuperAdmin seeded:', saEmail);

  // 3. Seed a Sample Restaurant
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      name: 'My Restaurant',
      slug: 'default',
      email: 'hello@myrestaurant.com',
      status: 'active',
      enabledModules: JSON.stringify(['pos', 'inventory']),
      businessType: 'bakery'
    }
  });
  console.log('✅ Restaurant seeded');

  // 4. Seed Settings
  await prisma.restaurantSettings.upsert({
    where: { restaurantId: restaurant.id },
    update: {},
    create: {
      restaurantId: restaurant.id,
      currency: 'INR',
      currencySymbol: '₹',
      taxMode: 'order'
    }
  });
  await prisma.billSettings.upsert({
    where: { restaurantId: restaurant.id },
    update: {},
    create: {
      restaurantId: restaurant.id,
      showGST: true,
      thankYouMessage: 'Thank you for visiting!'
    }
  });
  console.log('✅ Settings seeded');

  // 5. Seed a Branch
  const branch = await prisma.branch.upsert({
    where: { id: 1 },
    update: {},
    create: {
      restaurantId: restaurant.id,
      name: 'Main Branch',
      branchCode: 'MAIN01',
      isDefault: true
    }
  });
  console.log('✅ Branch seeded');

  // 6. Seed a Staff User (for Restaurant Login)
  const staffEmail = 'staff@myrestaurant.com';
  const staffPassword = 'staff123';
  const staffHashedPassword = await bcrypt.hash(staffPassword, 10);

  await prisma.staff.upsert({
    where: { restaurantId_email: { restaurantId: restaurant.id, email: staffEmail } },
    update: {},
    create: {
      restaurantId: restaurant.id,
      branchId: branch.id,
      name: 'John Doe',
      email: staffEmail,
      password: staffHashedPassword,
      role: 'admin',
      isActive: true
    }
  });
  console.log('✅ Staff seeded:', staffEmail);

  // 7. Seed Default Roles for RBAC
  const defaultRoles = [
    { 
      name: 'admin', 
      permissions: { 
        dashboard: true, pos: true, menu: true, orders: true, inventory: true, 
        staff: true, customers: true, reports: true, expenses: true, 
        hotel: true, settings: true, tokens: true 
      } 
    },
    { 
      name: 'manager', 
      permissions: { 
        dashboard: true, pos: true, menu: true, orders: true, inventory: true, 
        customers: true, reports: true, expenses: true, staff: true, settings: false
      } 
    },
    { 
      name: 'cashier', 
      permissions: { 
        dashboard: true, pos: true, menu: false, orders: true, inventory: false, 
        customers: true, reports: false, expenses: false, staff: false, settings: false
      } 
    }
  ];

  for (const roleDef of defaultRoles) {
    await prisma.role.upsert({
      where: { restaurantId_name: { restaurantId: restaurant.id, name: roleDef.name } },
      update: { permissions: JSON.stringify(roleDef.permissions) },
      create: {
        restaurantId: restaurant.id,
        name: roleDef.name,
        permissions: JSON.stringify(roleDef.permissions)
      }
    });
  }
  console.log('✅ Default Roles seeded');

  // 8. Seed Spice Kitchen (for loyalty e2e tests)
  console.log('🌱 Seeding Spice Kitchen for QA regression...');
  const spiceRestaurant = await prisma.restaurant.upsert({
    where: { slug: 'spicekitchen' },
    update: {},
    create: {
      name: 'Spice Kitchen',
      slug: 'spicekitchen',
      email: 'demo@spicekitchen.com',
      status: 'active',
      enabledModules: JSON.stringify(['pos', 'inventory']),
      businessType: 'bakery'
    }
  });

  const deletePasswordHash = await bcrypt.hash('admin123', 10);

  await prisma.restaurantSettings.upsert({
    where: { restaurantId: spiceRestaurant.id },
    update: { posDeletePassword: deletePasswordHash },
    create: {
      restaurantId: spiceRestaurant.id,
      currency: 'INR',
      currencySymbol: '₹',
      taxMode: 'order',
      posDeletePassword: deletePasswordHash
    }
  });

  await prisma.billSettings.upsert({
    where: { restaurantId: spiceRestaurant.id },
    update: {},
    create: {
      restaurantId: spiceRestaurant.id,
      showGST: true,
      thankYouMessage: 'Thank you for visiting Spice Kitchen!'
    }
  });

  const spiceBranch = await prisma.branch.upsert({
    where: { id: 2 },
    update: {},
    create: {
      restaurantId: spiceRestaurant.id,
      name: 'Main Branch',
      branchCode: 'SPICE01',
      isDefault: true
    }
  });

  const spiceAdminPassword = 'admin123';
  const spiceAdminHash = await bcrypt.hash(spiceAdminPassword, 10);

  await prisma.staff.upsert({
    where: { restaurantId_email: { restaurantId: spiceRestaurant.id, email: 'demo@spicekitchen.com' } },
    update: {},
    create: {
      restaurantId: spiceRestaurant.id,
      branchId: spiceBranch.id,
      name: 'Spice Admin',
      email: 'demo@spicekitchen.com',
      password: spiceAdminHash,
      role: 'admin',
      isActive: true
    }
  });

  for (const roleDef of defaultRoles) {
    await prisma.role.upsert({
      where: { restaurantId_name: { restaurantId: spiceRestaurant.id, name: roleDef.name } },
      update: { permissions: JSON.stringify(roleDef.permissions) },
      create: {
        restaurantId: spiceRestaurant.id,
        name: roleDef.name,
        permissions: JSON.stringify(roleDef.permissions)
      }
    });
  }

  // Create MainPOS terminal: main1 / s1234
  const terminalPinHash = await bcrypt.hash('s1234', 10);
  await prisma.mainPOSTerminal.upsert({
    where: { terminalCode: 'main1' },
    update: {
      pin: terminalPinHash,
      restaurantId: spiceRestaurant.id,
      branchId: spiceBranch.id,
      isActive: true
    },
    create: {
      restaurantId: spiceRestaurant.id,
      branchId: spiceBranch.id,
      name: 'Main POS 1',
      terminalCode: 'main1',
      pin: terminalPinHash,
      isActive: true
    }
  });

  // Create SubPOS terminal: sub1 / s1234
  await prisma.subPOSTerminal.upsert({
    where: { terminalCode: 'sub1' },
    update: {
      pin: terminalPinHash,
      restaurantId: spiceRestaurant.id,
      branchId: spiceBranch.id,
      isActive: true
    },
    create: {
      restaurantId: spiceRestaurant.id,
      branchId: spiceBranch.id,
      name: 'Bakery Counter SubPOS',
      terminalCode: 'sub1',
      pin: terminalPinHash,
      groupIds: JSON.stringify([]),
      isActive: true
    }
  });

  // Create Loyalty Program
  await prisma.loyaltyProgram.upsert({
    where: { restaurantId: spiceRestaurant.id },
    update: {},
    create: {
      restaurantId: spiceRestaurant.id,
      pointsPerAmount: 1,
      amountPerPoint: 0.1,
      pointsPerRupee: 0.1,
      pointValue: 0.5,
      isActive: true
    }
  });

  // Create Menu, Categories, Inventory Unit & Items for multi-department (Restaurant + Bakery + Dept Store)
  const spiceMenu = await prisma.menu.create({
    data: {
      restaurantId: spiceRestaurant.id,
      name: 'Main Menu',
      isActive: true
    }
  });

  const bakeryCategory = await prisma.itemCategory.create({
    data: {
      restaurantId: spiceRestaurant.id,
      name: 'Bakery & Sweets',
      isKOTEnabled: false
    }
  });

  const restaurantCategory = await prisma.itemCategory.create({
    data: {
      restaurantId: spiceRestaurant.id,
      name: 'Kitchen Specials',
      isKOTEnabled: true
    }
  });

  const deptCategory = await prisma.itemCategory.create({
    data: {
      restaurantId: spiceRestaurant.id,
      name: 'Department Store',
      isKOTEnabled: false
    }
  });

  // Create Inventory Unit
  let pcsUnit = await prisma.inventoryUnit.findFirst({ where: { restaurantId: spiceRestaurant.id, name: 'Pieces' } });
  if (!pcsUnit) {
    pcsUnit = await prisma.inventoryUnit.create({
      data: {
        restaurantId: spiceRestaurant.id,
        name: 'Pieces',
        symbol: 'Pcs'
      }
    });
  }

  let invCategory = await prisma.inventoryItemCategory.findFirst({ where: { restaurantId: spiceRestaurant.id, name: 'Packaged Goods' } });
  if (!invCategory) {
    invCategory = await prisma.inventoryItemCategory.create({
      data: {
        restaurantId: spiceRestaurant.id,
        name: 'Packaged Goods'
      }
    });
  }

  // Inventory Item with MRP for Department Store
  const deptInvItem = await prisma.inventoryItem.upsert({
    where: { barcode: '890123456789' },
    update: {},
    create: {
      restaurantId: spiceRestaurant.id,
      categoryId: invCategory.id,
      unitId: pcsUnit.id,
      name: 'Organic Almond Milk 1L',
      sku: 'DEPT-ALM-01',
      barcode: '890123456789',
      currentStock: 100,
      costPerUnit: 140.00
    }
  });

  const existingMRP = await prisma.inventoryItemMRP.findFirst({ where: { inventoryItemId: deptInvItem.id } });
  if (!existingMRP) {
    await prisma.inventoryItemMRP.create({
      data: {
        inventoryItemId: deptInvItem.id,
        mrp: 180.00,
        purchaseRate: 140.00,
        profitPercent: 28.57,
        isActive: true
      }
    });
  }

  // Menu Items for each department
  const existingBakeryItem = await prisma.menuItem.findFirst({ where: { restaurantId: spiceRestaurant.id, name: 'Chocolate Pastry' } });
  if (!existingBakeryItem) {
    await prisma.menuItem.create({
      data: {
        restaurantId: spiceRestaurant.id,
        menuId: spiceMenu.id,
        categoryId: bakeryCategory.id,
        name: 'Chocolate Pastry',
        price: 150.00,
        isAvailable: true,
        taxPercent: 5,
        taxType: 'external'
      }
    });
  }

  const existingBiryaniItem = await prisma.menuItem.findFirst({ where: { restaurantId: spiceRestaurant.id, name: 'Special Chicken Biryani' } });
  if (!existingBiryaniItem) {
    await prisma.menuItem.create({
      data: {
        restaurantId: spiceRestaurant.id,
        menuId: spiceMenu.id,
        categoryId: restaurantCategory.id,
        name: 'Special Chicken Biryani',
        price: 280.00,
        isAvailable: true,
        taxPercent: 5,
        taxType: 'external'
      }
    });
  }

  const existingDeptMenuItem = await prisma.menuItem.findFirst({ where: { restaurantId: spiceRestaurant.id, name: 'Organic Almond Milk 1L' } });
  if (!existingDeptMenuItem) {
    await prisma.menuItem.create({
      data: {
        restaurantId: spiceRestaurant.id,
        menuId: spiceMenu.id,
        categoryId: deptCategory.id,
        inventoryItemId: deptInvItem.id,
        name: 'Organic Almond Milk 1L',
        price: 180.00,
        salesUnit: 'Pcs',
        productQR: '890123456789',
        isAvailable: true,
        taxPercent: 5,
        taxType: 'external'
      }
    });
  }

  console.log('✅ Spice Kitchen seeded successfully!');

  console.log('\n✨ Seed completed successfully!');
  console.log('--------------------------------------------------');
  console.log('SuperAdmin Login: admin@restaurant-saas.com / admin123');
  console.log('Restaurant Login: staff@myrestaurant.com / staff123');
  console.log('Spice Kitchen POS: main1 / s1234');
  console.log('--------------------------------------------------');
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  runSeed()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
