import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { getConnection } from "../../../../lib/db";
import sql from 'mssql';

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'GET') {
    // Bild abrufen
    return await getImage(req, res, id);
  } else if (req.method === 'DELETE') {
    // Bild löschen
    return await deleteImage(req, res, id);
  } else if (req.method === 'PUT') {
    // Bild-Metadaten aktualisieren
    return await updateImageMetadata(req, res, id);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function getImage(req, res, imageId) {
  try {
    // Session überprüfen
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Nicht authentifiziert' });
    }

    if (!imageId || imageId === 'undefined') {
      return res.status(400).json({ error: 'Bild-ID ist erforderlich' });
    }

    // Datenbankverbindung
    const pool = await getConnection();
    if (!pool) {
      return res.status(503).json({ error: 'Datenbankverbindung fehlgeschlagen' });
    }

    // Bild aus der Datenbank abrufen
    const result = await pool.request()
      .input('imageId', sql.BigInt, imageId)
      .query(`
        SELECT 
          id, asset_id, filename, file_extension, mime_type, 
          file_size, image_data, image_type, image_text, selected_device, uploaded_at, description, is_primary
        FROM asset_images 
        WHERE id = @imageId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Bild nicht gefunden' });
    }

    const image = result.recordset[0];

    // HTTP-Headers für das Bild setzen
    res.setHeader('Content-Type', image.mime_type);
    res.setHeader('Content-Length', image.file_size);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 Jahr Cache
    res.setHeader('Content-Disposition', `inline; filename="${image.filename}"`);

    // Bild-Daten senden
    res.send(image.image_data);

  } catch (error) {
    console.error('Fehler beim Abrufen des Bildes:', error);
    return res.status(500).json({ 
      error: 'Fehler beim Abrufen des Bildes',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

async function deleteImage(req, res, imageId) {
  try {
    // Session überprüfen
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Nicht authentifiziert' });
    }

    if (!imageId || imageId === 'undefined') {
      return res.status(400).json({ error: 'Bild-ID ist erforderlich' });
    }

    // Datenbankverbindung
    const pool = await getConnection();
    if (!pool) {
      return res.status(503).json({ error: 'Datenbankverbindung fehlgeschlagen' });
    }

    // Bild löschen
    const result = await pool.request()
      .input('imageId', sql.BigInt, imageId)
      .query(`
        DELETE FROM asset_images 
        OUTPUT DELETED.filename, DELETED.asset_id
        WHERE id = @imageId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Bild nicht gefunden' });
    }

    const deletedImage = result.recordset[0];

    res.status(200).json({
      success: true,
      message: 'Bild erfolgreich gelöscht',
      filename: deletedImage.filename,
      assetId: deletedImage.asset_id
    });

  } catch (error) {
    console.error('Fehler beim Löschen des Bildes:', error);
    return res.status(500).json({ 
      error: 'Fehler beim Löschen des Bildes',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

async function updateImageMetadata(req, res, imageId) {
  try {
    // Session überprüfen
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Nicht authentifiziert' });
    }

    if (!imageId || imageId === 'undefined') {
      return res.status(400).json({ error: 'Bild-ID ist erforderlich' });
    }

    const { description, isPrimary, imageType, imageText, selectedDevice } = req.body;

    // Datenbankverbindung
    const pool = await getConnection();
    if (!pool) {
      return res.status(503).json({ error: 'Datenbankverbindung fehlgeschlagen' });
    }

    // Beginne Transaktion
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Wenn dieses Bild als primär markiert werden soll, andere Bilder auf nicht-primär setzen
      if (isPrimary === true) {
        // Zuerst die Asset-ID des aktuellen Bildes abrufen
        const assetResult = await transaction.request()
          .input('imageId', sql.BigInt, imageId)
          .query('SELECT asset_id FROM asset_images WHERE id = @imageId');

        if (assetResult.recordset.length > 0) {
          const assetId = assetResult.recordset[0].asset_id;
          
          await transaction.request()
            .input('assetId', sql.NVarChar, assetId)
            .input('currentImageId', sql.BigInt, imageId)
            .query(`
              UPDATE asset_images 
              SET is_primary = 0 
              WHERE asset_id = @assetId AND id != @currentImageId
            `);
        }
      }

      // Bild-Metadaten aktualisieren
      await transaction.request()
        .input('imageId', sql.BigInt, imageId)
        .input('description', sql.NVarChar, description || null)
        .input('isPrimary', sql.Bit, isPrimary === true ? 1 : 0)
        .input('imageType', sql.NVarChar, imageType || null)
        .input('imageText', sql.NVarChar, imageText || null)
        .input('selectedDevice', sql.NVarChar, selectedDevice || null)
        .query(`
          UPDATE asset_images 
          SET 
            description = @description,
            is_primary = @isPrimary,
            image_type = @imageType,
            image_text = @imageText,
            selected_device = @selectedDevice,
            updated_at = GETDATE()
          WHERE id = @imageId
        `);

      // Transaktion bestätigen
      await transaction.commit();

      res.status(200).json({
        success: true,
        message: 'Bild-Metadaten erfolgreich aktualisiert'
      });

    } catch (dbError) {
      await transaction.rollback();
      throw dbError;
    }

  } catch (error) {
    console.error('Fehler beim Aktualisieren der Bild-Metadaten:', error);
    return res.status(500).json({ 
      error: 'Fehler beim Aktualisieren der Bild-Metadaten',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
