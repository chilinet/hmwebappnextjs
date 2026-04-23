import jwt from 'jsonwebtoken';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../pages/api/auth/[...nextauth]';

/**
 * Browser-Session (NextAuth) oder Mobile-Bearer-JWT (gleiches Format wie Dashboard/stats).
 * @returns {Promise<object|null>} session mit user + tbToken oder null
 */
export async function getSessionOrMobileJwt(req, res) {
  let session = await getServerSession(req, res, authOptions);

  if (!session) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const raw = authHeader.split(' ')[1];
      try {
        const secret =
          process.env.NEXTAUTH_SECRET ||
          (process.env.NODE_ENV === 'development'
            ? 'development-secret-change-in-production'
            : null);
        if (secret) {
          const decoded = jwt.verify(raw, secret);
          if (decoded?.tbToken && (decoded.customerid || decoded.customerId)) {
            const cid = decoded.customerid || decoded.customerId;
            session = {
              user: {
                userid: decoded.userid,
                customerid: cid,
                role: decoded.role
              },
              tbToken: decoded.tbToken
            };
          }
        }
      } catch (e) {
        console.error('getSessionOrMobileJwt: Bearer JWT invalid:', e.message);
      }
    }
  }

  return session;
}
