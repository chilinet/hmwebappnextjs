import { useEffect, useRef, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';

const INACTIVITY_TIMEOUT = 20 * 60 * 1000; // 20 Minuten in Millisekunden
const WARNING_TIME = 2 * 60 * 1000; // 2 Minuten vor Abmeldung warnen

/**
 * Hook für automatische Abmeldung nach Inaktivität
 * Überwacht User-Interaktionen und meldet nach 20 Minuten Inaktivität automatisch ab
 * @returns {object} { showWarning, remainingMinutes } - Warnung und verbleibende Minuten
 */
export function useAutoLogout() {
  const { data: session } = useSession();
  const router = useRouter();
  const timeoutRef = useRef(null);
  const warningTimeoutRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const [showWarning, setShowWarning] = useState(false);
  const [remainingMinutes, setRemainingMinutes] = useState(0);

  useEffect(() => {
    // Nur aktivieren, wenn der Benutzer eingeloggt ist
    if (!session) {
      return;
    }

    // Ignoriere Auth-Seiten
    if (router.pathname.startsWith('/auth/')) {
      return;
    }

    // Funktion zum Zurücksetzen des Timers
    const resetTimer = () => {
      lastActivityRef.current = Date.now();
      
      // Warnung ausblenden
      setShowWarning(false);
      
      // Alte Timer löschen
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }

      // Warnung nach (INACTIVITY_TIMEOUT - WARNING_TIME) setzen
      warningTimeoutRef.current = setTimeout(() => {
        setShowWarning(true);
        setRemainingMinutes(Math.ceil(WARNING_TIME / 60000)); // Minuten
        
        // Countdown aktualisieren
        const countdownInterval = setInterval(() => {
          const timeSinceLastActivity = Date.now() - lastActivityRef.current;
          const remaining = Math.max(0, INACTIVITY_TIMEOUT - timeSinceLastActivity);
          const minutes = Math.ceil(remaining / 60000);
          
          setRemainingMinutes(minutes);
          
          if (remaining <= 0) {
            clearInterval(countdownInterval);
          }
        }, 1000); // Jede Sekunde aktualisieren
        
        // Countdown stoppen, wenn Timer zurückgesetzt wird
        setTimeout(() => clearInterval(countdownInterval), WARNING_TIME);
      }, INACTIVITY_TIMEOUT - WARNING_TIME);

      // Neuen Timer für Abmeldung setzen
      timeoutRef.current = setTimeout(() => {
        const timeSinceLastActivity = Date.now() - lastActivityRef.current;
        
        // Prüfe, ob wirklich 20 Minuten vergangen sind
        if (timeSinceLastActivity >= INACTIVITY_TIMEOUT) {
          console.log('Automatische Abmeldung nach 20 Minuten Inaktivität');
          
          // Automatische Abmeldung
          signOut({ 
            callbackUrl: '/auth/signin',
            redirect: true 
          });
        }
      }, INACTIVITY_TIMEOUT);
    };

    // Event-Handler für User-Interaktionen
    const handleActivity = () => {
      resetTimer();
    };

    // Verschiedene Events überwachen
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
      'keydown'
    ];

    // Event-Listener hinzufügen
    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Initialen Timer setzen
    resetTimer();

    // Cleanup
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, [session, router.pathname]);

  return { showWarning, remainingMinutes };
}

