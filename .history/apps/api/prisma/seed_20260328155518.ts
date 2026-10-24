import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // SuperAdmin
  const superAdminEmail = process.env.SUPERADMIN_EMAIL || 'admin@restaurant-saas.com';
  const superAdminPassword = process.env.SUPERADMIN_PASSWORD || 'admin123';
  const hashedPassword = await bcrypt.hash(superAdminPassword, 10);
  await prisma.superAdminUser.upsert({
    where: { email: superAdminEmail },
    update: {},
    create: {
      name: 'Super Admin',
      email: superAdminEmail,
      password: hashedPassword,
      role: 'superadmin',
    },
  });

  // Packages
  const starterPkg = await prisma.package.upsert({
    where: { name: 'Starter' },
    update: { description: 'Basic features for small restaurants', monthlyPrice: 29, annualPrice: 290, modules: JSON.parse('["menu","orders","tables","pos","customers","staff","reports"]'), trialDays: 14, isDefault: true },
    create: { name: 'Starter', description: 'Basic features for small restaurants', monthlyPrice: 29, annualPrice: 290, modules: JSON.parse('["menu","orders","tables","pos","customers","staff","reports"]'), trialDays: 14, isDefault: true },
  });
  const proPkg = await prisma.package.upsert({
    where: { name: 'Professional' },
    update: { description: 'Advanced features with inventory & kitchen', monthlyPrice: 79, annualPrice: 790, modules: JSON.parse('["menu","orders","tables","pos","customers","staff","reports","inventory","kitchen","expenses","cashregister","reservations"]'), trialDays: 14, isRecommended: true },
    create: { name: 'Professional', description: 'Advanced features with inventory & kitchen', monthlyPrice: 79, annualPrice: 790, modules: JSON.parse('["menu","orders","tables","pos","customers","staff","reports","inventory","kitchen","expenses","cashregister","reservations"]'), trialDays: 14, isRecommended: true },
  });
  await prisma.package.upsert({
    where: { name: 'Enterprise' },
    update: { description: 'Full suite with AI & multi-branch', monthlyPrice: 149, annualPrice: 1490, lifetimePrice: 4999, modules: JSON.parse('["menu","orders","tables","pos","customers","staff","reports","inventory","kitchen","expenses","cashregister","reservations","ai","loyalty","delivery","webhooks","whatsapp","kiosk"]'), trialDays: 30 },
    create: { name: 'Enterprise', description: 'Full suite with AI & multi-branch', monthlyPrice: 149, annualPrice: 1490, lifetimePrice: 4999, modules: JSON.parse('["menu","orders","tables","pos","customers","staff","reports","inventory","kitchen","expenses","cashregister","reservations","ai","loyalty","delivery","webhooks","whatsapp","kiosk"]'), trialDays: 30 },
  });

  // Demo Restaurant
  const rest = await prisma.restaurant.upsert({
    where: { slug: 'the-spice-kitchen' },
    update: {
      email: 'demo@spicekitchen.com',
      phone: '+1 555-0123',
      address: '123 Food Street, Culinary City',
      status: 'active',
      enabledModules: ['restaurant']
    },
    create: {
      name: 'The Spice Kitchen',
      slug: 'the-spice-kitchen',
      email: 'demo@spicekitchen.com',
      phone: '+1 555-0123',
      address: '123 Food Street, Culinary City',
      status: 'active',
      enabledModules: ['restaurant']
    },
  });

  // Subscription
  await prisma.subscription.upsert({
    where: { restaurantId: rest.id },
    update: {
      packageId: proPkg.id,
      billingCycle: 'trial',
      status: 'trial',
      startDate: new Date(),
      endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
    create: {
      restaurantId: rest.id,
      packageId: proPkg.id,
      billingCycle: 'trial',
      status: 'trial',
      startDate: new Date(),
      endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  // Settings
  await prisma.restaurantSettings.upsert({
    where: { restaurantId: rest.id },
    update: { currency: 'USD', currencySymbol: '$', sgstRate: 2.5, cgstRate: 2.5 },
    create: { restaurantId: rest.id, currency: 'USD', currencySymbol: '$', sgstRate: 2.5, cgstRate: 2.5 },
  });

  // Branch
  const branch = await prisma.branch.upsert({
    where: { restaurantId_name: { restaurantId: rest.id, name: 'Main Branch' } },
    update: { isDefault: true, openTime: '09:00', closeTime: '23:00' },
    create: { restaurantId: rest.id, name: 'Main Branch', isDefault: true, openTime: '09:00', closeTime: '23:00' },
  });

  // Staff
  const adminPass = await bcrypt.hash('admin123', 10);

  await prisma.staff.upsert({
    where: { restaurantId_email: { restaurantId: rest.id, email: 'demo@spicekitchen.com' } },
    update: { name: 'John Admin', password: adminPass, role: 'admin', branchId: branch.id },
    create: { restaurantId: rest.id, branchId: branch.id, name: 'John Admin', email: 'demo@spicekitchen.com', password: adminPass, role: 'admin' },
  });

  await prisma.staff.upsert({
    where: { restaurantId_email: { restaurantId: rest.id, email: 'sarah@spicekitchen.com' } },
    update: { name: 'Sarah Waiter', password: adminPass, role: 'waiter', branchId: branch.id },
    create: { restaurantId: rest.id, branchId: branch.id, name: 'Sarah Waiter', email: 'sarah@spicekitchen.com', password: adminPass, role: 'waiter' },
  });

  await prisma.staff.upsert({
    where: { restaurantId_email: { restaurantId: rest.id, email: 'mike@spicekitchen.com' } },
    update: { name: 'Mike Chef', password: adminPass, role: 'chef', branchId: branch.id },
    create: { restaurantId: rest.id, branchId: branch.id, name: 'Mike Chef', email: 'mike@spicekitchen.com', password: adminPass, role: 'chef' },
  });

  // Areas & Tables
  const mainHall = await prisma.area.create({ data: { branchId: branch.id, restaurantId: rest.id, name: 'Main Hall' } });
  const outdoor = await prisma.area.create({ data: { branchId: branch.id, restaurantId: rest.id, name: 'Outdoor Patio' } });

  for (let i = 1; i <= 8; i++) {
    await prisma.table.create({ data: { areaId: mainHall.id, restaurantId: rest.id, name: `T${i}`, capacity: i <= 4 ? 4 : 6 } });
  }
  for (let i = 1; i <= 4; i++) {
    await prisma.table.create({ data: { areaId: outdoor.id, restaurantId: rest.id, name: `P${i}`, capacity: 4 } });
  }

  // Menu
  const mainMenu = await prisma.menu.create({ data: { restaurantId: rest.id, name: 'Main Menu', isActive: true } });

  // Categories
  const appetizers = await prisma.itemCategory.create({ data: { restaurantId: rest.id, name: 'Appetizers', sortOrder: 1 } });
  const mains = await prisma.itemCategory.create({ data: { restaurantId: rest.id, name: 'Main Course', sortOrder: 2 } });
  const desserts = await prisma.itemCategory.create({ data: { restaurantId: rest.id, name: 'Desserts', sortOrder: 3 } });
  const beverages = await prisma.itemCategory.create({ data: { restaurantId: rest.id, name: 'Beverages', sortOrder: 4 } });

  // Menu Items
  const items = [
    { name: 'Crispy Spring Rolls', price: 8.99, categoryId: appetizers.id, isVeg: true, preparationTime: 10 },
    { name: 'Chicken Wings', price: 12.99, categoryId: appetizers.id, isVeg: false, preparationTime: 15 },
    { name: 'Caesar Salad', price: 10.99, categoryId: appetizers.id, isVeg: true, preparationTime: 8 },
    { name: 'Butter Chicken', price: 16.99, categoryId: mains.id, isVeg: false, preparationTime: 25 },
    { name: 'Grilled Salmon', price: 22.99, categoryId: mains.id, isVeg: false, preparationTime: 20 },
    { name: 'Paneer Tikka Masala', price: 14.99, categoryId: mains.id, isVeg: true, preparationTime: 20 },
    { name: 'Margherita Pizza', price: 13.99, categoryId: mains.id, isVeg: true, preparationTime: 18 },
    { name: 'Lamb Biryani', price: 18.99, categoryId: mains.id, isVeg: false, preparationTime: 30 },
    { name: 'Chocolate Lava Cake', price: 9.99, categoryId: desserts.id, isVeg: true, preparationTime: 12 },
    { name: 'Tiramisu', price: 8.99, categoryId: desserts.id, isVeg: true, preparationTime: 5 },
    { name: 'Fresh Lime Soda', price: 4.99, categoryId: beverages.id, isVeg: true, preparationTime: 3 },
    { name: 'Mango Lassi', price: 5.99, categoryId: beverages.id, isVeg: true, preparationTime: 5 },
  ];

  for (const item of items) {
    await prisma.menuItem.create({
      data: { restaurantId: rest.id, menuId: mainMenu.id, ...item },
    });
  }

  // Kitchen
  await prisma.kitchen.create({ data: { restaurantId: rest.id, name: 'Main Kitchen', isDefault: true } });

  // Customers
  await prisma.customer.create({ data: { restaurantId: rest.id, name: 'Alice Johnson', email: 'alice@example.com', phone: '+1 555-0001' } });
  await prisma.customer.create({ data: { restaurantId: rest.id, name: 'Bob Smith', email: 'bob@example.com', phone: '+1 555-0002' } });

  console.log('✅ Seed completed successfully!');
  console.log(`📧 SuperAdmin: ${superAdminEmail} / ${superAdminPassword}`);
  console.log('📧 Restaurant: demo@spicekitchen.com / admin123');
}

main().catch(console.error).finally(() => prisma.$disconnect());
