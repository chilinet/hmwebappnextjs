import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle, faTimes } from '@fortawesome/free-solid-svg-icons';

const TelemetryModal = ({ 
  isOpen, 
  onClose, 
  device, 
  telemetryData, 
  isLoading 
}) => {
  if (!isOpen) return null;

  // Helper function to format values based on attribute type
  const formatValue = (value, attributeName) => {
    if (value === null || value === undefined) return '-';
    
    try {
      switch (attributeName) {
        case 'batteryVoltage':
          return `${parseFloat(value).toFixed(2)} V`;
        case 'sensorTemperature':
        case 'targetTemperature':
          return `${parseFloat(value).toFixed(1)} °C`;
        case 'PercentValveOpen':
          return `${parseFloat(value).toFixed(0)} %`;
        case 'rssi':
        case 'snr':
          return `${parseFloat(value).toFixed(1)} dB`;
        case 'fCnt':
        case 'sf':
          return value;
        case 'signalQuality':
          return value;
        default:
          return value;
      }
    } catch (error) {
      return value;
    }
  };

  // Process telemetry data to create table rows
  const processTelemetryData = (rawData) => {
    if (!rawData || typeof rawData !== 'object') return [];

    const now = Date.now();
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
    
    // Collect all unique timestamps from all attributes
    const allTimestamps = new Set();
    
    Object.keys(rawData).forEach(attributeName => {
      const attributeData = rawData[attributeName];
      if (attributeData && Array.isArray(attributeData)) {
        attributeData.forEach((entry) => {
          if (entry && entry.ts) {
            const timestamp = Number(entry.ts);
            if (!isNaN(timestamp) && timestamp >= twentyFourHoursAgo) {
              allTimestamps.add(timestamp);
            }
          }
        });
      }
    });

    // Convert timestamps to array and sort (newest first)
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => b - a);

    // Create data structure for table display
    const tableData = sortedTimestamps.map(timestamp => {
      const row = {
        timestamp: timestamp,
        formattedTime: new Date(timestamp).toLocaleString('de-DE'),
        batteryVoltage: null,
        sensorTemperature: null,
        targetTemperature: null,
        PercentValveOpen: null,
        fCnt: null,
        rssi: null,
        snr: null,
        sf: null,
        signalQuality: null
      };

      // Fill in values for each attribute at this timestamp
      Object.keys(rawData).forEach(attributeName => {
        const attributeData = rawData[attributeName];
        if (attributeData && Array.isArray(attributeData)) {
          // Find the closest value to this timestamp (within 5 minutes)
          const fiveMinutes = 5 * 60 * 1000;
          const closestEntry = attributeData.find(entry => {
            if (entry && entry.ts) {
              const entryTs = Number(entry.ts);
              return Math.abs(entryTs - timestamp) <= fiveMinutes;
            }
            return false;
          });
          
          if (closestEntry) {
            row[attributeName] = closestEntry.value;
          }
        }
      });

      return row;
    });

    return tableData;
  };

  const processedData = processTelemetryData(telemetryData);

  return (
    <div 
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        backdropFilter: 'blur(2px)'
      }} 
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg shadow-2xl"
        style={{
          maxWidth: '90%',
          width: '1400px',
          maxHeight: '90%',
          animation: 'slideIn 0.3s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header d-flex justify-content-between align-items-center p-3">
          <h5 className="mb-0">
            Telemetriedaten - {device?.name || device?.label || 'Unbekanntes Gerät'}
          </h5>
          <button 
            type="button" 
            className="btn-close" 
            onClick={onClose}
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        
        <div className="card-body p-0">
          {isLoading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Lade...</span>
              </div>
              <p className="mt-2">Lade Telemetriedaten...</p>
            </div>
          ) : (
            <div className="table-responsive" style={{ maxHeight: '70vh' }}>
              <table className="table table-striped table-hover mb-0">
                <thead className="table-dark sticky-top">
                  <tr>
                    <th>Zeitstempel</th>
                    <th>Batterie</th>
                    <th>Aktuelle Temp.</th>
                    <th>Ziel Temp.</th>
                    <th>Ventil</th>
                    <th>FCnt</th>
                    <th>RSSI</th>
                    <th>SNR</th>
                    <th>SF</th>
                    <th>Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {processedData.length > 0 ? (
                    processedData.map((row, index) => (
                      <tr key={index}>
                        <td className="text-nowrap">
                          <span className="text-dark">
                            {row.formattedTime}
                          </span>
                        </td>
                        <td>
                          <span className="text-dark">
                            {formatValue(row.batteryVoltage, 'batteryVoltage')}
                          </span>
                        </td>
                        <td>
                          <span className="text-dark">
                            {formatValue(row.sensorTemperature, 'sensorTemperature')}
                          </span>
                        </td>
                        <td>
                          <span className="text-dark">
                            {formatValue(row.targetTemperature, 'targetTemperature')}
                          </span>
                        </td>
                        <td>
                          <span className="text-dark">
                            {formatValue(row.PercentValveOpen, 'PercentValveOpen')}
                          </span>
                        </td>
                        <td>
                          <span className="text-dark">
                            {formatValue(row.fCnt, 'fCnt')}
                          </span>
                        </td>
                        <td>
                          <span className="text-dark">
                            {formatValue(row.rssi, 'rssi')}
                          </span>
                        </td>
                        <td>
                          <span className="text-dark">
                            {formatValue(row.snr, 'snr')}
                          </span>
                        </td>
                        <td>
                          <span className="text-dark">
                            {formatValue(row.sf, 'sf')}
                          </span>
                        </td>
                        <td>
                          <span className="text-dark">
                            {formatValue(row.signalQuality, 'signalQuality')}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="10" className="text-center py-4">
                        <FontAwesomeIcon icon={faExclamationTriangle} size="2x" className="text-muted mb-3" />
                        <h6 className="mb-0">Keine Telemetriedaten verfügbar</h6>
                        <p className="text-muted mb-0">Für die letzten 24 Stunden wurden keine Daten gefunden.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        <div className="card-footer p-3">
          <div className="d-flex justify-content-between align-items-center">
            <small className="text-muted">
              Zeige Rohdaten der letzten 24 Stunden für alle verfügbaren Attribute
            </small>
            <button 
              type="button" 
              className="btn btn-secondary btn-sm"
              onClick={onClose}
            >
              Schließen
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from { 
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
          }
          to { 
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default TelemetryModal;
