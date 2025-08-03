import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Card } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faServer, faThermometerHalf, faChartLine } from '@fortawesome/free-solid-svg-icons';
import Head from 'next/head';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  useEffect(() => {
    async function fetchStats() {
      if (session?.user?.customerId) {
        try {
          console.log('Fetching stats for customer:', session.user.customerId);
          const response = await fetch('/api/dashboard/stats');
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch stats');
          }
          
          const data = await response.json();
          console.log('Received stats:', data);
          setStats(data);
        } catch (err) {
          console.error('Error fetching stats:', err);
          setError(err.message);
        } finally {
          setLoading(false);
        }
      } else {
        console.log('No customerId found in session:', session);
        setLoading(false);
      }
    }

    if (session) {
      fetchStats();
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
          <p className="mt-3 text-muted">Daten werden geladen...</p>
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
        <title>Dashboard - HeatManager</title>
        <meta name="description" content="HeatManager Dashboard - Übersicht über Geräte und Benutzer" />
      </Head>
      
      <div className="light-theme">
        <div className="container-fluid py-4">
          <div className="row mb-4">
            <div className="col-12">
              <h1 className="h2 mb-0 text-primary">
                <FontAwesomeIcon icon={faChartLine} className="me-2" />
                Dashboard
              </h1>
              <p className="text-muted mb-0">Willkommen bei HeatManager</p>
            </div>
          </div>
          
          <div className="row g-4">
            <div className="col-xl-3 col-md-6">
              <Card className="h-100 dashboard-card shadow-sm border-0">
                <Card.Body className="p-4">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <h6 className="text-muted mb-2 fw-semibold">Aktive Geräte</h6>
                      <h2 className="mb-0 text-primary fw-bold">{stats?.devices || 0}</h2>
                      <small className="text-success">
                        <FontAwesomeIcon icon={faThermometerHalf} className="me-1" />
                        Online
                      </small>
                    </div>
                    <div className="icon-shape bg-primary bg-opacity-10 text-primary">
                      <FontAwesomeIcon icon={faServer} size="lg" />
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>

            <div className="col-xl-3 col-md-6">
              <Card className="h-100 dashboard-card shadow-sm border-0">
                <Card.Body className="p-4">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <h6 className="text-muted mb-2 fw-semibold">Benutzer</h6>
                      <h2 className="mb-0 text-success fw-bold">{stats?.users || 0}</h2>
                      <small className="text-muted">
                        Registriert
                      </small>
                    </div>
                    <div className="icon-shape bg-success bg-opacity-10 text-success">
                      <FontAwesomeIcon icon={faUsers} size="lg" />
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>

            <div className="col-xl-3 col-md-6">
              <Card className="h-100 dashboard-card shadow-sm border-0">
                <Card.Body className="p-4">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <h6 className="text-muted mb-2 fw-semibold">Kunden</h6>
                      <h2 className="mb-0 text-info fw-bold">{stats?.customers || 0}</h2>
                      <small className="text-muted">
                        Verwaltet
                      </small>
                    </div>
                    <div className="icon-shape bg-info bg-opacity-10 text-info">
                      <FontAwesomeIcon icon={faUsers} size="lg" />
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>

            <div className="col-xl-3 col-md-6">
              <Card className="h-100 dashboard-card shadow-sm border-0">
                <Card.Body className="p-4">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <h6 className="text-muted mb-2 fw-semibold">Assets</h6>
                      <h2 className="mb-0 text-warning fw-bold">{stats?.assets || 0}</h2>
                      <small className="text-muted">
                        Konfiguriert
                      </small>
                    </div>
                    <div className="icon-shape bg-warning bg-opacity-10 text-warning">
                      <FontAwesomeIcon icon={faServer} size="lg" />
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>
          </div>

          {/* Welcome Section */}
          <div className="row mt-5">
            <div className="col-12">
              <Card className="border-0 shadow-sm welcome-section">
                <Card.Body className="p-4">
                  <div className="row align-items-center">
                    <div className="col-md-8">
                      <h4 className="text-primary mb-3">Willkommen bei HeatManager</h4>
                      <p className="text-muted mb-3">
                        Ihr intelligentes System zur Heizungssteuerung und -überwachung. 
                        Hier finden Sie eine Übersicht über alle wichtigen Kennzahlen und können 
                        Ihre Geräte und Benutzer verwalten.
                      </p>
                      <div className="d-flex gap-2">
                        <button className="btn btn-primary">
                          <FontAwesomeIcon icon={faChartLine} className="me-2" />
                          Dashboard öffnen
                        </button>
                        <button className="btn btn-outline-secondary">
                          <FontAwesomeIcon icon={faServer} className="me-2" />
                          Geräte verwalten
                        </button>
                      </div>
                    </div>
                    <div className="col-md-4 text-center">
                      <div className="bg-primary bg-opacity-10 rounded-circle d-inline-flex p-4">
                        <FontAwesomeIcon icon={faThermometerHalf} size="3x" className="text-primary" />
                      </div>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

Home.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
