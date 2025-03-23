import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

const ThingsboardContext = createContext(null);

export function ThingsboardProvider({ children }) {
  const { data: session } = useSession();
  const [tbToken, setTbToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (session?.tbToken) {
      setTbToken(session.tbToken);
      
      // Token-Refresh-Timer
      const refreshTimer = setInterval(async () => {
        try {
          const response = await fetch('/api/auth/refresh-tb-token', {
            method: 'POST',
          });
          if (response.ok) {
            const data = await response.json();
            setTbToken(data.token);
          }
        } catch (error) {
          console.error('Failed to refresh token:', error);
        }
      }, 55 * 60 * 1000); // 55 Minuten

      setIsLoading(false);

      return () => clearInterval(refreshTimer);
    } else {
      setIsLoading(false);
    }
  }, [session]);

  const contextValue = {
    tbToken,
    isLoading
  };

  return (
    <ThingsboardContext.Provider value={contextValue}>
      {children}
    </ThingsboardContext.Provider>
  );
}

export function useThingsboard() {
  const context = useContext(ThingsboardContext);
  if (!context) {
    throw new Error('useThingsboard must be used within a ThingsboardProvider');
  }
  return context;
} 