import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export function useThingsboardToken() {
  const { data: session } = useSession();
  const [tbToken, setTbToken] = useState(session?.tbToken);

  useEffect(() => {
    let timeoutId;

    async function refreshToken() {
      try {
        const response = await fetch('/api/auth/refresh-tb-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (response.ok) {
          const data = await response.json();
          setTbToken(data.token);
          // Setup next refresh
          timeoutId = setTimeout(refreshToken, 55 * 60 * 1000); // 55 Minuten
        } else {
          console.error('Failed to refresh ThingsBoard token');
        }
      } catch (error) {
        console.error('Error refreshing ThingsBoard token:', error);
      }
    }

    // Initial setup
    if (session?.tbToken) {
      setTbToken(session.tbToken);
      timeoutId = setTimeout(refreshToken, 55 * 60 * 1000); // 55 Minuten
    }

    // Cleanup
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [session]);

  return tbToken;
} 