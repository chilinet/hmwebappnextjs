import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../auth/[...nextauth]';
import { getSession } from 'next-auth/react';
import jwt from 'jsonwebtoken';

const THINGSBOARD_URL = process.env.THINGSBOARD_URL;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get query parameters
  const { 
    deviceId, 
    attribute, 
    startTs, 
    endTs, 
    interval, 
    limit = '100', 
    agg, 
    last7Days 
  } = req.query;

  // Authentifizierung prüfen
  let tbToken = null;

  // Versuche zuerst den Bearer Token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET);
      tbToken = decoded.tbToken;
    } catch (err) {
      console.error('JWT verification failed:', err);
    }
  }

  // Wenn kein gültiger Bearer Token, versuche Session
  if (!tbToken) {
    const session = await getSession({ req });
    if (session?.tbToken) {
      tbToken = session.tbToken;
    }
  }

  // Wenn keine Authentifizierung gefunden wurde
  if (!tbToken) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
      message: 'Kein gültiger ThingsBoard Token gefunden'
    });
  }

  // Device ID validieren
  if (!deviceId) {
    return res.status(400).json({
      success: false,
      error: 'Missing device ID',
      message: 'Device ID ist erforderlich'
    });
  }

  // Attribut validieren
  if (!attribute) {
    return res.status(400).json({
      success: false,
      error: 'Missing attribute',
      message: 'Attribut-Name ist erforderlich'
    });
  }

  // Zeitbereich validieren und verarbeiten
  let startTimestamp, endTimestamp;
  
  if (last7Days === 'true') {
    // Automatisch die letzten 7 Tage setzen
    endTimestamp = Date.now();
    startTimestamp = endTimestamp - (7 * 24 * 60 * 60 * 1000); // 7 Tage zurück
  } else {
    // Manuelle Zeitstempel verwenden
    if (!startTs || !endTs) {
      return res.status(400).json({
        success: false,
        error: 'Missing time range',
        message: 'Start- und Endzeit sind erforderlich (startTs, endTs) oder last7Days=true'
      });
    }

    startTimestamp = parseInt(startTs);
    endTimestamp = parseInt(endTs);
    
    if (isNaN(startTimestamp) || isNaN(endTimestamp)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid timestamps',
        message: 'Start- und Endzeit müssen gültige Unix-Timestamps sein'
      });
    }

    if (startTimestamp >= endTimestamp) {
      return res.status(400).json({
        success: false,
        error: 'Invalid time range',
        message: 'Startzeit muss vor der Endzeit liegen'
      });
    }
  }

  try {
    // Für 7-Tage-Abfragen automatisch optimale Parameter setzen
    let finalInterval = interval;
    let finalLimit = limit;
    let finalAgg = agg;
    
    if (last7Days === 'true') {
      // Für 7 Tage mit stündlichen Durchschnittswerten optimieren
      finalInterval = '3600000'; // 1 Stunde in Millisekunden
      finalAgg = 'AVG';
      finalLimit = '168'; // 7 Tage * 24 Stunden = 168 Datenpunkte
    } else {
      // Standard-Limit auf 100 setzen, wenn nicht explizit angegeben
      finalLimit = finalLimit || '100';
    }

    // ThingsBoard API URL zusammenbauen
    let apiUrl = `${THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${encodeURIComponent(attribute)}&startTs=${startTimestamp}&endTs=${endTimestamp}`;

    // Parameter hinzufügen
    if (finalInterval) {
      apiUrl += `&interval=${finalInterval}`;
    }
    
    if (finalLimit) {
      apiUrl += `&limit=${finalLimit}`;
    }
    
    if (finalAgg) {
      apiUrl += `&agg=${finalAgg}`;
    }

    // Construct ThingsBoard API URL

    // Telemetriedaten von ThingsBoard abrufen
    const response = await fetch(apiUrl, {
      headers: {
        'X-Authorization': `Bearer ${tbToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ThingsBoard API error:', response.status, errorText);
      
      return res.status(response.status).json({
        success: false,
        error: 'ThingsBoard API error',
        message: `Fehler beim Abrufen der Telemetriedaten: ${response.status}`,
        details: errorText
      });
    }

    const telemetryData = await response.json();

    // Daten strukturieren
    const result = {
      success: true,
      data: {
        deviceId: deviceId,
        attribute: attribute,
        timeRange: {
          start: startTimestamp,
          end: endTimestamp,
          startISO: new Date(startTimestamp).toISOString(),
          endISO: new Date(endTimestamp).toISOString()
        },
        parameters: {
          interval: finalInterval || null,
          limit: finalLimit || null,
          agg: finalAgg || null,
          last7Days: last7Days === 'true'
        },
        telemetry: {}
      }
    };

    // Telemetriedaten verarbeiten
    if (telemetryData && telemetryData[attribute]) {
      const values = telemetryData[attribute];
      
      // Daten nach Zeitstempel sortieren
      values.sort((a, b) => a.ts - b.ts);
      
      // Intelligente Stichprobenbildung, wenn mehr Daten als Limit vorhanden sind
      let processedValues = values;
      const maxDataPoints = parseInt(finalLimit) || 100;
      
      if (values.length > maxDataPoints) {
        // Berechne Schrittweite für Stichprobenbildung
        const step = Math.ceil(values.length / maxDataPoints);
        processedValues = [];
        
        for (let i = 0; i < values.length; i += step) {
          processedValues.push(values[i]);
          if (processedValues.length >= maxDataPoints) break;
        }
        
        // Immer den letzten Datenpunkt einschließen
        if (processedValues.length > 0 && processedValues[processedValues.length - 1] !== values[values.length - 1]) {
          processedValues[processedValues.length - 1] = values[values.length - 1];
        }
      }
      
      result.data.telemetry = {
        attribute: attribute,
        dataPoints: processedValues.length,
        originalDataPoints: values.length,
        values: processedValues.map(item => ({
          timestamp: item.ts,
          timestampISO: new Date(item.ts).toISOString(),
          value: item.value
        })),
        statistics: {
          min: Math.min(...processedValues.map(v => v.value).filter(v => typeof v === 'number')),
          max: Math.max(...processedValues.map(v => v.value).filter(v => typeof v === 'number')),
          avg: processedValues.map(v => v.value).filter(v => typeof v === 'number').reduce((a, b) => a + b, 0) / processedValues.filter(v => typeof v === 'number').length
        }
      };
    } else {
      result.data.telemetry = {
        attribute: attribute,
        dataPoints: 0,
        originalDataPoints: 0,
        values: [],
        statistics: {
          min: null,
          max: null,
          avg: null
        }
      };
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Telemetry API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Interner Serverfehler beim Verarbeiten der Anfrage',
      details: error.message
    });
  }
} 