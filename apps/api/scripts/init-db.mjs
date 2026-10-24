import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '..');

// Load environment variables
const dotenvPathCandidate = path.join(apiRoot, '.env');
const rootDotenvPath = path.resolve(apiRoot, '..', '..', '.env');

if (fs.existsSync(dotenvPathCandidate)) {
    dotenv.config({ path: dotenvPathCandidate });
} else if (fs.existsSync(rootDotenvPath)) {
    dotenv.config({ path: rootDotenvPath });
} else {
    dotenv.config();
}

const dbProvider = process.env.DB_PROVIDER || 'mysql';

if (dbProvider === 'sqlite') {
    process.env.DATABASE_URL = 'file:./database.sqlite';
    console.log(`[init-db] Overriding DATABASE_URL for SQLite to ${process.env.DATABASE_URL}`);
}

const schemaName = dbProvider === 'sqlite' ? 'schema.sqlite.prisma' : 'schema.prisma';
const schemaPath = path.join(apiRoot, 'prisma', schemaName);

console.log(`[init-db] Initializing database for provider: ${dbProvider}`);
console.log(`[init-db] Selected schema: ${schemaPath}`);

if (!fs.existsSync(schemaPath)) {
    console.error(`[init-db] Schema file not found: ${schemaPath}`);
    process.exit(1);
}

try {
    console.log('\n[init-db] Generating Prisma Client...');
    execSync(`npx prisma generate --schema="${schemaPath}"`, { stdio: 'inherit', cwd: apiRoot });
    
    console.log('\n[init-db] Pushing Schema to DB (creating tables automatically)...');
    execSync(`npx prisma db push --schema="${schemaPath}" --accept-data-loss`, { stdio: 'inherit', cwd: apiRoot });

    console.log('\n[init-db] Seeding database values...');
    // Some env loading in seed might overwrite, so we explicitly run it
    execSync(`node prisma/seed.js`, { stdio: 'inherit', cwd: apiRoot });
    
    console.log(`\n[init-db] ✅ Success! Initialization complete for ${dbProvider}.`);
} catch (error) {
    console.error(`\n[init-db] ❌ Failed during DB initialization:`, error.message);
    process.exit(1);
}
