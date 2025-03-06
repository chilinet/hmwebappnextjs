export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Prüfen Sie hier Ihre Session/Token
  const session = req.cookies.session; // Annahme: Sie verwenden ein Session-Cookie

  if (!session) {
    return res.status(200).json({ isAuthenticated: false });
  }

  try {
    // Hier können Sie die Session validieren
    // Zum Beispiel: JWT verify oder Datenbankabfrage
    
    return res.status(200).json({ isAuthenticated: true });
  } catch (error) {
    console.error(error);
    return res.status(200).json({ isAuthenticated: false });
  }
}  