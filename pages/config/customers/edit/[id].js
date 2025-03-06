import { useEffect, useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSave, faArrowLeft } from '@fortawesome/free-solid-svg-icons'

export default function EditCustomer() {
  const router = useRouter()
  const { id } = router.query
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      signIn()
    },
  })

  const [customer, setCustomer] = useState({
    title: '',
    email: '',
    address: '',
    city: '',
    country: '',
    phone: ''
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (id && session?.token) {
      fetchCustomer()
    }
  }, [id, session])

  const fetchCustomer = async () => {
    try {
      const response = await fetch(`/api/config/customers/${id}`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch customer')
      }

      const data = await response.json()
      setCustomer(data.data)
      setLoading(false)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
      const response = await fetch(`/api/config/customers/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify(customer)
      })

      if (!response.ok) {
        throw new Error('Failed to update customer')
      }

      router.push('/config/customers')
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setCustomer(prev => ({
      ...prev,
      [name]: value
    }))
  }

  if (loading) {
    return <div>Loading...</div>
  }

  if (error) {
    return <div>Error: {error}</div>
  }

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Kunde bearbeiten</h2>
        <button 
          className="btn btn-outline-secondary"
          onClick={() => router.push('/config/customers')}
        >
          <FontAwesomeIcon icon={faArrowLeft} className="me-2" />
          Zurück
        </button>
      </div>

      <div className="row">
        <div className="col-12">
          <div className="card">
            <div className="card-body">
              <form onSubmit={handleSubmit}>
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label htmlFor="title" className="form-label">Name</label>
                    <input
                      type="text"
                      className="form-control"
                      id="title"
                      name="title"
                      value={customer.title}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="col-md-6 mb-3">
                    <label htmlFor="email" className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-control"
                      id="email"
                      name="email"
                      value={customer.email}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="col-md-12 mb-3">
                    <label htmlFor="address" className="form-label">Adresse</label>
                    <input
                      type="text"
                      className="form-control"
                      id="address"
                      name="address"
                      value={customer.address}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="col-md-6 mb-3">
                    <label htmlFor="city" className="form-label">Stadt</label>
                    <input
                      type="text"
                      className="form-control"
                      id="city"
                      name="city"
                      value={customer.city}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="col-md-6 mb-3">
                    <label htmlFor="country" className="form-label">Land</label>
                    <input
                      type="text"
                      className="form-control"
                      id="country"
                      name="country"
                      value={customer.country}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="col-md-6 mb-3">
                    <label htmlFor="phone" className="form-label">Telefon</label>
                    <input
                      type="tel"
                      className="form-control"
                      id="phone"
                      name="phone"
                      value={customer.phone}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="d-flex justify-content-end gap-2 mt-3">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => router.push('/config/customers')}
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