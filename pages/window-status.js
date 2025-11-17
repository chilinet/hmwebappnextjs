import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Card, Badge, Spinner, Alert, Button, Modal } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faHome, 
  faArrowLeft,
  faDoorOpen,
  faDoorClosed,
  faSearch,
  faTimes,
  faClock,
  faDownload,
  faHistory
} from '@fortawesome/free-solid-svg-icons';
import Head from 'next/head';
import * as XLSX from 'xlsx';

export default function WindowStatus() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [windowData, setWindowData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [treeData, setTreeData] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Helper function to get window status text
  const getWindowStatus = (hallSensorState) => {
    if (!hallSensorState) return 'Unbekannt';
    const state = String(hallSensorState).toUpperCase();
    return state === 'LOW' ? 'Offen' : state === 'HIGH' ? 'Geschlossen' : 'Unbekannt';
  };

  // Helper function to get window status icon
  const getWindowIcon = (hallSensorState) => {
    if (!hallSensorState) return faHome;
    const state = String(hallSensorState).toUpperCase();
    return state === 'LOW' ? faDoorOpen : faDoorClosed;
  };

  // Helper function to get window status color
  const getWindowColor = (hallSensorState) => {
    if (!hallSensorState) return 'secondary';
    const state = String(hallSensorState).toUpperCase();
    return state === 'LOW' ? 'warning' : 'success';
  };

  // Helper function to format duration
  const formatDuration = (timestamp) => {
    if (!timestamp) return 'Keine Daten';
    
    try {
      // Handle timestamp from View (format: 'YYYY-MM-DD HH24:MI:SS' or Date object)
      const date = timestamp instanceof Date 
        ? timestamp 
        : new Date(timestamp);
      
      if (isNaN(date.getTime())) {
        return 'Ungültiges Datum';
      }
      
      const now = new Date();
      const diffMs = now - date;
      
      if (diffMs < 0) return 'Zukünftig';
      
      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);
      
      if (diffDays > 0) {
        return `${diffDays} Tag${diffDays > 1 ? 'e' : ''} ${diffHours % 24} Stunde${(diffHours % 24) !== 1 ? 'n' : ''}`;
      } else if (diffHours > 0) {
        return `${diffHours} Stunde${diffHours > 1 ? 'n' : ''} ${diffMinutes % 60} Minute${(diffMinutes % 60) !== 1 ? 'n' : ''}`;
      } else if (diffMinutes > 0) {
        return `${diffMinutes} Minute${diffMinutes > 1 ? 'n' : ''}`;
      } else {
        return `${diffSeconds} Sekunde${diffSeconds > 1 ? 'n' : ''}`;
      }
    } catch (error) {
      return 'Ungültiges Datum';
    }
  };

  // Helper function to format timestamp
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Keine Daten';
    
    try {
      // Handle timestamp from View (format: 'YYYY-MM-DD HH24:MI:SS' or Date object)
      const date = timestamp instanceof Date 
        ? timestamp 
        : new Date(timestamp);
      
      if (isNaN(date.getTime())) {
        return 'Ungültiges Datum';
      }
      
      return date.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (error) {
      return 'Ungültiges Datum';
    }
  };

  // Helper function to find asset path in tree
  const findAssetPath = (assetId, treeNodes, currentPath = []) => {
    for (const node of treeNodes) {
      const newPath = [...currentPath, node.label];
      
      if (node.id === assetId) {
        return newPath;
      }
      
      if (node.children && node.children.length > 0) {
        const foundPath = findAssetPath(assetId, node.children, newPath);
        if (foundPath) {
          return foundPath;
        }
      }
    }
    return null;
  };

  // Helper function to get asset path string
  const getAssetPathString = (assetId) => {
    if (!treeData || !assetId) return 'Pfad nicht gefunden';
    
    const path = findAssetPath(assetId, treeData);
    if (path) {
      return path.join(' → ');
    }
    return 'Pfad nicht gefunden';
  };

  // Load window status data and tree data
  useEffect(() => {
    async function fetchData() {
      if (session?.user?.customerid) {
        try {
          setLoading(true);
          
          // Fetch window status data - erhöhtes Limit für mehr als 2000 Geräte
          const reportingUrl = process.env.REPORTING_URL || 'https://webapptest.heatmanager.cloud';
          const windowResponse = await fetch(`${reportingUrl}/api/reporting/window-status?key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD&customer_id=${session.user.customerid}&limit=5000`);
          
          if (!windowResponse.ok) {
            throw new Error(`HTTP error! status: ${windowResponse.status}`);
          }
          
          const windowData = await windowResponse.json();
          console.log('Window status data received:', windowData);
          
          // Filtere nur Geräte mit device_type 'dnt-LW-WSCI'
          if (windowData.data && Array.isArray(windowData.data)) {
            windowData.data = windowData.data.filter(device => 
              device.device_type === 'dnt-LW-WSCI'
            );
            console.log(`Filtered to ${windowData.data.length} devices with type dnt-LW-WSCI`);
          }
          
          setWindowData(windowData);

          // Fetch customer tree data
          const treeResponse = await fetch(`/api/config/customers/${session.user.customerid}/tree`);
          if (treeResponse.ok) {
            const treeData = await treeResponse.json();
            setTreeData(treeData);
            console.log('Tree data loaded:', treeData);
          }
        } catch (err) {
          console.error('Error fetching data:', err);
          setError(err.message);
        } finally {
          setLoading(false);
        }
      } else {
        console.log('No customerid in session:', session?.user);
        setLoading(false);
      }
    }

    if (session) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [session]);

  // Calculate statistics
  const getWindowStats = () => {
    if (!windowData?.data || windowData.data.length === 0) {
      return { total: 0, open: 0, closed: 0, unknown: 0 };
    }

    const devices = windowData.data;
    const open = devices.filter(d => {
      const state = String(d.hall_sensor_state || '').toUpperCase();
      return state === 'LOW';
    }).length;
    const closed = devices.filter(d => {
      const state = String(d.hall_sensor_state || '').toUpperCase();
      return state === 'HIGH';
    }).length;
    const unknown = devices.filter(d => {
      const state = String(d.hall_sensor_state || '').toUpperCase();
      return state !== 'LOW' && state !== 'HIGH';
    }).length;

    return {
      total: devices.length,
      open,
      closed,
      unknown
    };
  };

  // Filter devices based on status and search term
  const getFilteredDevices = () => {
    if (!windowData?.data) return [];
    
    let filteredDevices = windowData.data;
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filteredDevices = filteredDevices.filter(device => {
        const state = String(device.hall_sensor_state || '').toUpperCase();
        if (statusFilter === 'open') {
          return state === 'LOW';
        } else if (statusFilter === 'closed') {
          return state === 'HIGH';
        } else if (statusFilter === 'unknown') {
          return state !== 'LOW' && state !== 'HIGH';
        }
        return true;
      });
    }
    
    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filteredDevices = filteredDevices.filter(device => {
        // Search in asset name
        if (device.asset_name?.toLowerCase().includes(searchLower)) return true;
        
        // Search in device name
        if (device.device_name?.toLowerCase().includes(searchLower)) return true;
        
        // Search in device type
        if (device.device_type?.toLowerCase().includes(searchLower)) return true;
        
        // Search in asset type
        if (device.asset_type?.toLowerCase().includes(searchLower)) return true;
        
        // Search in window status
        const status = getWindowStatus(device.hall_sensor_state);
        if (status.toLowerCase().includes(searchLower)) return true;
        
        // Search in asset path
        const assetPath = getAssetPathString(device.asset_id);
        if (assetPath.toLowerCase().includes(searchLower)) return true;
        
        // Search in device label
        if (device.device_label?.toLowerCase().includes(searchLower)) return true;
        
        return false;
      });
    }
    
    return filteredDevices;
  };

  // Fetch history for a device
  const fetchDeviceHistory = async (device) => {
    if (!device?.device_id) {
      console.error('No device_id provided');
      return;
    }
    
    console.log('Fetching history for device:', device.device_id, device.device_name);
    
    setLoadingHistory(true);
    setSelectedDevice(device);
    setShowHistoryModal(true);
    
    try {
      // Calculate date range (last 3 days)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 3);
      
      if (!session?.tbToken) {
        throw new Error('Keine Session gefunden');
      }
      
      const startTs = startDate.getTime();
      const endTs = endDate.getTime();
      
      console.log('Date range:', { startTs, endTs, startDate: startDate.toISOString(), endDate: endDate.toISOString() });
      
      // Try different possible attribute names for hall sensor state
      // Start with the correct attribute name first
      const possibleAttributes = ['hall_sensor_state', 'hallSensorState'];
      let historyDataResult = null;
      
      // Use ThingsBoard API to get history (works better than local PostgreSQL)
      for (const attrName of possibleAttributes) {
        try {
          console.log(`Trying ThingsBoard API with attribute: ${attrName}`);
          const response = await fetch(
            `/api/thingsboard/devices/${device.device_id}/timeseries?attribute=${attrName}&startTs=${startTs}&endTs=${endTs}&limit=1000`
          );
          
          console.log(`ThingsBoard API response status for ${attrName}:`, response.status);
          
          if (response.ok) {
            const data = await response.json();
            console.log(`ThingsBoard API response for ${attrName}:`, JSON.stringify(data, null, 2));
            
            if (data.success && data.data) {
              // API returns data in data.data.telemetry[attribute].values format
              // Structure: { success: true, data: { telemetry: { [attrName]: { values: [...] } } } }
              console.log('Full data structure:', JSON.stringify(data.data, null, 2));
              
              // Check if data is in data.data.telemetry[attrName].values
              if (data.data.telemetry && data.data.telemetry[attrName]) {
                const telemetryObj = data.data.telemetry[attrName];
                if (telemetryObj.values && Array.isArray(telemetryObj.values) && telemetryObj.values.length > 0) {
                  // Keep original format: { timestamp, timestampISO, value }
                  historyDataResult = telemetryObj.values;
                  console.log(`Found data in data.telemetry[${attrName}].values:`, historyDataResult.length, 'items');
                  console.log('First few items:', historyDataResult.slice(0, 3));
                  break;
                }
              }
              
              // Fallback: Check if data is directly in data.data[attribute] (array format)
              if (data.data[attrName] && Array.isArray(data.data[attrName]) && data.data[attrName].length > 0) {
                historyDataResult = data.data[attrName];
                console.log(`Found data in data.data[${attrName}]:`, historyDataResult.length, 'items');
                console.log('First few items:', historyDataResult.slice(0, 3));
                break;
              }
              
              // Try to find any key that has data
              const keys = Object.keys(data.data);
              console.log('Available keys in response:', keys);
              for (const key of keys) {
                const value = data.data[key];
                console.log(`Checking key ${key}:`, {
                  isArray: Array.isArray(value),
                  length: Array.isArray(value) ? value.length : 'N/A',
                  type: typeof value
                });
                
                if (Array.isArray(value) && value.length > 0) {
                  console.log(`Found data in key ${key}:`, value.length, 'items');
                  console.log('First few items:', value.slice(0, 3));
                  historyDataResult = value;
                  break;
                } else if (value && typeof value === 'object' && !Array.isArray(value)) {
                  // Maybe nested structure like telemetry[attrName].values
                  const nestedKeys = Object.keys(value);
                  console.log(`Key ${key} is an object with keys:`, nestedKeys);
                  for (const nestedKey of nestedKeys) {
                    if (Array.isArray(value[nestedKey]) && value[nestedKey].length > 0) {
                      console.log(`Found data in ${key}.${nestedKey}:`, value[nestedKey].length, 'items');
                      historyDataResult = value[nestedKey];
                      break;
                    } else if (value[nestedKey] && typeof value[nestedKey] === 'object' && value[nestedKey].values) {
                      // Check for .values property
                      if (Array.isArray(value[nestedKey].values) && value[nestedKey].values.length > 0) {
                        historyDataResult = value[nestedKey].values.map(item => ({
                          ts: item.timestamp || new Date(item.timestampISO).getTime(),
                          value: item.value
                        }));
                        console.log(`Found data in ${key}.${nestedKey}.values:`, historyDataResult.length, 'items');
                        break;
                      }
                    }
                  }
                  if (historyDataResult) break;
                }
              }
              if (historyDataResult) break;
            } else {
              console.log('Response structure:', {
                success: data.success,
                hasData: !!data.data,
                dataKeys: data.data ? Object.keys(data.data) : null,
                fullResponse: JSON.stringify(data, null, 2)
              });
            }
          } else {
            const errorText = await response.text();
            console.log(`Error response for ${attrName}:`, response.status, errorText);
          }
        } catch (err) {
          console.error(`Failed to fetch with attribute ${attrName}:`, err);
        }
      }
      
      if (!historyDataResult || historyDataResult.length === 0) {
        console.warn('No history data found from ThingsBoard API');
        setHistoryData([]);
        return;
      }
      
      console.log(`Processing ${historyDataResult.length} history items`);
      console.log('Sample items:', historyDataResult.slice(0, 3));
      
      // Process history data to show state changes
      // ThingsBoard API returns data in format: { timestamp, timestampISO, value } or { ts, value }
      const history = historyDataResult.map((item, index) => {
        // Handle different timestamp formats
        let timestampMs = null;
        let timestamp = null;
        
        // Priority 1: timestampISO (ISO string)
        if (item.timestampISO) {
          timestamp = new Date(item.timestampISO);
          timestampMs = timestamp.getTime();
        }
        // Priority 2: timestamp (milliseconds)
        else if (item.timestamp) {
          timestampMs = typeof item.timestamp === 'number' ? item.timestamp : parseInt(item.timestamp);
          timestamp = new Date(timestampMs);
        }
        // Priority 3: ts (milliseconds)
        else if (item.ts) {
          timestampMs = typeof item.ts === 'number' ? item.ts : parseInt(item.ts);
          timestamp = new Date(timestampMs);
        }
        
        if (!timestampMs || isNaN(timestampMs) || !timestamp || isNaN(timestamp.getTime())) {
          console.warn(`Invalid timestamp at index ${index}:`, item);
          return null;
        }
        
        const value = item.value;
        const state = String(value).toUpperCase() === 'LOW' ? 'Offen' : String(value).toUpperCase() === 'HIGH' ? 'Geschlossen' : 'Unbekannt';
        
        return {
          timestamp,
          timestampMs,
          value: String(value || ''),
          state
        };
      }).filter(item => item !== null); // Remove invalid entries
      
      if (history.length === 0) {
        console.warn('No valid history items after processing');
        setHistoryData([]);
        return;
      }
      
      // Sort by timestamp (oldest first)
      history.sort((a, b) => a.timestampMs - b.timestampMs);
      
      console.log('Processed history (first 3):', history.slice(0, 3).map(item => ({
        timestamp: item.timestamp.toISOString(),
        value: item.value,
        state: item.state
      })));
      
      // Group consecutive states and calculate durations
      const processedHistory = [];
      for (let i = 0; i < history.length; i++) {
        const current = history[i];
        const next = history[i + 1];
        
        let duration = null;
        if (next) {
          const diffMs = next.timestampMs - current.timestampMs;
          duration = diffMs / (1000 * 60 * 60); // Duration in hours
        }
        
        processedHistory.push({
          timestamp: current.timestamp,
          value: current.value,
          state: current.state,
          duration: duration !== null ? Math.round(duration * 100) / 100 : null // Round to 2 decimal places
        });
      }
      
      console.log(`Processed ${processedHistory.length} history items`);
      setHistoryData(processedHistory);
    } catch (error) {
      console.error('Error fetching device history:', error);
      setHistoryData([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Helper function to calculate duration in hours as decimal
  const getDurationInHours = (timestamp) => {
    if (!timestamp) return null;
    
    try {
      const date = timestamp instanceof Date 
        ? timestamp 
        : new Date(timestamp);
      
      if (isNaN(date.getTime())) {
        return null;
      }
      
      const now = new Date();
      const diffMs = now - date;
      
      if (diffMs < 0) return null;
      
      // Convert to hours (decimal)
      const diffHours = diffMs / (1000 * 60 * 60);
      return Math.round(diffHours * 100) / 100; // Round to 2 decimal places
    } catch (error) {
      return null;
    }
  };

  // Export function to Excel
  const exportToExcel = () => {
    try {
      const filteredDevices = getFilteredDevices();
      
      if (filteredDevices.length === 0) {
        alert('Keine Daten zum Exportieren verfügbar');
        return;
      }

      // Prepare data for Excel
      const excelData = filteredDevices.map(device => {
        const windowStatus = getWindowStatus(device.hall_sensor_state);
        const timestamp = device.last_update_utc ? formatTimestamp(device.last_update_utc) : 'Keine Daten';
        const durationHours = device.last_update_utc ? getDurationInHours(device.last_update_utc) : null;
        const assetPath = getAssetPathString(device.asset_id);

        return {
          'Asset Name': device.asset_name || '-',
          'Asset Typ': device.asset_type || '-',
          'Asset Pfad': assetPath,
          'Gerät Name': device.device_name || '-',
          'Gerät Label': device.device_label || '-',
          'Gerät Typ': device.device_type || '-',
          'Status': windowStatus,
          'Hall Sensor State': device.hall_sensor_state || '-',
          'Timestamp': timestamp,
          'Dauer (Stunden)': durationHours !== null ? durationHours : '-',
          'Device ID': device.device_id || '-',
          'Asset ID': device.asset_id || '-'
        };
      });

      // Create workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Fensterstatus');

      // Set column widths
      const columnWidths = [
        { wch: 25 }, // Asset Name
        { wch: 15 }, // Asset Typ
        { wch: 40 }, // Asset Pfad
        { wch: 25 }, // Gerät Name
        { wch: 20 }, // Gerät Label
        { wch: 15 }, // Gerät Typ
        { wch: 12 }, // Status
        { wch: 15 }, // Hall Sensor State
        { wch: 20 }, // Timestamp
        { wch: 18 }, // Dauer (Stunden)
        { wch: 40 }, // Device ID
        { wch: 40 }  // Asset ID
      ];
      worksheet['!cols'] = columnWidths;

      // Export as Excel file
      const fileName = `fensterstatus_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Fehler beim Exportieren nach Excel: ' + error.message);
    }
  };

  if (status === "loading") {
    return (
      <div className="light-theme min-vh-100 d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-3 text-muted">Session wird geladen...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="light-theme min-vh-100 d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-3 text-muted">Fensterstatus wird geladen...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="light-theme min-vh-100 d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="alert alert-warning">
            Keine Session gefunden. Bitte melden Sie sich an.
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="light-theme">
        <div className="container mt-4">
          <div className="alert alert-danger">
            <strong>Fehler:</strong> {error}
          </div>
        </div>
      </div>
    );
  }

  const stats = getWindowStats();

  return (
    <>
      <Head>
        <title>HeatManager - Fensterstatus</title>
        <meta name="description" content="HeatManager - Fensterstatus aller Geräte" />
      </Head>
      
      <div className="light-theme" style={{ backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        <div className="container-fluid py-4">
          {/* Header */}
          <div className="row mb-4">
            <div className="col-12">
              <div className="d-flex align-items-center mb-3">
                <button 
                  className="btn btn-outline-secondary me-3"
                  onClick={() => router.back()}
                >
                  <FontAwesomeIcon icon={faArrowLeft} className="me-2" />
                  Zurück
                </button>
                <div>
                  <h2 className="mb-0 fw-bold">Fensterstatus</h2>
                  <p className="text-muted mb-0">Übersicht aller Fensterkontakte und deren Status</p>
                </div>
              </div>
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="row g-3 mb-4">
            <div className="col-xl-3 col-lg-6 col-md-6">
              <Card className="status-card shadow-sm">
                <Card.Body className="p-4">
                  <div className="d-flex align-items-center">
                    <div className="status-icon bg-primary me-3">
                      <FontAwesomeIcon icon={faHome} />
                    </div>
                    <div>
                      <h3 className="mb-0 text-primary fw-bold">{stats.total}</h3>
                      <p className="mb-0 text-muted small">GESAMT FENSTERKONTAKTE</p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>

            <div className="col-xl-3 col-lg-6 col-md-6">
              <Card className="status-card shadow-sm">
                <Card.Body className="p-4">
                  <div className="d-flex align-items-center">
                    <div className="status-icon bg-warning me-3">
                      <FontAwesomeIcon icon={faDoorOpen} />
                    </div>
                    <div>
                      <h3 className="mb-0 text-warning fw-bold">{stats.open}</h3>
                      <p className="mb-0 text-muted small">OFFEN</p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>

            <div className="col-xl-3 col-lg-6 col-md-6">
              <Card className="status-card shadow-sm">
                <Card.Body className="p-4">
                  <div className="d-flex align-items-center">
                    <div className="status-icon bg-success me-3">
                      <FontAwesomeIcon icon={faDoorClosed} />
                    </div>
                    <div>
                      <h3 className="mb-0 text-success fw-bold">{stats.closed}</h3>
                      <p className="mb-0 text-muted small">GESCHLOSSEN</p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>

            <div className="col-xl-3 col-lg-6 col-md-6">
              <Card className="status-card shadow-sm">
                <Card.Body className="p-4">
                  <div className="d-flex align-items-center">
                    <div className="status-icon bg-secondary me-3">
                      <FontAwesomeIcon icon={faHome} />
                    </div>
                    <div>
                      <h3 className="mb-0 text-secondary fw-bold">{stats.unknown}</h3>
                      <p className="mb-0 text-muted small">UNBEKANNT</p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>
          </div>

          {/* Search and Filter Options */}
          <div className="row mb-4">
            <div className="col-12">
              <Card className="shadow-sm">
                <Card.Body className="p-4">
                  {/* Export Button */}
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5 className="mb-0 fw-bold">Filter & Suche</h5>
                    <Button
                      variant="outline-success"
                      size="sm"
                      onClick={exportToExcel}
                      disabled={!windowData?.data || windowData.data.length === 0 || getFilteredDevices().length === 0}
                    >
                      <FontAwesomeIcon icon={faDownload} className="me-2" />
                      Export nach Excel
                    </Button>
                  </div>

                  {/* Search Bar */}
                  <div className="mb-3">
                    <div className="input-group">
                      <span className="input-group-text">
                        <FontAwesomeIcon icon={faSearch} />
                      </span>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Suchen nach Asset, Gerät, Typ, Status oder Pfad..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                      {searchTerm && (
                        <button
                          className="btn btn-outline-secondary"
                          type="button"
                          onClick={() => setSearchTerm('')}
                        >
                          <FontAwesomeIcon icon={faTimes} />
                        </button>
                      )}
                    </div>
                    {searchTerm && (
                      <small className="text-muted mt-1 d-block">
                        {getFilteredDevices().length} Ergebnis{getFilteredDevices().length !== 1 ? 'se' : ''} für &quot;{searchTerm}&quot;
                      </small>
                    )}
                  </div>

                  {/* Status Filter */}
                  <div className="d-flex align-items-center flex-wrap gap-2">
                    <h6 className="mb-0 me-3 fw-bold">Filter nach Status:</h6>
                    <div className="d-flex gap-2 flex-wrap">
                      <button
                        className={`btn btn-sm ${statusFilter === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
                        onClick={() => setStatusFilter('all')}
                      >
                        Alle ({getWindowStats().total})
                      </button>
                      <button
                        className={`btn btn-sm ${statusFilter === 'open' ? 'btn-warning' : 'btn-outline-warning'}`}
                        onClick={() => setStatusFilter('open')}
                      >
                        Offen ({getWindowStats().open})
                      </button>
                      <button
                        className={`btn btn-sm ${statusFilter === 'closed' ? 'btn-success' : 'btn-outline-success'}`}
                        onClick={() => setStatusFilter('closed')}
                      >
                        Geschlossen ({getWindowStats().closed})
                      </button>
                      <button
                        className={`btn btn-sm ${statusFilter === 'unknown' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                        onClick={() => setStatusFilter('unknown')}
                      >
                        Unbekannt ({getWindowStats().unknown})
                      </button>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>
          </div>

          {/* Device List */}
          <div className="row">
            <div className="col-12">
              <Card className="shadow-sm">
                <Card.Body className="p-4">
                  <h5 className="mb-4 fw-bold">
                    Fensterkontakt-Übersicht 
                    {(statusFilter !== 'all' || searchTerm) && (
                      <span className="text-muted ms-2">
                        ({getFilteredDevices().length} von {getWindowStats().total} Geräten)
                      </span>
                    )}
                  </h5>
                  
                  {getFilteredDevices().length > 0 ? (
                    <div className="table-responsive">
                      <table className="table table-hover">
                        <thead className="table-light">
                          <tr>
                            <th>Asset</th>
                            <th>Gerät</th>
                            <th>Typ</th>
                            <th>Status</th>
                            <th>Timestamp</th>
                            <th>Dauer</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getFilteredDevices().map((device, index) => {
                            const windowStatus = getWindowStatus(device.hall_sensor_state);
                            // last_update_utc ist im Format 'YYYY-MM-DD HH24:MI:SS'
                            const timestamp = device.last_update_utc ? new Date(device.last_update_utc) : null;
                            
                            return (
                              <tr 
                                key={`${device.device_id}-${index}`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => fetchDeviceHistory(device)}
                              >
                                <td>
                                  <div>
                                    <strong>{device.asset_name || 'Unbekannt'}</strong>
                                    <br />
                                    <small className="text-muted">{device.asset_type || 'Unbekannt'}</small>
                                    <br />
                                    <small className="text-info">{getAssetPathString(device.asset_id)}</small>
                                  </div>
                                </td>
                                <td>
                                  <div>
                                    <code className="text-primary">{device.device_name || 'Unbekannt'}</code>
                                    <br />
                                    <small className="text-muted">{device.device_type || 'Unbekannt'}</small>
                                    <br />
                                    {device.device_label && (
                                      <small className="text-info">{device.device_label}</small>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <Badge bg="secondary">{device.device_type || 'Unbekannt'}</Badge>
                                </td>
                                <td>
                                  <div className="d-flex align-items-center">
                                    <FontAwesomeIcon 
                                      icon={getWindowIcon(device.hall_sensor_state)} 
                                      className={`text-${getWindowColor(device.hall_sensor_state)} me-2`}
                                    />
                                    <Badge bg={getWindowColor(device.hall_sensor_state)}>
                                      {windowStatus}
                                    </Badge>
                                  </div>
                                </td>
                                <td>
                                  <div>
                                    <small className="text-muted">
                                      {formatTimestamp(device.last_update_utc)}
                                    </small>
                                  </div>
                                </td>
                                <td>
                                  <div className="d-flex align-items-center">
                                    <FontAwesomeIcon icon={faClock} className="me-2 text-muted" />
                                    <small className="text-muted">
                                      {formatDuration(device.last_update_utc)}
                                    </small>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-5">
                      <FontAwesomeIcon icon={faHome} size="3x" className="text-muted mb-3" />
                      <p className="text-muted">
                        {!windowData?.data || windowData.data.length === 0
                          ? 'Keine Fensterstatus-Daten verfügbar'
                          : searchTerm
                            ? `Keine Ergebnisse für "${searchTerm}" gefunden`
                            : statusFilter !== 'all'
                              ? `Keine Geräte mit Status "${statusFilter}" gefunden`
                              : 'Keine Geräte gefunden'
                        }
                      </p>
                      {searchTerm && (
                        <button
                          className="btn btn-outline-primary btn-sm mt-2"
                          onClick={() => setSearchTerm('')}
                        >
                          <FontAwesomeIcon icon={faTimes} className="me-1" />
                          Suche zurücksetzen
                        </button>
                      )}
                    </div>
                  )}
                </Card.Body>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* History Modal */}
      <Modal
        show={showHistoryModal}
        onHide={() => {
          setShowHistoryModal(false);
          setSelectedDevice(null);
          setHistoryData(null);
        }}
        size="lg"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <FontAwesomeIcon icon={faHistory} className="me-2" />
            Historie - {selectedDevice?.device_name || 'Unbekannt'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedDevice && (
            <div className="mb-3">
              <p className="mb-1"><strong>Gerät:</strong> {selectedDevice.device_name}</p>
              <p className="mb-1"><strong>Asset:</strong> {selectedDevice.asset_name}</p>
              <p className="mb-0"><strong>Typ:</strong> {selectedDevice.device_type}</p>
            </div>
          )}
          
          {loadingHistory ? (
            <div className="text-center py-4">
              <Spinner animation="border" />
              <p className="mt-2 text-muted">Lade Historie...</p>
            </div>
          ) : historyData && historyData.length > 0 ? (
            <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="table table-sm table-hover">
                <thead className="table-light sticky-top">
                  <tr>
                    <th>Zeitpunkt</th>
                    <th>Status</th>
                    <th>Dauer (Stunden)</th>
                  </tr>
                </thead>
                <tbody>
                  {historyData.map((item, idx) => {
                    // Ensure timestamp is a valid Date object
                    const timestamp = item.timestamp instanceof Date 
                      ? item.timestamp 
                      : (item.timestamp ? new Date(item.timestamp) : null);
                    
                    return (
                      <tr key={idx}>
                        <td>
                          <small>
                            {timestamp && !isNaN(timestamp.getTime())
                              ? formatTimestamp(timestamp)
                              : 'Ungültiges Datum'
                            }
                          </small>
                        </td>
                        <td>
                          <Badge bg={item.state === 'Offen' ? 'warning' : item.state === 'Geschlossen' ? 'success' : 'secondary'}>
                            {item.state}
                          </Badge>
                        </td>
                        <td>
                          <small>
                            {item.duration !== null && !isNaN(item.duration)
                              ? `${Math.round(item.duration * 100) / 100} h`
                              : '-'
                            }
                          </small>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-4">
              <FontAwesomeIcon icon={faClock} size="2x" className="text-muted mb-2" />
              <p className="text-muted">Keine Historie-Daten für die letzten 3 Tage verfügbar</p>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => {
            setShowHistoryModal(false);
            setSelectedDevice(null);
            setHistoryData(null);
          }}>
            Schließen
          </Button>
        </Modal.Footer>
      </Modal>

      <style jsx>{`
        .status-card {
          border-radius: 12px;
          border: none;
          background: white;
          transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
        }
        
        .status-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.1) !important;
        }
        
        .status-icon {
          width: 48px;
          height: 48px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
        }
        
        .table th {
          border-top: none;
          font-weight: 600;
          color: #495057;
        }
        
        .table td {
          vertical-align: middle;
        }
        
        .table-hover tbody tr:hover {
          background-color: #f8f9fa;
        }
        
        .btn-sm {
          font-size: 0.875rem;
          padding: 0.375rem 0.75rem;
        }
        
        .gap-2 {
          gap: 0.5rem;
        }
        
        .input-group-text {
          background-color: #f8f9fa;
          border-color: #ced4da;
        }
        
        .form-control:focus {
          border-color: #86b7fe;
          box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
        }
        
        .flex-wrap {
          flex-wrap: wrap;
        }
      `}</style>
    </>
  );
}

WindowStatus.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};

