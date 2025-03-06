import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faArrowLeft } from '@fortawesome/free-solid-svg-icons';

export default function EditUser() {
  const router = useRouter();
  const { id, userId } = router.query;
  const { data: session } = useSession({
    required: true,
    onUnauthenticated() {
      router.push('/auth/signin');
    },
  });

  const [userData, setUserData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    additionalInfo: {
      description: ''
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (id && userId) {
      fetchUserData();
    }
  }, [id, userId]);

  const fetchUserData = async () => {
    try {
      const response = await fetch(`/api/config/customers/${id}/users/${userId}`);
      if (!response.ok) throw new Error('Fehler beim Laden der Benutzerdaten');
      const data = await response.json();
      setUserData(data);
    } catch (error) {
      setError('Fehler beim Laden der Benutzerdaten');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/config/customers/${id}/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Fehler beim Speichern');
      }

      setSuccess('Benutzer erfolgreich aktualisiert');
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setUserData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value
        }
      }));
    } else {
      setUserData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  if (loading) {
    return <div className="text-center mt-5">Lade...</div>;
  }

  return (
    <div className="container mt-4">
      <div className="d-flex align-items-center mb-4">
        <button 
          className="btn btn-link text-white me-3"
          onClick={() => router.push(`/config/customers/${id}/users`)}
        >
          <FontAwesomeIcon icon={faArrowLeft} /> Zurück
        </button>
        <h2 className="mb-0 text-white">Benutzer bearbeiten</h2>
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

      <div className="card" style={{ backgroundColor: '#2C3E50' }}>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label text-white">E-Mail</label>
                <input
                  type="email"
                  className="form-control"
                  name="email"
                  value={userData.email}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label text-white">Vorname</label>
                <input
                  type="text"
                  className="form-control"
                  name="firstName"
                  value={userData.firstName}
                  onChange={handleChange}
                />
              </div>
            </div>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label text-white">Nachname</label>
                <input
                  type="text"
                  className="form-control"
                  name="lastName"
                  value={userData.lastName}
                  onChange={handleChange}
                />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label text-white">Beschreibung</label>
                <input
                  type="text"
                  className="form-control"
                  name="additionalInfo.description"
                  value={userData.additionalInfo.description}
                  onChange={handleChange}
                />
              </div>
            </div>
            <div className="d-flex justify-content-end">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                <FontAwesomeIcon icon={faSave} className="me-2" />
                {saving ? 'Speichert...' : 'Speichern'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 