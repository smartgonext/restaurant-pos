import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const pump = promisify(pipeline);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function uploadRoutes(app: FastifyInstance) {
  app.post('/', async (request: any, reply: any) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ success: false, error: 'No file uploaded' });
    }

    const filename = `${Date.now()}-${data.filename.replace(/\s/g, '_')}`;
    const uploadPath = path.join(__dirname, '..', '..', '..', 'uploads', filename);

    await pump(data.file, fs.createWriteStream(uploadPath));

    // Return the URL to access the file
    // Assuming the server runs on 3001 and has /static/ prefix
    const url = `/static/${filename}`;
    
    return { success: true, url };
  });
}
