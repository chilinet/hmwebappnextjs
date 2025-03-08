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
  }, [router.isReady]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validierung
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
          token: router.query.token,
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
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-dark">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-md-6 col-lg-4">
            <div className="card bg-dark text-white border-secondary">
              <div className="card-body">
                <div className="text-center mb-4">
                  <Image
                    src="/assets/img/heatmanager-logo.png"
                    alt="Logo"
                    width={320}
                    height={40}
                  />
                </div>
                <h4 className="text-center mb-4">Account aktivieren</h4>
                {error && (
                  <div className="alert alert-danger" role="alert">
                    {error}
                  </div>
                )}
                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label className="form-label">Neues Passwort</label>
                    <div className="input-group">
                      <input
                        type={showPassword ? "text" : "password"}
                        className="form-control bg-dark text-white"
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
                    <label className="form-label">Passwort bestätigen</label>
                    <div className="input-group">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        className="form-control bg-dark text-white"
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
          border-color: #6c757d;
        }
        .form-control:focus {
          background-color: #343a40;
          border-color: #6c757d;
          color: white;
          box-shadow: none;
        }
        .btn-outline-secondary {
          color: #6c757d;
          border-color: #6c757d;
        }
        .btn-outline-secondary:hover {
          background-color: #6c757d;
          color: white;
        }
      `}</style>
    </div>
  );
}

// Deaktiviere das Standard-Layout für diese Seite
ActivateAccount.getLayout = function getLayout(page) {
  return page;
}; 