 import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEdit, faTrash, faArrowLeft } from '@fortawesome/free-solid-svg-icons';

export default function Customers() {
  const router = useRouter();
  const { data: session } = useSession({
    required: true,
    onUnauthenticated() {
      router.push('/auth/signin');
    },
  });

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/thingsboard/customers');
      if (!response.ok) throw new Error('Fehler beim Laden der Kunden');
      const data = await response.json();
      setCustomers(data.data || []);
    } catch (error) {
      setError('Fehler beim Laden der Kunden');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (customerId) => {
    if (!window.confirm('Möchten Sie diesen Kunden wirklich löschen?')) return;

    try {
      const response = await fetch(`/api/thingsboard/customers?customerId=${customerId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Fehler beim Löschen des Kunden');
      fetchCustomers(); // Liste neu laden
    } catch (error) {
      setError('Fehler beim Löschen des Kunden');
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
            onClick={() => router.push('/config')}
          >
            <FontAwesomeIcon icon={faArrowLeft} /> Zurück
          </button>
          <h2 className="mb-0 text-white">Kundenverwaltung</h2>
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => router.push('/config/customers/new')}
        >
          <FontAwesomeIcon icon={faPlus} className="me-2" />
          Neuer Kunde
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
                  <th>Adresse</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(customer => (
                  <tr key={customer.id.id}>
                    <td>{customer.title}</td>
                    <td>{customer.email}</td>
                    <td>{customer.address}</td>
                    <td>
                      <button 
                        className="btn btn-sm btn-outline-primary me-2"
                        onClick={() => router.push(`/config/customers/${customer.id.id}`)}
                      >
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button 
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleDelete(customer.id.id)}
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