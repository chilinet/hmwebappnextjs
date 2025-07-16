import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';

export default function TokenRefreshAdmin() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [tokenStatus, setTokenStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Check if user is admin
  useEffect(() => {
    if (sessionStatus === 'loading') return;
    
    if (!session || session.user?.role !== 'admin') {
      router.push('/auth/signin');
    }
  }, [session, sessionStatus, router]);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/cron/refresh-tokens');
      const data = await response.json();
      setTokenStatus(data);
    } catch (error) {
      console.error('Error fetching status:', error);
      setMessage('Fehler beim Abrufen des Status');
    }
  };

  const performAction = async (action) => {
    setLoading(true);
    setMessage('');
    
    try {
      const response = await fetch('/api/cron/refresh-tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMessage(data.message || 'Aktion erfolgreich ausgeführt');
        await fetchStatus(); // Refresh status
      } else {
        setMessage(data.error || 'Fehler bei der Ausführung');
      }
    } catch (error) {
      console.error('Error performing action:', error);
      setMessage('Fehler bei der Ausführung der Aktion');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.role === 'admin') {
      fetchStatus();
    }
  }, [session]);

  if (sessionStatus === 'loading' || !session || session.user?.role !== 'admin') {
    return <div className="container mt-5">Loading...</div>;
  }

  return (
    <div className="container mt-5">
      <div className="row">
        <div className="col-12">
          <h1>ThingsBoard Token Refresh Admin</h1>
          <p className="text-muted">Verwaltung des automatischen Token-Refresh-Services</p>
          
          {message && (
            <div className={`alert ${message.includes('Fehler') ? 'alert-danger' : 'alert-success'}`}>
              {message}
            </div>
          )}

          <div className="card mb-4">
            <div className="card-header">
              <h5 className="mb-0">Service Status</h5>
            </div>
            <div className="card-body">
              {tokenStatus ? (
                <div>
                  <div className="row">
                    <div className="col-md-6">
                      <h6>Cron Job Status</h6>
                      <p>
                        <span className={`badge ${tokenStatus.cron?.running ? 'bg-success' : 'bg-danger'}`}>
                          {tokenStatus.cron?.running ? 'Aktiv' : 'Inaktiv'}
                        </span>
                      </p>
                      <p className="text-muted">{tokenStatus.cron?.description}</p>
                    </div>
                    <div className="col-md-6">
                      <h6>Token Übersicht</h6>
                      {tokenStatus.tokens?.summary && (
                        <div>
                          <p><strong>Gesamt:</strong> {tokenStatus.tokens.summary.total}</p>
                          <p><span className="text-success"><strong>Gültig:</strong> {tokenStatus.tokens.summary.valid}</span></p>
                          <p><span className="text-warning"><strong>Läuft bald ab:</strong> {tokenStatus.tokens.summary.expiring_soon}</span></p>
                          <p><span className="text-danger"><strong>Abgelaufen:</strong> {tokenStatus.tokens.summary.expired}</span></p>
                          <p><span className="text-danger"><strong>Fehlend:</strong> {tokenStatus.tokens.summary.missing}</span></p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p>Status wird geladen...</p>
              )}
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header">
              <h5 className="mb-0">Aktionen</h5>
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-md-3 mb-2">
                  <button 
                    className="btn btn-success w-100" 
                    onClick={() => performAction('start')}
                    disabled={loading || tokenStatus?.cron?.running}
                  >
                    {loading ? 'Lädt...' : 'Cron Starten'}
                  </button>
                </div>
                <div className="col-md-3 mb-2">
                  <button 
                    className="btn btn-danger w-100" 
                    onClick={() => performAction('stop')}
                    disabled={loading || !tokenStatus?.cron?.running}
                  >
                    {loading ? 'Lädt...' : 'Cron Stoppen'}
                  </button>
                </div>
                <div className="col-md-3 mb-2">
                  <button 
                    className="btn btn-primary w-100" 
                    onClick={() => performAction('refresh')}
                    disabled={loading}
                  >
                    {loading ? 'Lädt...' : 'Manueller Refresh'}
                  </button>
                </div>
                <div className="col-md-3 mb-2">
                  <button 
                    className="btn btn-info w-100" 
                    onClick={() => performAction('status')}
                    disabled={loading}
                  >
                    {loading ? 'Lädt...' : 'Status Aktualisieren'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {tokenStatus?.tokens?.customers && (
            <div className="card">
              <div className="card-header">
                <h5 className="mb-0">Token Details</h5>
              </div>
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table table-striped">
                    <thead>
                      <tr>
                        <th>Customer ID</th>
                        <th>Username</th>
                        <th>URL</th>
                        <th>Status</th>
                        <th>Minuten bis Ablauf</th>
                        <th>Token vorhanden</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokenStatus.tokens.customers.map((customer, index) => (
                        <tr key={index}>
                          <td>{customer.customer_id}</td>
                          <td>{customer.tb_username}</td>
                          <td>
                            <a href={customer.tb_url} target="_blank" rel="noopener noreferrer">
                              {customer.tb_url}
                            </a>
                          </td>
                          <td>
                            <span className={`badge ${
                              customer.token_status === 'valid' ? 'bg-success' :
                              customer.token_status === 'expiring_soon' ? 'bg-warning' :
                              customer.token_status === 'expired' ? 'bg-danger' :
                              'bg-secondary'
                            }`}>
                              {customer.token_status === 'valid' ? 'Gültig' :
                               customer.token_status === 'expiring_soon' ? 'Läuft bald ab' :
                               customer.token_status === 'expired' ? 'Abgelaufen' :
                               'Fehlend'}
                            </span>
                          </td>
                          <td>
                            {customer.minutes_until_expiry !== null 
                              ? `${customer.minutes_until_expiry} min`
                              : '-'
                            }
                          </td>
                          <td>
                            <span className={`badge ${customer.tbtoken ? 'bg-success' : 'bg-danger'}`}>
                              {customer.tbtoken ? 'Ja' : 'Nein'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 