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
    role: '',
    password: '',
    customerid: ''
  })
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [userRole, setUserRole] = useState(null);
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    if (userRole !== null) {
      fetchRoles();
    }
  }, [userRole]);

  useEffect(() => {
    if (session?.token) {
      Promise.all([
        fetchUserRole(),
        fetchCustomers()
      ]).then(() => {
        setLoading(false);
      });
    }
  }, [session]);

  const fetchUserRole = async () => {
    try {
      const response = await fetch('/api/config/users/me', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user role');
      }

      const data = await response.json();
      setUserRole(data.role);
      
      setUser(prev => ({
        ...prev,
        tenantid: data.tenantid,
        customerid: data.role !== 1 ? data.customerid : prev.customerid
      }));
    } catch (error) {
      console.error('Error fetching user role:', error);
    }
  };

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

  const fetchRoles = async () => {
    try {
      const response = await fetch('/api/roles', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch roles');
      }

      const data = await response.json();
      
      const filteredRoles = data.filter(role => {
        if (userRole === 1) {
          return true;
        } else if (userRole === 2) {
          return role.roleid === 2 || role.roleid === 3;
        }
        return false;
      });

      console.log('Filtered roles:', filteredRoles);
      setRoles(filteredRoles);
    } catch (error) {
      console.error('Error fetching roles:', error);
      setError('Error loading roles');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Prüfe ob die E-Mail-Domain heatmanager.de ist
      if (user.email && user.email.includes('@')) {
        const emailDomain = user.email.toLowerCase().split('@')[1];
        if (emailDomain === 'heatmanager.de' && userRole !== 1) {
          throw new Error('Nur Superadmins dürfen Benutzer mit der Domain @heatmanager.de anlegen');
        }
      }

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

      const userData = {
        ...user,
        role: selectedRole, // Verwende den bereits konvertierten Wert
        tenantid: user.tenantid,
        customerid: userRole === 1 ? user.customerid : user.customerid
      };

      console.log('Sending user data:', userData);

      const response = await fetch('/api/config/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify(userData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create user');
      }

      router.push('/config/users');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target
    setUser(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const isSuperAdmin = userRole === 1;

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
              <h2 className="mb-0 text-white">Neuer Benutzer</h2>
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
                <label htmlFor="username" className="form-label text-white">Benutzername</label>
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
                <label htmlFor="email" className="form-label text-white">Email</label>
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
                <label htmlFor="firstName" className="form-label text-white">Vorname</label>
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
                <label htmlFor="lastName" className="form-label text-white">Nachname</label>
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
                <label htmlFor="role" className="form-label text-white">Rolle</label>
                <select
                  className="form-select bg-white text-dark"
                  id="role"
                  name="role"
                  value={user.role}
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

              <div className="col-md-6 mb-3">
                <label htmlFor="password" className="form-label text-white">Passwort</label>
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

              {isSuperAdmin && (
                <div className="col-md-6 mb-3">
                  <label htmlFor="customerid" className="form-label text-white">Kunde</label>
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