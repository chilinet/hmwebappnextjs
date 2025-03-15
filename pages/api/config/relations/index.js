import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (req.method === 'POST') {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const { fromId, fromType, toId, toType, relationType } = req.body;

    if (!fromId || !fromType || !toId || !toType || !relationType) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
      // Erstelle die Relation in ThingsBoard
      const response = await fetch(
        `${process.env.THINGSBOARD_URL}/api/relation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${session.tbToken}`
          },
          body: JSON.stringify({
            from: {
              entityType: fromType,
              id: fromId
            },
            to: {
              entityType: toType,
              id: toId
            },
            type: relationType,
            typeGroup: "COMMON"
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ThingsBoard API error:', errorText);
        throw new Error('Failed to create relation in ThingsBoard');
      }

      return res.status(200).json({ 
        success: true,
        message: 'Relation created successfully' 
      });

    } catch (error) {
      console.error('Error creating relation:', error);
      return res.status(500).json({ 
        message: 'Error creating relation',
        error: error.message 
      });
    }
  } 
  else if (req.method === 'DELETE') {
    const { fromId, fromType, toId, toType, relationType } = req.body;

    if (!fromId || !fromType || !toId || !toType || !relationType) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
      // Lösche die Relation in ThingsBoard
      const response = await fetch(
        `${process.env.THINGSBOARD_URL}/api/relation?fromId=${fromId}&fromType=${fromType}&toId=${toId}&toType=${toType}&relationType=${relationType}`,
        {
          method: 'DELETE',
          headers: {
            'X-Authorization': `Bearer ${session.tbToken}`
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ThingsBoard API error:', errorText);
        throw new Error('Failed to delete relation in ThingsBoard');
      }

      return res.status(200).json({ 
        success: true,
        message: 'Relation deleted successfully' 
      });

    } catch (error) {
      console.error('Error deleting relation:', error);
      return res.status(500).json({ 
        message: 'Error deleting relation',
        error: error.message 
      });
    }
  }
  else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
} 