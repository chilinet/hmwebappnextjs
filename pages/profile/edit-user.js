import { useEffect, useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSave } from '@fortawesome/free-solid-svg-icons'

export default function EditUser() {
  const router = useRouter()
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      signIn()
    },
  })

  const [user, setUser] = useState({
    email: '',
    firstName: '',
    lastName: '',
    username: '',
    role: '',
    tenantid: '',
    customerid: '',
    customerName: ''
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (session?.token) {
      fetchUserData()
    }
  }, [session])

  const fetchUserData = async () => {
    try {
      const response = await fetch('/api/profile', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch user data')
      }

      const { data } = await response.json()
      // Hier die Daten korrekt in den State übernehmen
      setUser({
        email: data.email || '',
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        username: data.username || '',
        role: data.rolle || '',
        tenantid: data.tenantid || '',
        customerid: data.customerid || '',
        customerName: data.customerName || ''
      })
      setLoading(false)
    } catch (error) {
      setError('Error loading user data')
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update profile')
      }

      router.push('/profile')
    } catch (error) {
      setError('Error updating profile')
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

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div className="container mt-4">
      <div className="row">
        <div className="col-12">
          <div className="card bg-dark text-light">
            <div className="card-body">
              <h2 className="card-title mb-4">Profil bearbeiten</h2>
              <form onSubmit={handleSubmit}>
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label htmlFor="username" className="form-label">Benutzername</label>
                    <input
                      type="text"
                      className="form-control bg-dark text-light"
                      id="username"
                      name="username"
                      value={user.username}
                      disabled
                    />
                  </div>

                  <div className="col-md-6 mb-3">
                    <label htmlFor="customerName" className="form-label">Kunde</label>
                    <input
                      type="text"
                      className="form-control bg-dark text-light"
                      id="customerName"
                      name="customerName"
                      value={user.customerName || 'Kein Kunde zugewiesen'}
                      disabled
                    />
                  </div>

                  <div className="col-md-6 mb-3">
                    <label htmlFor="customerid" className="form-label">Customer ID</label>
                    <input
                      type="text"
                      className="form-control bg-dark text-light"
                      id="customerid"
                      name="customerid"
                      value={user.customerid}
                      disabled
                    />
                  </div>

                  <div className="col-md-6 mb-3">
                    <label htmlFor="role" className="form-label">Rolle</label>
                    <input
                      type="text"
                      className="form-control bg-dark text-light"
                      id="role"
                      name="role"
                      value={user.role}
                      disabled
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
                </div>

                <div className="d-flex justify-content-end gap-2">
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
        </div>
      </div>

      <style jsx>{`
        .form-control:disabled {
          background-color: #2d3238;
          color: #6c757d;
        }
        .form-control:disabled {
          border-color: #495057;
        }
        .form-control:focus {
          border-color: #0d6efd;
          box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
        }
        .form-control:not(:disabled) {
          background-color: white;
          color: #212529;
        }
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