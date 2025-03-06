import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.NEXTAUTH_SECRET
const TB_URL = process.env.THINGSBOARD_URL

export default async function handler(req, res) {
  const { id } = req.query

  // Token überprüfen
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const token = authHeader.split(' ')[1]
  let decoded
  try {
    decoded = jwt.verify(token, JWT_SECRET)
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  switch (req.method) {
    case 'GET':
      try {
        const response = await fetch(`${TB_URL}/api/customer/${id}`, {
          headers: {
            'X-Authorization': `Bearer ${decoded.tbToken}`
          }
        })

        if (!response.ok) {
          throw new Error('Failed to fetch customer')
        }

        const customer = await response.json()
        return res.status(200).json({ 
          success: true,
          data: {
            id: customer.id.id,
            title: customer.title,
            email: customer.email,
            address: customer.address,
            city: customer.city,
            country: customer.country,
            phone: customer.phone
          }
        })
      } catch (error) {
        console.error('Error fetching customer:', error)
        return res.status(500).json({ error: error.message })
      }

    case 'PUT':
      try {
        const response = await fetch(`${TB_URL}/api/customer`, {
          method: 'POST', // ThingsBoard verwendet POST für Updates
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${decoded.tbToken}`
          },
          body: JSON.stringify({
            ...req.body,
            id: {
              entityType: 'CUSTOMER',
              id: id
            }
          })
        })

        if (!response.ok) {
          throw new Error('Failed to update customer')
        }

        return res.status(200).json({ success: true })
      } catch (error) {
        console.error('Error updating customer:', error)
        return res.status(500).json({ error: error.message })
      }

    case 'DELETE':
      try {
        const response = await fetch(`${TB_URL}/api/customer/${id}`, {
          method: 'DELETE',
          headers: {
            'X-Authorization': `Bearer ${decoded.tbToken}`
          }
        })

        if (!response.ok) {
          throw new Error('Failed to delete customer')
        }

        return res.status(200).json({ success: true })
      } catch (error) {
        console.error('Error deleting customer:', error)
        return res.status(500).json({ error: error.message })
      }

    default:
      res.setHeader('Allow', ['GET', 'PUT', 'DELETE'])
      res.status(405).end(`Method ${req.method} Not Allowed`)
  }
} 