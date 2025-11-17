import { useSession } from "next-auth/react";
import { Table, Spinner, Button, Modal, Nav, Tab, Form, InputGroup, FormControl, Alert } from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faTrash, faPlus, faSearch, faSync, faDownload, faUpload, faArrowUp } from "@fortawesome/free-solid-svg-icons";
import Layout from "@/components/Layout";
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useThingsboard } from '@/contexts/ThingsboardContext';
import * as XLSX from 'xlsx';

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
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedGateway, setSelectedGateway] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(null);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const tableContainerRef = useRef(null);

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

  // Handle scroll events for scroll-to-top button
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      setShowScrollToTop(scrollTop > 100);
    };

    // Also listen to table scroll events
    const handleTableScroll = (event) => {
      const scrollTop = event.target.scrollTop;
      setShowScrollToTop(scrollTop > 100);
    };

    window.addEventListener('scroll', handleScroll);
    
    // Add table scroll listener after component mounts
    const tableContainer = document.querySelector('.table-responsive');
    if (tableContainer) {
      tableContainer.addEventListener('scroll', handleTableScroll);
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (tableContainer) {
        tableContainer.removeEventListener('scroll', handleTableScroll);
      }
    };
  }, []);

  // Add ref to table container and set up scroll listener
  useEffect(() => {
    if (tableContainerRef.current) {
      const handleTableScroll = (event) => {
        const scrollTop = event.target.scrollTop;
        setShowScrollToTop(scrollTop > 50);
      };

      tableContainerRef.current.addEventListener('scroll', handleTableScroll);
      
      return () => {
        if (tableContainerRef.current) {
          tableContainerRef.current.removeEventListener('scroll', handleTableScroll);
        }
      };
    }
  }, [devices]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdown && !event.target.closest('.dropdown')) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openDropdown]);

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
      

      
      // Hole Seriennummern aus der Inventory-API für jedes Device
      const devicesWithSerialNumbers = await Promise.all(
        data.map(async (device) => {
          // Extrahiere die korrekte Device-ID
          let deviceId;
          if (typeof device.id === 'string') {
            deviceId = device.id;
          } else if (device.id && typeof device.id === 'object' && device.id.id) {
            deviceId = device.id.id;
          } else if (device.id) {
            deviceId = device.id;
          } else {
            console.warn('No valid device ID found for device:', device);
            return device;
          }
          
          try {
            // Hole Seriennummer aus der Inventory-API
            const inventoryResponse = await fetch(`/api/inventory/${deviceId}`);
            let serialNumber = '-';
            if (inventoryResponse.ok) {
              const inventoryData = await inventoryResponse.json();
              serialNumber = inventoryData.serialnbr || '-';
            }
            
            // Verbessere den Asset-Pfad, falls er nur eine ID ist
            let improvedAsset = device.asset;
            // Nur verbessern, wenn asset ein Objekt ist und pathString vorhanden ist
            if (device.asset && typeof device.asset === 'object' && device.asset.pathString && device.asset.pathString.startsWith('Asset ')) {
              const assetId = device.asset.pathString.replace('Asset ', '');
              try {
                // Versuche den Asset-Pfad zu verbessern
                const treepathResponse = await fetch(`/api/treepath/${assetId}?customerId=${session.user.customerid}`);
                if (treepathResponse.ok) {
                  const treepathData = await treepathResponse.json();
                  improvedAsset = {
                    ...device.asset,
                    pathString: treepathData.pathString || device.asset.pathString,
                    fullPath: treepathData.fullPath || device.asset.fullPath || null
                  };
                } else if (treepathResponse.status === 404) {
                  // Wenn Asset nicht im Tree gefunden wird, setze pathString auf null, damit "-" angezeigt wird
                  // statt der UUID
                  improvedAsset = {
                    ...device.asset,
                    pathString: null,
                    fullPath: null
                  };
                }
              } catch (treepathError) {
                console.warn(`Could not improve asset path for ${assetId}:`, treepathError);
                // Setze pathString auf null, damit "-" angezeigt wird
                improvedAsset = {
                  ...device.asset,
                  pathString: null,
                  fullPath: null
                };
              }
            }
            
            return {
              ...device,
              serialNumber: serialNumber,
              asset: improvedAsset
            };
          } catch (error) {
            console.error(`Error fetching data for device ${deviceId}:`, error);
          }
          return device;
        })
      );
      
      setDevices(devicesWithSerialNumbers);
      cacheDevices(devicesWithSerialNumbers);
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

  // Hilfsfunktion zum Finden des SerialNbr-Attributs (muss vor exportDevices definiert werden)
  const getSerialNumber = (device) => {
    // Priorität: 1. Lokale Seriennummer aus inventory-Tabelle über API
    if (device.serialNumber) {
      return device.serialNumber;
    }
    
    // Fallback: ThingsBoard-Attribute (falls keine lokale Seriennummer verfügbar ist)
    const attributes = device.serverAttributes || device.telemetry || {};
    return attributes.serialNbr || 
           attributes.serialNumber || 
           attributes.SerialNbr || 
           attributes.SerialNumber || 
           attributes.serial || 
           attributes.Serial || 
           '-';
  };

  const exportDevices = useCallback(() => {
    try {
      // Bereite Daten für Excel vor
      const excelData = cachedDevices.map(device => {
        const serialNumber = getSerialNumber(device);
        const assetPath = device.asset && typeof device.asset === 'object' ? (
          device.asset.fullPath?.labels && device.asset.fullPath.labels.length > 0 ? (
            device.asset.fullPath.labels.join(' / ')
          ) : device.asset.pathString && !device.asset.pathString.startsWith('Asset ') ? (
            device.asset.pathString
          ) : '-'
        ) : '-';
        
        const lastActivity = device.telemetry?.lastActivityTime ? 
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
            'Nie';

        return {
          'Name': device.name || '-',
          'Label': device.label || '-',
          'Typ': device.type || '-',
          'SerialNbr': serialNumber,
          'Gateway': device.telemetry?.gatewayId || '-',
          'Pfad': assetPath,
          'Batterie (V)': device.telemetry?.batteryVoltage || '-',
          'FCnt': device.telemetry?.fCnt || '-',
          'Ventil (%)': device.telemetry?.PercentValveOpen !== undefined ? Math.round(device.telemetry.PercentValveOpen) : '-',
          'Motor Position': device.telemetry?.motorPosition !== undefined ? Math.round(device.telemetry.motorPosition) : '-',
          'Motor Range': device.telemetry?.motorRange !== undefined ? Math.round(device.telemetry.motorRange) : '-',
          'RSSI (dBm)': device.telemetry?.rssi || '-',
          'SF': device.telemetry?.sf || '-',
          'SNR (dB)': device.telemetry?.snr ? `${device.telemetry.snr}dB` : '-',
          'Signal Quality': device.telemetry?.signalQuality || '-',
          'Status': device.active ? 'Aktiv' : 'Inaktiv',
          'Letzte Aktivität': lastActivity,
          'Device ID': typeof device.id === 'string' ? device.id : (device.id?.id || '-')
        };
      });

      // Erstelle Workbook und Worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Geräte');

      // Setze Spaltenbreiten
      const columnWidths = [
        { wch: 20 }, // Name
        { wch: 20 }, // Label
        { wch: 15 }, // Typ
        { wch: 15 }, // SerialNbr
        { wch: 20 }, // Gateway
        { wch: 40 }, // Pfad
        { wch: 12 }, // Batterie
        { wch: 10 }, // FCnt
        { wch: 12 }, // Ventil
        { wch: 15 }, // Motor Position
        { wch: 15 }, // Motor Range
        { wch: 12 }, // RSSI
        { wch: 8 },  // SF
        { wch: 12 }, // SNR
        { wch: 15 }, // Signal Quality
        { wch: 10 }, // Status
        { wch: 20 }, // Letzte Aktivität
        { wch: 40 }  // Device ID
      ];
      worksheet['!cols'] = columnWidths;

      // Exportiere als Excel-Datei
      const fileName = `devices_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('Error exporting devices:', error);
      alert('Fehler beim Exportieren der Geräte: ' + error.message);
    }
  }, [cachedDevices]);

  const scrollToTop = () => {
    // Scroll page to top
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
    
    // Also scroll table to top if it has scroll position
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

  // Use cached devices if available, otherwise use live data
  const displayDevices = cachedDevices.length > 0 ? cachedDevices : (devices || []);

  // Neue Funktion: Hole Seriennummer direkt aus der Inventory-API
  const fetchSerialNumberFromInventory = async (deviceId) => {
    try {
      const response = await fetch(`/api/inventory/${deviceId}`);
      if (response.ok) {
        const inventoryData = await response.json();
        return inventoryData.serialnbr || '-';
      }
    } catch (error) {
      console.error('Error fetching serial number from inventory:', error);
    }
    return '-';
  };

  // Filter devices based on search term
  const filteredDevices = useMemo(() => {
    if (!displayDevices) return [];
    if (!searchTerm && selectedType === 'all' && selectedStatus === 'all' && selectedGateway === 'all') return displayDevices;

    const searchLower = (searchTerm || '').toLowerCase();
    return displayDevices.filter(device => {
      if (!device) return false;
      const serialNumber = getSerialNumber(device).toLowerCase();
      const matchesSearch = !searchTerm || 
        (device.name || '').toLowerCase().includes(searchLower) ||
        (device.label || '').toLowerCase().includes(searchLower) ||
        (device.type || '').toLowerCase().includes(searchLower) ||
        (device.asset?.pathString || '').toLowerCase().includes(searchLower) ||
        serialNumber.includes(searchLower) ||
        (device.telemetry?.gatewayId || '').toLowerCase().includes(searchLower);

      const matchesType = selectedType === 'all' || device.type === selectedType;
      
      const matchesStatus = selectedStatus === 'all' || 
        (selectedStatus === 'active' && device.active) ||
        (selectedStatus === 'inactive' && !device.active);
      
      const matchesGateway = selectedGateway === 'all' || 
        (selectedGateway === 'withGateway' && device.telemetry?.gatewayId) ||
        (selectedGateway === 'withoutGateway' && !device.telemetry?.gatewayId) ||
        (selectedGateway !== 'all' && selectedGateway !== 'withGateway' && selectedGateway !== 'withoutGateway' && 
         device.telemetry?.gatewayId === selectedGateway);

      return matchesSearch && matchesType && matchesStatus && matchesGateway;
    });
  }, [displayDevices, searchTerm, selectedType, selectedStatus, selectedGateway]);

  const handleClose = () => {
    setShowModal(false);
    setSelectedDevice(null);
  };

  const handleRowClick = (device) => {
    setSelectedDevice(device);
    setShowModal(true);
  };

  const handleDeviceAction = async (device, action, event) => {
    // Event-Propagation stoppen, damit nicht die Tabellenzeile geklickt wird
    if (event) {
      event.stopPropagation();
    }

    if (!device?.id) {
      alert('Keine gültige Geräte-ID gefunden');
      return;
    }

    // Bestätigung vom Benutzer einholen
    const actionNames = {
      'reset': 'Reset',
      'recalibrate': 'Rekalibrierung'
    };
    
    const confirmed = window.confirm(
      `Möchten Sie wirklich eine ${actionNames[action]} für das Gerät "${device.name}" durchführen?`
    );
    
    if (!confirmed) return;

    try {
      // Extrahiere die korrekte Device-ID
      let deviceId;
      if (typeof device.id === 'string') {
        deviceId = device.id;
      } else if (device.id && typeof device.id === 'object' && device.id.id) {
        deviceId = device.id.id;
      } else if (device.id) {
        deviceId = device.id;
      } else {
        alert('Keine gültige Geräte-ID gefunden');
        return;
      }

      // Debug-Logging
      console.log('Frontend Debug - Device object:', device);
      console.log('Frontend Debug - Extracted deviceId:', deviceId);
      console.log('Frontend Debug - Action:', action);
      console.log('Frontend Debug - Session token:', session.token);

      const requestBody = {
        action: action,
        device: device,
        parameters: {
          deviceName: device.name,
          deviceType: device.type,
          timestamp: new Date().toISOString()
        }
      };
      
      console.log('Frontend Debug - Request body:', requestBody);

      const response = await fetch(`/api/config/devices/${deviceId}/actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        alert(`${actionNames[action]} erfolgreich für Gerät "${device.name}" ausgelöst!`);
        console.log('Action result:', result);
      } else {
        alert(`Fehler bei der ${actionNames[action]}: ${result.error || 'Unbekannter Fehler'}`);
      }

    } catch (error) {
      console.error(`Error executing ${action} action:`, error);
      alert(`Fehler bei der ${actionNames[action]}: ${error.message}`);
    }
  };

  const testMelitaAPI = async (device, event) => {
    // Event-Propagation stoppen
    if (event) {
      event.stopPropagation();
    }

    if (!device?.name) {
      alert('Keine gültige Geräte-ID gefunden');
      return;
    }

    // Bestätigung vom Benutzer einholen
    const confirmed = window.confirm(
      `Möchten Sie die Melita.io API für das Gerät "${device.name}" testen?\n\nDies wird eine Test-Downlink-Nachricht senden.`
    );
    
    if (!confirmed) return;

    try {
      // Extrahiere die korrekte Device-ID
      let deviceId;
      if (typeof device.id === 'string') {
        deviceId = device.id;
      } else if (device.id && typeof device.id === 'object' && device.id.id) {
        deviceId = device.id.id;
      } else if (device.id) {
        deviceId = device.id;
      } else {
        alert('Keine gültige Geräte-ID gefunden');
        return;
      }

      // Extrahiere die devEUI aus den Gerätedaten
      let devEUI = device.name;
      
      // Falls keine devEUI gefunden, verwende die Device-ID (falls es eine gültige EUI ist)
      if (!devEUI) {
        // Prüfe ob die Device-ID eine gültige 16-Zeichen Hex-EUI ist
        if (/^[0-9a-fA-F]{16}$/i.test(deviceId)) {
          devEUI = deviceId;
        } else {
          alert(`Keine gültige Device EUI gefunden für Gerät "${device.name}".\n\nErwartet: 16-Zeichen Hex-String (z.B. 70b3d52dd3027742)\nGefunden: ${deviceId}\n\nBitte prüfen Sie die Gerätekonfiguration.`);
          return;
        }
      }

      // Test-Payload für Melita.io API (korrekte Struktur)
      const testPayload = {
        deviceEui: devEUI,
        payload: "MA==", // "0" in Base64
        priority: "LOW",
        confirmed: false,
        fPort: 2
      };

      console.log('Melita API Test - Request:', testPayload);
      console.log('Device EUI format check:', /^[0-9a-fA-F]{16}$/i.test(devEUI) ? 'Valid 16-char hex' : 'Invalid format');
      console.log('Original device ID:', deviceId);
      console.log('Extracted devEUI:', devEUI);

      const response = await fetch('/api/melita/downlink', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify(testPayload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        let errorMessage = `HTTP error! status: ${response.status}`;
        
        if (errorData.error) {
          errorMessage += ` - ${errorData.error}`;
        }
        
        if (errorData.details) {
          errorMessage += `\n\nDetails: ${errorData.details}`;
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      
      if (result.success) {
        alert(`Melita.io API Test erfolgreich!\n\nGerät: ${device.name}\nDevice EUI: ${devEUI}\nPayload: ${testPayload.payload}\nAntwort: ${result.message}`);
        console.log('Melita API Test result:', result);
      } else {
        alert(`Melita.io API Test fehlgeschlagen: ${result.error || 'Unbekannter Fehler'}`);
      }

    } catch (error) {
      console.error('Error testing Melita API:', error);
      alert(`Fehler beim Melita.io API Test: ${error.message}`);
    }
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
    <div className="container-fluid px-4 mt-4">
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
          <InputGroup.Text>
            <FontAwesomeIcon icon={faSearch} />
          </InputGroup.Text>
          <Form.Control
            placeholder="Suche nach Gerät, Label, Typ, SerialNbr, Gateway oder Pfad..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </InputGroup>
      </div>

      {/* Filter Row */}
      <div className="row mb-4 g-3">
        <div className="col-md-2">
          <Form.Select 
            value={selectedType} 
            onChange={(e) => setSelectedType(e.target.value)}
            className="form-select-sm"
          >
            <option value="all">Alle Typen</option>
            {Array.from(new Set(displayDevices.map(d => d.type).filter(Boolean))).sort().map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </Form.Select>
        </div>
        <div className="col-md-2">
          <Form.Select 
            value={selectedStatus} 
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="form-select-sm"
          >
            <option value="all">Alle Status</option>
            <option value="active">Aktiv</option>
            <option value="inactive">Inaktiv</option>
          </Form.Select>
        </div>
        <div className="col-md-2">
          <Form.Select 
            value={selectedGateway} 
            onChange={(e) => setSelectedGateway(e.target.value)}
            className="form-select-sm"
          >
            <option value="all">Alle Gateways</option>
            <option value="withGateway">Mit Gateway</option>
            <option value="withoutGateway">Ohne Gateway</option>
            {Array.from(new Set(displayDevices
              .map(d => d.telemetry?.gatewayId)
              .filter(Boolean)))
              .sort()
              .map(gatewayId => (
                <option key={gatewayId} value={gatewayId}>
                  Gateway: {gatewayId}
                </option>
              ))}
          </Form.Select>
        </div>
        <div className="col-md-3">
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => {
              setSearchTerm('');
              setSelectedType('all');
              setSelectedStatus('all');
              setSelectedGateway('all');
            }}
            className="w-100"
          >
            Filter zurücksetzen
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" size="lg" className="me-3" />
          <div className="mt-3">
            <h5 className="text-white">Lade Geräte...</h5>
            <p className="text-muted">Bitte warten Sie, während die Gerätedaten abgerufen werden.</p>
          </div>
        </div>
      )}

      {/* Table - nur anzeigen wenn nicht geladen wird */}
      {!loading && (
        <div ref={tableContainerRef} className="table-responsive" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <Table striped bordered hover className="text-start" style={{ marginBottom: 0 }}>
            <thead style={{ 
              position: 'sticky', 
              top: 0, 
              zIndex: 1, 
              backgroundColor: 'var(--bs-table-bg)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              <tr>
                <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Name</th>
                <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Label</th>
                <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Typ</th>
                <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>SerialNbr</th>
                <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Gateway</th>
                <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Pfad</th>
                <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Batterie</th>
                <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>FCnt</th>
                <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Ventil</th>
                <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Motor Position</th>
                <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Motor Range</th>
                <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>RSSI</th>
                <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>SF</th>
                <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>SNR</th>
                <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Signal Quality</th>
                <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Status</th>
                <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Letzte Aktivität</th>
                <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.map((device) => (
                <tr 
                  key={device.id}
                >
                  <td>{device.name}</td>
                  <td>{device.label}</td>
                  <td>{device.type}</td>
                  <td>{getSerialNumber(device)}</td>
                  <td>
                    {device.telemetry?.gatewayId || '-'}
                  </td>
                  <td>
                    {device.asset && typeof device.asset === 'object' ? (
                      device.asset.fullPath?.labels && device.asset.fullPath.labels.length > 0 ? (
                        <div>
                          {device.asset.fullPath.labels.join(' / ')}
                        </div>
                      ) : device.asset.pathString && !device.asset.pathString.startsWith('Asset ') ? (
                        <div>
                          {device.asset.pathString}
                        </div>
                      ) : '-'
                    ) : '-'}
                  </td>
                  <td>
                    {device.telemetry?.batteryVoltage ? (
                      <div>{device.telemetry.batteryVoltage}V</div>
                    ) : '-'}
                  </td>
                  <td>
                    {device.telemetry?.fCnt || '-'}
                  </td>
                  <td>
                    {device.telemetry?.PercentValveOpen !== undefined ? (
                      <div>
                        {Math.round(device.telemetry.PercentValveOpen)}%
                      </div>
                    ) : '-'}
                  </td>
                  <td>
                    {device.telemetry?.motorPosition !== undefined ? (
                      <div>{Math.round(device.telemetry.motorPosition)}</div>
                    ) : '-'}
                  </td>
                  <td>
                    {device.telemetry?.motorRange !== undefined ? (
                      <div>{Math.round(device.telemetry.motorRange)}</div>
                    ) : '-'}
                  </td>
                  <td>
                    {device.telemetry?.rssi ? (
                      <div>{device.telemetry.rssi}dBm</div>
                    ) : '-'}
                  </td>
                  <td>
                    {device.telemetry?.sf || '-'}
                  </td>
                  <td>
                    {device.telemetry?.snr ? `${device.telemetry.snr}dB` : '-'}
                  </td>
                  <td>
                    {device.telemetry?.signalQuality || '-'}
                  </td>
                  <td>
                    <span className={`badge ${device.active ? 'bg-success' : 'bg-danger'}`}>
                      {device.active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td>
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
                  <td>
                    <div className="dropdown position-relative">
                      <Button
                        variant="outline-primary"
                        size="sm"
                        className="dropdown-toggle"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdown(openDropdown === device.id ? null : device.id);
                        }}
                      >
                        Aktionen
                      </Button>
                      {openDropdown === device.id && (
                        <ul className="dropdown-menu show position-absolute" style={{ zIndex: 1000 }}>
                          <li>
                            <button
                              className="dropdown-item"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeviceAction(device, 'recalibrate', e);
                                setOpenDropdown(null);
                              }}
                            >
                              <FontAwesomeIcon icon={faSync} className="me-2" />
                              Rekalibrierung
                            </button>
                          </li>
                          <li>
                            <button
                              className="dropdown-item"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeviceAction(device, 'reset', e);
                                setOpenDropdown(null);
                              }}
                            >
                              <FontAwesomeIcon icon={faTrash} className="me-2" />
                              Reset
                            </button>
                          </li>
                          <li><hr className="dropdown-divider" /></li>
                          <li>
                            <button
                              className="dropdown-item"
                              onClick={(e) => {
                                e.stopPropagation();
                                testMelitaAPI(device, e);
                                setOpenDropdown(null);
                              }}
                            >
                              <FontAwesomeIcon icon={faUpload} className="me-2" />
                              Melita API Test
                            </button>
                          </li>
                          <li>
                            <button
                              className="dropdown-item"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRowClick(device);
                                setOpenDropdown(null);
                              }}
                            >
                              <FontAwesomeIcon icon={faEdit} className="me-2" />
                              Details anzeigen
                            </button>
                          </li>
                        </ul>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {/* Scroll to Top Button */}
      <Button
        variant="primary"
        size="lg"
        className="position-fixed"
        style={{
          bottom: '30px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          borderRadius: '50%',
          width: '60px',
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          opacity: showScrollToTop ? 1 : 0.3
        }}
        onClick={scrollToTop}
        title="Nach oben scrollen"
      >
        <FontAwesomeIcon icon={faArrowUp} />
      </Button>

      <Modal
        show={showModal}
        onHide={handleClose}
        size="lg"
        centered
        backdrop="static"
      >
        <Modal.Header closeButton>
          <Modal.Title>{selectedDevice?.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Tab.Container defaultActiveKey="settings">
            <Nav variant="tabs" className="mb-3">
              <Nav.Item>
                <Nav.Link eventKey="settings">
                  Einstellungen
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="history">
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
                    <strong>Pfad:</strong> {
                      selectedDevice?.asset && typeof selectedDevice.asset === 'object' ? (
                        selectedDevice.asset.fullPath?.labels && selectedDevice.asset.fullPath.labels.length > 0 ? (
                          selectedDevice.asset.fullPath.labels.join(' / ')
                        ) : selectedDevice.asset.pathString && !selectedDevice.asset.pathString.startsWith('Asset ') ? (
                          selectedDevice.asset.pathString
                        ) : 'Nicht zugewiesen'
                      ) : 'Nicht zugewiesen'
                    }
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