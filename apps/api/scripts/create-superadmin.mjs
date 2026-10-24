#!/usr/bin/env node
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from apps/api/.env if present
dotenv.config({ path: join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

async function main() {
  const argv = process.argv.slice(2);
  const parseArg = (name) => {
    const a = argv.find(x => x.startsWith(`--${name}=`));
    return a ? a.split('=')[1] : undefined;
  };

  const email = parseArg('email') || 'superadmin@local';
  const password = parseArg('password') || 'Admin123!';
  const name = parseArg('name') || 'Super Admin';

  console.log(`Creating/updating superadmin: ${email}`);

  const existing = await prisma.superAdminUser.findUnique({ where: { email } });
  const hashed = await bcrypt.hash(password, 10);

  if (existing) {
    await prisma.superAdminUser.update({
      where: { email },
      data: { password: hashed, name },
    });
    console.log('Updated existing superadmin.');
  } else {
    const user = await prisma.superAdminUser.create({
      data: { email, name, password: hashed },
    });
    console.log('Created superadmin with id:', user.id);
  }

  console.log('Done. You can now login with:');
  console.log(`  email: ${email}`);
  console.log(`  password: ${password}`);
}

main()
  .catch((e) => {
    console.error('Error creating superadmin:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
