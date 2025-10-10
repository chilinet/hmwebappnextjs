import jwt from 'jsonwebtoken'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: 'Nur POST-Anfragen sind erlaubt'
    });
  }

  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      success: false,
      error: 'Missing token',
      message: 'Token ist erforderlich'
    });
  }

  try {
    // Token verifizieren
    const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET);
    
    // Neuen Token mit längerer Gültigkeit erstellen
    const newToken = jwt.sign(
      { 
        username: decoded.username,
        userid: decoded.userid,
        customerid: decoded.customerid,
        role: decoded.role,
        tbToken: decoded.tbToken,
        refreshToken: decoded.refreshToken,
      },
      process.env.NEXTAUTH_SECRET,
      { expiresIn: '8h' }
    );

    return res.status(200).json({
      success: true,
      data: {
        token: newToken,
        expiresIn: '8h'
      }
    });

  } catch (error) {
    console.error('Token refresh error:', error)
    
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'Ungültiger oder abgelaufener Token'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Interner Serverfehler'
    });
  }
}

