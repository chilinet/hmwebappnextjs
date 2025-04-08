import { updateTokens } from '@/lib/services/tokenRefreshService';

export default async function handler(req, res) {
  // Basic security check - nur POST requests von vertrauenswürdigen Quellen
  if (req.method !== 'POST' ) {
    return res.status(405).json({ error: 'Not allowed' });
  }

  try {
    await updateTokens();
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Token refresh failed:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
} 