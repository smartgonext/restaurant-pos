import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { prisma } from '../../app.js';

const pump = promisify(pipeline);

function getDatabasePath() {
  const rawUrl = process.env.DATABASE_URL || '';
  if (!rawUrl.startsWith('file:')) {
    throw new Error('Backup & Restore is only supported for SQLite databases.');
  }
  const sqliteRelPath = rawUrl.replace(/^file:/, '');
  return path.isAbsolute(sqliteRelPath)
    ? sqliteRelPath
    : path.resolve(process.cwd(), sqliteRelPath);
}

export async function backupRoutes(app) {
  // GET /api/restaurant/backup/export
  app.get('/export', async (request, reply) => {
    try {
      const dbPath = getDatabasePath();
      if (!fs.existsSync(dbPath)) {
        return reply.status(404).send({ success: false, error: 'Database file not found.' });
      }

      // Read database file and send it
      const fileStream = fs.createReadStream(dbPath);
      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename=backup_database_${Date.now()}.db`);
      return reply.send(fileStream);
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // POST /api/restaurant/backup/import
  app.post('/import', async (request, reply) => {
    try {
      if (!request.headers['content-type']?.includes('multipart/form-data')) {
        return reply.status(400).send({ success: false, error: 'Request must be multipart/form-data.' });
      }

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ success: false, error: 'No backup file uploaded.' });
      }

      const tempFilePath = path.join(os.tmpdir(), `upload_${Date.now()}.db`);
      const writeStream = fs.createWriteStream(tempFilePath);
      await pump(data.file, writeStream);

      // Verify it is a valid SQLite database
      const fileHeader = Buffer.alloc(16);
      const fd = fs.openSync(tempFilePath, 'r');
      fs.readSync(fd, fileHeader, 0, 16, 0);
      fs.closeSync(fd);

      const sqliteHeader = Buffer.from('SQLite format 3\0', 'binary');
      if (!fileHeader.equals(sqliteHeader)) {
        // Delete invalid file
        fs.unlinkSync(tempFilePath);
        return reply.status(400).send({ success: false, error: 'Invalid backup file. The uploaded file is not a valid SQLite database.' });
      }

      // Overwrite database file
      const dbPath = getDatabasePath();
      
      // Disconnect Prisma
      await prisma.$disconnect();

      // Overwrite DB file
      fs.copyFileSync(tempFilePath, dbPath);

      // Delete the temp file
      fs.unlinkSync(tempFilePath);

      // Reconnect Prisma
      await prisma.$connect();

      return { success: true, message: 'Database restored successfully.' };
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
