import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { getConnection } from "../../../../lib/db";
import sql from 'mssql';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Session überprüfen
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Nicht authentifiziert' });
    }

    const { assetId } = req.query;

    if (!assetId || assetId === 'undefined') {
      return res.status(400).json({ error: 'Asset-ID ist erforderlich' });
    }

    // Datenbankverbindung
    const pool = await getConnection();
    if (!pool) {
      return res.status(503).json({ error: 'Datenbankverbindung fehlgeschlagen' });
    }

    // Alle Bilder für das Asset abrufen (ohne die eigentlichen Bilddaten für bessere Performance)
    const result = await pool.request()
      .input('assetId', sql.NVarChar, assetId)
      .query(`
        SELECT 
          id, asset_id, filename, file_extension, mime_type, 
          file_size, image_type, image_text, selected_device, uploaded_by, uploaded_at, updated_at, 
          description, is_primary
        FROM asset_images 
        WHERE asset_id = @assetId
        ORDER BY is_primary DESC, uploaded_at DESC
      `);

    const images = result.recordset.map(image => ({
      id: image.id,
      assetId: image.asset_id,
      filename: image.filename,
      fileExtension: image.file_extension,
      mimeType: image.mime_type,
      fileSize: image.file_size,
      imageType: image.image_type,
      imageText: image.image_text,
      selectedDevice: image.selected_device,
      uploadedBy: image.uploaded_by,
      uploadedAt: image.uploaded_at,
      updatedAt: image.updated_at,
      description: image.description,
      isPrimary: image.is_primary,
      // URL zum Abrufen des Bildes
      imageUrl: `/api/structure/image/${image.id}`,
      // Thumbnail-URL (könnte später implementiert werden)
      thumbnailUrl: `/api/structure/image/${image.id}?thumbnail=true`
    }));

    // Statistiken berechnen
    const stats = {
      totalImages: images.length,
      totalSize: images.reduce((sum, img) => sum + img.fileSize, 0),
      primaryImage: images.find(img => img.isPrimary) || null,
      fileTypes: [...new Set(images.map(img => img.fileExtension))]
    };

    res.status(200).json({
      success: true,
      assetId: assetId,
      images: images,
      statistics: stats
    });

  } catch (error) {
    console.error('Fehler beim Abrufen der Asset-Bilder:', error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen der Asset-Bilder',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
