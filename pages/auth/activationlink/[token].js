import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import Image from 'next/image';

export default function ActivateAccount() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Warte bis der Router bereit ist
  useEffect(() => {
    if (!router.isReady) return;
    
    // Prüfe ob Token vorhanden ist
    if (!router.query.token) {
      setError('Ungültiger Aktivierungslink - Token fehlt');
    }
  }, [router.isReady, router.query.token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validierung: Token vorhanden?
    if (!router.query.token || typeof router.query.token !== 'string' || router.query.token.trim().length === 0) {
      setError('Ungültiger Aktivierungslink - Token fehlt');
      setLoading(false);
      return;
    }

    // Validierung: Passwort
    if (formData.password.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein');
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Die Passwörter stimmen nicht überein');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: router.query.token.trim(),
          password: formData.password,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Fehler bei der Aktivierung');
      }

      // Erfolgreich aktiviert - Weiterleitung zur Login-Seite
      router.push('/auth/signin?activated=true');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-md-6 col-lg-4">
            <div className="card bg-white text-dark border">
              <div className="card-body">
                <div className="text-center mb-4">
                  <Image
                    src="/assets/img/heatmanager-logo.png"
                    alt="Logo"
                    width={320}
                    height={40}
                  />
                </div>
                <h4 className="text-center mb-4 text-dark">Account aktivieren</h4>
                {error && (
                  <div className="alert alert-danger" role="alert">
                    {error}
                  </div>
                )}
                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label className="form-label text-dark">Neues Passwort</label>
                    <div className="input-group">
                      <input
                        type={showPassword ? "text" : "password"}
                        className="form-control bg-white text-dark"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        required
                      />
                      <button
                        className="btn btn-outline-secondary"
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                      </button>
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="form-label text-dark">Passwort bestätigen</label>
                    <div className="input-group">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        className="form-control bg-white text-dark"
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        required
                      />
                      <button
                        className="btn btn-outline-secondary"
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        <FontAwesomeIcon icon={showConfirmPassword ? faEyeSlash : faEye} />
                      </button>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary w-100"
                    disabled={loading}
                  >
                    {loading ? 'Aktiviere...' : 'Account aktivieren'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .form-control {
          border-color: #ced4da;
        }
        .form-control:focus {
          background-color: #fff;
          border-color: #80bdff;
          color: #000;
          box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
        }
        .btn-outline-secondary {
          color: #6c757d;
          border-color: #6c757d;
        }
        .btn-outline-secondary:hover {
          background-color: #6c757d;
          color: #fff;
        }
        .card {
          box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
        }
      `}</style>
    </div>
  );
}

// Deaktiviere das Standard-Layout für diese Seite
ActivateAccount.getLayout = function getLayout(page) {
  return page;
}; 