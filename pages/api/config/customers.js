import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'
import jwt from 'jsonwebtoken'
import thingsboardAuth from '../thingsboard/auth'

const JWT_SECRET = process.env.NEXTAUTH_SECRET

async function fetchCustomersWithToken(tbToken) {
  const response = await fetch(`${process.env.THINGSBOARD_URL}/api/customers?pageSize=1000&page=0`, {
    headers: {
      'Accept': 'application/json',
      'X-Authorization': `Bearer ${tbToken}`
    }
  })
  return response
}

export default async function handler(req, res) {
  try {
    const session = await getServerSession(req, res, authOptions)
    let tbToken

    if (session?.tbToken) {
      tbToken = session.tbToken
    } else {
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not authenticated' })
      }
      const token = authHeader.split(' ')[1]
      const decoded = jwt.verify(token, JWT_SECRET)
      tbToken = decoded.tbToken
    }

    if (req.method === 'GET') {
      let response = await fetchCustomersWithToken(tbToken)
      if (response.status === 401) {
        const tenantUser = process.env.TENNANT_THINGSBOARD_USERNAME || process.env.THINGSBOARD_USERNAME
        const tenantPass = process.env.TENNANT_THINGSBOARD_PASSWORD || process.env.THINGSBOARD_PASSWORD
        const mainUser = process.env.THINGSBOARD_USERNAME
        const mainPass = process.env.THINGSBOARD_PASSWORD
        for (const [label, user, pass] of [
          ['tenant', tenantUser, tenantPass],
          ['main', mainUser, mainPass]
        ]) {
          if (!user || !pass) continue
          if (response.ok) break
          try {
            const freshToken = await thingsboardAuth(user, pass)
            response = await fetchCustomersWithToken(freshToken)
            if (response.ok) break
          } catch (authErr) {
            console.error(`ThingsBoard ${label} login for customers fallback failed:`, authErr.message)
          }
        }
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`ThingsBoard API Error: ${response.status} - ${errorData.message || 'Unknown error'} (URL: ${process.env.THINGSBOARD_URL}/api/customers)`)
      }
      const data = await response.json()
      return res.status(200).json(data)
    }

    res.setHeader('Allow', ['GET'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  } catch (error) {
    console.error('Customers API error:', error)
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal server error',
      details: {
        url: `${process.env.THINGSBOARD_URL}/api/customers`,
        token: typeof tbToken !== 'undefined' ? 'Token present' : 'No token',
        timestamp: new Date().toISOString()
      }
    })
  }
} 