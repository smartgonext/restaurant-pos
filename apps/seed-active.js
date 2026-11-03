import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import path from 'path';
import os from 'os';
import { runSeed } from './api/prisma/seed.js';

async function seedActiveDb() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'restaurant-saas-electron', 'restaurant.db');
  console.log(`🎯 Target Active Database: ${dbPath}`);

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${dbPath}`,
      },
    },
  });

  try {
    console.log('🌱 Starting full seed for active database...');
    await runSeed(prisma);
    console.log('✨ Active database seeded successfully!');
  } catch (error) {
    console.error('❌ Active DB seeding failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedActiveDb();
