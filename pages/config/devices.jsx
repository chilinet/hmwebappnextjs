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
  const [hasValidCache, setHasValidCache] = useState(false);
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
  const [treeData, setTreeData] = useState(null);
  const [showDownlinkModal, setShowDownlinkModal] = useState(false);
  const [downlinkTargetDevice, setDownlinkTargetDevice] = useState(null);
  const [downlinkMode, setDownlinkMode] = useState('command');
  const [downlinkCommand, setDownlinkCommand] = useState('reset');
  const [downlinkHexPayload, setDownlinkHexPayload] = useState('03F40B');
  const [downlinkConfirmed, setDownlinkConfirmed] = useState(false);
  const [downlinkSending, setDownlinkSending] = useState(false);
  const tableContainerRef = useRef(null);

  // Helper: find asset path in tree (same pattern as window-status)
  const findAssetPath = useCallback((assetId, treeNodes, currentPath = []) => {
    const nodes = Array.isArray(treeNodes) ? treeNodes : (treeNodes ? [treeNodes] : []);
    for (const node of nodes) {
      const newPath = [...currentPath, node.label || node.name || node.text || '?'];
      if (node.id === assetId) return newPath;
      if (node.children?.length > 0) {
        const found = findAssetPath(assetId, node.children, newPath);
        if (found) return found;
      }
    }
    return null;
  }, []);

  const getAssetPathString = useCallback((assetId) => {
    if (!treeData || !assetId) return null;
    const path = findAssetPath(assetId, treeData);
    return path && path.length > 0 ? path.join(' → ') : null;
  }, [treeData, findAssetPath]);

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

  // Load cached data on component mount
  useEffect(() => {
    setHasValidCache(loadCachedDevices());
  }, [loadCachedDevices]);

  // Load tree data for path display (same pattern as window-status)
  useEffect(() => {
    if (session?.user?.customerid) {
      fetch(`/api/config/customers/${session.user.customerid}/tree`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setTreeData(data))
        .catch((err) => console.warn('Error loading tree for device paths:', err));
    }
  }, [session?.user?.customerid]);

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

  // Fetch devices when tbToken is available
  useEffect(() => {
    if (tbToken && session?.token && !hasValidCache) {
      fetchDevices();
    }
  }, [tbToken, session?.token, hasValidCache, fetchDevices]);

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
      setHasValidCache(false);
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
        const assetPath = (device.asset?.id && getAssetPathString(device.asset.id))
          || (device.asset?.fullPath?.labels?.length > 0 ? device.asset.fullPath.labels.join(' → ') : null)
          || (device.asset?.pathString && !device.asset.pathString.startsWith('Asset ') ? device.asset.pathString : null)
          || '-';
        
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
  }, [cachedDevices, getAssetPathString]);

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

  // Filter devices based on search term
  const filteredDevices = useMemo(() => {
    if (!displayDevices) return [];
    if (!searchTerm && selectedType === 'all' && selectedStatus === 'all' && selectedGateway === 'all') return displayDevices;

    const searchLower = (searchTerm || '').toLowerCase();
    return displayDevices.filter(device => {
      if (!device) return false;
      const serialNumber = getSerialNumber(device).toLowerCase();
      const pathStr = (device.asset?.id && getAssetPathString(device.asset.id)) || device.asset?.pathString || '';
      const matchesSearch = !searchTerm || 
        (device.name || '').toLowerCase().includes(searchLower) ||
        (device.label || '').toLowerCase().includes(searchLower) ||
        (device.type || '').toLowerCase().includes(searchLower) ||
        pathStr.toLowerCase().includes(searchLower) ||
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
  }, [displayDevices, searchTerm, selectedType, selectedStatus, selectedGateway, getAssetPathString]);

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

      const requestBody = {
        action,
        parameters: {
          deviceName: device.name,
          deviceType: device.type,
          timestamp: new Date().toISOString()
        }
      };

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
        const integrationLabel = result.integration ? ` (${result.integration})` : '';
        alert(`${actionNames[action]} erfolgreich für Gerät "${device.name}" ausgelöst${integrationLabel}.`);
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

  const sendDownlink = async (device, event) => {
    if (event) {
      event.stopPropagation();
    }
    setDownlinkTargetDevice(device || null);
    setDownlinkMode('command');
    setDownlinkCommand('reset');
    setDownlinkHexPayload('03F40B');
    setDownlinkConfirmed(false);
    setShowDownlinkModal(true);
  };

  const closeDownlinkModal = () => {
    if (downlinkSending) return;
    setShowDownlinkModal(false);
    setDownlinkTargetDevice(null);
  };

  const extractDeviceId = (device) => {
    if (!device?.id) return null;
    if (typeof device.id === 'string') return device.id;
    if (device.id && typeof device.id === 'object' && device.id.id) return device.id.id;
    return device.id || null;
  };

  const submitDownlink = async () => {
    const device = downlinkTargetDevice;
    const deviceId = extractDeviceId(device);
    if (!deviceId) {
      alert('Keine gültige Geräte-ID gefunden');
      return;
    }

    if (downlinkMode === 'raw') {
      const normalizedPayload = downlinkHexPayload.trim().toUpperCase();
      if (!normalizedPayload) {
        alert('Payload darf nicht leer sein.');
        return;
      }
      if (!/^[0-9A-F]+$/.test(normalizedPayload)) {
        alert('Ungültiges HEX-Format. Erlaubt sind nur 0-9 und A-F.');
        return;
      }
    }

    try {
      setDownlinkSending(true);
      if (downlinkMode === 'command') {
        const response = await fetch(`/api/config/devices/${deviceId}/actions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.token}`
          },
          body: JSON.stringify({
            action: downlinkCommand,
            parameters: {
              source: 'send-downlink-modal',
              deviceName: device?.name || '',
              timestamp: new Date().toISOString(),
            },
          }),
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result?.details || result?.error || `HTTP ${response.status}`);
        }
        alert(`Kommando erfolgreich gesendet.\n\nGerät: ${device?.name}\nAktion: ${downlinkCommand}`);
      } else {
        const normalizedPayload = downlinkHexPayload.trim().toUpperCase();
        const response = await fetch('/api/lns/downlink', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.token}`
          },
          body: JSON.stringify({
            deviceId,
            frm_payload: normalizedPayload,
            confirmed: downlinkConfirmed,
            priority: 'NORMAL'
          })
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result?.details || result?.error || `HTTP ${response.status}`);
        }
        alert(`Downlink erfolgreich gesendet.\n\nGerät: ${device?.name}\nHEX: ${normalizedPayload}`);
      }
      closeDownlinkModal();
    } catch (error) {
      console.error('Error sending downlink:', error);
      alert(`Fehler beim Senden des Downlinks: ${error.message}`);
    } finally {
      setDownlinkSending(false);
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
        <h2 className="text-dark">Geräte</h2>
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
                    {(() => {
                      const pathFromTree = device.asset?.id && getAssetPathString(device.asset.id);
                      if (pathFromTree) return <div><small className="text-info">{pathFromTree}</small></div>;
                      if (device.asset && typeof device.asset === 'object') {
                        if (device.asset.fullPath?.labels?.length > 0) return <div>{device.asset.fullPath.labels.join(' / ')}</div>;
                        if (device.asset.pathString && !device.asset.pathString.startsWith('Asset ')) return <div>{device.asset.pathString}</div>;
                      }
                      return '-';
                    })()}
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
                          <li><hr className="dropdown-divider" /></li>
                          <li>
                            <button
                              className="dropdown-item"
                              onClick={(e) => {
                                e.stopPropagation();
                                sendDownlink(device, e);
                                setOpenDropdown(null);
                              }}
                            >
                              <FontAwesomeIcon icon={faUpload} className="me-2" />
                              Send Downlink
                            </button>
                          </li>
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
        show={showDownlinkModal}
        onHide={closeDownlinkModal}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Send Downlink</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-3">
            <strong>Gerät:</strong> {downlinkTargetDevice?.name || '-'}
          </div>
          <Form.Group className="mb-3">
            <Form.Label>Modus</Form.Label>
            <Form.Select
              value={downlinkMode}
              onChange={(e) => setDownlinkMode(e.target.value)}
              disabled={downlinkSending}
            >
              <option value="command">Command (sensorabhängig)</option>
              <option value="raw">Raw HEX</option>
            </Form.Select>
          </Form.Group>

          {downlinkMode === 'command' ? (
            <Form.Group className="mb-3">
              <Form.Label>Command</Form.Label>
              <Form.Select
                value={downlinkCommand}
                onChange={(e) => setDownlinkCommand(e.target.value)}
                disabled={downlinkSending}
              >
                <option value="reset">Reset</option>
                <option value="recalibrate">Rekalibrierung</option>
              </Form.Select>
              <Form.Text className="text-muted">
                Das Backend löst das passende Payload je Sensor/LNS auf.
              </Form.Text>
            </Form.Group>
          ) : (
            <>
              <Form.Group className="mb-3">
                <Form.Label>HEX Payload</Form.Label>
                <Form.Control
                  type="text"
                  value={downlinkHexPayload}
                  onChange={(e) => setDownlinkHexPayload(e.target.value)}
                  disabled={downlinkSending}
                  placeholder="z.B. 03F40B"
                />
              </Form.Group>
              <Form.Check
                type="switch"
                id="downlink-confirmed-switch"
                label="Confirmed Downlink"
                checked={downlinkConfirmed}
                onChange={(e) => setDownlinkConfirmed(e.target.checked)}
                disabled={downlinkSending}
              />
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeDownlinkModal} disabled={downlinkSending}>
            Abbrechen
          </Button>
          <Button variant="primary" onClick={submitDownlink} disabled={downlinkSending}>
            {downlinkSending ? 'Sende...' : 'Senden'}
          </Button>
        </Modal.Footer>
      </Modal>

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
                    <strong>Pfad:</strong>{' '}
                    {selectedDevice?.asset?.id && getAssetPathString(selectedDevice.asset.id) ? (
                      <span className="text-info">{getAssetPathString(selectedDevice.asset.id)}</span>
                    ) : selectedDevice?.asset?.fullPath?.labels?.length > 0 ? (
                      selectedDevice.asset.fullPath.labels.join(' → ')
                    ) : selectedDevice?.asset?.pathString && !selectedDevice.asset.pathString.startsWith('Asset ') ? (
                      selectedDevice.asset.pathString
                    ) : (
                      'Nicht zugewiesen'
                    )}
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