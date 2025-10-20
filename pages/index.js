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
  faUsers
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
        <title>HeatManager - Übersicht</title>
        <meta name="description" content="HeatManager - Intelligente Heizungssteuerung und -überwachung" />
      </Head>
      
      <div className="light-theme">
        <div className="container-fluid py-4">
          {/* Spacer for top margin */}
          <div className="row mb-4">
            <div className="col-12">
              <div style={{ height: '20px' }}></div>
            </div>
          </div>
          
          {/* Main Dashboard Tiles */}
          <div className="row g-4 mb-5">
            {/* 1. Wärme Kachel */}
            <div className="col-xl-6 col-lg-6">
              <Card 
                className="h-100 dashboard-tile shadow border-2 border-dark" 
                style={{ cursor: 'pointer' }}
                onClick={() => router.push('/dashboard')}
              >
                <Card.Body className="p-4">
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                      <h4 className="mb-1 fw-bold text-dark">
                        <FontAwesomeIcon icon={faFire} className="me-2 text-danger" />
                        Wärme
                      </h4>
                      <p className="mb-0 text-muted fw-semibold">Heizungssteuerung & Monitoring</p>
                    </div>
                    <div className="icon-shape bg-danger text-white border border-dark">
                      <FontAwesomeIcon icon={faFire} size="lg" />
                    </div>
                  </div>
                  
                            <div className="row g-3">
            <div className="col-4">
              <div className="text-center">
                <h3 className="mb-1 fw-bold text-primary">{dashboardData?.devices || 0}</h3>
                <small className="text-dark fw-semibold">Gesamt</small>
              </div>
            </div>
            <div className="col-4">
              <div className="text-center">
                <h3 className="mb-1 fw-bold text-success">{dashboardData?.activeDevices || 0}</h3>
                <small className="text-dark fw-semibold">Aktiv</small>
              </div>
            </div>
            <div className="col-4">
              <div className="text-center">
                <h3 className="mb-1 fw-bold text-danger">{dashboardData?.inactiveDevices || 0}</h3>
                <small className="text-dark fw-semibold">Inaktiv</small>
              </div>
            </div>
                  </div>
                  
                  <div className="row g-3 mt-2">
                    <div className="col-12">
                      <div className="text-center">
                        <h3 className="mb-1 fw-bold text-info">{dashboardData?.heatDemand || '85%'}</h3>
                        <small className="text-dark fw-semibold">Wärmeanforderung</small>
                      </div>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>

            {/* 2. Verbrauch Kachel */}
            <div className="col-xl-6 col-lg-6">
              <Card 
                className="h-100 dashboard-tile shadow border-2 border-dark disabled-card"
                style={{
                  opacity: 0.3,
                  filter: 'grayscale(100%) brightness(0.6) blur(2px)',
                  pointerEvents: 'none',
                  cursor: 'not-allowed'
                }}
              >
                <Card.Body className="p-4">
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                      <h4 className="mb-1 fw-bold text-dark">
                        <FontAwesomeIcon icon={faTachometerAlt} className="me-2 text-secondary" />
                        Verbrauch
                      </h4>
                      <p className="mb-0 text-muted fw-semibold">Energieverbrauch & Effizienz</p>
                    </div>
                    <div className="icon-shape bg-secondary text-white border border-dark">
                      <FontAwesomeIcon icon={faTachometerAlt} size="lg" />
                    </div>
                  </div>
                  
                  <div className="row g-3">
                    <div className="col-4">
                      <div className="text-center">
                        <h3 className="mb-1 fw-bold text-primary">---</h3>
                        <small className="text-dark fw-semibold">kWh/h</small>
                      </div>
                    </div>
                    <div className="col-4">
                      <div className="text-center">
                        <h3 className="mb-1 fw-bold text-success">
                          <FontAwesomeIcon icon={faArrowDown} className="me-1" />
                          ---
                        </h3>
                        <small className="text-dark fw-semibold">Effizienz</small>
                      </div>
                    </div>
                    <div className="col-4">
                      <div className="text-center">
                        <h3 className="mb-1 fw-bold text-primary">---</h3>
                        <small className="text-dark fw-semibold">Monatlich</small>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <small className="text-dark fw-semibold">Energieeinsparung</small>
                      <Badge bg="success" className="border border-dark">---</Badge>
                    </div>
                    <ProgressBar variant="info" now={0} className="border border-dark" />
                  </div>
                </Card.Body>
              </Card>
            </div>

            {/* 3. Raumklima Kachel */}
            <div className="col-xl-6 col-lg-6">
              <Card 
                className="h-100 dashboard-tile shadow border-2 border-dark disabled-card"
                style={{
                  opacity: 0.3,
                  filter: 'grayscale(100%) brightness(0.6) blur(2px)',
                  pointerEvents: 'none',
                  cursor: 'not-allowed'
                }}
              >
                <Card.Body className="p-4">
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                      <h4 className="mb-1 fw-bold text-dark">
                        <FontAwesomeIcon icon={faThermometerHalf} className="me-2 text-secondary" />
                        Raumklima
                      </h4>
                      <p className="mb-0 text-muted fw-semibold">Temperatur & Luftqualität</p>
                    </div>
                    <div className="icon-shape bg-secondary text-white border border-dark">
                      <FontAwesomeIcon icon={faThermometerHalf} size="lg" />
                    </div>
                  </div>
                  
                  <div className="row g-3">
                    <div className="col-4">
                      <div className="text-center">
                        <h3 className="mb-1 fw-bold text-primary">---°C</h3>
                        <small className="text-dark fw-semibold">Durchschnitt</small>
                      </div>
                    </div>
                    <div className="col-4">
                      <div className="text-center">
                        <h3 className="mb-1 fw-bold text-info">---%</h3>
                        <small className="text-dark fw-semibold">Luftfeuchtigkeit</small>
                      </div>
                    </div>
                    <div className="col-4">
                      <div className="text-center">
                        <h3 className="mb-1 fw-bold text-success">
                          <FontAwesomeIcon icon={faCheckCircle} className="me-1" />
                          ---
                        </h3>
                        <small className="text-dark fw-semibold">Komfort</small>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <small className="text-dark fw-semibold">Klimaqualität</small>
                      <Badge bg="success" className="border border-dark">---</Badge>
                    </div>
                    <ProgressBar variant="success" now={0} className="border border-dark" />
                  </div>
                </Card.Body>
              </Card>
            </div>

            {/* 4. Einstellungen Kachel */}
            <div className="col-xl-6 col-lg-6">
              <Card className="h-100 dashboard-tile shadow border-2 border-dark">
                <Card.Body className="p-4">
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                      <h4 className="mb-1 fw-bold text-dark">
                        <FontAwesomeIcon icon={faCog} className="me-2 text-warning" />
                        Einstellungen
                      </h4>
                      <p className="mb-0 text-muted fw-semibold">System & Benutzerverwaltung</p>
                    </div>
                    <div className="icon-shape bg-warning text-white border border-dark">
                      <FontAwesomeIcon icon={faCog} size="lg" />
                    </div>
                  </div>
                  
                  <div className="row g-3">
                    <div className="col-4">
                      <div className="text-center">
                        <h3 className="mb-1 fw-bold text-primary">{dashboardData?.users || 0}</h3>
                        <small className="text-dark fw-semibold">Benutzer</small>
                      </div>
                    </div>
                    <div className="col-4">
                      <div className="text-center">
                        <h3 className="mb-1 fw-bold text-warning">
                          <FontAwesomeIcon icon={faShieldAlt} className="me-1" />
                          {dashboardData?.securityLevel || 'Hoch'}
                        </h3>
                        <small className="text-dark fw-semibold">Sicherheit</small>
                      </div>
                    </div>
                    <div className="col-4">
                      <div className="text-center">
                        <h3 className="mb-1 fw-bold text-success">
                          <FontAwesomeIcon icon={faBolt} className="me-1" />
                          {dashboardData?.systemStatus || 'Online'}
                        </h3>
                        <small className="text-dark fw-semibold">Status</small>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <small className="text-dark fw-semibold">Systemverfügbarkeit</small>
                      <Badge bg="success" className="border border-dark">99.9%</Badge>
                    </div>
                    <ProgressBar variant="warning" now={99} className="border border-dark" />
                  </div>
                </Card.Body>
              </Card>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="row mt-4">
            <div className="col-12">
              <Card className="border-0 shadow-sm">
                <Card.Body className="p-4">
                  <h5 className="text-primary mb-3">Schnellzugriff</h5>
                  <div className="row g-3">
                    <div className="col-md-3">
                      <button 
                        className="btn btn-outline-primary w-100"
                        onClick={() => router.push('/dashboard')}
                      >
                        <FontAwesomeIcon icon={faChartLine} className="me-2" />
                        Dashboard
                      </button>
                    </div>
                    <div className="col-md-3">
                      <button 
                        className="btn btn-outline-success w-100"
                        onClick={() => router.push('/config/devices')}
                      >
                        <FontAwesomeIcon icon={faThermometerHalf} className="me-2" />
                        Geräte
                      </button>
                    </div>
                    <div className="col-md-3">
                      <button 
                        className="btn btn-outline-info w-100"
                        onClick={() => router.push('/config/users')}
                      >
                        <FontAwesomeIcon icon={faUsers} className="me-2" />
                        Benutzer
                      </button>
                    </div>
                    <div className="col-md-3">
                      <button 
                        className="btn btn-outline-warning w-100"
                        onClick={() => router.push('/config')}
                      >
                        <FontAwesomeIcon icon={faCog} className="me-2" />
                        Einstellungen
                      </button>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .dashboard-tile {
          transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
          border-radius: 16px;
          overflow: hidden;
        }
        
        .dashboard-tile:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 25px rgba(0,0,0,0.15) !important;
        }
        
        .icon-shape {
          width: 60px;
          height: 60px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .dashboard-tile .progress {
          height: 8px;
          border-radius: 4px;
        }
        
        .dashboard-tile .badge {
          font-size: 0.75rem;
        }
        
        .disabled-card {
          opacity: 0.3 !important;
          filter: grayscale(100%) brightness(0.6) blur(2px) !important;
          pointer-events: none !important;
          cursor: not-allowed !important;
        }
        
        .disabled-card * {
          opacity: 0.5 !important;
          filter: blur(1px) !important;
        }
      `}</style>
    </>
  );
}

Home.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
