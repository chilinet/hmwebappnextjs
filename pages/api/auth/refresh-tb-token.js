import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // ThingsBoard Login durchführen
    const tbResponse = await fetch(
      `${process.env.THINGSBOARD_URL}/api/auth/login`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: session.email,
          password: session.tbPassword // Muss im Session-Objekt verfügbar sein
        }),
      }
    );

    if (!tbResponse.ok) {
      throw new Error('ThingsBoard login failed');
    }

    const tbData = await tbResponse.json();
    
    return res.status(200).json({ token: tbData.token });
  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(500).json({ message: 'Failed to refresh token' });
  }
} 