import { useState, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSave, faArrowLeft } from '@fortawesome/free-solid-svg-icons'

export default function NewUser() {
  const router = useRouter()
  const { data: session } = useSession({
    required: true,
    onUnauthenticated() {
      signIn()
    },
  })

  const [user, setUser] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    role: 'USER',
    password: '',
    customerid: ''
  })
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (session?.token) {
      fetchCustomers()
    }
  }, [session])

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/config/customers', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      })

      if (!response.ok) throw new Error('Failed to fetch customers')

      const data = await response.json()
      setCustomers(data.data)
      
      if (session.user.customerid) {
        setUser(prev => ({
          ...prev,
          customerid: session.user.customerid
        }))
      }
      
      setLoading(false)
    } catch (error) {
      setError('Error loading customers')
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
      const response = await fetch('/api/config/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify(user)
      })

      if (!response.ok) {
        throw new Error('Failed to create user')
      }

      router.push('/config/users')
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setUser(prev => ({
      ...prev,
      [name]: value
    }))
  }

  return (
    <div className="container mt-4">
      <div className="card bg-dark text-light">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <div className="d-flex align-items-center">
              <button 
                className="btn btn-outline-light me-3"
                onClick={() => router.push('/config/users')}
              >
                <FontAwesomeIcon icon={faArrowLeft} />
              </button>
              <h2 className="mb-0">Neuer Benutzer</h2>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label htmlFor="username" className="form-label">Benutzername</label>
                <input
                  type="text"
                  className="form-control bg-white text-dark"
                  id="username"
                  name="username"
                  value={user.username}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="col-md-6 mb-3">
                <label htmlFor="email" className="form-label">Email</label>
                <input
                  type="email"
                  className="form-control bg-white text-dark"
                  id="email"
                  name="email"
                  value={user.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="col-md-6 mb-3">
                <label htmlFor="firstName" className="form-label">Vorname</label>
                <input
                  type="text"
                  className="form-control bg-white text-dark"
                  id="firstName"
                  name="firstName"
                  value={user.firstName}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-6 mb-3">
                <label htmlFor="lastName" className="form-label">Nachname</label>
                <input
                  type="text"
                  className="form-control bg-white text-dark"
                  id="lastName"
                  name="lastName"
                  value={user.lastName}
                  onChange={handleChange}
                />
              </div>

              <div className="col-md-6 mb-3">
                <label htmlFor="role" className="form-label">Rolle</label>
                <select
                  className="form-select bg-white text-dark"
                  id="role"
                  name="role"
                  value={user.role}
                  onChange={handleChange}
                  required
                >
                  <option value="USER">Benutzer</option>
                  <option value="ADMIN">Administrator</option>
                </select>
              </div>

              <div className="col-md-6 mb-3">
                <label htmlFor="password" className="form-label">Passwort</label>
                <input
                  type="password"
                  className="form-control bg-white text-dark"
                  id="password"
                  name="password"
                  value={user.password}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="col-md-6 mb-3">
                <label htmlFor="customerid" className="form-label">Kunde</label>
                <select
                  className="form-select bg-white text-dark"
                  id="customerid"
                  name="customerid"
                  value={user.customerid}
                  onChange={handleChange}
                  required
                >
                  <option value="">Bitte wählen...</option>
                  {customers.map(customer => (
                    <option key={customer.id.id} value={customer.id.id}>
                      {customer.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="d-flex justify-content-end gap-2">
              <button
                type="button"
                className="btn btn-outline-light"
                onClick={() => router.push('/config/users')}
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="btn btn-warning"
                disabled={saving}
              >
                <FontAwesomeIcon icon={faSave} className="me-2" />
                {saving ? 'Speichern...' : 'Speichern'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <style jsx>{`
        .btn-warning {
          background-color: #fd7e14;
          border-color: #fd7e14;
          color: white;
        }
        .btn-warning:hover {
          background-color: #e66e12;
          border-color: #e66e12;
          color: white;
        }
        .btn-warning:disabled {
          background-color: #fd7e14;
          border-color: #fd7e14;
          opacity: 0.65;
        }
      `}</style>
    </div>
  )
} 