import { useRouter } from 'next/router';
import { useSession, getSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync, faArrowLeft } from '@fortawesome/free-solid-svg-icons';

export default function Processes() {
  const router = useRouter();
  const { data: session } = useSession({
    required: true,
    onUnauthenticated() {
      router.push('/auth/signin');
    },
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [customerData, setCustomerData] = useState(null);

  useEffect(() => {
    if (session?.token) {
      fetchUserData();
    }
  }, [session]);

  const fetchUserData = async () => {
    try {
      const response = await fetch('/api/config/users/me', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }

      const data = await response.json();
      setCustomerData(data);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError('Fehler beim Laden der Benutzerdaten');
    }
  };

  const syncTree = async () => {
    if (!customerData?.customerid) {
      setError('Keine Customer ID verfügbar');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/config/customers/tree/${customerData.customerid}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Fehler beim Synchronisieren des Baums');
      }

      const data = await response.json();
      setSuccess('Baum erfolgreich synchronisiert');
      console.log('Sync response:', data);
    } catch (error) {
      console.error('Sync error:', error);
      setError(error.message || 'Fehler beim Synchronisieren');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-4">
      <div className="card bg-dark text-white">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <div className="d-flex align-items-center">
              <button 
                className="btn btn-outline-light me-3"
                onClick={() => router.push('/config')}
              >
                <FontAwesomeIcon icon={faArrowLeft} />
              </button>
              <h2 className="mb-0">Prozesse</h2>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          {success && (
            <div className="alert alert-success" role="alert">
              {success}
            </div>
          )}

          <div className="card mb-3 bg-secondary">
            <div className="card-body">
              <h5 className="card-title">Asset-Baum Synchronisation</h5>
              <p className="card-text">
                Synchronisiert den Asset-Baum mit ThingsBoard.
              </p>
              <button 
                className="btn btn-warning" 
                onClick={syncTree}
                disabled={loading}
              >
                <FontAwesomeIcon icon={faSync} className={`me-2 ${loading ? 'fa-spin' : ''}`} />
                {loading ? 'Synchronisiere...' : 'Synchronisieren'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export async function getServerSideProps(context) {
  const session = await getSession(context);

  if (!session) {
    return {
      redirect: {
        destination: '/auth/signin',
        permanent: false,
      },
    };
  }

  return {
    props: {}
  };
} 