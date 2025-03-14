import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Asset ID is required' });
  }

  const TB_API_URL = process.env.THINGSBOARD_URL;

  switch (req.method) {
    case 'GET':
      try {
        const response = await fetch(`${TB_API_URL}/api/asset/${id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${session.tbToken}`
          }
        });

        if (!response.ok) {
          throw new Error(`Error fetching asset details: ${response.statusText}`);
        }

        const assetData = await response.json();
        return res.status(200).json({
          id: assetData.id.id,
          name: assetData.name,
          type: assetData.type,
          label: assetData.label,
          additionalInfo: assetData.additionalInfo,
          createdTime: assetData.createdTime,
          attributes: assetData.attributes || {}
        });
      } catch (error) {
        console.error('Error in asset details API:', error);
        return res.status(500).json({ 
          error: 'Failed to fetch asset details',
          details: error.message 
        });
      }

    case 'PUT':
      try {
        // Aktuelle Asset-Daten abrufen
        const getResponse = await fetch(`${TB_API_URL}/api/asset/${id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${session.tbToken}`
          }
        });

        if (!getResponse.ok) {
          throw new Error(`Error fetching current asset: ${getResponse.statusText}`);
        }

        const currentAsset = await getResponse.json();
        
        // Aktualisierte Daten vorbereiten
        const updatedAsset = {
          ...currentAsset,
          name: req.body.name,
          type: req.body.type,
          label: req.body.label
        };

        // Asset in Thingsboard aktualisieren
        const updateResponse = await fetch(`${TB_API_URL}/api/asset`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${session.tbToken}`
          },
          body: JSON.stringify(updatedAsset)
        });

        if (!updateResponse.ok) {
          throw new Error(`Error updating asset: ${updateResponse.statusText}`);
        }

        const updatedData = await updateResponse.json();
        return res.status(200).json({
          id: updatedData.id.id,
          name: updatedData.name,
          type: updatedData.type,
          label: updatedData.label,
          additionalInfo: updatedData.additionalInfo,
          createdTime: updatedData.createdTime,
          attributes: updatedData.attributes || {}
        });

      } catch (error) {
        console.error('Error updating asset:', error);
        return res.status(500).json({ 
          error: 'Failed to update asset',
          details: error.message 
        });
      }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
} 