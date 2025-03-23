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
    phone: '',
    tb_username: '',
    tb_password: '',
    prefix: ''
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
    console.log('+++++++++++++++++++++++++++++++++++++++++');
    console.log('Fetching customer with ID:', id);
    console.log('+++++++++++++++++++++++++++++++++++++++++');
    try {
      const [customerResponse, settingsResponse] = await Promise.all([
        fetch(`/api/config/customers/${id}`, {
          headers: {
            'Authorization': `Bearer ${session.token}`
          }
        }),
        fetch(`/api/config/customers/${id}/settings`, {
          headers: {
            'Authorization': `Bearer ${session.token}`
          }
        })
      ]);

      if (!customerResponse.ok || !settingsResponse.ok) {
        throw new Error('Fehler beim Laden der Kundendaten');
      }

      const customerData = await customerResponse.json();
      const settingsData = await settingsResponse.json();
      
     // console.log('+++++++++++++++++++++++++++++++++++++++++');
     // console.log('Customer Data:', customerData);
     // console.log('Settings Data:', settingsData);
     // console.log('+++++++++++++++++++++++++++++++++++++++++'); 

      setCustomer({
        ...customerData.data,
        tb_username: settingsData.data.tb_username || '',
        tb_password: settingsData.data.tb_password || '',
        prefix: settingsData.data.prefix || ''
      });
    } catch (error) {
      setError('Fehler beim Laden der Kundendaten');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const customerResponse = await fetch(`/api/config/customers/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({
          title: customer.title,
          email: customer.email,
          address: customer.address,
          city: customer.city,
          country: customer.country,
          phone: customer.phone
        })
      });

      const settingsResponse = await fetch(`/api/config/customers/${id}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({
          tb_username: customer.tb_username,
          tb_password: customer.tb_password,
          prefix: customer.prefix
        })
      });

      if (!customerResponse.ok || !settingsResponse.ok) {
        throw new Error('Fehler beim Speichern');
      }

      router.push('/config/customers');
    } catch (error) {
      setError('Fehler beim Speichern der Daten');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'prefix') {
      const upperValue = value.toUpperCase();
      if (upperValue.length <= 10 && /^[A-Z]*$/.test(upperValue)) {
        setCustomer(prev => ({
          ...prev,
          [name]: upperValue
        }));
      }
      return;
    }

    setCustomer(prev => ({
      ...prev,
      [name]: value
    }));
  };

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
                    <label htmlFor="prefix" className="form-label">
                      Kunden Prefix
                      <small className="text-muted ms-2">(max. 10 Großbuchstaben)</small>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="prefix"
                      name="prefix"
                      value={customer.prefix}
                      onChange={handleChange}
                      maxLength={10}
                      pattern="[A-Z]*"
                      style={{ textTransform: 'uppercase' }}
                    />
                    <div className="form-text">
                      Nur Großbuchstaben erlaubt (A-Z)
                    </div>
                  </div>

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

                <div className="card bg-dark text-white mb-4">
                  <div className="card-header">
                    ThingsBoard Zugangsdaten
                  </div>
                  <div className="card-body">
                    <div className="row">
                      <div className="col-md-6">
                        <div className="mb-3">
                          <label className="form-label">Benutzername</label>
                          <input
                            type="text"
                            className="form-control bg-dark text-white"
                            name="tb_username"
                            value={customer.tb_username}
                            onChange={handleChange}
                          />
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="mb-3">
                          <label className="form-label">Passwort</label>
                          <input
                            type="password"
                            className="form-control bg-dark text-white"
                            name="tb_password"
                            value={customer.tb_password}
                            onChange={handleChange}
                          />
                        </div>
                      </div>
                    </div>
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