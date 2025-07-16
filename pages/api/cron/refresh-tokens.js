import { 
  updateTokens, 
  checkTokenStatus, 
  startTokenRefreshCron, 
  stopTokenRefreshCron 
} from '../../../lib/services/tokenRefreshService';

let cronStarted = false;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // GET: Status abrufen
    try {
      const tokenStatus = await checkTokenStatus();
      
      return res.status(200).json({
        success: true,
        cron: {
          running: cronStarted,
          description: 'ThingsBoard Token Refresh (runs every minute)'
        },
        tokens: tokenStatus
      });
    } catch (error) {
      console.error('Error checking token status:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  if (req.method === 'POST') {
    // POST: Cron-Job starten oder Token manuell aktualisieren
    const { action } = req.body;
    
    try {
      switch (action) {
        case 'start':
          if (!cronStarted) {
            startTokenRefreshCron();
            cronStarted = true;
            return res.status(200).json({
              success: true,
              message: 'Token refresh cron job started',
              cron: {
                running: true,
                description: 'ThingsBoard Token Refresh (runs every minute)'
              }
            });
          } else {
            return res.status(200).json({
              success: true,
              message: 'Token refresh cron job is already running',
              cron: {
                running: true,
                description: 'ThingsBoard Token Refresh (runs every minute)'
              }
            });
          }
          
        case 'stop':
          if (cronStarted) {
            stopTokenRefreshCron();
            cronStarted = false;
            return res.status(200).json({
              success: true,
              message: 'Token refresh cron job stopped',
              cron: {
                running: false,
                description: 'ThingsBoard Token Refresh (runs every minute)'
              }
            });
          } else {
            return res.status(200).json({
              success: true,
              message: 'Token refresh cron job is not running',
              cron: {
                running: false,
                description: 'ThingsBoard Token Refresh (runs every minute)'
              }
            });
          }
          
        case 'refresh':
          // Manueller Token-Refresh
          const result = await updateTokens();
          return res.status(200).json({
            success: true,
            message: 'Manual token refresh completed',
            result: result
          });
          
        case 'status':
          // Nur Status abrufen
          const tokenStatus = await checkTokenStatus();
          return res.status(200).json({
            success: true,
            cron: {
              running: cronStarted,
              description: 'ThingsBoard Token Refresh (runs every minute)'
            },
            tokens: tokenStatus
          });
          
        default:
          return res.status(400).json({
            success: false,
            error: 'Invalid action. Use: start, stop, refresh, or status'
          });
      }
    } catch (error) {
      console.error('Error in token refresh API:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  return res.status(405).json({
    success: false,
    error: 'Method not allowed. Use GET or POST'
  });
} 