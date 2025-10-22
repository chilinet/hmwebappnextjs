import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    
    if (!session?.user?.customerid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { alarmId, solution, customer_id } = req.body;

    if (!alarmId || !solution?.trim()) {
      return res.status(400).json({ error: 'Alarm ID and solution are required' });
    }

    if (customer_id !== session.user.customerid) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const thingsboardUrl = process.env.THINGSBOARD_URL;
    const tbToken = session.tbToken;

    if (!thingsboardUrl || !tbToken) {
      return res.status(500).json({ error: 'ThingsBoard configuration missing' });
    }

    // Acknowledge alarm with solution
    const response = await fetch(`${thingsboardUrl}/api/alarm/${alarmId}/ack`, {
      method: 'POST',
      headers: {
        'X-Authorization': `Bearer ${tbToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        comment: solution.trim()
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to acknowledge alarm ${alarmId}:`, response.status, errorText);
      return res.status(response.status).json({ 
        error: 'Failed to acknowledge alarm',
        details: errorText 
      });
    }

    const result = await response.json();

    return res.status(200).json({
      success: true,
      message: 'Alarm successfully acknowledged',
      alarmId: alarmId,
      solution: solution.trim(),
      result: result
    });

  } catch (error) {
    console.error('Acknowledge error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
