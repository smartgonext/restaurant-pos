import fs from 'fs';
import path from 'path';
import { pipeline, Readable } from 'stream';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const pump = promisify(pipeline);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_GEMINI_KEY = process.env.GEMINI_API_KEY || '';

/**
 * Uses Google Gemini Vision API to inspect image content
 * Checks if the image is a valid food dish, beverage, or retail product item
 */
export async function analyzeImageBufferWithGemini(buffer, mimeType = 'image/jpeg', userApiKey = null) {
  const keyToUse = (userApiKey && userApiKey.trim()) ? userApiKey.trim() : DEFAULT_GEMINI_KEY;
  const base64Data = buffer.toString('base64');
  const prompt = `You are an AI Food and Product Image Inspector for a Restaurant POS system.
Analyze the image to check if it is a valid food dish, beverage, or retail product item suitable for a restaurant or grocery menu.
Return ONLY raw valid JSON (without markdown formatting) with these exact fields:
- isValid: boolean (true if it is a food dish, beverage, snack, ingredient, or retail store product; false if it is an unrelated image like a document, car, person photo, building, or random noise)
- itemType: string ("food", "beverage", "product", or "invalid")
- detectedName: string (estimated dish or product name in English, e.g. "Paneer Butter Masala", "Cold Coffee", "Crispy Potato Chips")
- category: string (estimated menu category, e.g. "Starters", "Main Course", "Beverages", "Bakery", "Snacks", "Grocery", "Desserts")
- isVeg: boolean or null (true for vegetarian dish/product, false for non-vegetarian, null if unknown/product)
- confidence: number (integer 0 to 100 representing confidence score)
- reason: string (1 sentence explanation of what was detected in the image and whether it is a correct food or product item)`;

  const models = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'];
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keyToUse}`;
      const payload = {
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }]
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!res.ok) {
        lastError = json.error?.message || `Gemini API status ${res.status}`;
        continue;
      }

      let text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(text);

      return {
        isValid: Boolean(parsed.isValid),
        itemType: parsed.itemType || (parsed.isValid ? 'food' : 'invalid'),
        detectedName: parsed.detectedName || 'Uploaded Item',
        category: parsed.category || 'General',
        isVeg: typeof parsed.isVeg === 'boolean' ? parsed.isVeg : null,
        confidence: Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : 90,
        reason: parsed.reason || 'AI image verification completed',
        modelUsed: model
      };
    } catch (e) {
      lastError = e.message;
    }
  }

  // Graceful fallback if Gemini API is unreachable or key invalid
  return {
    isValid: true,
    itemType: 'food',
    detectedName: 'Uploaded Item',
    category: 'General',
    isVeg: true,
    confidence: 60,
    reason: `Gemini AI inspection warning: ${lastError || 'Could not verify image online'}`,
    fallbackUsed: true
  };
}

export async function uploadRoutes(app) {
  const uploadsDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', '..', 'uploads');

  const ensureUploadsDir = async () => {
    if (!fs.existsSync(uploadsDir)) {
      await fs.promises.mkdir(uploadsDir, { recursive: true });
    }
  };

  // ── Standard Single File / Image URL Upload ──
  app.post('/', async (request, reply) => {
    let filename;
    let uploadPath;
    await ensureUploadsDir();

    if (request.headers['content-type']?.includes('multipart/form-data')) {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ success: false, error: 'No file uploaded' });
      }
      filename = `${Date.now()}-${data.filename.replace(/\s/g, '_')}`;
      uploadPath = path.join(uploadsDir, filename);
      await pump(data.file, fs.createWriteStream(uploadPath));
    } else {
      const body = request.body || {};
      const imageUrl = String(body.imageUrl || '').trim();
      if (!imageUrl) {
        return reply.code(400).send({ success: false, error: 'No file uploaded or imageUrl provided' });
      }
      const inferredName = String(body.filename || path.basename(new URL(imageUrl).pathname || 'image'));
      const safeName = inferredName.replace(/\s/g, '_').replace(/[^a-zA-Z0-9._-]/g, '') || 'image';
      const baseName = path.basename(safeName, path.extname(safeName));
      const ext = path.extname(safeName) || '.jpg';
      filename = `${Date.now()}-${baseName}${ext}`;
      uploadPath = path.join(uploadsDir, filename);
      const response = await fetch(imageUrl);
      if (!response.ok) {
        return reply.code(400).send({ success: false, error: `Failed to fetch image from URL: ${response.statusText}` });
      }
      if (!response.body) {
        return reply.code(400).send({ success: false, error: 'No response body from image URL' });
      }
      const fileStream = fs.createWriteStream(uploadPath);
      await pump(Readable.fromWeb(response.body), fileStream);
    }
    const url = `/static/${filename}`;
    return { success: true, url };
  });

  // ── Single Image AI Verification & Upload Endpoint ──
  app.post('/verify-image', async (request, reply) => {
    await ensureUploadsDir();
    let filename = '';
    let uploadPath = '';
    let imageBuffer = null;
    let mimeType = 'image/jpeg';

    if (request.headers['content-type']?.includes('multipart/form-data')) {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ success: false, error: 'No file uploaded' });
      }
      mimeType = data.mimetype || 'image/jpeg';
      filename = `${Date.now()}-${data.filename.replace(/\s/g, '_')}`;
      uploadPath = path.join(uploadsDir, filename);
      imageBuffer = await data.toBuffer();
      await fs.promises.writeFile(uploadPath, imageBuffer);
    } else {
      const body = request.body || {};
      const base64Data = String(body.base64 || body.image || '').trim();
      const imageUrl = String(body.imageUrl || '').trim();

      if (base64Data) {
        const matches = base64Data.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        let rawBase64 = base64Data;
        if (matches) {
          mimeType = matches[1];
          rawBase64 = matches[2];
        }
        imageBuffer = Buffer.from(rawBase64, 'base64');
        const ext = mimeType.split('/')[1] || 'jpg';
        filename = `${Date.now()}-ai-upload.${ext}`;
        uploadPath = path.join(uploadsDir, filename);
        await fs.promises.writeFile(uploadPath, imageBuffer);
      } else if (imageUrl) {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          return reply.code(400).send({ success: false, error: 'Failed to fetch image URL' });
        }
        mimeType = response.headers.get('content-type') || 'image/jpeg';
        const arrayBuf = await response.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuf);
        const inferredName = path.basename(new URL(imageUrl).pathname || 'image');
        const ext = path.extname(inferredName) || '.jpg';
        filename = `${Date.now()}-ai-${inferredName.replace(/[^a-zA-Z0-9._-]/g, '')}${ext}`;
        uploadPath = path.join(uploadsDir, filename);
        await fs.promises.writeFile(uploadPath, imageBuffer);
      } else {
        return reply.code(400).send({ success: false, error: 'Please upload an image file, base64, or imageUrl' });
      }
    }

    const staticUrl = `/static/${filename}`;
    const apiKey = request.body?.apiKey || DEFAULT_GEMINI_KEY;
    const aiResult = await analyzeImageBufferWithGemini(imageBuffer, mimeType, apiKey);

    return {
      success: true,
      url: staticUrl,
      filename,
      aiResult
    };
  });

  // ── Bulk Image Upload & Gemini AI Verification Endpoint ──
  app.post('/bulk-verify-images', async (request, reply) => {
    await ensureUploadsDir();
    const results = [];
    const userApiKey = request.body?.apiKey || DEFAULT_GEMINI_KEY;

    if (request.headers['content-type']?.includes('multipart/form-data')) {
      const parts = request.files();
      for await (const part of parts) {
        try {
          const buffer = await part.toBuffer();
          const mimeType = part.mimetype || 'image/jpeg';
          const safeName = part.filename.replace(/\s/g, '_').replace(/[^a-zA-Z0-9._-]/g, '') || 'image';
          const filename = `${Date.now()}-${Math.floor(Math.random() * 10000)}-${safeName}`;
          const uploadPath = path.join(uploadsDir, filename);

          await fs.promises.writeFile(uploadPath, buffer);
          const staticUrl = `/static/${filename}`;

          const aiResult = await analyzeImageBufferWithGemini(buffer, mimeType, userApiKey);
          results.push({
            originalName: part.filename,
            filename,
            url: staticUrl,
            aiResult
          });
        } catch (err) {
          results.push({
            originalName: part.filename,
            error: err.message,
            aiResult: {
              isValid: false,
              itemType: 'invalid',
              detectedName: part.filename,
              category: 'General',
              confidence: 0,
              reason: `Failed to process image: ${err.message}`
            }
          });
        }
      }
    } else {
      const body = request.body || {};
      const itemsList = Array.isArray(body.images) ? body.images : [];

      if (itemsList.length === 0) {
        return reply.code(400).send({ success: false, error: 'No files uploaded or empty images array provided' });
      }

      for (const item of itemsList) {
        try {
          let buffer = null;
          let mimeType = 'image/jpeg';
          let originalName = item.name || item.filename || 'image';

          if (item.base64) {
            const matches = item.base64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
            let rawBase64 = item.base64;
            if (matches) {
              mimeType = matches[1];
              rawBase64 = matches[2];
            }
            buffer = Buffer.from(rawBase64, 'base64');
          } else if (item.imageUrl) {
            const res = await fetch(item.imageUrl);
            if (res.ok) {
              mimeType = res.headers.get('content-type') || 'image/jpeg';
              buffer = Buffer.from(await res.arrayBuffer());
            }
          }

          if (!buffer) {
            results.push({
              originalName,
              error: 'Invalid image data',
              aiResult: { isValid: false, itemType: 'invalid', detectedName: originalName, category: 'General', confidence: 0, reason: 'Invalid image payload' }
            });
            continue;
          }

          const safeName = originalName.replace(/\s/g, '_').replace(/[^a-zA-Z0-9._-]/g, '') || 'image';
          const filename = `${Date.now()}-${Math.floor(Math.random() * 10000)}-${safeName}`;
          const uploadPath = path.join(uploadsDir, filename);

          await fs.promises.writeFile(uploadPath, buffer);
          const staticUrl = `/static/${filename}`;
          const aiResult = await analyzeImageBufferWithGemini(buffer, mimeType, userApiKey);

          results.push({
            originalName,
            filename,
            url: staticUrl,
            aiResult
          });
        } catch (err) {
          results.push({
            originalName: item.name || 'image',
            error: err.message,
            aiResult: { isValid: false, itemType: 'invalid', detectedName: item.name || 'image', category: 'General', confidence: 0, reason: err.message }
          });
        }
      }
    }

    const validCount = results.filter(r => r.aiResult?.isValid).length;
    const invalidCount = results.length - validCount;

    return {
      success: true,
      total: results.length,
      validCount,
      invalidCount,
      results
    };
  });
}
