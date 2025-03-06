import { getSession } from 'next-auth/react'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.NEXTAUTH_SECRET

const verifyToken = (req) => {
  const session = getSession({ req })
  if (session) return session

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No token provided')
  }

  const token = authHeader.split(' ')[1]
  return jwt.verify(token, JWT_SECRET)
}

export default async function handler(req, res) {
  try {
    const session = await getSession({ req })
    let tbToken

    if (session) {
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
    
   // console.log('tbToken : ', tbToken);

    if (req.method === 'GET') {
      const response = await fetch(`${process.env.THINGSBOARD_URL}/api/customers?pageSize=1000&page=0`, {
        headers: {
          'Accept': 'application/json',
          'X-Authorization': `Bearer ${tbToken}`
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
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
        token: tbToken ? 'Token present' : 'No token',
        timestamp: new Date().toISOString()
      }
    })
  }
} 