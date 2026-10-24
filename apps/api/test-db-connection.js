import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('--- Database Connection Test ---');
  
  // 1. Check process.env.DATABASE_URL
  console.log('Process Environment DATABASE_URL:', process.env.DATABASE_URL || '(not set)');

  // 2. Try to load from .env file
  const rootDotenvPath = path.resolve(process.cwd(), '..', '..', '.env');
  const apiDotenvPath = path.resolve(process.cwd(), '.env');
  
  let envFileUrl = null;
  if (fs.existsSync(apiDotenvPath)) {
    const content = fs.readFileSync(apiDotenvPath, 'utf8');
    const match = content.match(/^DATABASE_URL=["']?(.+?)["']?$/m);
    if (match) {
      envFileUrl = match[1];
      console.log('Found in apps/api/.env:', envFileUrl);
    }
  } else if (fs.existsSync(rootDotenvPath)) {
    const content = fs.readFileSync(rootDotenvPath, 'utf8');
    const match = content.match(/^DATABASE_URL=["']?(.+?)["']?$/m);
    if (match) {
      envFileUrl = match[1];
      console.log('Found in root .env:', envFileUrl);
    }
  }

  const activeUrl = process.env.DATABASE_URL || envFileUrl;
  
  if (!activeUrl) {
    console.error('ERROR: No DATABASE_URL found in environment or .env files.');
    return;
  }

  console.log('Active DATABASE_URL being tested:', activeUrl);

  if (activeUrl.startsWith('file:')) {
    console.log('Detected DB Type: SQLite');
    const dbPath = activeUrl.replace('file:', '');
    const absolutePath = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
    console.log('SQLite File Path:', absolutePath);
    if (fs.existsSync(absolutePath)) {
      console.log('SQLite File Exists: Yes, size:', fs.statSync(absolutePath).size, 'bytes');
    } else {
      console.log('SQLite File Exists: No');
    }
  } else if (activeUrl.startsWith('mysql:')) {
    console.log('Detected DB Type: MySQL');
  } else if (activeUrl.startsWith('postgresql:')) {
    console.log('Detected DB Type: PostgreSQL');
  } else {
    console.log('Detected DB Type: Unknown');
  }

  // 3. Test Prisma connection
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: activeUrl
      }
    }
  });

  try {
    console.log('Attempting to connect via Prisma...');
    // A simple query to test connection
    const userCount = await prisma.superAdminUser.count();
    console.log('Connection Successful!');
    console.log('SuperAdminUser count:', userCount);
    
    // Check if we can query another table
    const restaurantCount = await prisma.restaurant.count();
    console.log('Restaurant count:', restaurantCount);

  } catch (err) {
    console.error('Connection Failed!');
    console.error('Error Details:', err.message);
    if (err.code === 'P1001') {
      console.error('Suggestion: Database server is not reachable.');
    } else if (err.code === 'P1003') {
      console.error('Suggestion: Database file/schema does not exist.');
    } else {
        console.error('Prisma Error Code:', err.code);
    }
  } finally {
    await prisma.$disconnect();
    console.log('--------------------------------');
  }
}

main();
