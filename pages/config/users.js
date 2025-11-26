import { useEffect, useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEdit, faTrash, faPlus, faLink, faCopy, faEnvelope, faLock, faUnlock } from '@fortawesome/free-solid-svg-icons'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUserEmail, setSelectedUserEmail] = useState(null);
  const [activationLink, setActivationLink] = useState('');
  const [userRole, setUserRole] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Hole die User-ID aus der Session
  const currentUserId = session?.user?.userid;
  useEffect(() => {
    if (session?.token) {
      // Zuerst die Rolle des aktuellen Benutzers laden
      fetchUserRole().then(() => {
        Promise.all([
          fetchUsers(),
          fetchRoles()
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

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="text-light">Benutzer</h2>
        <button 
          className="btn btn-warning"
          onClick={handleNew}
        >
          <FontAwesomeIcon icon={faPlus} className="me-2" />
          Neuer Benutzer
        </button>
      </div>

      <div className="card bg-dark">
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-dark">
              <thead>
                <tr>
                  <th>Benutzername</th>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Rolle</th>
                  {isSuperAdmin && <th>Kunde</th>}
                  <th>Status</th>
                  <th>Erstellt</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.username}</td>
                    <td>{user.email}</td>
                    <td>{user.firstName} {user.lastName}</td>
                    <td>
                      {(() => {
                        try {
                          return getRoleName(user.role)
                        } catch (err) {
                          console.error('Error getting role name:', err, user.role);
                          return 'Fehler';
                        }
                      })()}
                    </td>
                    {isSuperAdmin && <td>{user.customerName}</td>}
                    <td>{getStatusBadge(user.status)}</td>
                    <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-outline-primary me-2"
                        onClick={() => handleEdit(user.id)}
                        title="Bearbeiten"
                      >
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      
                      {user.id !== currentUserId && (
                        <>
                          <button
                            className="btn btn-sm btn-outline-danger me-2"
                            onClick={() => handleDelete(user.id)}
                            title="Löschen"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                          
                          {/* Sperren/Entsperren Button - nur für aktive oder gesperrte Benutzer */}
                          {parseInt(user.status) === 1 && (
                            <button
                              className="btn btn-sm btn-outline-warning me-2"
                              onClick={() => handleToggleLock(user.id, user.status)}
                              title="Benutzer sperren"
                            >
                              <FontAwesomeIcon icon={faLock} />
                            </button>
                          )}
                          
                          {parseInt(user.status) === 99 && (
                            <button
                              className="btn btn-sm btn-outline-success me-2"
                              onClick={() => handleToggleLock(user.id, user.status)}
                              title="Benutzer entsperren"
                            >
                              <FontAwesomeIcon icon={faUnlock} />
                            </button>
                          )}
                        </>
                      )}

                      {parseInt(user.status) === 0 && (
                        <button
                          className="btn btn-sm btn-outline-success"
                          onClick={() => handleActivationLink(user.id)}
                          title="Aktivierungslink generieren"
                        >
                          <FontAwesomeIcon icon={faLink} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
        .btn-warning {
          background-color: #fd7e14;
          border-color: #fd7e14;
          color: white;
        }
        .btn-warning:hover {
          background-color: #e66e12;
          border-color: #e66e12;
          color: white;
        }
        .btn-warning:disabled {
          background-color: #fd7e14;
          border-color: #fd7e14;
          opacity: 0.65;
        }
        .table-dark {
          color: #fff;
          background-color: #343a40;
        }
        .table-dark th,
        .table-dark td {
          border-color: #454d55;
        }
        .card {
          border-color: #454d55;
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