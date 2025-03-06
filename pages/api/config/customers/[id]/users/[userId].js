import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../auth/[...nextauth]";
import axios from 'axios';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ message: 'Nicht authentifiziert' });
  }

  const { id, userId } = req.query;

  try {
    const headers = { 'X-Authorization': `Bearer ${session.tbToken}` };
    const baseUrl = `${process.env.THINGSBOARD_URL}/api`;

    switch (req.method) {
      case 'GET':
        const response = await axios.get(
          `${baseUrl}/user/${userId}`,
          { headers }
        );
        return res.json(response.data);

      case 'PUT':
        const updatedUser = await axios.post( // ThingsBoard verwendet POST für Updates
          `${baseUrl}/user`,
          {
            ...req.body,
            id: {
              id: userId,
              entityType: 'USER'
            },
            customerId: {
              id: id,
              entityType: 'CUSTOMER'
            }
          },
          { headers }
        );
        return res.json(updatedUser.data);

      case 'DELETE':
        await axios.delete(
          `${baseUrl}/user/${userId}`,
          { headers }
        );
        return res.json({ message: 'Benutzer erfolgreich gelöscht' });

      default:
        return res.status(405).json({ message: 'Methode nicht erlaubt' });
    }
  } catch (error) {
    console.error('API Error:', error);
    console.error('Request URL:', error.config?.url);
    console.error('Response:', error.response?.data);
    return res.status(error.response?.status || 500).json({ 
      message: 'Fehler bei der Kommunikation mit ThingsBoard',
      error: error.response?.data || error.message 
    });
  }
} 