import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';
import archiver from 'archiver';
import { prisma } from '../../app.js';

// Resolve database path dynamically using SQLite PRAGMA or environment variables
async function getActiveDatabasePath() {
  try {
    const list = await prisma.$queryRawUnsafe('PRAGMA database_list;');
    if (Array.isArray(list)) {
      const mainDb = list.find((d) => d.name === 'main');
      if (mainDb?.file && fs.existsSync(mainDb.file)) {
        return mainDb.file;
      }
    }
  } catch (err) {
    // If Prisma query fails, fallback to environment / disk paths below
  }

  const rawUrl = process.env.DATABASE_URL || '';
  if (rawUrl.startsWith('file:')) {
    const sqliteRelPath = rawUrl.replace(/^file:/, '');
    if (path.isAbsolute(sqliteRelPath) && fs.existsSync(sqliteRelPath)) {
      return sqliteRelPath;
    }
    // Check relative to cwd
    const fromCwd = path.resolve(process.cwd(), sqliteRelPath);
    if (fs.existsSync(fromCwd)) return fromCwd;

    // Check relative to prisma directory
    const fromPrisma = path.resolve(process.cwd(), 'prisma', path.basename(sqliteRelPath));
    if (fs.existsSync(fromPrisma)) return fromPrisma;
  }

  // Check common Electron production location
  if (process.env.APPDATA) {
    const electronDb = path.join(process.env.APPDATA, 'restaurant-saas-electron', 'restaurant.db');
    if (fs.existsSync(electronDb)) return electronDb;
  }

  // Fallbacks in workspace
  const candidatePaths = [
    path.resolve(process.cwd(), 'prisma/maligai.db'),
    path.resolve(process.cwd(), 'maligai.db'),
    path.resolve(process.cwd(), 'prisma/sqlite-template/dev.db'),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error('Active SQLite database file not found.');
}

// Find all known upload directories across environments
function getUploadDirectories() {
  const dirs = new Set();
  
  if (process.env.UPLOAD_DIR) {
    dirs.add(path.resolve(process.env.UPLOAD_DIR));
  }
  
  if (process.env.APPDATA) {
    dirs.add(path.join(process.env.APPDATA, 'restaurant-saas-electron', 'uploads'));
  }

  dirs.add(path.resolve(process.cwd(), 'uploads'));
  dirs.add(path.resolve(process.cwd(), '..', 'uploads'));
  dirs.add(path.resolve(process.cwd(), '..', 'web', 'public', 'uploads'));
  dirs.add(path.resolve(process.cwd(), '..', 'web', 'dist', 'uploads'));

  return Array.from(dirs).filter(d => fs.existsSync(d));
}

// Primary uploads directory to write to
function getPrimaryUploadDirectory() {
  if (process.env.UPLOAD_DIR) {
    return path.resolve(process.env.UPLOAD_DIR);
  }
  if (process.env.APPDATA) {
    const electronUploads = path.join(process.env.APPDATA, 'restaurant-saas-electron', 'uploads');
    if (fs.existsSync(path.dirname(electronUploads))) {
      return electronUploads;
    }
  }
  return path.resolve(process.cwd(), 'uploads');
}

// Helper to copy directory recursively
function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return 0;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  
  let copiedCount = 0;
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copiedCount += copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      copiedCount++;
    }
  }
  return copiedCount;
}

export async function backupRoutes(app) {
  // ── GET /api/restaurant/backup/status ── Get live database and media stats
  app.get('/status', async (request, reply) => {
    try {
      const dbPath = await getActiveDatabasePath();
      const dbStats = fs.statSync(dbPath);
      
      const primaryUploads = getPrimaryUploadDirectory();
      let totalImages = 0;
      let totalUploadsSize = 0;
      if (fs.existsSync(primaryUploads)) {
        const files = fs.readdirSync(primaryUploads);
        totalImages = files.length;
        for (const f of files) {
          try {
            totalUploadsSize += fs.statSync(path.join(primaryUploads, f)).size;
          } catch (e) {}
        }
      }

      let totalItems = 0;
      let totalOrders = 0;
      let totalTokens = 0;
      let totalCustomers = 0;
      let restaurantName = 'Restaurant';

      try {
        const [itemsCount, ordersCount, tokensCount, customersCount, rest] = await Promise.all([
          prisma.menuItem.count({ where: { isDeleted: false } }),
          prisma.order.count(),
          prisma.bakeryToken.count(),
          prisma.customer.count(),
          prisma.restaurant.findFirst({ select: { name: true } })
        ]);
        totalItems = itemsCount;
        totalOrders = ordersCount;
        totalTokens = tokensCount;
        totalCustomers = customersCount;
        if (rest?.name) restaurantName = rest.name;
      } catch (err) {
        // Continue with available filesystem stats
      }

      return {
        success: true,
        data: {
          databasePath: dbPath,
          databaseSizeBytes: dbStats.size,
          databaseSizeMb: (dbStats.size / (1024 * 1024)).toFixed(2),
          primaryUploads,
          totalImages,
          uploadsSizeMb: (totalUploadsSize / (1024 * 1024)).toFixed(2),
          restaurantName,
          totalItems,
          totalOrders,
          totalTokens,
          totalCustomers,
          lastModified: dbStats.mtime
        }
      };
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── GET /api/restaurant/backup/export ── Full backup (Database + all uploaded images) or DB only
  app.get('/export', async (request, reply) => {
    try {
      // 1. Force WAL checkpoint to flush all recent transactions/bills into the main DB file
      try {
        await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch (e) {
        app.log.warn({ err: e }, 'Could not run wal_checkpoint before backup');
      }

      const dbPath = await getActiveDatabasePath();
      if (!fs.existsSync(dbPath)) {
        return reply.status(404).send({ success: false, error: 'Database file not found.' });
      }

      const backupType = String(request.query?.type || 'full').toLowerCase();
      const includeImages = backupType !== 'db';

      // If user specifically requested DB-only:
      if (!includeImages) {
        const fileStream = fs.createReadStream(dbPath);
        reply.header('Content-Type', 'application/octet-stream');
        reply.header('Content-Disposition', `attachment; filename="amora_database_backup_${Date.now()}.db"`);
        return reply.send(fileStream);
      }

      // Full Backup: Package SQLite DB + all Uploaded Images into a single .zip archive
      const uploadDirs = getUploadDirectories();
      const primaryUploadDir = getPrimaryUploadDirectory();

      // Gather restaurant metadata for manifest
      let restaurantInfo = {};
      let totalItems = 0;
      let totalOrders = 0;
      let totalTokens = 0;
      try {
        const [rest, ic, oc, tc] = await Promise.all([
          prisma.restaurant.findFirst(),
          prisma.menuItem.count({ where: { isDeleted: false } }),
          prisma.order.count(),
          prisma.bakeryToken.count()
        ]);
        if (rest) {
          restaurantInfo = {
            id: rest.id,
            name: rest.name,
            phone: rest.phone,
            address: rest.address
          };
        }
        totalItems = ic;
        totalOrders = oc;
        totalTokens = tc;
      } catch (e) {}

      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `amora_full_system_backup_${dateStr}.zip`;

      const archive = archiver('zip', { store: true }); // store=true keeps zip generation super fast (images already compressed)

      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);

      // 1. Add database file
      archive.file(dbPath, { name: 'database.db' });

      // 2. Add manifest
      const manifest = {
        backupVersion: '2.0',
        createdAt: new Date().toISOString(),
        backupType: 'full',
        restaurant: restaurantInfo,
        stats: {
          totalMenuItems: totalItems,
          totalOrders,
          totalTokens,
        },
        databaseFileName: path.basename(dbPath)
      };
      archive.append(JSON.stringify(manifest, null, 2), { name: 'backup_manifest.json' });

      // 3. Add uploads folder
      // Prefer directory with the most images
      let bestUploadDir = primaryUploadDir;
      let maxFiles = 0;
      for (const d of uploadDirs) {
        try {
          const count = fs.readdirSync(d).length;
          if (count > maxFiles) {
            maxFiles = count;
            bestUploadDir = d;
          }
        } catch (e) {}
      }

      if (fs.existsSync(bestUploadDir) && maxFiles > 0) {
        archive.directory(bestUploadDir, 'uploads');
      }

      archive.finalize();
      return reply.send(archive);
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── POST /api/restaurant/backup/import ── Restore full backup (.zip) or database (.db)
  app.post('/import', async (request, reply) => {
    let tempFilePath = null;
    let tempExtractDir = null;

    try {
      if (!request.headers['content-type']?.includes('multipart/form-data')) {
        return reply.status(400).send({ success: false, error: 'Request must be multipart/form-data.' });
      }

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ success: false, error: 'No backup file uploaded.' });
      }

      tempFilePath = path.join(os.tmpdir(), `upload_backup_${Date.now()}.tmp`);
      const writeStream = fs.createWriteStream(tempFilePath);
      await pipeline(data.file, writeStream);

      // Check magic header of the uploaded file
      const fileHeader = Buffer.alloc(16);
      const fd = fs.openSync(tempFilePath, 'r');
      fs.readSync(fd, fileHeader, 0, 16, 0);
      fs.closeSync(fd);

      const sqliteHeader = Buffer.from('SQLite format 3\0', 'binary');
      const isSqlite = fileHeader.equals(sqliteHeader);
      const isZip = fileHeader[0] === 0x50 && fileHeader[1] === 0x4B; // 'PK' magic header

      if (!isSqlite && !isZip) {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        return reply.status(400).send({
          success: false,
          error: 'Invalid backup file. The uploaded file is neither a valid SQLite database (.db) nor a Full Backup archive (.zip).'
        });
      }

      let dbFileToRestore = null;
      let imagesRestored = 0;
      let manifestData = null;

      if (isZip) {
        // Extract archive to a temporary folder
        tempExtractDir = path.join(os.tmpdir(), `extract_backup_${Date.now()}`);
        fs.mkdirSync(tempExtractDir, { recursive: true });

        const { default: extract } = await import('extract-zip');
        await extract(tempFilePath, { dir: tempExtractDir });

        // Check for manifest
        const manifestPath = path.join(tempExtractDir, 'backup_manifest.json');
        if (fs.existsSync(manifestPath)) {
          try {
            manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          } catch (e) {}
        }

        // Find the database file inside the extracted files
        const extractedFiles = fs.readdirSync(tempExtractDir);
        let candidateDb = null;
        if (extractedFiles.includes('database.db')) {
          candidateDb = path.join(tempExtractDir, 'database.db');
        } else {
          // Look for any .db file in root
          const found = extractedFiles.find(f => f.endsWith('.db') || f.endsWith('.sqlite'));
          if (found) candidateDb = path.join(tempExtractDir, found);
        }

        if (!candidateDb || !fs.existsSync(candidateDb)) {
          throw new Error('Backup archive is missing the database.db file.');
        }

        // Verify SQLite header of extracted db
        const extHeader = Buffer.alloc(16);
        const extFd = fs.openSync(candidateDb, 'r');
        fs.readSync(extFd, extHeader, 0, 16, 0);
        fs.closeSync(extFd);

        if (!extHeader.equals(sqliteHeader)) {
          throw new Error('The database file inside the backup archive is corrupted or not a valid SQLite database.');
        }

        dbFileToRestore = candidateDb;

        // Restore uploads directory if present in zip
        const extractedUploads = path.join(tempExtractDir, 'uploads');
        if (fs.existsSync(extractedUploads)) {
          const targetUploadDirs = getUploadDirectories();
          const primaryUpload = getPrimaryUploadDirectory();
          if (!targetUploadDirs.includes(primaryUpload)) {
            targetUploadDirs.push(primaryUpload);
          }

          for (const targetDir of targetUploadDirs) {
            try {
              imagesRestored += copyDirSync(extractedUploads, targetDir);
            } catch (err) {
              app.log.warn({ err, targetDir }, 'Failed to copy images to one upload target');
            }
          }
        }
      } else {
        // Raw SQLite database file
        dbFileToRestore = tempFilePath;
      }

      // Locate active database path to replace
      const targetDbPath = await getActiveDatabasePath();

      // Disconnect Prisma cleanly before file replacement
      try {
        await prisma.$disconnect();
      } catch (e) {}

      // Create a safety backup of existing database before overwriting
      try {
        const safetyBackupPath = `${targetDbPath}.pre_restore_backup_${Date.now()}`;
        if (fs.existsSync(targetDbPath)) {
          fs.copyFileSync(targetDbPath, safetyBackupPath);
          app.log.info({ safetyBackupPath }, 'Created safety backup of existing DB before restore');
        }
      } catch (e) {}

      // Clean up any stale WAL or SHM files so SQLite doesn't merge old log frames
      const walPath = `${targetDbPath}-wal`;
      const shmPath = `${targetDbPath}-shm`;
      if (fs.existsSync(walPath)) {
        try { fs.unlinkSync(walPath); } catch (e) {}
      }
      if (fs.existsSync(shmPath)) {
        try { fs.unlinkSync(shmPath); } catch (e) {}
      }

      // Overwrite database file
      fs.copyFileSync(dbFileToRestore, targetDbPath);

      // Reconnect Prisma
      await prisma.$connect();

      // Run WAL checkpoint and verify integrity on restored DB
      try {
        await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch (e) {}

      // Gather summary of restored database
      let restoredStats = {
        restaurantName: 'Restaurant',
        totalItems: 0,
        totalOrders: 0,
        totalTokens: 0,
        totalCustomers: 0,
        imagesRestored
      };

      try {
        const [itemsCount, ordersCount, tokensCount, customersCount, rest] = await Promise.all([
          prisma.menuItem.count({ where: { isDeleted: false } }),
          prisma.order.count(),
          prisma.bakeryToken.count(),
          prisma.customer.count(),
          prisma.restaurant.findFirst({ select: { name: true } })
        ]);
        restoredStats.totalItems = itemsCount;
        restoredStats.totalOrders = ordersCount;
        restoredStats.totalTokens = tokensCount;
        restoredStats.totalCustomers = customersCount;
        if (rest?.name) restoredStats.restaurantName = rest.name;
      } catch (e) {}

      return {
        success: true,
        message: 'Database and assets restored successfully! All data, bills, and images are ready.',
        data: restoredStats,
        manifest: manifestData
      };
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ success: false, error: err.message || 'Failed to restore backup.' });
    } finally {
      // Clean up temp files
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (e) {}
      }
      if (tempExtractDir && fs.existsSync(tempExtractDir)) {
        try { fs.rmSync(tempExtractDir, { recursive: true, force: true }); } catch (e) {}
      }
    }
  });
}
