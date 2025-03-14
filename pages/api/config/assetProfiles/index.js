import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const TB_API_URL = process.env.THINGSBOARD_URL;
    
    const response = await fetch(`${TB_API_URL}/api/assetProfiles?pageSize=100&page=0`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Authorization': `Bearer ${session.tbToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Error fetching asset profiles: ${response.statusText}`);
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Error in asset profiles API:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch asset profiles',
      details: error.message 
    });
  }
} 