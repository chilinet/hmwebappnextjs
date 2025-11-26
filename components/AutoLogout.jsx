import { useAutoLogout } from '../lib/hooks/useAutoLogout';
import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle, faTimes } from '@fortawesome/free-solid-svg-icons';

/**
 * Component für automatische Abmeldung nach Inaktivität
 * Wird in _app.js verwendet, um die Inaktivitätsüberwachung zu aktivieren
 */
export default function AutoLogout() {
  const { showWarning, remainingMinutes } = useAutoLogout();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (showWarning) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [showWarning]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="position-fixed top-0 start-0 end-0 bg-warning text-dark p-3 shadow-lg"
      style={{
        zIndex: 9999,
        animation: 'slideDown 0.3s ease-out'
      }}
    >
      <div className="container d-flex justify-content-between align-items-center">
        <div className="d-flex align-items-center">
          <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" size="lg" />
          <div>
            <strong>Warnung: Automatische Abmeldung</strong>
            <br />
            <small>
              Sie werden in {remainingMinutes} Minute{remainingMinutes !== 1 ? 'n' : ''} automatisch abgemeldet, 
              wenn keine Aktivität erkannt wird.
            </small>
          </div>
        </div>
        <button
          className="btn btn-sm btn-outline-dark"
          onClick={() => setIsVisible(false)}
          aria-label="Warnung schließen"
        >
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>
      <style jsx>{`
        @keyframes slideDown {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

