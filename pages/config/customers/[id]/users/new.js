import { useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSave, faArrowLeft } from '@fortawesome/free-solid-svg-icons'

export default function NewUser() {
  const router = useRouter()
  const { id: customerId } = router.query
  const { data: session } = useSession({
    required: true,
    onUnauthenticated() {
      signIn()
    },
  })

  const [user, setUser] = useState({
    email: '',
    firstName: '',
    lastName: '',
    authority: 'CUSTOMER_USER',
    password: ''
  })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
      const response = await fetch(`/api/config/customers/${customerId}/users`, {
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

      router.push(`/config/customers/${customerId}/users`)
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
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div className="d-flex align-items-center gap-3">
          <button 
            className="btn btn-outline-secondary"
            onClick={() => router.push(`/config/customers/${customerId}/users`)}
          >
            <FontAwesomeIcon icon={faArrowLeft} className="me-2" />
            Zurück
          </button>
          <h2 className="mb-0">Neuer Benutzer</h2>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <div className="row">
        <div className="col-12">
          <div className="card">
            <div className="card-body">
              <form onSubmit={handleSubmit}>
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label htmlFor="email" className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-control"
                      id="email"
                      name="email"
                      value={user.email}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="col-md-6 mb-3">
                    <label htmlFor="password" className="form-label">Passwort</label>
                    <input
                      type="password"
                      className="form-control"
                      id="password"
                      name="password"
                      value={user.password}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="col-md-6 mb-3">
                    <label htmlFor="firstName" className="form-label">Vorname</label>
                    <input
                      type="text"
                      className="form-control"
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
                      className="form-control"
                      id="lastName"
                      name="lastName"
                      value={user.lastName}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="col-md-6 mb-3">
                    <label htmlFor="authority" className="form-label">Rolle</label>
                    <select
                      className="form-select"
                      id="authority"
                      name="authority"
                      value={user.authority}
                      onChange={handleChange}
                      required
                    >
                      <option value="CUSTOMER_USER">Benutzer</option>
                      <option value="CUSTOMER_ADMIN">Administrator</option>
                    </select>
                  </div>
                </div>

                <div className="d-flex justify-content-end gap-2 mt-3">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => router.push(`/config/customers/${customerId}/users`)}
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
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
    </div>
  )
} 