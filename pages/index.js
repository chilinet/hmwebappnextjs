import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Card, Badge, ProgressBar } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faFire, 
  faTachometerAlt, 
  faThermometerHalf, 
  faCog,
  faExclamationTriangle,
  faCheckCircle,
  faArrowUp,
  faArrowDown,
  faBolt,
  faHome,
  faShieldAlt,
  faChartLine,
  faUsers,
  faCloud,
  faCloudRain,
  faSun,
  faHeartbeat,
  faWarning,
  faInfoCircle
} from '@fortawesome/free-solid-svg-icons';
import Head from 'next/head';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  useEffect(() => {
    async function fetchDashboardData() {
      if (session?.user?.customerid) {
        try {
          const response = await fetch(`/api/dashboard/stats?customerId=${session.user.customerid}`);
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch dashboard data');
          }
          
          const data = await response.json();
          console.log('Dashboard data received:', data);
          setDashboardData(data);
        } catch (err) {
          console.error('Error fetching dashboard data:', err);
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
      fetchDashboardData();
    } else {
      setLoading(false);
    }
  }, [session]);

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
          <p className="mt-3 text-muted">Dashboard-Daten werden geladen...</p>
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

  return (
    <>
      <Head>
        <title>HeatManager - Dashboard</title>
        <meta name="description" content="HeatManager - Intelligente Heizungssteuerung und -überwachung" />
      </Head>
      
      <div className="light-theme" style={{ backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        <div className="container-fluid py-4">
          {/* Top Row - Status Cards */}
          <div className="row g-3 mb-4">
            {/* Active Devices Card */}
            <div className="col-xl-3 col-lg-6 col-md-6">
              <Card className="status-card shadow-sm">
                <Card.Body className="p-4">
                  <div className="d-flex align-items-center mb-3">
                    <div className="status-icon bg-success me-3">
                      <FontAwesomeIcon icon={faCheckCircle} />
                    </div>
                    <div>
                      <h3 className="mb-0 text-success fw-bold">{dashboardData?.activeDevices || '--'}</h3>
                      <p className="mb-0 text-muted small">AKTIVE GERÄTE</p>
                      <p className="mb-0 text-muted small">Gesamt {dashboardData?.devices || '--'}</p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>

            {/* Heat Demand Card */}
            <div className="col-xl-3 col-lg-6 col-md-6">
              <Card className="status-card shadow-sm">
                <Card.Body className="p-4">
                  <div className="d-flex align-items-center mb-3">
                    <div className="status-icon bg-secondary me-3">
                      <FontAwesomeIcon icon={faThermometerHalf} />
                    </div>
                    <div>
                      <h3 className="mb-0 text-secondary fw-bold">{dashboardData?.heatDemand || '--%'}</h3>
                      <p className="mb-0 text-muted small">WÄRMEANFORDERUNG</p>
                      <p className="mb-0 text-muted small">Ø Ventilöffnung --%</p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>

            {/* Inactive/Faulty Devices Card */}
            <div className="col-xl-3 col-lg-6 col-md-6">
              <Card className="status-card shadow-sm">
                <Card.Body className="p-4">
                  <div className="d-flex align-items-center mb-3">
                    <div className="status-icon bg-danger me-3">
                      <FontAwesomeIcon icon={faHeartbeat} />
                    </div>
                    <div>
                      <h3 className="mb-0 text-danger fw-bold">{dashboardData?.inactiveDevices || '--'}</h3>
                      <p className="mb-0 text-muted small">INAKTIVE / FEHLERHAFT</p>
                      <p className="mb-0 text-muted small">Letzte 24 h: -- neu</p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>

            {/* Open Alarms Card */}
            <div className="col-xl-3 col-lg-6 col-md-6">
              <Card className="status-card shadow-sm">
                <Card.Body className="p-4">
                  <div className="d-flex align-items-center mb-3">
                    <div className="status-icon bg-danger me-3">
                      <FontAwesomeIcon icon={faExclamationTriangle} />
                    </div>
                    <div>
                      <h3 className="mb-0 text-danger fw-bold">--</h3>
                      <p className="mb-0 text-muted small">ALARME OFFEN</p>
                      <p className="mb-0 text-muted small">-- kritisch, -- Info</p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>
          </div>

          {/* Middle Row - Charts and Weather */}
          <div className="row g-4 mb-4">
            {/* Heating Control & Heat Demand Chart */}
            <div className="col-xl-8 col-lg-7">
              <Card className="chart-card shadow-sm">
                <Card.Body className="p-4">
                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <h5 className="mb-0 fw-bold">HEIZUNGSSTEUERUNG & WÄRMEANFORDERUNG</h5>
                    <button className="btn btn-outline-secondary btn-sm">Letzte 24 h</button>
                  </div>
                  <div className="chart-placeholder">
                    <div className="text-center py-5">
                      <FontAwesomeIcon icon={faChartLine} size="3x" className="text-muted mb-3" />
                      <p className="text-muted">Chart-Daten werden geladen...</p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>

            {/* Weather & External Influence */}
            <div className="col-xl-4 col-lg-5">
              <Card className="weather-card shadow-sm">
                <Card.Body className="p-4">
                  <h5 className="mb-4 fw-bold">WETTER & AUSSENEINFLUSS</h5>
                  
                  <div className="weather-current mb-4">
                    <div className="d-flex align-items-center mb-3">
                      <FontAwesomeIcon icon={faCloud} size="2x" className="text-muted me-3" />
                      <div>
                        <h3 className="mb-0 fw-bold">--°C</h3>
                        <p className="mb-0 text-muted small">Gefühlte --°C · -- m/s Wind</p>
                      </div>
                    </div>
                    <p className="mb-2"><strong>Heizbedarf:</strong> --</p>
                    <p className="mb-0"><strong>Trend:</strong> --</p>
                  </div>

                  <div className="weather-forecast">
                    <div className="row g-2">
                      <div className="col-3">
                        <div className="text-center">
                          <small className="text-muted">+3h</small>
                          <div className="mt-1">
                            <FontAwesomeIcon icon={faCloud} className="text-muted" />
                          </div>
                          <small>--°C</small>
                        </div>
                      </div>
                      <div className="col-3">
                        <div className="text-center">
                          <small className="text-muted">+6h</small>
                          <div className="mt-1">
                            <FontAwesomeIcon icon={faCloudRain} className="text-muted" />
                          </div>
                          <small>--°C</small>
                        </div>
                      </div>
                      <div className="col-3">
                        <div className="text-center">
                          <small className="text-muted">+9h</small>
                          <div className="mt-1">
                            <FontAwesomeIcon icon={faCloudRain} className="text-muted" />
                          </div>
                          <small>--°C</small>
                        </div>
                      </div>
                      <div className="col-3">
                        <div className="text-center">
                          <small className="text-muted">+12h</small>
                          <div className="mt-1">
                            <FontAwesomeIcon icon={faCloudRain} className="text-muted" />
                          </div>
                          <small>--°C</small>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>
          </div>

          {/* Bottom Row - Consumption and Alerts */}
          <div className="row g-4">
            {/* Consumption & Efficiency Chart */}
            <div className="col-xl-8 col-lg-7">
              <Card className="chart-card shadow-sm">
                <Card.Body className="p-4">
                  <h5 className="mb-4 fw-bold">VERBRAUCH & EFFIZIENZ</h5>
                  <div className="chart-placeholder">
                    <div className="text-center py-5">
                      <FontAwesomeIcon icon={faChartLine} size="3x" className="text-muted mb-3" />
                      <p className="text-muted">Verbrauchsdaten werden geladen...</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="text-muted">Energieeinsparung ggü. Referenz:</span>
                      <Badge bg="success">--%</Badge>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>

            {/* Alarms & Messages */}
            <div className="col-xl-4 col-lg-5">
              <Card className="alerts-card shadow-sm">
                <Card.Body className="p-4">
                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <h5 className="mb-0 fw-bold">ALARME & MELDUNGEN</h5>
                    <button className="btn btn-outline-secondary btn-sm">Alarm-Center öffnen</button>
                  </div>
                  
                  <div className="alerts-list">
                    <div className="alert-item mb-3">
                      <div className="d-flex align-items-start">
                        <FontAwesomeIcon icon={faExclamationTriangle} className="text-danger me-2 mt-1" />
                        <div className="flex-grow-1">
                          <p className="mb-1 fw-semibold">Thermostat #040 keine Verbindung seit 45 min</p>
                          <small className="text-muted">Kritisch · 12:05 Uhr</small>
                        </div>
                        <button className="btn btn-outline-danger btn-sm">Details</button>
                      </div>
                    </div>
                    
                    <div className="alert-item mb-3">
                      <div className="d-flex align-items-start">
                        <FontAwesomeIcon icon={faWarning} className="text-warning me-2 mt-1" />
                        <div className="flex-grow-1">
                          <p className="mb-1 fw-semibold">Batterie niedrig in Raum 207 (18%)</p>
                          <small className="text-muted">Warnung · 11:50 Uhr</small>
                        </div>
                        <button className="btn btn-outline-warning btn-sm">Details</button>
                      </div>
                    </div>
                    
                    <div className="alert-item">
                      <div className="d-flex align-items-start">
                        <FontAwesomeIcon icon={faInfoCircle} className="text-info me-2 mt-1" />
                        <div className="flex-grow-1">
                          <p className="mb-1 fw-semibold">Fenster offen erkannt in Raum 315</p>
                          <small className="text-muted">Info · 11:21 Uhr</small>
                        </div>
                        <button className="btn btn-outline-info btn-sm">Details</button>
                      </div>
                    </div>
                  </div>
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
        
        .chart-card, .weather-card, .alerts-card {
          border-radius: 12px;
          border: none;
          background: white;
          transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
        }
        
        .chart-card:hover, .weather-card:hover, .alerts-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.1) !important;
        }
        
        .chart-placeholder {
          background: #f8f9fa;
          border-radius: 8px;
          border: 2px dashed #dee2e6;
        }
        
        .weather-forecast {
          border-top: 1px solid #dee2e6;
          padding-top: 1rem;
        }
        
        .alert-item {
          border-bottom: 1px solid #f0f0f0;
          padding-bottom: 1rem;
        }
        
        .alert-item:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
        
        .btn-outline-secondary {
          border-color: #6c757d;
          color: #6c757d;
        }
        
        .btn-outline-secondary:hover {
          background-color: #6c757d;
          border-color: #6c757d;
          color: white;
        }
      `}</style>
    </>
  );
}

Home.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
