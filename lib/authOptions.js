import CredentialsProvider from 'next-auth/providers/credentials';
import sql from 'mssql';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getConnection } from './db';
import { debugLog } from './appDebug';

if (process.env.NODE_ENV === 'production' && !process.env.NEXTAUTH_SECRET) {
  console.error('❌ ERROR: NEXTAUTH_SECRET is required in production!');
  console.error('Please set NEXTAUTH_SECRET environment variable.');
}

export const authOptions = {
  secret:
    process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV === 'development' ? 'development-secret-change-in-production' : undefined),
  url:
    process.env.NEXTAUTH_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://webapptest.heatmanager.cloud' : 'http://localhost:3000'),
  trustHost: process.env.NODE_ENV === 'production',
  useSecureCookies: process.env.NODE_ENV === 'production',
  adapter: undefined,
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,
    updateAge: 24 * 60 * 60
  },
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        domain: process.env.NODE_ENV === 'production' ? '.heatmanager.cloud' : undefined
      }
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        domain: process.env.NODE_ENV === 'production' ? '.heatmanager.cloud' : undefined
      }
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        domain: process.env.NODE_ENV === 'production' ? '.heatmanager.cloud' : undefined
      }
    }
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        try {
          const pool = await getConnection();

                            const result = await pool.request()
            .input('username', sql.NVarChar, credentials.username)
            .query(`
              SELECT 
                u.userid,
                u.username,
                u.email,
                u.password,
                u.customerid,
                u.role,
                u.status,
                u.default_entry_asset_id,
                cs.tb_username,
                cs.tb_password,
                cs.tb_url
              FROM hm_users u
              LEFT JOIN customer_settings cs ON u.customerid = cs.customer_id
              WHERE u.username = @username
            `);

          if (result.recordset.length === 0) {
            return null;
          }

          const user = result.recordset[0];

          if (user.status === 0) {
            console.log(`Login attempt blocked: User ${credentials.username} is inactive (status: 0)`);
            return null;
          }

          if (user.status === 99) {
            console.log(`Login attempt blocked: User ${credentials.username} is locked (status: 99)`);
            return null;
          }

          const passwordMatch = await bcrypt.compare(credentials.password, user.password);
          if (!passwordMatch) {
            return null;
          }

          let tbData = null;
          try {
            const tbResponse = await fetch(`${process.env.THINGSBOARD_URL}/api/auth/login`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                username: user.tb_username,
                password: user.tb_password
              })
            });

            tbData = await tbResponse.json();

            if (!tbResponse.ok) {
              console.error('ThingsBoard login failed:', tbData);
              return null;
            }
          } catch (tbError) {
            console.error('ThingsBoard connection error:', tbError);
            tbData = { token: null, refreshToken: null };
          }

          return {
            id: user.userid.toString(),
            name: user.username,
            email: user.email,
            userid: user.userid,
            customerid: user.customerid,
            role: user.role,
            defaultEntryAssetId:
              user.default_entry_asset_id != null
                ? String(user.default_entry_asset_id)
                : null,
            token: jwt.sign(
              {
                username: user.username,
                userid: user.userid,
                customerid: user.customerid,
                role: user.role
              },
              process.env.NEXTAUTH_SECRET,
              { expiresIn: '8h' }
            ),
            tbToken: tbData?.token || null,
            refreshToken: tbData?.refreshToken || null,
            tbTokenExpires: tbData?.token ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        return {
          ...token,
          ...user,
          email: user.email,
          userid: user.userid,
          customerid: user.customerid,
          role: user.role
        };
      }
      return token;
    },
    async session({ session, token }) {
      if (!token) {
        return null;
      }
      session.user = {
        ...session.user,
        id: token.id,
        email: token.email,
        userid: token.userid,
        customerid: token.customerid,
        role: token.role,
        defaultEntryAssetId: token.defaultEntryAssetId ?? null
      };
      session.token = token.token;
      session.tbToken = token.tbToken;
      session.refreshToken = token.refreshToken;
      session.tbTokenExpires = token.tbTokenExpires;
      return session;
    }
  },
  pages: {
    signIn: '/auth/signin'
  },
  debug: process.env.NODE_ENV === 'development',
  events: {
    async signIn({ user }) {
      debugLog('User signed in:', user?.username);
    },
    async signOut() {
      debugLog('User signed out');
    },
    async session() {
      debugLog('Session callback called');
    }
  },
  error: {
    error: '/auth/error'
  }
};
