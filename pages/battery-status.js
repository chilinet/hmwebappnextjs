import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Card, Badge, Spinner, Alert } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faBolt, 
  faArrowLeft,
  faExclamationTriangle,
  faCheckCircle,
  faBatteryQuarter,
  faBatteryHalf,
  faBatteryFull,
  faBatteryEmpty,
  faSearch,
  faTimes
} from '@fortawesome/free-solid-svg-icons';
import Head from 'next/head';

export default function BatteryStatus() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [batteryData, setBatteryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [treeData, setTreeData] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Helper function to get battery icon based on status
  const getBatteryIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'gut':
        return faBatteryFull;
      case 'kritisch':
        return faBatteryHalf;
      case 'leer':
        return faBatteryEmpty;
      default:
        return faBatteryQuarter;
    }
  };

  // Helper function to get battery color based on status
  const getBatteryColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'gut':
        return 'success';
      case 'kritisch':
        return 'warning';
      case 'leer':
        return 'danger';
      default:
        return 'secondary';
    }
  };

  // Helper function to get battery voltage color
  const getVoltageColor = (voltage) => {
    if (voltage >= 3.0) return 'success';
    if (voltage >= 2.5) return 'warning';
    return 'danger';
  };

  // Helper function to format last update time
  const formatLastUpdate = (lastUpdate) => {
    const date = new Date(lastUpdate);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;
    } else if (diffHours > 0) {
      return `vor ${diffHours} Stunde${diffHours > 1 ? 'n' : ''}`;
    } else {
      return 'gerade eben';
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

  // Load battery status data and tree data
  useEffect(() => {
    async function fetchData() {
      if (session?.user?.customerid) {
        try {
          setLoading(true);
          
          // Fetch battery status data
          const reportingUrl = process.env.REPORTING_URL || 'https://webapptest.heatmanager.cloud';
          const batteryResponse = await fetch(`${reportingUrl}/api/reporting/battery-status?key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD&customer_id=${session.user.customerid}`);
          
          if (!batteryResponse.ok) {
            throw new Error(`HTTP error! status: ${batteryResponse.status}`);
          }
          
          const batteryData = await batteryResponse.json();
          console.log('Battery status data received:', batteryData);
          setBatteryData(batteryData);

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
  const getBatteryStats = () => {
    if (!batteryData?.data || batteryData.data.length === 0) {
      return { total: 0, good: 0, critical: 0, empty: 0 };
    }

    const devices = batteryData.data;
    const good = devices.filter(d => d.battery_status === 'gut').length;
    const critical = devices.filter(d => d.battery_status === 'kritisch').length;
    const empty = devices.filter(d => d.battery_status === 'leer').length;

    return {
      total: devices.length,
      good,
      critical,
      empty
    };
  };

  // Filter devices based on status and search term
  const getFilteredDevices = () => {
    if (!batteryData?.data) return [];
    
    let filteredDevices = batteryData.data;
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filteredDevices = filteredDevices.filter(device => 
        device.battery_status?.toLowerCase() === statusFilter.toLowerCase()
      );
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
        
        // Search in battery status
        if (device.battery_status?.toLowerCase().includes(searchLower)) return true;
        
        // Search in asset path
        const assetPath = getAssetPathString(device.asset_id);
        if (assetPath.toLowerCase().includes(searchLower)) return true;
        
        // Search in device label (if available in relatedDevices)
        if (device.device_label?.toLowerCase().includes(searchLower)) return true;
        
        return false;
      });
    }
    
    return filteredDevices;
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
          <p className="mt-3 text-muted">Batteriestatus wird geladen...</p>
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

  const stats = getBatteryStats();

  return (
    <>
      <Head>
        <title>HeatManager - Batteriestatus</title>
        <meta name="description" content="HeatManager - Batteriestatus aller Geräte" />
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
                  <h2 className="mb-0 fw-bold">Batteriestatus</h2>
                  <p className="text-muted mb-0">Übersicht aller Geräte und deren Batteriestatus</p>
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
                      <FontAwesomeIcon icon={faBolt} />
                    </div>
                    <div>
                      <h3 className="mb-0 text-primary fw-bold">{stats.total}</h3>
                      <p className="mb-0 text-muted small">GESAMT GERÄTE</p>
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
                      <FontAwesomeIcon icon={faCheckCircle} />
                    </div>
                    <div>
                      <h3 className="mb-0 text-success fw-bold">{stats.good}</h3>
                      <p className="mb-0 text-muted small">BATTERIE GUT</p>
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
                      <FontAwesomeIcon icon={faExclamationTriangle} />
                    </div>
                    <div>
                      <h3 className="mb-0 text-warning fw-bold">{stats.critical}</h3>
                      <p className="mb-0 text-muted small">BATTERIE KRITISCH</p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>

            <div className="col-xl-3 col-lg-6 col-md-6">
              <Card className="status-card shadow-sm">
                <Card.Body className="p-4">
                  <div className="d-flex align-items-center">
                    <div className="status-icon bg-danger me-3">
                      <FontAwesomeIcon icon={faExclamationTriangle} />
                    </div>
                    <div>
                      <h3 className="mb-0 text-danger fw-bold">{stats.empty}</h3>
                      <p className="mb-0 text-muted small">BATTERIE LEER</p>
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
                        Alle ({getBatteryStats().total})
                      </button>
                      <button
                        className={`btn btn-sm ${statusFilter === 'gut' ? 'btn-success' : 'btn-outline-success'}`}
                        onClick={() => setStatusFilter('gut')}
                      >
                        Gut ({getBatteryStats().good})
                      </button>
                      <button
                        className={`btn btn-sm ${statusFilter === 'kritisch' ? 'btn-warning' : 'btn-outline-warning'}`}
                        onClick={() => setStatusFilter('kritisch')}
                      >
                        Kritisch ({getBatteryStats().critical})
                      </button>
                      <button
                        className={`btn btn-sm ${statusFilter === 'leer' ? 'btn-danger' : 'btn-outline-danger'}`}
                        onClick={() => setStatusFilter('leer')}
                      >
                        Leer ({getBatteryStats().empty})
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
                    Geräte-Übersicht 
                    {(statusFilter !== 'all' || searchTerm) && (
                      <span className="text-muted ms-2">
                        ({getFilteredDevices().length} von {getBatteryStats().total} Geräten)
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
                            <th>Batteriespannung</th>
                            <th>Status</th>
                            <th>Letzte Aktualisierung</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getFilteredDevices().map((device, index) => (
                            <tr key={`${device.device_id}-${index}`}>
                              <td>
                                <div>
                                  <strong>{device.asset_name}</strong>
                                  <br />
                                  <small className="text-muted">{device.asset_type}</small>
                                  <br />
                                  <small className="text-info">{getAssetPathString(device.asset_id)}</small>
                                </div>
                              </td>
                              <td>
                                <div>
                                  <code className="text-primary">{device.device_name}</code>
                                  <br />
                                  <small className="text-muted">{device.device_type}</small>
                                  <br />
                                  <small className="text-info">{device.device_label || 'Kein Label'}</small>
                                </div>
                              </td>
                              <td>
                                <Badge bg="secondary">{device.device_type}</Badge>
                              </td>
                              <td>
                                <div className="d-flex align-items-center">
                                  <FontAwesomeIcon 
                                    icon={getBatteryIcon(device.battery_status)} 
                                    className={`text-${getVoltageColor(device.battery_voltage)} me-2`}
                                  />
                                  <span className={`fw-bold text-${getVoltageColor(device.battery_voltage)}`}>
                                    {device.battery_voltage}V
                                  </span>
                                </div>
                              </td>
                              <td>
                                <Badge bg={getBatteryColor(device.battery_status)}>
                                  {device.battery_status}
                                </Badge>
                              </td>
                              <td>
                                <div>
                                  <small className="text-muted">
                                    {new Date(device.last_update_utc).toLocaleString('de-DE')}
                                  </small>
                                  <br />
                                  <small className="text-muted">
                                    {formatLastUpdate(device.last_update_utc)}
                                  </small>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-5">
                      <FontAwesomeIcon icon={faBolt} size="3x" className="text-muted mb-3" />
                      <p className="text-muted">
                        {!batteryData?.data || batteryData.data.length === 0
                          ? 'Keine Batteriestatus-Daten verfügbar'
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

BatteryStatus.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
