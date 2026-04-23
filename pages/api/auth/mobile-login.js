import { authenticateCredentials } from '../../../lib/credentialsLogin';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { username, password } = req.body || {};
  const user = await authenticateCredentials(username, password);

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials',
      message: 'Anmeldung fehlgeschlagen'
    });
  }

  return res.status(200).json({
    success: true,
    token: user.token,
    user: {
      userid: user.userid,
      username: user.name,
      customerid: user.customerid,
      role: user.role,
      defaultEntryAssetId: user.defaultEntryAssetId
    },
    expiresIn: 8 * 60 * 60
  });
}
