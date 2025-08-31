import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { getConnection } from "../../../lib/db";
import sql from 'mssql';
import multer from 'multer';
import { promisify } from 'util';

// Multer-Konfiguration für Datei-Upload im Speicher
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB Limit
  },
  fileFilter: (req, file, cb) => {
    // Nur JPG und PNG Dateien erlauben
    const allowedMimeTypes = ['image/jpeg', 'image/png'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Nur JPG und PNG Dateien sind erlaubt'), false);
    }
  }
});

const uploadSingle = promisify(upload.single('image'));

// Helper-Funktion zum Deaktivieren des Standard-Body-Parsers für Datei-Uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Session überprüfen
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Nicht authentifiziert' });
    }

    // Datei-Upload verarbeiten
    await uploadSingle(req, res);

    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }

    const { assetId, description, isPrimary, imageType, imageText, selectedDevice } = req.body;

    if (!assetId) {
      return res.status(400).json({ error: 'Asset-ID ist erforderlich' });
    }

    // Datei-Informationen extrahieren
    const file = req.file;
    const filename = file.originalname;
    const fileExtension = filename.split('.').pop().toLowerCase();
    const mimeType = file.mimetype;
    const fileSize = file.size;
    const imageData = file.buffer;

          // Validierung
      if (!['jpg', 'jpeg', 'png'].includes(fileExtension)) {
        return res.status(400).json({ error: 'Ungültiger Dateityp. Nur JPG und PNG sind erlaubt.' });
      }

      if (fileSize > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'Datei ist zu groß. Maximum 10MB erlaubt.' });
      }

      // Validierung des Bildtyps
      const validImageTypes = ['Heizkörper', 'Raum', 'Grundriss'];
      if (!imageType || !validImageTypes.includes(imageType)) {
        return res.status(400).json({ error: 'Ungültiger Bildtyp. Erlaubte Typen: Heizkörper, Raum, Grundriss' });
      }

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
      if (isPrimary === 'true' || isPrimary === true) {
        await transaction.request()
          .input('assetId', sql.NVarChar, assetId)
          .query(`
            UPDATE asset_images 
            SET is_primary = 0 
            WHERE asset_id = @assetId
          `);
      }

      // Neues Bild in die Datenbank einfügen
      const result = await transaction.request()
        .input('assetId', sql.NVarChar, assetId)
        .input('filename', sql.NVarChar, filename)
        .input('fileExtension', sql.NVarChar, fileExtension)
        .input('mimeType', sql.NVarChar, mimeType)
        .input('fileSize', sql.Int, fileSize)
        .input('imageData', sql.VarBinary, imageData)
        .input('imageType', sql.NVarChar, imageType)
        .input('imageText', sql.NVarChar, imageText || null)
        .input('selectedDevice', sql.NVarChar, selectedDevice || null)
        .input('uploadedBy', sql.NVarChar, session.user.email || session.user.id)
        .input('description', sql.NVarChar, description || null)
        .input('isPrimary', sql.Bit, isPrimary === 'true' || isPrimary === true ? 1 : 0)
        .query(`
          INSERT INTO asset_images (
            asset_id, filename, file_extension, mime_type, file_size, 
            image_data, image_type, image_text, selected_device, uploaded_by, description, is_primary
          )
          VALUES (
            @assetId, @filename, @fileExtension, @mimeType, @fileSize,
            @imageData, @imageType, @imageText, @selectedDevice, @uploadedBy, @description, @isPrimary
          );
          
          SELECT SCOPE_IDENTITY() as id;
        `);

      // Transaktion bestätigen
      await transaction.commit();

      const imageId = result.recordset[0].id;

      res.status(200).json({
        success: true,
        message: 'Bild erfolgreich hochgeladen',
        imageId: imageId,
        filename: filename,
        fileSize: fileSize,
        mimeType: mimeType,
        isPrimary: isPrimary === 'true' || isPrimary === true
      });

    } catch (dbError) {
      // Transaktion rückgängig machen
      await transaction.rollback();
      throw dbError;
    }

  } catch (error) {
    console.error('Fehler beim Bild-Upload:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Datei ist zu groß. Maximum 10MB erlaubt.' });
    }
    
    if (error.message.includes('Nur JPG und PNG')) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({ 
      error: 'Fehler beim Hochladen des Bildes',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
