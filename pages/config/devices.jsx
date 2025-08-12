import { useSession } from "next-auth/react";
import { Table, Spinner, Button, Modal, Nav, Tab, Form, InputGroup, FormControl, Alert } from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faTrash, faPlus, faSearch, faSync, faDownload, faUpload } from "@fortawesome/free-solid-svg-icons";
import Layout from "@/components/Layout";
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useThingsboard } from '@/contexts/ThingsboardContext';

// Local storage keys
const DEVICES_CACHE_KEY = 'hm_devices_cache';
const DEVICES_LAST_UPDATE_KEY = 'hm_devices_last_update';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

function Devices() {
  const { data: session } = useSession();
  const { tbToken, isLoading } = useThingsboard();
  
  // Local state for devices
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Local state for cached devices
  const [cachedDevices, setCachedDevices] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(null);

  // Load cached data on component mount
  useEffect(() => {
    loadCachedDevices();
  }, []);

  // Fetch devices when tbToken is available
  useEffect(() => {
    if (tbToken && session?.token) {
      fetchDevices();
    }
  }, [tbToken, session?.token]);

  // Auto-refresh functionality
  useEffect(() => {
    if (autoRefresh && tbToken) {
      const interval = setInterval(() => {
        refreshDevices();
      }, 30000); // Refresh every 30 seconds
      setRefreshInterval(interval);
      
      return () => {
        if (interval) clearInterval(interval);
      };
    } else if (refreshInterval) {
      clearInterval(refreshInterval);
      setRefreshInterval(null);
    }
  }, [autoRefresh, tbToken]);

  // Update cache when new devices data is available
  useEffect(() => {
    if (devices && devices.length > 0) {
      cacheDevices(devices);
    }
  }, [devices]);

  const loadCachedDevices = useCallback(() => {
    try {
      const cached = localStorage.getItem(DEVICES_CACHE_KEY);
      const lastUpdateStr = localStorage.getItem(DEVICES_LAST_UPDATE_KEY);
      
      if (cached && lastUpdateStr) {
        const parsedDevices = JSON.parse(cached);
        const lastUpdateTime = parseInt(lastUpdateStr);
        const now = Date.now();
        
        // Check if cache is still valid
        if (now - lastUpdateTime < CACHE_DURATION) {
          setCachedDevices(parsedDevices);
          setLastUpdate(lastUpdateTime);
          return true;
        }
      }
    } catch (error) {
      console.error('Error loading cached devices:', error);
    }
    return false;
  }, []);

  const cacheDevices = useCallback((devicesData) => {
    try {
      localStorage.setItem(DEVICES_CACHE_KEY, JSON.stringify(devicesData));
      localStorage.setItem(DEVICES_LAST_UPDATE_KEY, Date.now().toString());
      setCachedDevices(devicesData);
      setLastUpdate(Date.now());
    } catch (error) {
      console.error('Error caching devices:', error);
    }
  }, []);

  const fetchDevices = useCallback(async () => {
    if (!tbToken || !session?.token) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/config/devices', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch devices');
      }
      
      const data = await response.json();
      setDevices(data);
      cacheDevices(data);
    } catch (error) {
      console.error('Error fetching devices:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [tbToken, session?.token, cacheDevices]);

  const refreshDevices = useCallback(async () => {
    if (!tbToken) return;
    
    setIsRefreshing(true);
    try {
      await fetchDevices();
    } catch (error) {
      console.error('Error refreshing devices:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [tbToken, fetchDevices]);

  const clearCache = useCallback(() => {
    try {
      localStorage.removeItem(DEVICES_CACHE_KEY);
      localStorage.removeItem(DEVICES_LAST_UPDATE_KEY);
      setCachedDevices([]);
      setLastUpdate(null);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }, []);

  const exportDevices = useCallback(() => {
    try {
      const dataStr = JSON.stringify(cachedDevices, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `devices_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting devices:', error);
    }
  }, [cachedDevices]);

  // Use cached devices if available, otherwise use live data
  const displayDevices = cachedDevices.length > 0 ? cachedDevices : (devices || []);

  // Hilfsfunktion zum Finden des SerialNbr-Attributs
  const getSerialNumber = (device) => {
    const attributes = device.serverAttributes || device.telemetry || {};
    return attributes.serialNbr || 
           attributes.serialNumber || 
           attributes.SerialNbr || 
           attributes.SerialNumber || 
           attributes.serial || 
           attributes.Serial || 
           '-';
  };

  // Filter devices based on search term
  const filteredDevices = useMemo(() => {
    if (!displayDevices) return [];
    if (!searchTerm && selectedType === 'all') return displayDevices;

    const searchLower = (searchTerm || '').toLowerCase();
    return displayDevices.filter(device => {
      if (!device) return false;
      const serialNumber = getSerialNumber(device).toLowerCase();
      const matchesSearch = !searchTerm || 
        (device.name || '').toLowerCase().includes(searchLower) ||
        (device.label || '').toLowerCase().includes(searchLower) ||
        (device.type || '').toLowerCase().includes(searchLower) ||
        (device.asset?.pathString || '').toLowerCase().includes(searchLower) ||
        serialNumber.includes(searchLower);

      const matchesType = selectedType === 'all' || device.type === selectedType;

      return matchesSearch && matchesType;
    });
  }, [displayDevices, searchTerm, selectedType]);

  const handleClose = () => {
    setShowModal(false);
    setSelectedDevice(null);
  };

  const handleRowClick = (device) => {
    setSelectedDevice(device);
    setShowModal(true);
  };

  const formatLastUpdate = (timestamp) => {
    if (!timestamp) return 'Nie';
    return new Date(timestamp).toLocaleString('de-DE');
  };

  if (isLoading || !tbToken || !session) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
        <Spinner animation="border" />
      </div>
    );
  }

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="text-white">Geräte</h2>
        <div className="d-flex gap-2">
          <Button
            variant="outline-light"
            size="sm"
            onClick={refreshDevices}
            disabled={isRefreshing}
          >
            <FontAwesomeIcon icon={faSync} spin={isRefreshing} className="me-2" />
            {isRefreshing ? 'Aktualisiere...' : 'Aktualisieren'}
          </Button>
          <Button
            variant={autoRefresh ? "success" : "outline-success"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            Auto-Refresh
          </Button>
          <Button
            variant="outline-info"
            size="sm"
            onClick={exportDevices}
            disabled={cachedDevices.length === 0}
          >
            <FontAwesomeIcon icon={faDownload} className="me-2" />
            Export
          </Button>
          <Button
            variant="outline-warning"
            size="sm"
            onClick={clearCache}
          >
            Cache löschen
          </Button>
        </div>
      </div>

      {/* Status Information */}
      {lastUpdate && (
        <Alert variant="info" className="mb-3">
          <div className="d-flex justify-content-between align-items-center">
            <span>
              <strong>Cache Status:</strong> {cachedDevices.length} Geräte gespeichert
            </span>
            <span>
              <strong>Letzte Aktualisierung:</strong> {formatLastUpdate(lastUpdate)}
            </span>
          </div>
        </Alert>
      )}

      {error && (
        <Alert variant="danger" className="mb-3">
          Fehler beim Laden der Geräte: {error.message}
          {cachedDevices.length > 0 && (
            <div className="mt-2">
              <small>Zeige gecachte Daten ({cachedDevices.length} Geräte)</small>
            </div>
          )}
        </Alert>
      )}

      {/* Search Bar */}
      <div className="mb-4">
        <InputGroup>
          <InputGroup.Text style={{ 
            backgroundColor: '#34495E', 
            borderColor: '#2C3E50',
            color: 'white'
          }}>
            <FontAwesomeIcon icon={faSearch} />
          </InputGroup.Text>
          <FormControl
            placeholder="Suche nach Gerät, Label, Typ, SerialNbr oder Pfad..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              backgroundColor: '#2C3E50',
              borderColor: '#34495E',
              color: 'white',
              '&::placeholder': {
                color: 'rgba(255, 255, 255, 0.5)'
              }
            }}
          />
        </InputGroup>
      </div>

      <div style={{ 
        position: 'relative', 
        height: 'calc(100vh - 320px)', // Adjusted for additional elements
        overflow: 'auto'
      }}>
        <Table 
          striped 
          bordered 
          hover 
          variant="dark" 
          className="shadow"
          style={{
            backgroundColor: '#2C3E50',
            borderColor: '#34495E',
            position: 'relative',
            borderCollapse: 'separate',
            borderSpacing: 0,
          }}
        >
          <thead style={{
            position: 'sticky',
            top: 0,
            zIndex: 1,
            backgroundColor: '#34495E',
          }}>
            <tr style={{ backgroundColor: '#34495E' }}>
              <th>Name</th>
              <th>Label</th>
              <th>Typ</th>
              <th>SerialNbr</th>
              <th>Pfad</th>
              <th>Batterie</th>
              <th>FCnt</th>
              <th>Ventil</th>
              <th>RSSI</th>
              <th>SF</th>
              <th>SNR</th>
              <th>Status</th>
              <th>Letzte Aktivität</th>
            </tr>
          </thead>
          <tbody>
            {filteredDevices.map((device) => (
              <tr 
                key={device.id}
                onClick={() => handleRowClick(device)}
                style={{ 
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: '#34495E'
                  }
                }}
              >
                <td>{device.name}</td>
                <td>{device.label}</td>
                <td>{device.type}</td>
                <td>{getSerialNumber(device)}</td>
                <td>{device.asset?.pathString || '-'}</td>
                <td>
                  {device.telemetry?.batteryVoltage ? (
                    <div className="text-white">{device.telemetry.batteryVoltage}V</div>
                  ) : '-'}
                </td>
                <td>
                  {device.telemetry?.fCnt || '-'}
                </td>
                <td>
                  {device.telemetry?.PercentValveOpen !== undefined ? (
                    <div className="text-white">
                      {Math.round(device.telemetry.PercentValveOpen)}%
                    </div>
                  ) : '-'}
                </td>
                <td>
                  {device.telemetry?.rssi ? (
                    <div className="text-white">{device.telemetry.rssi}dBm</div>
                  ) : '-'}
                </td>
                <td>
                  {device.telemetry?.sf || '-'}
                </td>
                <td>
                  {device.telemetry?.snr ? `${device.telemetry.snr}dB` : '-'}
                </td>
                <td>
                  <span className={`badge ${device.active ? 'bg-success' : 'bg-danger'}`}>
                    {device.active ? 'Aktiv' : 'Inaktiv'}
                  </span>
                </td>
                <td className="text-white">
                  {device.telemetry?.lastActivityTime ? 
                    new Date(parseInt(device.telemetry.lastActivityTime)).toLocaleString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    }) : 
                    device.lastActivityTime ? 
                      new Date(parseInt(device.lastActivityTime)).toLocaleString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      }) : 
                      'Nie'
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <Modal
        show={showModal}
        onHide={handleClose}
        size="lg"
        centered
        backdrop="static"
        className="custom-modal"
      >
        <Modal.Header closeButton style={{ backgroundColor: '#2C3E50', color: 'white' }}>
          <Modal.Title>{selectedDevice?.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ backgroundColor: '#2C3E50', color: 'white' }}>
          <Tab.Container defaultActiveKey="settings">
            <Nav variant="tabs" className="mb-3">
              <Nav.Item>
                <Nav.Link 
                  eventKey="settings"
                  style={{ 
                    color: 'white',
                    backgroundColor: 'transparent',
                    border: '1px solid #34495E'
                  }}
                >
                  Einstellungen
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link 
                  eventKey="history"
                  style={{ 
                    color: 'white',
                    backgroundColor: 'transparent',
                    border: '1px solid #34495E'
                  }}
                >
                  Historische Daten
                </Nav.Link>
              </Nav.Item>
            </Nav>
            <Tab.Content>
              <Tab.Pane eventKey="settings">
                <div className="p-3">
                  <h5>Geräteinformationen</h5>
                  <div className="mb-3">
                    <strong>ID:</strong> {selectedDevice?.id}
                  </div>
                  <div className="mb-3">
                    <strong>Typ:</strong> {selectedDevice?.type}
                  </div>
                  <div className="mb-3">
                    <strong>Label:</strong> {selectedDevice?.label}
                  </div>
                  <div className="mb-3">
                    <strong>Status:</strong> 
                    <span className={`badge ms-2 ${selectedDevice?.active ? 'bg-success' : 'bg-danger'}`}>
                      {selectedDevice?.active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </div>
                  <div className="mb-3">
                    <strong>Pfad:</strong> {selectedDevice?.asset?.pathString || 'Nicht zugewiesen'}
                  </div>
                  {/* Weitere Geräteinformationen hier */}
                </div>
              </Tab.Pane>
              <Tab.Pane eventKey="history">
                <div className="p-3">
                  <h5>Historische Daten</h5>
                  {/* Hier kommt später die Implementierung der historischen Daten */}
                  <p>Historische Daten werden hier angezeigt...</p>
                </div>
              </Tab.Pane>
            </Tab.Content>
          </Tab.Container>
        </Modal.Body>
      </Modal>
    </div>
  );
}

Devices.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};

export default Devices; 