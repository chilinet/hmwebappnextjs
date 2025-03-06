import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.NEXTAUTH_SECRET
const TB_URL = process.env.THINGSBOARD_URL

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

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

  try {
    const response = await fetch(`${TB_URL}/api/customer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Authorization': `Bearer ${decoded.tbToken}`
      },
      body: JSON.stringify(req.body)
    })

    if (!response.ok) {
      throw new Error('Failed to create customer')
    }

    const newCustomer = await response.json()
    
    return res.status(201).json({ 
      success: true,
      data: {
        id: newCustomer.id.id,
        title: newCustomer.title,
        email: newCustomer.email,
        address: newCustomer.address,
        city: newCustomer.city,
        country: newCustomer.country,
        phone: newCustomer.phone
      }
    })
  } catch (error) {
    console.error('Error creating customer:', error)
    return res.status(500).json({ error: error.message })
  }
} 