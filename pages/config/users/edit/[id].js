import { useEffect, useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSave, faArrowLeft } from '@fortawesome/free-solid-svg-icons'

export default function EditUser() {
  const router = useRouter()
  const { id } = router.query
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
    role: '',
    customerid: ''
  })
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [roles, setRoles] = useState([])
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    if (session?.token && id) {
      // Sequentielle Ausführung der Fetch-Operationen
      fetchUserRole()
        .then((roleValue) => {
          // Verwende den zurückgegebenen roleValue direkt
          return fetchRoles(roleValue);
        })
        .then(() => Promise.all([
          fetchUser(),
          fetchCustomers()
        ]))
        .then(() => setLoading(false))
        .catch(err => {
          console.error('Loading error:', err)
          setError('Error loading data')
          setLoading(false)
        })
    }
  }, [session, id])

  const fetchUserRole = async () => {
    try {
      const response = await fetch('/api/config/users/me', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch user role')
      }

      const data = await response.json()
      console.log('Received user role data:', data)
      const roleValue = parseInt(data.role, 10) // Stellen sicher, dass role als Nummer gespeichert wird
      setUserRole(roleValue)
      console.log('Setting userRole to:', roleValue) // Neuer Debug-Log
      return roleValue // Rückgabewert hinzugefügt
    } catch (error) {
      console.error('Error fetching user role:', error)
      return null
    }
  }

  const fetchUser = async () => {
    try {
      const response = await fetch(`/api/config/users/${id}`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      })
      if (!response.ok) throw new Error('Failed to fetch user')
      const data = await response.json()
      
      //console.log('Raw API response:', data)
      //console.log('Customer ID from API:', data.data.customerid, typeof data.data.customerid)
      
      const userData = {
        ...data.data,
        customerid: data.data.customerid ? data.data.customerid.toLowerCase() : ''
      }
      
      setUser(userData)
      console.log('Processed user data:', userData)
    } catch (error) {
      console.error('Error fetching user:', error)
      setError('Error loading user')
    }
  }

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/config/customers', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      })
      if (!response.ok) throw new Error('Failed to fetch customers')
      const data = await response.json()
      
      console.log('Raw customers data:', data)
      
      const formattedCustomers = data.data.map(customer => ({
        ...customer,
        id: {
          id: customer.id.id.toLowerCase()
        }
      }))
      
      console.log('Formatted customers:', formattedCustomers)
      setCustomers(formattedCustomers)
    } catch (error) {
      console.error('Error fetching customers:', error)
      setError('Error loading customers')
    }
  }

  const fetchRoles = async (currentUserRole) => {
    try {
      const response = await fetch('/api/roles', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      })
      if (!response.ok) throw new Error('Failed to fetch roles')
      const data = await response.json()
      
      console.log('Fetching roles with userRole:', currentUserRole)
      
      // Filtere die Rollen basierend auf der übergebenen userRole
      const filteredRoles = data.filter(role => {
        if (currentUserRole === 1) { // Superadmin kann alle Rollen auswählen
          return true;
        } else if (currentUserRole === 2) { // Customer Admin kann nur Customer Admin und Benutzer auswählen
          return role.roleid === 2 || role.roleid === 3;
        }
        return false;
      });

      setRoles(filteredRoles)
    } catch (error) {
      console.error('Error fetching roles:', error)
      setError('Error loading roles')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    
    try {
      // Konvertiere beide Werte zu Nummern für den Vergleich
      const currentUserRole = parseInt(userRole, 10);
      const selectedRole = parseInt(user.role, 10);
      
      console.log('Current user role (type):', typeof currentUserRole, currentUserRole);
      console.log('Selected role (type):', typeof selectedRole, selectedRole);

      const isRoleAllowed = currentUserRole === 1 || // Superadmin darf alles
        (currentUserRole === 2 && (selectedRole === 2 || selectedRole === 3)); // Customer Admin nur 2 oder 3

      if (!isRoleAllowed) {
        throw new Error('Sie haben keine Berechtigung, diese Rolle zuzuweisen');
      }

      const response = await fetch(`/api/config/users/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          customerid: user.customerid
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update user')
      }

      router.push('/config/users')
    } catch (error) {
      setError(error.message)
      setSaving(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    console.log('Select change:', name, value)
    setUser(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const isSuperAdmin = userRole === 1;

  if (!session) return <div>Loading...</div>
  if (loading) return <div>Loading user data...</div>
  if (error) return <div>Error: {error}</div>

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
              <h2 className="mb-0">Benutzer bearbeiten</h2>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label htmlFor="username" className="form-label">Benutzername</label>
                <input
                  type="text"
                  className="form-control bg-white text-dark"
                  id="username"
                  value={user.username}
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
                  required
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
                  required
                />
              </div>

              <div className="col-md-6 mb-3">
                <label htmlFor="role" className="form-label">Rolle</label>
                <select
                  className="form-select bg-white text-dark"
                  id="role"
                  name="role"
                  value={user.role || ''}
                  onChange={handleChange}
                  required
                >
                  <option value="">Bitte wählen...</option>
                  {roles.map(role => (
                    <option 
                      key={role.roleid} 
                      value={role.roleid}
                    >
                      {role.rolename}
                    </option>
                  ))}
                </select>
              </div>

              {isSuperAdmin && (
                <div className="col-md-6 mb-3">
                  <label htmlFor="customerid" className="form-label">Kunde</label>
                  <select
                    className="form-select bg-white text-dark"
                    id="customerid"
                    name="customerid"
                    value={user.customerid || ''}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Bitte wählen...</option>
                    {customers.map(customer => (
                      <option 
                        key={customer.id.id} 
                        value={customer.id.id}
                      >
                        {customer.title || customer.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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