import { getConnection } from '../../../lib/db';
import sql from 'mssql';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: 'Nur POST-Anfragen sind erlaubt'
    });
  }

  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Missing token',
        message: 'Token ist erforderlich'
      });
    }

    const pool = await getConnection();

    // Token in der Datenbank suchen
    const tokenResult = await pool.request()
      .input('resetToken', sql.VarChar, token)
      .query(`
        SELECT userid, username, email, resetToken, resetTokenExpiry, 
               DATEDIFF(MINUTE, GETDATE(), resetTokenExpiry) as minutesUntilExpiry
        FROM hm_users 
        WHERE resetToken = @resetToken
      `);

    if (tokenResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
        message: 'Token wurde in der Datenbank nicht gefunden',
        debug: {
          searchedToken: token,
          tokenLength: token.length,
          tokenFirstChars: token.substring(0, 10) + '...',
          tokenLastChars: '...' + token.substring(token.length - 10)
        }
      });
    }

    const user = tokenResult.recordset[0];
    const now = new Date();
    const tokenExpiry = new Date(user.resetTokenExpiry);
    const isExpired = now > tokenExpiry;
    
    return res.status(200).json({
      success: true,
      message: 'Token gefunden',
      tokenInfo: {
        userid: user.userid,
        username: user.username,
        email: user.email,
        tokenFound: true,
        tokenLength: user.resetToken.length,
        tokenFirstChars: user.resetToken.substring(0, 10) + '...',
        tokenLastChars: '...' + user.resetToken.substring(user.resetToken.length - 10),
        expiryDate: user.resetTokenExpiry,
        minutesUntilExpiry: user.minutesUntilExpiry,
        isExpired: isExpired,
        currentTime: now.toISOString(),
        expiryTime: tokenExpiry.toISOString()
      },
      searchInfo: {
        searchedToken: token,
        searchedTokenLength: token.length,
        searchedTokenFirstChars: token.substring(0, 10) + '...',
        searchedTokenLastChars: '...' + token.substring(token.length - 10),
        tokensMatch: user.resetToken === token
      }
    });

  } catch (error) {
    console.error('Token debug error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unbekannter Fehler',
      message: 'Fehler bei der Token-Debug-Analyse'
    });
  }
}
