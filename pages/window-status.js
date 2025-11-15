import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Card, Badge, Spinner, Alert } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faHome, 
  faArrowLeft,
  faDoorOpen,
  faDoorClosed,
  faSearch,
  faTimes,
  faClock
} from '@fortawesome/free-solid-svg-icons';
import Head from 'next/head';

export default function WindowStatus() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [windowData, setWindowData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [treeData, setTreeData] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

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
                              <tr key={`${device.device_id}-${index}`}>
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

