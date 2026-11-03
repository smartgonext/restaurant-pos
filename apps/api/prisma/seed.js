import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const amoraProducts = JSON.parse(fs.readFileSync(path.join(__dirname, 'amora-non-kot-products.json'), 'utf8'));
const amoraKotProducts = JSON.parse(fs.readFileSync(path.join(__dirname, 'amora-kot-products.json'), 'utf8'));

const prisma = new PrismaClient();

export async function runSeed(customPrisma = null) {
  const db = customPrisma || prisma;
  console.log('🌱 Starting comprehensive Amora Bakes & Cafe seed...');

  // 1. Seed Packages
  const defaultPackage = await db.package.upsert({
    where: { id: 1 },
    update: {
      name: 'Amora Bakery & POS Pro',
      modules: JSON.stringify(['pos', 'inventory', 'bakery']),
      isRecommended: true,
      isDefault: true,
    },
    create: {
      id: 1,
      name: 'Amora Bakery & POS Pro',
      description: 'Complete all-in-one POS, Inventory, Bakery, and Dining management',
      lifetimePrice: 999.99,
      isRecommended: true,
      isDefault: true,
      modules: JSON.stringify(['pos', 'inventory', 'bakery']),
      trialDays: 365,
    },
  });
  console.log('✅ Package seeded');

  // 2. Seed SuperAdmin
  const saEmail = 'admin@restaurant-saas.com';
  const saPassword = 'admin123';
  const saHashedPassword = await bcrypt.hash(saPassword, 10);

  const superAdmin = await db.superAdminUser.upsert({
    where: { email: saEmail },
    update: {
      name: 'Super Admin',
      password: saHashedPassword,
      role: 'superadmin',
    },
    create: {
      name: 'Super Admin',
      email: saEmail,
      password: saHashedPassword,
      role: 'superadmin',
    },
  });
  console.log('✅ SuperAdmin seeded:', saEmail);

  // 3. Seed Restaurant: Amora Bakes & Cafe
  const restData = {
    name: 'Amora Bakes & Cafe',
    slug: 'amora',
    email: 'hello@amora.com',
    phone: '9544424344',
    address: 'Bharathiyar Road, Viola Garden, Nehrunagar, Karaikal, Puducherry 609605',
    logo: '/amora-logo.png',
    status: 'active',
    enabledModules: JSON.stringify(['pos', 'inventory', 'bakery']),
    businessType: 'bakery',
  };

  let restaurant = await db.restaurant.findFirst({
    where: {
      OR: [
        { slug: 'amora' },
        { slug: 'default' },
        { email: 'hello@amora.com' },
        { id: 1 },
      ],
    },
  });

  if (restaurant) {
    restaurant = await db.restaurant.update({
      where: { id: restaurant.id },
      data: restData,
    });
  } else {
    restaurant = await db.restaurant.create({
      data: restData,
    });
  }
  console.log('✅ Restaurant "Amora Bakes & Cafe" seeded (ID:', restaurant.id, ')');

  // 4. Seed Settings
  const deletePasswordHash = await bcrypt.hash('admin123', 10);

  await db.restaurantSettings.upsert({
    where: { restaurantId: restaurant.id },
    update: {
      currency: 'INR',
      currencySymbol: '₹',
      taxMode: 'order',
      sgstRate: 2.5,
      cgstRate: 2.5,
      allowDineIn: true,
      allowDelivery: true,
      allowPickup: true,
      loyaltyEnabled: true,
      posDeletePassword: deletePasswordHash,
    },
    create: {
      restaurantId: restaurant.id,
      currency: 'INR',
      currencySymbol: '₹',
      taxMode: 'order',
      sgstRate: 2.5,
      cgstRate: 2.5,
      allowDineIn: true,
      allowDelivery: true,
      allowPickup: true,
      loyaltyEnabled: true,
      posDeletePassword: deletePasswordHash,
    },
  });

  const safeExec = async (sql) => {
    try {
      await db.$executeRawUnsafe(sql);
    } catch (_) {}
  };
  await safeExec('ALTER TABLE "BillSettings" ADD COLUMN "registerAutoCloseTime" TEXT DEFAULT "23:59";');
  await safeExec('ALTER TABLE "BillSettings" ADD COLUMN "showUnitForKOT" BOOLEAN DEFAULT 0;');
  await safeExec('ALTER TABLE "BillSettings" ADD COLUMN "showUnitForNonKOT" BOOLEAN DEFAULT 1;');
  await safeExec('ALTER TABLE "BillSettings" ADD COLUMN "loyaltyDiscountFormat" TEXT DEFAULT "small_line";');
  await safeExec('ALTER TABLE "BillSettings" ADD COLUMN "kotItemsDisplay" TEXT;');
  await safeExec('ALTER TABLE "BillSettings" ADD COLUMN "nonKotItemsDisplay" TEXT;');
  await safeExec('ALTER TABLE "BillSettings" ADD COLUMN "billSectionOrder" TEXT;');
  await safeExec('ALTER TABLE "BillSettings" ADD COLUMN "upiVpa" TEXT;');
  await safeExec('ALTER TABLE "BillSettings" ADD COLUMN "upiId" TEXT;');

  await db.billSettings.upsert({
    where: { restaurantId: restaurant.id },
    update: {
      showGST: true,
      showRestaurantInfo: true,
      showPhoneNumber: true,
      showTokenNumber: true,
      billHeaderText: 'Amora Bakes & Cafe',
      thankYouMessage: 'Thank you for visiting Amora! Visit again.',
    },
    create: {
      restaurantId: restaurant.id,
      showGST: true,
      showRestaurantInfo: true,
      showPhoneNumber: true,
      showTokenNumber: true,
      billHeaderText: 'Amora Bakes & Cafe',
      thankYouMessage: 'Thank you for visiting Amora! Visit again.',
    },
  });
  console.log('✅ Settings seeded');

  // 5. Seed Branch
  const branch = await db.branch.upsert({
    where: { id: 1 },
    update: {
      restaurantId: restaurant.id,
      name: 'Amora Main Branch',
      branchCode: 'AMORA01',
      address: 'Bharathiyar Road, Viola Garden, Nehrunagar, Karaikal, Puducherry 609605',
      phone: '9544424344',
      isDefault: true,
    },
    create: {
      id: 1,
      restaurantId: restaurant.id,
      name: 'Amora Main Branch',
      branchCode: 'AMORA01',
      address: 'Bharathiyar Road, Viola Garden, Nehrunagar, Karaikal, Puducherry 609605',
      phone: '9544424344',
      isDefault: true,
    },
  });
  console.log('✅ Branch seeded');

  // 6. Seed Roles with granular permissions
  const roles = [
    {
      name: 'admin',
      permissions: {
        dashboard: true, pos: true, menu: true, orders: true, inventory: true,
        staff: true, customers: true, reports: true, expenses: true,
        settings: true, tokens: true, tables: true,
      },
    },
    {
      name: 'manager',
      permissions: {
        dashboard: true, pos: true, menu: true, orders: true, inventory: true,
        customers: true, reports: true, expenses: true, staff: true, settings: false,
        tokens: true, tables: true,
      },
    },
    {
      name: 'cashier',
      permissions: {
        dashboard: true, pos: true, menu: false, orders: true, inventory: false,
        customers: true, reports: false, expenses: false, staff: false, settings: false,
        tokens: true, tables: true,
      },
    },
    {
      name: 'waiter',
      permissions: {
        dashboard: false, pos: true, menu: false, orders: true, inventory: false,
        customers: true, reports: false, expenses: false, staff: false, settings: false,
        tokens: true, tables: true,
      },
    },
    {
      name: 'kitchen',
      permissions: {
        dashboard: false, pos: false, menu: false, orders: true, inventory: false,
        customers: false, reports: false, expenses: false, staff: false, settings: false,
        tokens: true, tables: false,
      },
    },
  ];

  for (const roleDef of roles) {
    await db.role.upsert({
      where: { restaurantId_name: { restaurantId: restaurant.id, name: roleDef.name } },
      update: { permissions: JSON.stringify(roleDef.permissions) },
      create: {
        restaurantId: restaurant.id,
        name: roleDef.name,
        permissions: JSON.stringify(roleDef.permissions),
      },
    });
  }
  console.log('✅ Roles seeded');

  // 7. Seed Staff Users
  const staffList = [
    { name: 'Amora Admin', email: 'admin@amora.com', password: 'admin123', role: 'admin' },
    { name: 'General Manager', email: 'manager@amora.com', password: 'manager123', role: 'manager' },
    { name: 'Front Cashier', email: 'cashier@amora.com', password: 'cashier123', role: 'cashier' },
    { name: 'Floor Waiter', email: 'waiter@amora.com', password: 'waiter123', role: 'waiter' },
    { name: 'Head Chef', email: 'kitchen@amora.com', password: 'kitchen123', role: 'kitchen' },
  ];

  for (const s of staffList) {
    const hashedPassword = await bcrypt.hash(s.password, 10);
    await db.staff.upsert({
      where: { restaurantId_email: { restaurantId: restaurant.id, email: s.email } },
      update: {
        name: s.name,
        password: hashedPassword,
        role: s.role,
        branchId: branch.id,
        isActive: true,
      },
      create: {
        restaurantId: restaurant.id,
        branchId: branch.id,
        name: s.name,
        email: s.email,
        password: hashedPassword,
        role: s.role,
        isActive: true,
      },
    });
  }
  console.log('✅ Staff users seeded');

  // 8. Seed Terminals
  const terminalPinHash = await bcrypt.hash('s1234', 10);
  await db.mainPOSTerminal.upsert({
    where: { terminalCode: 'main1' },
    update: {
      pin: terminalPinHash,
      restaurantId: restaurant.id,
      branchId: branch.id,
      name: 'Amora Main Counter POS',
      isActive: true,
    },
    create: {
      restaurantId: restaurant.id,
      branchId: branch.id,
      name: 'Amora Main Counter POS',
      terminalCode: 'main1',
      pin: terminalPinHash,
      isActive: true,
    },
  });

  await db.subPOSTerminal.upsert({
    where: { terminalCode: 'sub1' },
    update: {
      pin: terminalPinHash,
      restaurantId: restaurant.id,
      branchId: branch.id,
      name: 'Amora Bakery SubPOS',
      isActive: true,
    },
    create: {
      restaurantId: restaurant.id,
      branchId: branch.id,
      name: 'Amora Bakery SubPOS',
      terminalCode: 'sub1',
      pin: terminalPinHash,
      groupIds: JSON.stringify([]),
      isActive: true,
    },
  });
  console.log('✅ POS Terminals seeded (main1 / s1234, sub1 / s1234)');

  // 9. Seed Loyalty Program
  await db.loyaltyProgram.upsert({
    where: { restaurantId: restaurant.id },
    update: {
      pointsPerAmount: 1,
      amountPerPoint: 0.1,
      pointsPerRupee: 0.1,
      pointValue: 0.5,
      isActive: true,
    },
    create: {
      restaurantId: restaurant.id,
      pointsPerAmount: 1,
      amountPerPoint: 0.1,
      pointsPerRupee: 0.1,
      pointValue: 0.5,
      isActive: true,
    },
  });
  console.log('✅ Loyalty program seeded');

  // 10. Seed Dine-in Areas & Tables
  let mainHall = await db.area.findFirst({ where: { restaurantId: restaurant.id, name: 'Main Cafe Hall' } });
  if (!mainHall) {
    mainHall = await db.area.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch.id,
        name: 'Main Cafe Hall',
        sortOrder: 1,
      },
    });
  }

  let terrace = await db.area.findFirst({ where: { restaurantId: restaurant.id, name: 'Garden Terrace' } });
  if (!terrace) {
    terrace = await db.area.create({
      data: {
        restaurantId: restaurant.id,
        branchId: branch.id,
        name: 'Garden Terrace',
        sortOrder: 2,
      },
    });
  }

  for (let i = 1; i <= 5; i++) {
    const tableName = `Table ${i}`;
    const existing = await db.table.findFirst({ where: { restaurantId: restaurant.id, areaId: mainHall.id, name: tableName } });
    if (!existing) {
      await db.table.create({
        data: {
          restaurantId: restaurant.id,
          areaId: mainHall.id,
          name: tableName,
          capacity: 4,
          status: 'available',
        },
      });
    }
  }

  for (let i = 6; i <= 10; i++) {
    const tableName = `Terrace ${i}`;
    const existing = await db.table.findFirst({ where: { restaurantId: restaurant.id, areaId: terrace.id, name: tableName } });
    if (!existing) {
      await db.table.create({
        data: {
          restaurantId: restaurant.id,
          areaId: terrace.id,
          name: tableName,
          capacity: 4,
          status: 'available',
        },
      });
    }
  }
  console.log('✅ Dine-in Areas & Tables seeded');

  // 11. Seed Inventory Units
  const unitsData = [
    { name: 'Piece (pc)', symbol: 'pc' },
    { name: 'Pieces', symbol: 'Pcs' },
    { name: 'Portion', symbol: 'Portion' },
    { name: 'Kilograms', symbol: 'Kg' },
    { name: 'Grams', symbol: 'g' },
    { name: 'Litres', symbol: 'L' },
    { name: 'Box', symbol: 'Box' },
  ];
  const unitMap = {};
  for (const u of unitsData) {
    let unit = await db.inventoryUnit.findFirst({ where: { restaurantId: restaurant.id, name: u.name } });
    if (!unit) {
      unit = await db.inventoryUnit.create({
        data: { restaurantId: restaurant.id, name: u.name, symbol: u.symbol },
      });
    }
    unitMap[u.name] = unit;
  }
  const defaultUnit = unitMap['Piece (pc)'] || unitMap['Pieces'];
  const defaultKotUnit = unitMap['Portion'] || defaultUnit;

  // 12. Seed ItemGroups ('Non KOT' and 'KOT')
  let nonKotGroup = await db.itemGroup.findFirst({
    where: { restaurantId: restaurant.id, name: 'Non KOT' },
  });
  if (!nonKotGroup) {
    nonKotGroup = await db.itemGroup.create({
      data: {
        restaurantId: restaurant.id,
        name: 'Non KOT',
        description: 'All Non-KOT retail bakery, confectionery, drinks and packaged snacks',
        isKOTEnabled: false,
        sortOrder: 1,
      },
    });
  } else if (nonKotGroup.isKOTEnabled) {
    nonKotGroup = await db.itemGroup.update({
      where: { id: nonKotGroup.id },
      data: { isKOTEnabled: false },
    });
  }

  let kotGroup = await db.itemGroup.findFirst({
    where: { restaurantId: restaurant.id, name: 'KOT' },
  });
  if (!kotGroup) {
    kotGroup = await db.itemGroup.create({
      data: {
        restaurantId: restaurant.id,
        name: 'KOT',
        description: 'Freshly prepared kitchen and cafe orders (shakes, falooda, burgers, momos, chaat, beverages)',
        isKOTEnabled: true,
        sortOrder: 2,
      },
    });
  } else if (!kotGroup.isKOTEnabled) {
    kotGroup = await db.itemGroup.update({
      where: { id: kotGroup.id },
      data: { isKOTEnabled: true },
    });
  }

  // 13. Seed Categories
  const catMap = {};
  const invCatMap = {};

  // Non-KOT Categories
  const nonKotCatNames = [...new Set(amoraProducts.map((p) => p.category))];
  for (let idx = 0; idx < nonKotCatNames.length; idx++) {
    const catName = nonKotCatNames[idx];
    let cat = await db.itemCategory.findFirst({ where: { restaurantId: restaurant.id, name: catName } });
    if (!cat) {
      cat = await db.itemCategory.create({
        data: {
          restaurantId: restaurant.id,
          groupId: nonKotGroup.id,
          name: catName,
          isKOTEnabled: false,
          sortOrder: idx + 1,
        },
      });
    } else {
      cat = await db.itemCategory.update({
        where: { id: cat.id },
        data: {
          groupId: nonKotGroup.id,
          isKOTEnabled: false,
          sortOrder: idx + 1,
        },
      });
    }
    catMap[catName] = cat;

    let invCat = await db.inventoryItemCategory.findFirst({ where: { restaurantId: restaurant.id, name: catName } });
    if (!invCat) {
      invCat = await db.inventoryItemCategory.create({
        data: { restaurantId: restaurant.id, name: catName },
      });
    }
    invCatMap[catName] = invCat;
  }

  // KOT Categories
  const kotCatNames = [...new Set(amoraKotProducts.map((p) => p.category))];
  for (let idx = 0; idx < kotCatNames.length; idx++) {
    const catName = kotCatNames[idx];
    let cat = await db.itemCategory.findFirst({ where: { restaurantId: restaurant.id, name: catName } });
    if (!cat) {
      cat = await db.itemCategory.create({
        data: {
          restaurantId: restaurant.id,
          groupId: kotGroup.id,
          name: catName,
          isKOTEnabled: true,
          sortOrder: nonKotCatNames.length + idx + 1,
        },
      });
    } else {
      cat = await db.itemCategory.update({
        where: { id: cat.id },
        data: {
          groupId: kotGroup.id,
          isKOTEnabled: true,
          sortOrder: nonKotCatNames.length + idx + 1,
        },
      });
    }
    catMap[catName] = cat;

    let invCat = await db.inventoryItemCategory.findFirst({ where: { restaurantId: restaurant.id, name: catName } });
    if (!invCat) {
      invCat = await db.inventoryItemCategory.create({
        data: { restaurantId: restaurant.id, name: catName },
      });
    }
    invCatMap[catName] = invCat;
  }

  // Remove old categories that have 0 menu items and aren't in either product list
  const allValidCatNames = [...nonKotCatNames, ...kotCatNames];
  await db.itemCategory.deleteMany({
    where: {
      restaurantId: restaurant.id,
      name: { notIn: allValidCatNames },
      menuItems: { none: {} },
    },
  });

  console.log(`✅ Seeded ${nonKotCatNames.length} Non-KOT Categories and ${kotCatNames.length} KOT Categories`);

  // 14. Seed Menu
  let menu = await db.menu.findFirst({ where: { restaurantId: restaurant.id, name: 'Amora Regular Menu' } });
  if (!menu) {
    menu = await db.menu.create({
      data: {
        restaurantId: restaurant.id,
        name: 'Amora Regular Menu',
        isActive: true,
      },
    });
  }

  // 15. Clean up old dummy menu items not in Non-KOT or KOT product lists
  const validProductQRs = new Set([
    ...amoraProducts.map((p) => p.productQR),
    ...amoraKotProducts.map((p) => p.productQR),
  ]);
  const oldMenuItems = await db.menuItem.findMany({
    where: { restaurantId: restaurant.id },
    include: { kotItems: true, tokenItems: true, returnItems: true },
  });

  for (const oldItem of oldMenuItems) {
    if (!validProductQRs.has(oldItem.productQR)) {
      if (
        (!oldItem.kotItems || oldItem.kotItems.length === 0) &&
        (!oldItem.tokenItems || oldItem.tokenItems.length === 0) &&
        (!oldItem.returnItems || oldItem.returnItems.length === 0)
      ) {
        try {
          await db.menuItem.delete({ where: { id: oldItem.id } });
        } catch (e) {
          await db.menuItem.update({
            where: { id: oldItem.id },
            data: { isDeleted: true, isAvailable: false, showOnCustomerSite: false },
          });
        }
      } else {
        await db.menuItem.update({
          where: { id: oldItem.id },
          data: { isDeleted: true, isAvailable: false, showOnCustomerSite: false },
        });
      }
    }
  }

  // Helper function to seed an item list
  async function seedItemList(items, isKotItem) {
    let count = 0;
    for (const p of items) {
      const category = catMap[p.category];
      const invCategory = invCatMap[p.category];
      const unit = isKotItem ? defaultKotUnit : (unitMap[p.salesUnit] || defaultUnit);

      // 1. Inventory Item
      let invItem = await db.inventoryItem.findFirst({
        where: {
          restaurantId: restaurant.id,
          OR: [{ barcode: p.productQR }, { sku: p.productQR }],
        },
      });

      if (!invItem) {
        invItem = await db.inventoryItem.create({
          data: {
            restaurantId: restaurant.id,
            categoryId: invCategory.id,
            unitId: unit.id,
            name: p.name,
            sku: p.productQR,
            barcode: p.productQR,
            currentStock: p.qty || 0,
            costPerUnit: p.purchaseRate || 0,
            thresholdQty: p.stockWarn || 5,
            image: p.image,
          },
        });
      } else {
        invItem = await db.inventoryItem.update({
          where: { id: invItem.id },
          data: {
            name: p.name,
            categoryId: invCategory.id,
            unitId: unit.id,
            currentStock: p.qty || 0,
            costPerUnit: p.purchaseRate || 0,
            thresholdQty: p.stockWarn || 5,
            image: p.image,
          },
        });
      }

      // 2. Inventory Item MRP
      const existingMrp = await db.inventoryItemMRP.findFirst({
        where: { inventoryItemId: invItem.id, mrp: p.mrp },
      });
      if (!existingMrp) {
        await db.inventoryItemMRP.create({
          data: {
            inventoryItemId: invItem.id,
            mrp: p.mrp,
            purchaseRate: p.purchaseRate || 0,
            profitPercent: p.profitPercent || 0,
            isActive: true,
          },
        });
      }

      // 3. MenuItem
      let menuItem = await db.menuItem.findFirst({
        where: {
          restaurantId: restaurant.id,
          OR: [{ productQR: p.productQR }, { name: p.name }],
        },
      });

      const menuData = {
        restaurantId: restaurant.id,
        menuId: menu.id,
        categoryId: category ? category.id : null,
        inventoryItemId: invItem.id,
        name: p.name,
        productQR: p.productQR,
        price: p.sellingPrice,
        image: p.image,
        salesUnit: p.salesUnit,
        taxType: p.taxType || 'include',
        taxPercent: p.taxPercent || 0,
        stockWarningThreshold: p.stockWarn || 5,
        isVeg: p.isVeg !== undefined ? p.isVeg : true,
        isAvailable: true,
        isDeleted: false,
        showOnCustomerSite: true,
      };

      if (!menuItem) {
        await db.menuItem.create({ data: menuData });
      } else {
        await db.menuItem.update({
          where: { id: menuItem.id },
          data: menuData,
        });
      }
      count++;
    }
    return count;
  }

  // 16. Seed All Non-KOT Products
  console.log(`📦 Seeding ${amoraProducts.length} Amora Non-KOT products...`);
  const nonKotCount = await seedItemList(amoraProducts, false);
  console.log(`✅ ${nonKotCount} Amora Non-KOT items seeded!`);

  // 17. Seed All KOT Products
  console.log(`🍳 Seeding ${amoraKotProducts.length} Amora KOT products...`);
  const kotCount = await seedItemList(amoraKotProducts, true);
  console.log(`✅ ${kotCount} Amora KOT items seeded!`);

  console.log('\n✨✨ AMORA BAKES & CAFE SEED COMPLETED SUCCESSFULLY! ✨✨');
  console.log('===============================================================');
  console.log('👑 Super Admin : admin@restaurant-saas.com / admin123');
  console.log('🏪 Restaurant  : Amora Bakes & Cafe (Slug: amora)');
  console.log('🔑 Admin User  : admin@amora.com / admin123');
  console.log('💼 Manager     : manager@amora.com / manager123');
  console.log('💵 Cashier     : cashier@amora.com / cashier123');
  console.log('🍽️ Waiter      : waiter@amora.com / waiter123');
  console.log('👨‍🍳 Kitchen    : kitchen@amora.com / kitchen123');
  console.log('🖥️ Main POS    : main1 / PIN: s1234');
  console.log('📱 Sub POS     : sub1 / PIN: s1234');
  console.log('===============================================================');
}

if (process.argv[1] && (process.argv[1].endsWith('seed.js') || process.argv[1].endsWith('seed-amora.js'))) {
  runSeed()
    .catch((error) => {
      console.error('❌ Seed error:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
