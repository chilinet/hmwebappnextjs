import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';

export default function ResetPassword() {
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenChecking, setTokenChecking] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentToken, setCurrentToken] = useState('');

  // Token aus URL extrahieren
  useEffect(() => {
    if (router.isReady) {
      // Prüfe Query-Parameter (?token=...)
      const queryToken = router.query.token;
      
      if (queryToken) {
        setCurrentToken(queryToken);
        // Fehler sofort zurücksetzen, wenn Token gefunden wird
        setError('');
        validateToken(queryToken);
      } else {
        setTokenChecking(false);
        setTokenValid(false);
        setError('Kein Token in der URL gefunden. Bitte überprüfen Sie den Link in Ihrer E-Mail.');
      }
    }
  }, [router.isReady, router.query.token]);

  const validateToken = async (token) => {
    if (!token) return;
    
    setTokenChecking(true);
    setError(''); // Fehler zurücksetzen beim Validieren
    
    try {
      const response = await fetch('/api/auth/validate-reset-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const result = await response.json();
      
      if (result.success) {
        setTokenValid(true);
        setError(''); // Fehler explizit löschen
      } else {
        setTokenValid(false);
        setError(result.message || 'Token ist ungültig oder abgelaufen');
      }
    } catch (error) {
      setTokenValid(false);
      setError('Fehler bei der Token-Validierung');
    } finally {
      setTokenChecking(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwörter stimmen nicht überein');
      return;
    }

    if (formData.password.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen lang sein');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: currentToken,
          password: formData.password
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('Passwort wurde erfolgreich zurückgesetzt! Sie werden in 3 Sekunden zur Anmeldeseite weitergeleitet.');
        setTimeout(() => {
          router.push('/auth/signin');
        }, 3000);
      } else {
        setError(result.message || 'Fehler beim Zurücksetzen des Passworts');
      }
    } catch (error) {
      setError('Fehler beim Zurücksetzen des Passworts');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // Fehler löschen, wenn der Benutzer tippt
    if (error) setError('');
  };

  if (tokenChecking) {
    return (
      <>
        <Head>
          <title>Passwort zurücksetzen - HeatManager</title>
        </Head>
        
        <div className="signin-page light-theme">
          <div className="signin-card">
            <div className="card-body text-center">
              <div className="signin-logo">
                <Image
                  src="/assets/img/heatmanager-logo.png"
                  alt="HeatManager Logo"
                  width={280}
                  height={35}
                  priority
                />
              </div>
              
              <h4 className="text-center mb-4">Token wird überprüft...</h4>
              
              <div className="d-flex justify-content-center">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Lädt...</span>
                </div>
              </div>
              
              <p className="mt-4 text-muted">
                Bitte warten Sie, während wir Ihren Token überprüfen...
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!tokenValid) {
    return (
      <>
        <Head>
          <title>Ungültiger Token - HeatManager</title>
        </Head>
        
        <div className="signin-page light-theme">
          <div className="signin-card">
            <div className="card-body text-center">
              <div className="signin-logo">
                <Image
                  src="/assets/img/heatmanager-logo.png"
                  alt="HeatManager Logo"
                  width={280}
                  height={35}
                  priority
                />
              </div>
              
              <div className="alert alert-danger" role="alert">
                <h5 className="alert-heading">Token ungültig oder abgelaufen</h5>
                <p className="mb-0">{error}</p>
              </div>
              
              <div className="mt-4">
                <button
                  onClick={() => router.push('/auth/signin')}
                  className="btn btn-primary w-100 mb-2"
                >
                  Zurück zur Anmeldung
                </button>
                <button
                  onClick={() => router.push('/auth/signin?forgot=1')}
                  className="btn btn-secondary w-100"
                >
                  Neuen Reset-Link anfordern
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (success) {
    return (
      <>
        <Head>
          <title>Passwort zurückgesetzt - HeatManager</title>
        </Head>
        
        <div className="signin-page light-theme">
          <div className="signin-card">
            <div className="card-body text-center">
              <div className="signin-logo">
                <Image
                  src="/assets/img/heatmanager-logo.png"
                  alt="HeatManager Logo"
                  width={280}
                  height={35}
                  priority
                />
              </div>
              
              <div className="alert alert-success" role="alert">
                <h4>Passwort erfolgreich zurückgesetzt!</h4>
                <p className="mb-0">{success}</p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Neues Passwort setzen - HeatManager</title>
        <meta name="description" content="Neues Passwort für HeatManager setzen" />
      </Head>
      
      <div className="signin-page light-theme">
        <div className="signin-card">
          <div className="card-body">
            <div className="signin-logo">
              <Image
                src="/assets/img/heatmanager-logo.png"
                alt="HeatManager Logo"
                width={280}
                height={35}
                priority
              />
            </div>
            
            <h4 className="text-center mb-4">Neues Passwort setzen</h4>
            
            {error && (
              <div className="alert alert-danger" role="alert">
                <strong>Fehler:</strong> {error}
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="signin-form">
              <div className="mb-3">
                <label className="form-label">Neues Passwort</label>
                <input
                  type="password"
                  className="form-control"
                  value={formData.password}
                  onChange={handleInputChange}
                  name="password"
                  required
                  disabled={loading}
                  placeholder="Neues Passwort eingeben"
                  minLength="8"
                />
                <small className="text-muted">Mindestens 8 Zeichen</small>
              </div>
              
              <div className="mb-4">
                <label className="form-label">Passwort bestätigen</label>
                <input
                  type="password"
                  className="form-control"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  name="confirmPassword"
                  required
                  disabled={loading}
                  placeholder="Passwort wiederholen"
                  minLength="8"
                />
              </div>
              
              <button 
                type="submit" 
                className="btn btn-primary w-100"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Passwort wird gesetzt...
                  </>
                ) : (
                  'Passwort ändern'
                )}
              </button>
            </form>
            
            <div className="mt-4 text-center">
              <Link href="/auth/signin" className="text-decoration-none">
                Zurück zur Anmeldung
              </Link>
            </div>
            
            <div className="mt-4 text-center">
              <small className="text-muted">
                HeatManager - Intelligente Heizungssteuerung
              </small>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Deaktiviere das Standard-Layout für diese Seite
ResetPassword.getLayout = function getLayout(page) {
  return page;
};
