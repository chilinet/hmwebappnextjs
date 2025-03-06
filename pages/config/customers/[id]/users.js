import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEdit, faTrash, faArrowLeft } from '@fortawesome/free-solid-svg-icons';

export default function CustomerUsers() {
  const router = useRouter();
  const { id } = router.query;
  const { data: session } = useSession({
    required: true,
    onUnauthenticated() {
      router.push('/auth/signin');
    },
  });

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [customerName, setCustomerName] = useState('');

  useEffect(() => {
    if (id) {
      fetchUsers();
      fetchCustomerInfo();
    }
  }, [id]);

  const fetchCustomerInfo = async () => {
    try {
      const response = await fetch(`/api/config/customers/${id}`);
      if (!response.ok) throw new Error('Fehler beim Laden der Kundendaten');
      const data = await response.json();
      setCustomerName(data.title || 'Unbekannter Kunde');
    } catch (error) {
      console.error('Fehler beim Laden der Kundendaten:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch(`/api/config/customers/${id}/users`);
      if (!response.ok) throw new Error('Fehler beim Laden der Benutzer');
      const data = await response.json();
      setUsers(data.data || []);
    } catch (error) {
      setError('Fehler beim Laden der Benutzer');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Möchten Sie diesen Benutzer wirklich löschen?')) return;

    try {
      const response = await fetch(`/api/config/customers/${id}/users/${userId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Fehler beim Löschen des Benutzers');
      fetchUsers(); // Liste neu laden
    } catch (error) {
      setError('Fehler beim Löschen des Benutzers');
      console.error(error);
    }
  };

  if (loading) return <div className="text-center mt-5">Lade...</div>;

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div className="d-flex align-items-center">
          <button 
            className="btn btn-link text-white me-3"
            onClick={() => router.push('/config/customers')}
          >
            <FontAwesomeIcon icon={faArrowLeft} /> Zurück
          </button>
          <h2 className="mb-0 text-white">Benutzer - {customerName}</h2>
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => router.push(`/config/customers/${id}/users/new`)}
        >
          <FontAwesomeIcon icon={faPlus} className="me-2" />
          Neuer Benutzer
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <div className="card" style={{ backgroundColor: '#2C3E50' }}>
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-dark table-hover">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>E-Mail</th>
                  <th>Status</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id.id}>
                    <td>{`${user.firstName || ''} ${user.lastName || ''}`}</td>
                    <td>{user.email}</td>
                    <td>{user.enabled ? 'Aktiv' : 'Inaktiv'}</td>
                    <td>
                      <button 
                        className="btn btn-sm btn-outline-primary me-2"
                        onClick={() => router.push(`/config/customers/${id}/users/${user.id.id}/edit`)}
                      >
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button 
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleDelete(user.id.id)}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
} 