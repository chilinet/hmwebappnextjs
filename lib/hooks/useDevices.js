import { useQuery } from '@tanstack/react-query';

async function fetchDevices(token) {
  const response = await fetch('/api/config/devices', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  if (!response.ok) {
    throw new Error('Failed to fetch devices');
  }
  return response.json();
}

export function useDevices(token) {
  return useQuery({
    queryKey: ['devices'],
    queryFn: () => fetchDevices(token),
    staleTime: 0, // Daten sofort als veraltet markieren
    cacheTime: 0, // Cache deaktivieren für Testzwecke
    refetchOnMount: true, // Bei jedem Mount neu laden
    refetchOnWindowFocus: true, // Bei Fokuswechsel neu laden
    enabled: !!token,
  });
} 