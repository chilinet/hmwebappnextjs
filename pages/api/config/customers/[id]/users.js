import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import axios from 'axios';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ message: 'Nicht authentifiziert' });
  }

  const { id } = req.query;

  try {
    const headers = { 'X-Authorization': `Bearer ${session.tbToken}` };
    const baseUrl = `${process.env.THINGSBOARD_URL}/api`;

    switch (req.method) {
      case 'GET':
        const response = await axios.get(
          `${baseUrl}/customer/${id}/users?pageSize=100&page=0`,
          { headers }
        );
        return res.json(response.data);

      default:
        return res.status(405).json({ message: 'Methode nicht erlaubt' });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      message: 'Fehler bei der Kommunikation mit ThingsBoard',
      error: error.response?.data || error.message 
    });
  }
} 