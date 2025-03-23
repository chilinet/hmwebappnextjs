import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const { id } = req.query;

  try {
    if (req.method === 'PUT') {
      // Validierung für das Prefix
      const prefix = req.body.prefix;
      if (prefix && (prefix.length > 10 || !/^[A-Z]*$/.test(prefix))) {
        return res.status(400).json({
          message: 'Prefix muss aus maximal 10 Großbuchstaben bestehen'
        });
      }

      const customerData = {
        ...req.body,
        id: {
          entityType: "CUSTOMER",
          id: id
        }
      };

      //console.log('+++++++++++++++++++++++++++++++++++++++++');
      //console.log('Customer Data:', customerData);
      //console.log('+++++++++++++++++++++++++++++++++++++++++'); 
      let urlpost = `${process.env.THINGSBOARD_URL}/api/customer`;
      const response = await fetch(urlpost, {
        method: 'POST', // ThingsBoard verwendet POST für Updates
        headers: {
          'Content-Type': 'application/json',
          'X-Authorization': `Bearer ${session.tbToken}`
        },
        body: JSON.stringify(customerData)
      });

      if (!response.ok) {
        throw new Error(`ThingsBoard API error: ${response.status}`);
      }

      const data = await response.json();
      return res.status(200).json({ data });
    }

    // GET Request
    if (req.method === 'GET') {
      let url = `${process.env.THINGSBOARD_URL}/api/customer/${id}`;
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'X-Authorization': `Bearer ${session.tbToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`ThingsBoard API error: ${response.status}`);
      }

      const data = await response.json();
      return res.status(200).json({ data });
    }

    // Methode nicht erlaubt
    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);

  } catch (error) {
    console.error('Error handling customer:', error);
    res.status(500).json({ message: 'Failed to handle customer request' });
  }
} 