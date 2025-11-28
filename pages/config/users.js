import { useEffect, useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEdit, faTrash, faPlus, faLink, faCopy, faEnvelope, faLock, faUnlock, faUser, faSearch, faFilter, faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { v4 as uuidv4 } from 'uuid'

const getStatusBadge = (status) => {
  // Konvertiere status zu einer Nummer
  const statusNum = parseInt(status);
  
  switch (statusNum) {
    case 0:
      return <span className="badge bg-secondary">Inaktiv</span>;
    case 1:
      return <span className="badge bg-success">Aktiv</span>;
    case 99:
      return <span className="badge bg-danger">Gesperrt</span>;
    default:
      console.log('Unbekannter Status:', status, typeof status); // Debug-Info
      return <span className="badge bg-warning">Unbekannt</span>;
  }
};

export default function Users() {
  const router = useRouter()
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      signIn()
    },
  })

  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUserEmail, setSelectedUserEmail] = useState(null);
  const [activationLink, setActivationLink] = useState('');
  const [userRole, setUserRole] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Hole die User-ID aus der Session
  const currentUserId = session?.user?.userid;
  useEffect(() => {
    if (session?.token) {
      // Zuerst die Rolle des aktuellen Benutzers laden
      fetchUserRole().then(() => {
        Promise.all([
          fetchUsers(),
          fetchRoles(),
          fetchCustomers()
        ]).finally(() => setLoading(false));
      });
    }
  }, [session])

  const fetchUserRole = async () => {
    try {
      const response = await fetch('/api/config/users/me', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user role');
      }

      const data = await response.json();
      setUserRole(data.role);
    } catch (error) {
      console.error('Error fetching user role:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/config/users', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      setUsers(data.data);
    } catch (error) {
      setError('Error loading users');
      console.error(error);
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await fetch('/api/roles', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch roles');
      }

      const data = await response.json();
      setRoles(data); // Die API gibt direkt das Array zurück
    } catch (error) {
      console.error('Error loading roles:', error);
    }
  };

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/config/customers', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch customers');
      }

      const data = await response.json();
      // ThingsBoard API gibt { data: [...] } zurück
      const customersData = data.data || (Array.isArray(data) ? data : []);
      setCustomers(Array.isArray(customersData) ? customersData : []);
    } catch (error) {
      console.error('Error loading customers:', error);
      setCustomers([]);
    }
  };

  // Hilfsfunktion um den Rollentext anhand der ID zu finden
  const getRoleName = (roleId) => {
    if (!roleId) return 'Keine Rolle';
    
    // Wenn roleId ein String ist, versuche ihn zu parsen
    const id = typeof roleId === 'string' ? parseInt(roleId, 10) : roleId;
    
    const role = roles.find(r => r.roleid === id);
    return role ? role.rolename : 'Unbekannte Rolle';
  };

  const handleNew = () => {
    router.push('/config/users/new')
  }

  const handleEdit = (id) => {
    router.push(`/config/users/edit/${id}`)
  }

  const handleDelete = async (id) => {
    if (!confirm('Möchten Sie diesen Benutzer wirklich löschen?')) {
      return
    }

    try {
      const response = await fetch(`/api/config/users/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to delete user')
      }

      fetchUsers() // Tabelle neu laden
    } catch (error) {
      setError('Error deleting user')
    }
  }

  const handleActivationLink = async (id) => {
    try {
      const token = uuidv4();
      const link = `${window.location.origin}/auth/activationlink/${token}`;
      
      // Finde den Benutzer, um die E-Mail-Adresse zu erhalten
      const user = users.find(u => u.id === id);
      
      // Token in der Datenbank speichern
      const response = await fetch(`/api/config/users/${id}/activation-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({ activationLink: token })
      });

      if (!response.ok) {
        throw new Error('Fehler beim Speichern des Aktivierungslinks');
      }

      setActivationLink(link);
      setSelectedUserId(id);
      setSelectedUserEmail(user?.email || null);
      setEmailSent(false);
      setShowModal(true);
    } catch (error) {
      console.error('Fehler:', error);
      alert('Fehler beim Generieren des Aktivierungslinks');
    }
  };

  const handleSendEmail = async () => {
    if (!selectedUserId || !activationLink) {
      alert('Kein Aktivierungslink vorhanden');
      return;
    }

    setSendingEmail(true);
    setError(null);

    try {
      const response = await fetch(`/api/config/users/${selectedUserId}/send-activation-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({ activationLink })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Fehler beim Versenden der E-Mail');
      }

      setEmailSent(true);
      setTimeout(() => {
        setEmailSent(false);
      }, 5000);
    } catch (err) {
      setError(err.message);
      console.error('Fehler beim Versenden der E-Mail:', err);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(activationLink);
      alert('Link wurde in die Zwischenablage kopiert!');
    } catch (err) {
      console.error('Fehler beim Kopieren:', err);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedUserId(null);
    setSelectedUserEmail(null);
    setActivationLink('');
    setEmailSent(false);
    setError(null);
  };

  const handleToggleLock = async (id, currentStatus) => {
    const user = users.find(u => u.id === id);
    const isLocked = parseInt(currentStatus) === 99;
    const action = isLocked ? 'entsperren' : 'sperren';
    
    if (!confirm(`Möchten Sie diesen Benutzer wirklich ${action}?`)) {
      return;
    }

    try {
      const newStatus = isLocked ? 1 : 99; // Entsperren = 1 (Aktiv), Sperren = 99 (Gesperrt)
      
      const response = await fetch(`/api/config/users/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({
          status: newStatus
        })
      });

      if (!response.ok) {
        throw new Error(`Fehler beim ${action} des Benutzers`);
      }

      // Tabelle neu laden
      fetchUsers();
    } catch (error) {
      setError(`Fehler beim ${action} des Benutzers: ${error.message}`);
      console.error(error);
    }
  };

  const isSuperAdmin = userRole === 1;

  // Filter- und Suchfunktion
  const filteredUsers = users.filter((user) => {
    // Suche über alle Felder
    const searchLower = searchText.toLowerCase();
    const matchesSearch = !searchText || 
      user.username?.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower) ||
      user.firstName?.toLowerCase().includes(searchLower) ||
      user.lastName?.toLowerCase().includes(searchLower) ||
      `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchLower) ||
      getRoleName(user.role).toLowerCase().includes(searchLower) ||
      user.customerName?.toLowerCase().includes(searchLower);

    // Filter nach Kunde
    const matchesCustomer = !filterCustomer || (() => {
      if (!filterCustomer) return true;
      
      // Extrahiere die Kunden-ID aus dem Benutzer (kann verschiedene Formate haben)
      const userCustomerId = user.customerid?.id || user.customerid || user.customerId?.id || user.customerId;
      const userCustomerName = user.customerName;
      
      // Finde den ausgewählten Kunden
      const selectedCustomer = customers.find(c => {
        const cId = c.id?.id || c.id || c.customerId;
        const cName = c.title || c.name;
        return (cId && cId.toString() === filterCustomer.toString()) || 
               (cName && cName === filterCustomer);
      });
      
      if (!selectedCustomer) return false;
      
      const selectedId = selectedCustomer.id?.id || selectedCustomer.id || selectedCustomer.customerId;
      const selectedName = selectedCustomer.title || selectedCustomer.name;
      
      // Vergleiche sowohl mit ID als auch mit Name
      const idMatch = userCustomerId && selectedId && 
                     userCustomerId.toString() === selectedId.toString();
      const nameMatch = userCustomerName && selectedName && 
                       userCustomerName === selectedName;
      
      return idMatch || nameMatch;
    })();

    // Filter nach Status
    const matchesStatus = !filterStatus || 
      user.status?.toString() === filterStatus;

    return matchesSearch && matchesCustomer && matchesStatus;
  });

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div className="d-flex align-items-center">
          <button 
            className="btn btn-outline-secondary me-3"
            onClick={() => router.push('/config')}
          >
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          <h1 style={{ color: '#fd7e14', fontSize: '2.5rem', fontWeight: 'bold' }}>Benutzer</h1>
        </div>
        <button 
          className="btn"
          onClick={handleNew}
          style={{ backgroundColor: '#fd7e14', borderColor: '#fd7e14', color: 'white' }}
        >
          <FontAwesomeIcon icon={faPlus} className="me-2" />
          Neuer Benutzer
        </button>
      </div>

      {/* Filter- und Suchbereich */}
      <div className="card mb-4" style={{ backgroundColor: '#ffffff', border: '1px solid #dee2e6' }}>
        <div className="card-body">
          <div className="row g-3">
            {/* Suchfeld */}
            <div className="col-md-4">
              <label className="form-label" style={{ color: '#fd7e14', fontWeight: 'bold' }}>
                <FontAwesomeIcon icon={faSearch} className="me-2" />
                Suche
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Suche nach Name, Email, Benutzername..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ border: '1px solid #dee2e6' }}
              />
            </div>

            {/* Filter nach Kunde - nur für Superadmin */}
            {isSuperAdmin && (
              <div className="col-md-4">
                <label className="form-label" style={{ color: '#fd7e14', fontWeight: 'bold' }}>
                  <FontAwesomeIcon icon={faFilter} className="me-2" />
                  Filter nach Kunde
                </label>
                <select
                  className="form-select"
                  value={filterCustomer}
                  onChange={(e) => setFilterCustomer(e.target.value)}
                  style={{ border: '1px solid #dee2e6' }}
                >
                  <option value="">Alle Kunden</option>
                  {customers.map((customer, index) => {
                    // ThingsBoard gibt Kunden als { id: { id: "...", ... }, title: "..." } zurück
                    const customerId = customer.id?.id || customer.id || customer.customerId;
                    const customerName = customer.title || customer.name || 'Unbekannt';
                    // Verwende die ID als Wert, falls vorhanden, sonst den Namen
                    const optionValue = customerId ? customerId.toString() : customerName;
                    return (
                      <option key={customerId || `customer-${index}`} value={optionValue}>
                        {customerName}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Filter nach Status */}
            <div className="col-md-4">
              <label className="form-label" style={{ color: '#fd7e14', fontWeight: 'bold' }}>
                <FontAwesomeIcon icon={faFilter} className="me-2" />
                Filter nach Status
              </label>
              <select
                className="form-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{ border: '1px solid #dee2e6' }}
              >
                <option value="">Alle Status</option>
                <option value="1">Aktiv</option>
                <option value="0">Inaktiv</option>
                <option value="99">Gesperrt</option>
              </select>
            </div>
          </div>

          {/* Ergebnisanzahl */}
          <div className="mt-3">
            <small className="text-muted">
              {filteredUsers.length} von {users.length} Benutzer{filteredUsers.length !== 1 ? 'n' : ''} angezeigt
            </small>
          </div>
        </div>
      </div>

      <div className="row g-4">
        {filteredUsers.length === 0 ? (
          <div className="col-12">
            <div className="alert alert-info text-center">
              Keine Benutzer gefunden. Bitte passen Sie Ihre Such- oder Filterkriterien an.
            </div>
          </div>
        ) : (
          filteredUsers.map((user) => (
          <div key={user.id} className="col-md-4 col-lg-3">
            <div className="card h-100" 
                 style={{ 
                   backgroundColor: '#ffffff',
                   border: '1px solid #dee2e6',
                   transition: 'all 0.3s'
                 }}>
              <div className="card-body text-center p-4">
                <div className="mb-3">
                  <FontAwesomeIcon icon={faUser} size="3x" style={{ color: '#fd7e14' }} />
                </div>
                
                <h5 className="card-title mb-2" style={{ color: '#fd7e14' }}>
                  {user.firstName} {user.lastName}
                </h5>
                
                <p className="card-text text-muted mb-2" style={{ fontSize: '0.9rem' }}>
                  <strong>Benutzername:</strong> {user.username}
                </p>
                
                <p className="card-text text-muted mb-2" style={{ fontSize: '0.9rem' }}>
                  <strong>Email:</strong> {user.email}
                </p>
                
                <p className="card-text text-muted mb-2" style={{ fontSize: '0.9rem' }}>
                  <strong>Rolle:</strong> {(() => {
                    try {
                      return getRoleName(user.role)
                    } catch (err) {
                      console.error('Error getting role name:', err, user.role);
                      return 'Fehler';
                    }
                  })()}
                </p>
                
                {isSuperAdmin && user.customerName && (
                  <p className="card-text text-muted mb-2" style={{ fontSize: '0.9rem' }}>
                    <strong>Kunde:</strong> {user.customerName}
                  </p>
                )}
                
                <div className="mb-3">
                  {getStatusBadge(user.status)}
                </div>
                
                <p className="card-text text-muted mb-3" style={{ fontSize: '0.85rem' }}>
                  Erstellt: {new Date(user.createdAt).toLocaleDateString()}
                </p>
                
                <div className="d-flex flex-wrap justify-content-center gap-2">
                  <button
                    className="btn btn-sm"
                    onClick={() => handleEdit(user.id)}
                    title="Bearbeiten"
                    style={{ backgroundColor: '#007bff', borderColor: '#007bff', color: 'white' }}
                  >
                    <FontAwesomeIcon icon={faEdit} />
                  </button>
                  
                  {user.id !== currentUserId && (
                    <>
                      <button
                        className="btn btn-sm"
                        onClick={() => handleDelete(user.id)}
                        title="Löschen"
                        style={{ backgroundColor: '#dc3545', borderColor: '#dc3545', color: 'white' }}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                      
                      {parseInt(user.status) === 1 && (
                        <button
                          className="btn btn-sm"
                          onClick={() => handleToggleLock(user.id, user.status)}
                          title="Benutzer sperren"
                          style={{ backgroundColor: '#ffc107', borderColor: '#ffc107', color: 'black' }}
                        >
                          <FontAwesomeIcon icon={faLock} />
                        </button>
                      )}
                      
                      {parseInt(user.status) === 99 && (
                        <button
                          className="btn btn-sm"
                          onClick={() => handleToggleLock(user.id, user.status)}
                          title="Benutzer entsperren"
                          style={{ backgroundColor: '#198754', borderColor: '#198754', color: 'white' }}
                        >
                          <FontAwesomeIcon icon={faUnlock} />
                        </button>
                      )}
                    </>
                  )}

                  {parseInt(user.status) === 0 && (
                    <button
                      className="btn btn-sm"
                      onClick={() => handleActivationLink(user.id)}
                      title="Aktivierungslink generieren"
                      style={{ backgroundColor: '#198754', borderColor: '#198754', color: 'white' }}
                    >
                      <FontAwesomeIcon icon={faLink} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <>
          <div className="modal show d-block" tabIndex="-1">
            <div className="modal-dialog">
              <div className="modal-content bg-dark text-white">
                <div className="modal-header border-secondary">
                  <h5 className="modal-title">Aktivierungslink</h5>
                  <button 
                    type="button" 
                    className="btn-close btn-close-white" 
                    onClick={handleCloseModal}
                    aria-label="Close"
                  ></button>
                </div>
                <div className="modal-body">
                  {emailSent && (
                    <div className="alert alert-success mb-3">
                      <strong>E-Mail gesendet!</strong> Der Aktivierungslink wurde an {selectedUserEmail} versendet.
                    </div>
                  )}
                  
                  {error && (
                    <div className="alert alert-danger mb-3">
                      <strong>Fehler:</strong> {error}
                    </div>
                  )}

                  {selectedUserEmail && (
                    <div className="mb-3">
                      <p className="text-white">E-Mail-Adresse: <strong>{selectedUserEmail}</strong></p>
                    </div>
                  )}

                  <div className="input-group mb-3">
                    <input
                      type="text"
                      className="form-control bg-dark text-white"
                      value={activationLink}
                      readOnly
                    />
                    <button 
                      className="btn btn-outline-secondary"
                      type="button"
                      title="Link kopieren"
                      onClick={handleCopyLink}
                    >
                      <FontAwesomeIcon icon={faCopy} />
                    </button>
                  </div>

                  {selectedUserEmail && (
                    <div className="d-grid">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleSendEmail}
                        disabled={sendingEmail || emailSent}
                      >
                        {sendingEmail ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                            Wird gesendet...
                          </>
                        ) : (
                          <>
                            <FontAwesomeIcon icon={faEnvelope} className="me-2" />
                            Per E-Mail versenden
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
                <div className="modal-footer border-secondary">
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={handleCloseModal}
                  >
                    Schließen
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div 
            className="modal-backdrop show" 
            onClick={handleCloseModal}
          ></div>
        </>
      )}

      <style jsx>{`
        .card {
          transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .card:hover {
          transform: translateY(-5px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }
        
        .btn-sm {
          padding: 0.25rem 0.5rem;
          font-size: 0.875rem;
        }
        
        .modal {
          background-color: transparent;
          z-index: 1050;
        }
        
        .modal-backdrop {
          background-color: rgba(0, 0, 0, 0.5);
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 1040;
        }
        
        .form-control:read-only {
          background-color: #343a40;
          color: #fff;
        }
        
        .form-control:read-only:focus {
          background-color: #343a40;
          color: #fff;
        }
        
        :global(.badge) {
          font-size: 0.875rem;
          padding: 0.35em 0.65em;
        }
        
        :global(.bg-secondary) {
          background-color: #6c757d !important;
        }
        
        :global(.bg-success) {
          background-color: #198754 !important;
        }
        
        :global(.bg-danger) {
          background-color: #dc3545 !important;
        }
        
        :global(.bg-warning) {
          background-color: #ffc107 !important;
          color: #000;
        }
      `}</style>
    </div>
  )
} 