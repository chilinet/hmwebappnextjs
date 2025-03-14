import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    try {
      const TB_API_URL = process.env.THINGSBOARD_URL;
      
      const response = await fetch(`${TB_API_URL}/api/relation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Authorization': `Bearer ${session.tbToken}`
        },
        body: JSON.stringify(req.body)
      });

      if (!response.ok) {
        throw new Error('Failed to create relation');
      }

      return res.status(200).json({ message: 'Relation created successfully' });

    } catch (error) {
      console.error('Error creating relation:', error);
      return res.status(500).json({ error: 'Failed to create relation' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
} 