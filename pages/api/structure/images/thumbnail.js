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
const generateThumbnail = async (imageUrl, imageId) => {
  try {
    // Lade das Originalbild
    const response = await fetch(imageUrl);
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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { imageId, imageUrl, forceRegenerate } = req.query;

    if (!imageId || !imageUrl) {
      return res.status(400).json({ error: 'Missing imageId or imageUrl' });
    }

    // Stelle sicher, dass das Cache-Verzeichnis existiert
    ensureCacheDir();

    // Prüfe ob Thumbnail bereits existiert
    if (!forceRegenerate && thumbnailExists(imageId)) {
      const thumbnailUrl = getThumbnailUrl(imageId);
      return res.json({
        success: true,
        thumbnailUrl,
        cached: true,
        size: THUMBNAIL_CONFIG
      });
    }

    // Generiere neues Thumbnail
    const thumbnailUrl = await generateThumbnail(imageUrl, imageId);
    
    return res.json({
      success: true,
      thumbnailUrl,
      cached: false,
      size: THUMBNAIL_CONFIG
    });

  } catch (error) {
    console.error('Thumbnail generation error:', error);
    return res.status(500).json({ 
      error: 'Failed to generate thumbnail',
      details: error.message 
    });
  }
}
