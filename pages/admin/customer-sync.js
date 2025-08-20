import { useState } from 'react';
import { Container, Row, Col, Card, Button, Alert, Spinner, Table } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync, faUsers, faDatabase, faClock } from '@fortawesome/free-solid-svg-icons';
import Layout from '../../components/Layout';

export default function CustomerSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [error, setError] = useState(null);

  const syncCustomers = async () => {
    setIsSyncing(true);
    setError(null);
    setSyncResult(null);

    try {
      const response = await fetch('/api/customers/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setSyncResult(result);
      
      // Lade die aktualisierten Customer-Daten
      loadCustomers();
    } catch (error) {
      console.error('Sync error:', error);
      setError(error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const loadCustomers = async () => {
    setIsLoadingCustomers(true);
    try {
      const response = await fetch('/api/customers');
      if (response.ok) {
        const data = await response.json();
        setCustomers(data);
      } else {
        throw new Error('Fehler beim Laden der Customer-Daten');
      }
    } catch (error) {
      console.error('Load customers error:', error);
      setError(error.message);
    } finally {
      setIsLoadingCustomers(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    try {
      return new Date(timestamp).toLocaleString('de-DE');
    } catch {
      return timestamp;
    }
  };

  return (
    <Layout>
      <Container fluid className="mt-4">
        <Row>
          <Col>
            <h1 className="mb-4">
              <FontAwesomeIcon icon={faUsers} className="me-2" />
              Customer-Synchronisation
            </h1>
          </Col>
        </Row>

        <Row className="mb-4">
          <Col md={6}>
            <Card>
              <Card.Header>
                <FontAwesomeIcon icon={faSync} className="me-2" />
                Synchronisation starten
              </Card.Header>
              <Card.Body>
                <p className="text-muted">
                  Synchronisiert alle Customer-Informationen von ThingsBoard mit der lokalen Datenbank.
                  Dies verbessert die Performanz der Inventory-Seite erheblich.
                </p>
                <Button 
                  variant="primary" 
                  onClick={syncCustomers}
                  disabled={isSyncing}
                  className="w-100"
                >
                  {isSyncing ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      Synchronisiere...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faSync} className="me-2" />
                      Synchronisation starten
                    </>
                  )}
                </Button>
              </Card.Body>
            </Card>
          </Col>

          <Col md={6}>
            <Card>
              <Card.Header>
                <FontAwesomeIcon icon={faDatabase} className="me-2" />
                Synchronisations-Status
              </Card.Header>
              <Card.Body>
                {syncResult ? (
                  <div>
                    <Alert variant="success" className="mb-3">
                      <strong>✅ Synchronisation erfolgreich!</strong>
                    </Alert>
                    <div className="row text-center">
                      <div className="col-4">
                        <div className="h4 text-primary">{syncResult.total}</div>
                        <small className="text-muted">Gesamt</small>
                      </div>
                      <div className="col-4">
                        <div className="h4 text-success">{syncResult.inserted}</div>
                        <small className="text-muted">Neu</small>
                      </div>
                      <div className="col-4">
                        <div className="h4 text-info">{syncResult.updated}</div>
                        <small className="text-muted">Aktualisiert</small>
                      </div>
                    </div>
                    <div className="mt-3 text-muted small">
                      <FontAwesomeIcon icon={faClock} className="me-1" />
                      {new Date(syncResult.timestamp).toLocaleString('de-DE')}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted">
                    <FontAwesomeIcon icon={faSync} size="2x" className="mb-2" />
                    <p>Noch keine Synchronisation durchgeführt</p>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {error && (
          <Row className="mb-4">
            <Col>
              <Alert variant="danger">
                <strong>Fehler bei der Synchronisation:</strong> {error}
              </Alert>
            </Col>
          </Row>
        )}

        <Row>
          <Col>
            <Card>
              <Card.Header className="d-flex justify-content-between align-items-center">
                <span>
                  <FontAwesomeIcon icon={faUsers} className="me-2" />
                  Lokale Customer-Daten
                </span>
                <Button 
                  variant="outline-secondary" 
                  size="sm" 
                  onClick={loadCustomers}
                  disabled={isLoadingCustomers}
                >
                  {isLoadingCustomers ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      Lade...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faSync} className="me-2" />
                      Aktualisieren
                    </>
                  )}
                </Button>
              </Card.Header>
              <Card.Body>
                {customers.length > 0 ? (
                  <Table responsive striped hover>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Titel</th>
                        <th>E-Mail</th>
                        <th>Telefon</th>
                        <th>Stadt</th>
                        <th>Land</th>
                        <th>Letzte Synchronisation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map((customer) => (
                        <tr key={customer.id}>
                          <td>
                            <strong>{customer.name}</strong>
                            <br />
                            <small className="text-muted">{customer.id}</small>
                          </td>
                          <td>{customer.title || '-'}</td>
                          <td>{customer.email || '-'}</td>
                          <td>{customer.phone || '-'}</td>
                          <td>{customer.city || '-'}</td>
                          <td>{customer.country || '-'}</td>
                          <td>
                            <small>
                              {formatDate(customer.last_sync)}
                            </small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : (
                  <div className="text-center text-muted py-4">
                    <FontAwesomeIcon icon={faUsers} size="3x" className="mb-3" />
                    <p>Keine Customer-Daten verfügbar</p>
                    <p className="small">
                      Führen Sie eine Synchronisation durch, um Customer-Daten von ThingsBoard zu laden.
                    </p>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </Layout>
  );
}
