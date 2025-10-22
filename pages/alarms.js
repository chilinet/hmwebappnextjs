import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Card, Badge, Button, Spinner, Alert } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faExclamationTriangle,
  faCheckCircle,
  faClock,
  faBell,
  faFilter,
  faRefresh,
  faInfoCircle,
  faWarning,
  faTimesCircle
} from '@fortawesome/free-solid-svg-icons';
import Head from 'next/head';

export default function Alarms() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [alarms, setAlarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('ACTIVE');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [timeFilter, setTimeFilter] = useState('ALL');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAlarms, setSelectedAlarms] = useState(new Set());
  const [bulkAcknowledging, setBulkAcknowledging] = useState(false);
  const [showAcknowledgeDialog, setShowAcknowledgeDialog] = useState(false);
  const [acknowledgeSolution, setAcknowledgeSolution] = useState('');
  const [acknowledgingAlarm, setAcknowledgingAlarm] = useState(null);

  // Filter-Optionen - ThingsBoard Status
  const filterOptions = [
    { value: 'ACTIVE', label: 'Aktive Alarme', color: 'danger' },
    { value: 'CLEARED', label: 'Behobene Alarme', color: 'success' },
    { value: 'ACK', label: 'Bestätigte Alarme', color: 'warning' },
    { value: 'UNACK', label: 'Unbestätigte Alarme', color: 'info' }
  ];

  // Severity-Filter-Optionen
  const severityOptions = [
    { value: 'ALL', label: 'Alle Severities', color: 'secondary' },
    { value: 'CRITICAL', label: 'Critical', color: 'danger' },
    { value: 'MAJOR', label: 'Major', color: 'warning' },
    { value: 'MINOR', label: 'Minor', color: 'info' },
    { value: 'WARNING', label: 'Warning', color: 'warning' },
    { value: 'INDETERMINATE', label: 'Indeterminate', color: 'secondary' }
  ];

  // Zeit-Filter-Optionen
  const timeOptions = [
    { value: 'ALL', label: 'Alle Zeiten', color: 'secondary' },
    { value: '1D', label: 'Letzter Tag', color: 'info' },
    { value: '7D', label: 'Letzte 7 Tage', color: 'warning' },
    { value: '30D', label: 'Letzte 30 Tage', color: 'primary' }
  ];

  // Alarm-Typen für Icons
  const getAlarmIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'critical':
      case 'high':
        return faExclamationTriangle;
      case 'warning':
      case 'medium':
        return faWarning;
      case 'info':
      case 'low':
        return faInfoCircle;
      default:
        return faBell;
    }
  };

  // Alarm-Farben
  const getAlarmColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
      case 'high':
        return 'danger';
      case 'warning':
      case 'medium':
        return 'warning';
      case 'info':
      case 'low':
        return 'info';
      default:
        return 'secondary';
    }
  };

  // Zeit formatieren
  const formatTime = (timestamp) => {
    if (!timestamp) return 'Unbekannt';
    const date = new Date(timestamp);
    return date.toLocaleString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Duration berechnen
  const calculateDuration = (alarm) => {
    if (!alarm.startTs) return 'Unbekannt';
    
    const startTime = new Date(alarm.startTs);
    const endTime = alarm.endTs ? new Date(alarm.endTs) : new Date();
    const durationMs = endTime.getTime() - startTime.getTime();
    
    if (durationMs < 0) return '0m';
    
    const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    let duration = '';
    if (days > 0) duration += `${days}d `;
    if (hours > 0) duration += `${hours}h `;
    if (minutes > 0) duration += `${minutes}m`;
    
    return duration.trim() || '0m';
  };

  // Bulk-Auswahl Funktionen
  const toggleAlarmSelection = (alarmId) => {
    const newSelected = new Set(selectedAlarms);
    if (newSelected.has(alarmId)) {
      newSelected.delete(alarmId);
    } else {
      newSelected.add(alarmId);
    }
    setSelectedAlarms(newSelected);
  };

  const selectAllAlarms = () => {
    const unacknowledgedAlarms = alarms.filter(alarm => !alarm.ackTs);
    setSelectedAlarms(new Set(unacknowledgedAlarms.map(alarm => alarm.id?.id)));
  };

  const clearSelection = () => {
    setSelectedAlarms(new Set());
  };

  const openAcknowledgeDialog = (alarm) => {
    setAcknowledgingAlarm(alarm);
    setAcknowledgeSolution('');
    setShowAcknowledgeDialog(true);
  };

  const closeAcknowledgeDialog = () => {
    setShowAcknowledgeDialog(false);
    setAcknowledgingAlarm(null);
    setAcknowledgeSolution('');
  };

  const acknowledgeAlarm = async () => {
    if (!acknowledgingAlarm || !acknowledgeSolution.trim()) {
      setError('Bitte geben Sie eine Lösungsbeschreibung ein');
      return;
    }

    try {
      const response = await fetch('/api/alarms/acknowledge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          alarmId: acknowledgingAlarm.id?.id,
          solution: acknowledgeSolution.trim(),
          customer_id: session.user.customerid
        })
      });

      if (!response.ok) {
        throw new Error('Fehler beim Bestätigen des Alarms');
      }

      // Alarme neu laden
      await loadAlarms();
      closeAcknowledgeDialog();
    } catch (error) {
      console.error('Acknowledge error:', error);
      setError('Fehler beim Bestätigen des Alarms');
    }
  };

  const bulkAcknowledgeAlarms = async () => {
    if (selectedAlarms.size === 0) return;

    setBulkAcknowledging(true);
    try {
      const alarmIds = Array.from(selectedAlarms);
      const response = await fetch('/api/alarms/bulk-acknowledge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          alarmIds: alarmIds,
          customer_id: session.user.customerid
        })
      });

      if (!response.ok) {
        throw new Error('Fehler beim Bulk-Bestätigen der Alarme');
      }

      // Alarme neu laden
      await loadAlarms();
      setSelectedAlarms(new Set());
    } catch (error) {
      console.error('Bulk acknowledge error:', error);
      setError('Fehler beim Bulk-Bestätigen der Alarme');
    } finally {
      setBulkAcknowledging(false);
    }
  };

  // Alarme laden
  const loadAlarms = async (status = filter) => {
    if (!session?.user?.customerid) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/alarms?customer_id=${session.user.customerid}&status=${status}&limit=100`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Fehler beim Laden der Alarme');
      }

      const data = await response.json();
      setAlarms(data.data || []);
      setError(null);
    } catch (err) {
      console.error('Error loading alarms:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Alarme aktualisieren
  const refreshAlarms = async () => {
    setRefreshing(true);
    await loadAlarms();
    setRefreshing(false);
  };

  // Filter ändern
  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    loadAlarms(newFilter);
  };

  const handleSeverityFilterChange = (newSeverityFilter) => {
    setSeverityFilter(newSeverityFilter);
    // Severity-Filter wird client-seitig angewendet
  };

  const handleTimeFilterChange = (newTimeFilter) => {
    setTimeFilter(newTimeFilter);
    // Zeit-Filter wird client-seitig angewendet
  };

  // Zeit-Filter-Funktion
  const isAlarmInTimeRange = (alarm, timeFilter) => {
    if (timeFilter === 'ALL') return true;
    
    const now = new Date();
    const alarmTime = new Date(alarm.startTs || alarm.createdTime);
    
    switch (timeFilter) {
      case '1D':
        return alarmTime >= new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7D':
        return alarmTime >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30D':
        return alarmTime >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        return true;
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    } else if (session) {
      loadAlarms();
    }
  }, [status, session, router]);

  if (status === "loading") {
    return (
      <div className="light-theme min-vh-100 d-flex align-items-center justify-content-center">
        <div className="text-center">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
          <p className="mt-3 text-muted">Session wird geladen...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="light-theme min-vh-100 d-flex align-items-center justify-content-center">
        <div className="text-center">
          <Alert variant="warning">
            Keine Session gefunden. Bitte melden Sie sich an.
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>HeatManager - Alarme</title>
        <meta name="description" content="HeatManager - Alarmübersicht und -verwaltung" />
      </Head>
      
      <div className="light-theme" style={{ backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        <div className="container-fluid py-4">
          {/* Header */}
          <div className="row mb-4">
            <div className="col-12">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h2 className="mb-1 fw-bold">Alarmübersicht</h2>
                  <p className="text-muted mb-0">Verwaltung und Überwachung aller Systemalarme</p>
                </div>
                <div className="d-flex gap-2">
                  <Button 
                    variant="outline-secondary" 
                    onClick={refreshAlarms}
                    disabled={refreshing}
                  >
                    <FontAwesomeIcon icon={faRefresh} className={refreshing ? 'fa-spin' : ''} />
                    {refreshing ? ' Aktualisiere...' : ' Aktualisieren'}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Filter */}
          <div className="row mb-4">
            <div className="col-12">
              <Card className="shadow-sm">
                <Card.Body className="p-3">
                  <div className="row">
                    <div className="col-md-4">
                      <div className="d-flex align-items-center gap-3">
                        <FontAwesomeIcon icon={faFilter} className="text-muted" />
                        <span className="fw-semibold">Status:</span>
                        <div className="d-flex gap-2 flex-wrap">
                          {filterOptions.map((option) => (
                            <Button
                              key={option.value}
                              variant={filter === option.value ? option.color : 'outline-secondary'}
                              size="sm"
                              onClick={() => handleFilterChange(option.value)}
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="d-flex align-items-center gap-3">
                        <FontAwesomeIcon icon={faExclamationTriangle} className="text-muted" />
                        <span className="fw-semibold">Severity:</span>
                        <div className="d-flex gap-2 flex-wrap">
                          {severityOptions.map((option) => (
                            <Button
                              key={option.value}
                              variant={severityFilter === option.value ? option.color : 'outline-secondary'}
                              size="sm"
                              onClick={() => handleSeverityFilterChange(option.value)}
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="d-flex align-items-center gap-3">
                        <FontAwesomeIcon icon={faClock} className="text-muted" />
                        <span className="fw-semibold">Zeit:</span>
                        <div className="d-flex gap-2 flex-wrap">
                          {timeOptions.map((option) => (
                            <Button
                              key={option.value}
                              variant={timeFilter === option.value ? option.color : 'outline-secondary'}
                              size="sm"
                              onClick={() => handleTimeFilterChange(option.value)}
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>
          </div>

          {/* Bulk Actions */}
          {alarms.length > 0 && (
            <div className="row mb-3">
              <div className="col-12">
                <Card className="shadow-sm">
                  <Card.Body className="py-3">
                    <div className="d-flex justify-content-between align-items-center">
                      <div className="d-flex align-items-center gap-3">
                        <div className="form-check">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id="selectAll"
                            checked={selectedAlarms.size > 0 && selectedAlarms.size === alarms.filter(alarm => !alarm.ackTs).length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                selectAllAlarms();
                              } else {
                                clearSelection();
                              }
                            }}
                          />
                          <label className="form-check-label" htmlFor="selectAll">
                            Alle unbestätigten Alarme auswählen
                          </label>
                        </div>
                        {selectedAlarms.size > 0 && (
                          <Badge bg="primary">
                            {selectedAlarms.size} ausgewählt
                          </Badge>
                        )}
                      </div>
                      <div className="d-flex gap-2">
                        {selectedAlarms.size > 0 && (
                          <>
                            <Button
                              variant="outline-secondary"
                              size="sm"
                              onClick={clearSelection}
                            >
                              Auswahl aufheben
                            </Button>
                            <Button
                              variant="success"
                              size="sm"
                              onClick={bulkAcknowledgeAlarms}
                              disabled={bulkAcknowledging}
                            >
                              {bulkAcknowledging ? (
                                <>
                                  <Spinner size="sm" className="me-2" />
                                  Bestätige...
                                </>
                              ) : (
                                <>
                                  <FontAwesomeIcon icon={faCheckCircle} className="me-2" />
                                  Ausgewählte bestätigen ({selectedAlarms.size})
                                </>
                              )}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </Card.Body>
                </Card>
              </div>
            </div>
          )}

          {/* Alarme */}
          <div className="row">
            <div className="col-12">
              {loading ? (
                <div className="text-center py-5">
                  <Spinner animation="border" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </Spinner>
                  <p className="mt-3 text-muted">Alarme werden geladen...</p>
                </div>
              ) : error ? (
                <Alert variant="danger">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
                  <strong>Fehler:</strong> {error}
                </Alert>
              ) : alarms.length === 0 ? (
                <Card className="shadow-sm">
                  <Card.Body className="text-center py-5">
                    <FontAwesomeIcon icon={faCheckCircle} size="3x" className="text-success mb-3" />
                    <h5 className="text-muted">Keine Alarme gefunden</h5>
                    <p className="text-muted">Für den gewählten Filter wurden keine Alarme gefunden.</p>
                  </Card.Body>
                </Card>
              ) : (
                <div className="row g-3">
                  {alarms
                    .filter(alarm => {
                      // Severity-Filter
                      if (severityFilter !== 'ALL' && alarm.severity !== severityFilter) {
                        return false;
                      }
                      
                      // Zeit-Filter
                      if (!isAlarmInTimeRange(alarm, timeFilter)) {
                        return false;
                      }
                      
                      return true;
                    })
                    .map((alarm, index) => (
                    <div key={alarm.id?.id || index} className="col-12">
                      <Card className="shadow-sm alarm-card">
                        <Card.Body className="p-4">
                          <div className="d-flex align-items-start">
                            {!alarm.ackTs && (
                              <div className="me-3">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  checked={selectedAlarms.has(alarm.id?.id)}
                                  onChange={() => toggleAlarmSelection(alarm.id?.id)}
                                />
                              </div>
                            )}
                            <div className="alarm-icon me-3">
                              <FontAwesomeIcon 
                                icon={getAlarmIcon(alarm.type)} 
                                className={`text-${getAlarmColor(alarm.severity)}`}
                                size="lg"
                              />
                            </div>
                            <div className="flex-grow-1">
                              <div className="d-flex justify-content-between align-items-start mb-2">
                                <div>
                                  <h5 className="mb-1 fw-bold">{alarm.type || 'Unbekannter Alarm'}</h5>
                                  <div className="device-info mb-1">
                                    <small className="text-muted">
                                      <strong>Gerät:</strong> {alarm.originatorLabel || alarm.device?.name || alarm.originator?.name || 'Unbekanntes Gerät'}
                                    </small>
                                  </div>
                                  <div className="device-id">
                                    <small className="text-muted">
                                      <strong>Device-ID:</strong> {alarm.originatorName || alarm.device?.id || alarm.originator?.id?.id || 'Unknown'}
                                    </small>
                                  </div>
                                </div>
                                <div className="text-end">
                                  <Badge bg={getAlarmColor(alarm.severity)} className="mb-2">
                                    {alarm.severity || 'UNKNOWN'}
                                  </Badge>
                                  <div className="text-muted small">
                                    <FontAwesomeIcon icon={faClock} className="me-1" />
                                    {formatTime(alarm.createdTime)}
                                  </div>
                                </div>
                              </div>
                              
                              {alarm.details && (
                                <div className="alarm-details mb-3">
                                  <small className="text-muted">
                                    <strong>Details:</strong> {JSON.stringify(alarm.details)}
                                  </small>
                                </div>
                              )}
                              
                              <div className="d-flex justify-content-between align-items-center">
                                <div className="alarm-status">
                                  <Badge bg={alarm.ackTs ? 'success' : 'warning'}>
                                    {alarm.ackTs ? 'Bestätigt' : 'Unbestätigt'}
                                  </Badge>
                                  {alarm.clearTs && (
                                    <Badge bg="info" className="ms-2">
                                      Behoben
                                    </Badge>
                                  )}
                                  <Badge bg="secondary" className="ms-2">
                                    <FontAwesomeIcon icon={faClock} className="me-1" />
                                    {calculateDuration(alarm)}
                                  </Badge>
                                </div>
                                <div className="alarm-actions">
                                  {!alarm.ackTs && (
                                    <Button 
                                      variant="outline-success" 
                                      size="sm"
                                      onClick={() => openAcknowledgeDialog(alarm)}
                                    >
                                      Bestätigen
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </Card.Body>
                      </Card>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .alarm-card {
          border-radius: 12px;
          border: none;
          background: white;
          transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
        }
        
        .alarm-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.1) !important;
        }
        
        .alarm-icon {
          width: 48px;
          height: 48px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.05);
        }
        
        .alarm-details {
          background: #f8f9fa;
          border-radius: 6px;
          padding: 0.75rem;
          border-left: 3px solid #dee2e6;
        }
        
        .alarm-status .badge {
          font-size: 0.75rem;
        }
        
        .alarm-actions .btn {
          font-size: 0.875rem;
        }
        
        .device-info, .device-id {
          margin-bottom: 0.25rem;
        }
        
        .device-info small, .device-id small {
          font-size: 0.75rem;
          line-height: 1.2;
        }
      `}</style>

      {/* Acknowledge Dialog */}
      {showAcknowledgeDialog && (
        <div className="modal-overlay" onClick={closeAcknowledgeDialog}>
          <div className="modal-content-custom" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-custom">
              <h5 className="modal-title">Alarm bestätigen</h5>
              <button 
                type="button" 
                className="btn-close-custom" 
                onClick={closeAcknowledgeDialog}
              >
                ×
              </button>
            </div>
            <div className="modal-body-custom">
              <div className="mb-3">
                <label className="form-label">
                  <strong>Alarm:</strong> {acknowledgingAlarm?.type || 'Unbekannter Alarm'}
                </label>
              </div>
              <div className="mb-3">
                <label className="form-label">
                  <strong>Gerät:</strong> {acknowledgingAlarm?.originatorLabel || acknowledgingAlarm?.device?.name || 'Unbekanntes Gerät'}
                </label>
              </div>
              <div className="mb-3">
                <label htmlFor="solution" className="form-label">
                  Lösungsbeschreibung <span className="text-danger">*</span>
                </label>
                <textarea
                  id="solution"
                  className="form-control"
                  rows="4"
                  value={acknowledgeSolution}
                  onChange={(e) => setAcknowledgeSolution(e.target.value)}
                  placeholder="Beschreiben Sie die Lösung für diesen Alarm..."
                  required
                />
                <div className="form-text">
                  Bitte beschreiben Sie kurz, wie der Alarm behoben wurde oder warum er bestätigt wird.
                </div>
              </div>
            </div>
            <div className="modal-footer-custom">
              <Button 
                variant="outline-secondary" 
                onClick={closeAcknowledgeDialog}
              >
                Abbrechen
              </Button>
              <Button 
                variant="success" 
                onClick={acknowledgeAlarm}
                disabled={!acknowledgeSolution.trim()}
              >
                <FontAwesomeIcon icon={faCheckCircle} className="me-2" />
                Bestätigen
              </Button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1050;
        }
        
        .modal-content-custom {
          background: white;
          border-radius: 8px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          max-width: 500px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
        }
        
        .modal-header-custom {
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #dee2e6;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .modal-body-custom {
          padding: 1.5rem;
        }
        
        .modal-footer-custom {
          padding: 1rem 1.5rem;
          border-top: 1px solid #dee2e6;
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }
        
        .btn-close-custom {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #6c757d;
          padding: 0;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .btn-close-custom:hover {
          color: #000;
        }
      `}</style>
    </>
  );
}

Alarms.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
