import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import bcrypt from 'bcryptjs';
import path from 'path';
import os from 'os';

async function seedActiveDb() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'restaurant-saas-electron', 'restaurant.db');
  console.log(`🎯 Target Database: ${dbPath}`);

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${dbPath}`,
      },
    },
  });

  try {
    console.log('🌱 Starting manual seed of active database...');

    const saEmail = 'admin@restaurant-saas.com';
    const saPassword = 'admin123';
    const saHashedPassword = await bcrypt.hash(saPassword, 10);

    // 1. Seed Packages
    await prisma.package.upsert({
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

    // 2. Seed SuperAdmin
    await prisma.superAdminUser.upsert({
      where: { email: saEmail },
      update: {},
      create: {
        name: 'Super Admin',
        email: saEmail,
        password: saHashedPassword,
        role: 'superadmin',
      },
    });

    // 3. Seed Restaurant
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

    // 5. Seed Branch
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

    // 6. Seed Staff
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

    console.log('✨ Active database seeded successfully!');
    console.log('--------------------------------------------------');
    console.log('SuperAdmin: admin@restaurant-saas.com / admin123');
    console.log('Staff: staff@myrestaurant.com / staff123');
    console.log('--------------------------------------------------');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedActiveDb();
