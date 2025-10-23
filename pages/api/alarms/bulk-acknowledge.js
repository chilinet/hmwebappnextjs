import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { makeThingsBoardRequest } from "../../../lib/utils/thingsboardRequest";


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    
    if (!session?.user?.customerid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { alarmIds, customer_id } = req.body;

    if (!alarmIds || !Array.isArray(alarmIds) || alarmIds.length === 0) {
      return res.status(400).json({ error: 'Alarm IDs are required' });
    }

    if (customer_id !== session.user.customerid) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const thingsboardUrl = process.env.THINGSBOARD_URL;
    const tbToken = session.tbToken;

    if (!thingsboardUrl || !tbToken) {
      return res.status(500).json({ error: 'ThingsBoard configuration missing' });
    }

    // Bulk acknowledge alarms
    const acknowledgePromises = alarmIds.map(async (alarmId) => {
      try {
        const response = await makeThingsBoardRequest(`${thingsboardUrl}/api/alarm/${alarmId}/ack`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        }, customer_id);

        if (!response.ok) {
          console.error(`Failed to acknowledge alarm ${alarmId}:`, response.status);
          return { alarmId, success: false, error: response.status };
        }

        return { alarmId, success: true };
      } catch (error) {
        console.error(`Error acknowledging alarm ${alarmId}:`, error);
        return { alarmId, success: false, error: error.message };
      }
    });

    const results = await Promise.all(acknowledgePromises);
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    return res.status(200).json({
      success: true,
      message: `Bulk acknowledgement completed`,
      results: {
        total: alarmIds.length,
        successful: successful.length,
        failed: failed.length,
        details: results
      }
    });

  } catch (error) {
    console.error('Bulk acknowledge error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
