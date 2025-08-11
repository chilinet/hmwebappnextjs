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

    // Get user data from database to get ThingsBoard credentials
    const userResponse = await fetch(`${process.env.NEXTAUTH_URL}/api/config/users/me`, {
      headers: {
        'Authorization': `Bearer ${session.token}`
      }
    });

    if (!userResponse.ok) {
      throw new Error('Failed to get user data');
    }

    const userData = await userResponse.json();
    
    // ThingsBoard Login durchführen
    const tbResponse = await fetch(
      `${process.env.THINGSBOARD_URL}/api/auth/login`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: userData.tb_username,
          password: userData.tb_password
        }),
      }
    );

    if (!tbResponse.ok) {
      throw new Error('ThingsBoard login failed');
    }

    const tbData = await tbResponse.json();
    
    return res.status(200).json({ 
      success: true,
      message: 'Token refreshed successfully',
      token: tbData.token 
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(500).json({ message: 'Failed to refresh token' });
  }
} 