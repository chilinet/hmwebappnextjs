import { useState, useEffect } from 'react';
import { useSession, getSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faKey, faArrowLeft } from '@fortawesome/free-solid-svg-icons';

export default function EditUser() {
  const router = useRouter();
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push('/auth/signin');
    },
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [userData, setUserData] = useState({
    username: '',
    firstname: '',
    lastname: '',
    email: ''
  });

  // Lade Benutzerdaten beim ersten Render
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await fetch(`/api/user/${session.user.id}`);
        const data = await response.json();
        setUserData(data);
      } catch (error) {
        setError('Fehler beim Laden der Benutzerdaten');
      }
    };

    if (session?.user?.id) {
      fetchUserData();
    }
  }, [session]);

  const handleChange = (e) => {
    setUserData({
      ...userData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/user/${session.user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (response.ok) {
        setSuccess('Benutzerdaten erfolgreich aktualisiert');
      } else {
        const data = await response.json();
        setError(data.message || 'Fehler beim Aktualisieren der Daten');
      }
    } catch (error) {
      setError('Ein Fehler ist aufgetreten');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mt-4">
      <div className="d-flex align-items-center mb-4">
        <button 
          className="btn btn-link text-white me-3" 
          onClick={() => router.back()}
        >
          <FontAwesomeIcon icon={faArrowLeft} /> Zurück
        </button>
        <h2 className="mb-0 text-white">Benutzerdaten bearbeiten</h2>
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
                <label htmlFor="username" className="form-label text-white">
                  Benutzername
                </label>
                <input
                  type="text"
                  className="form-control"
                  id="username"
                  name="username"
                  value={userData.username}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="col-md-6 mb-3">
                <label htmlFor="email" className="form-label text-white">
                  E-Mail
                </label>
                <input
                  type="email"
                  className="form-control"
                  id="email"
                  name="email"
                  value={userData.email}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label htmlFor="firstname" className="form-label text-white">
                  Vorname
                </label>
                <input
                  type="text"
                  className="form-control"
                  id="firstname"
                  name="firstname"
                  value={userData.firstname}
                  onChange={handleChange}
                />
              </div>
              <div className="col-md-6 mb-3">
                <label htmlFor="lastname" className="form-label text-white">
                  Nachname
                </label>
                <input
                  type="text"
                  className="form-control"
                  id="lastname"
                  name="lastname"
                  value={userData.lastname}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="d-flex justify-content-between mt-4">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowPasswordModal(true)}
              >
                <FontAwesomeIcon icon={faKey} className="me-2" />
                Passwort ändern
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isLoading}
              >
                <FontAwesomeIcon icon={faSave} className="me-2" />
                {isLoading ? 'Speichert...' : 'Speichern'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content" style={{ backgroundColor: '#2C3E50' }}>
              <div className="modal-header border-0">
                <h5 className="modal-title text-white">Passwort ändern</h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowPasswordModal(false)}
                />
              </div>
              <PasswordChangeForm userId={session.user.id} onClose={() => setShowPasswordModal(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PasswordChangeForm({ userId, onClose }) {
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e) => {
    setPasswords({
      ...passwords,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (passwords.newPassword !== passwords.confirmPassword) {
      setError('Die neuen Passwörter stimmen nicht überein');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/user/${userId}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword
        }),
      });

      if (response.ok) {
        onClose();
      } else {
        const data = await response.json();
        setError(data.message || 'Fehler beim Ändern des Passworts');
      }
    } catch (error) {
      setError('Ein Fehler ist aufgetreten');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="modal-body">
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}
        <div className="mb-3">
          <label htmlFor="currentPassword" className="form-label text-white">
            Aktuelles Passwort
          </label>
          <input
            type="password"
            className="form-control"
            id="currentPassword"
            name="currentPassword"
            value={passwords.currentPassword}
            onChange={handleChange}
            required
          />
        </div>
        <div className="mb-3">
          <label htmlFor="newPassword" className="form-label text-white">
            Neues Passwort
          </label>
          <input
            type="password"
            className="form-control"
            id="newPassword"
            name="newPassword"
            value={passwords.newPassword}
            onChange={handleChange}
            required
          />
        </div>
        <div className="mb-3">
          <label htmlFor="confirmPassword" className="form-label text-white">
            Neues Passwort bestätigen
          </label>
          <input
            type="password"
            className="form-control"
            id="confirmPassword"
            name="confirmPassword"
            value={passwords.confirmPassword}
            onChange={handleChange}
            required
          />
        </div>
      </div>
      <div className="modal-footer border-0">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onClose}
        >
          Abbrechen
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isLoading}
        >
          {isLoading ? 'Speichert...' : 'Passwort ändern'}
        </button>
      </div>
    </form>
  );
}

// Server-side Überprüfung der Authentifizierung
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