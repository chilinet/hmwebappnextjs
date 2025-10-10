import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Thumbnail-Konfiguration
const THUMBNAIL_CONFIG = {
  width: 300,
  height: 200,
  quality: 80,
  format: 'jpeg'
};

// Cache-Verzeichnis
const CACHE_DIR = path.join(process.cwd(), 'public', 'cache', 'thumbnails');

// Stelle sicher, dass das Cache-Verzeichnis existiert
const ensureCacheDir = () => {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
};

// Generiere Thumbnail-Pfad
const getThumbnailPath = (imageId) => {
  return path.join(CACHE_DIR, `${imageId}_${THUMBNAIL_CONFIG.width}x${THUMBNAIL_CONFIG.height}.${THUMBNAIL_CONFIG.format}`);
};

// Generiere Thumbnail-URL
const getThumbnailUrl = (imageId) => {
  return `/cache/thumbnails/${imageId}_${THUMBNAIL_CONFIG.width}x${THUMBNAIL_CONFIG.height}.${THUMBNAIL_CONFIG.format}`;
};

// Prüfe ob Thumbnail existiert
const thumbnailExists = (imageId) => {
  const thumbnailPath = getThumbnailPath(imageId);
  return fs.existsSync(thumbnailPath);
};

// Generiere Thumbnail
const generateThumbnail = async (imageUrl, imageId, req) => {
  try {
    // Konvertiere relative URLs zu absoluten URLs
    let fullImageUrl = imageUrl;
    if (imageUrl.startsWith('/')) {
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
      fullImageUrl = `${baseUrl}${imageUrl}`;
    }
    
    console.log(`Fetching image from: ${fullImageUrl}`);
    
    // Lade das Originalbild mit Session-Cookies
    const response = await fetch(fullImageUrl, {
      headers: {
        'Cookie': req.headers.cookie || '',
        'User-Agent': 'ThumbnailGenerator/1.0'
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    
    const imageBuffer = await response.arrayBuffer();
    
    // Generiere Thumbnail mit Sharp
    const thumbnailBuffer = await sharp(Buffer.from(imageBuffer))
      .resize(THUMBNAIL_CONFIG.width, THUMBNAIL_CONFIG.height, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: THUMBNAIL_CONFIG.quality })
      .toBuffer();
    
    // Speichere Thumbnail
    const thumbnailPath = getThumbnailPath(imageId);
    fs.writeFileSync(thumbnailPath, thumbnailBuffer);
    
    console.log(`Thumbnail generated for image ${imageId}: ${thumbnailPath}`);
    
    return getThumbnailUrl(imageId);
  } catch (error) {
    console.error(`Error generating thumbnail for ${imageId}:`, error);
    throw error;
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { images } = req.body;

    if (!images || !Array.isArray(images)) {
      return res.status(400).json({ error: 'Missing or invalid images array' });
    }

    // Stelle sicher, dass das Cache-Verzeichnis existiert
    ensureCacheDir();

    // Generiere Thumbnails für alle Bilder parallel
    const thumbnailPromises = images.map(async (image) => {
      try {
        // Prüfe ob Thumbnail bereits existiert
        if (thumbnailExists(image.id)) {
          const thumbnailUrl = getThumbnailUrl(image.id);
          return {
            imageId: image.id,
            success: true,
            thumbnailUrl: thumbnailUrl,
            cached: true
          };
        }

        // Generiere neues Thumbnail
        const thumbnailUrl = await generateThumbnail(image.imageUrl, image.id, req);
        
        return {
          imageId: image.id,
          success: true,
          thumbnailUrl: thumbnailUrl,
          cached: false
        };
      } catch (error) {
        console.error(`Error processing image ${image.id}:`, error);
        return {
          imageId: image.id,
          success: false,
          error: error.message,
          thumbnailUrl: image.imageUrl // Fallback zur ursprünglichen URL
        };
      }
    });

    const results = await Promise.allSettled(thumbnailPromises);
    
    const thumbnails = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          imageId: images[index].id,
          success: false,
          error: result.reason?.message || 'Unknown error',
          thumbnailUrl: images[index].imageUrl
        };
      }
    });

    const successCount = thumbnails.filter(t => t.success).length;
    const cachedCount = thumbnails.filter(t => t.success && t.cached).length;
    const generatedCount = thumbnails.filter(t => t.success && !t.cached).length;

    return res.json({
      success: true,
      thumbnails,
      statistics: {
        total: images.length,
        successful: successCount,
        cached: cachedCount,
        generated: generatedCount,
        failed: images.length - successCount
      }
    });

  } catch (error) {
    console.error('Batch thumbnail generation error:', error);
    return res.status(500).json({ 
      error: 'Failed to generate thumbnails',
      details: error.message 
    });
  }
}
