import { useEffect, useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEdit, faTrash, faPlus, faUsers } from '@fortawesome/free-solid-svg-icons'

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const router = useRouter()
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      signIn()
    },
  })

  useEffect(() => {
    fetchCustomers()
  }, [session])

  const fetchCustomers = async () => {
    try {
      if (!session?.token) {
        throw new Error('No token found')
      }

      const response = await fetch('/api/config/customers', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch customers')
      }

      const data = await response.json()
      setCustomers(data.data)
      setLoading(false)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handleEdit = (customerId) => {
    router.push(`/config/customers/edit/${customerId}`)
  }

  const handleNew = () => {
    router.push('/config/customers/new')
  }

  const handleDelete = async (customerId) => {
    if (!confirm('Sind Sie sicher, dass Sie diesen Kunden löschen möchten?')) {
      return
    }

    try {
      const response = await fetch(`/api/config/customers/${customerId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to delete customer')
      }

      // Liste aktualisieren
      await fetchCustomers()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleUsers = (customerId) => {
    router.push(`/config/customers/${customerId}/users`)
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
        <h2>Customers</h2>
        <button 
          className="btn btn-primary"
          onClick={handleNew}
        >
          <FontAwesomeIcon icon={faPlus} className="me-2" />
          Neuer Kunde
        </button>
      </div>
      
      <div className="table-responsive">
        <table className="table table-striped">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Address</th>
              <th>City</th>
              <th>Country</th>
              <th>Phone</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td>{customer.name}</td>
                <td>{customer.email}</td>
                <td>{customer.address}</td>
                <td>{customer.city}</td>
                <td>{customer.country}</td>
                <td>{customer.phone}</td>
                <td>
                  <button
                    className="btn btn-sm btn-outline-primary me-2"
                    onClick={() => handleEdit(customer.id)}
                    title="Bearbeiten"
                  >
                    <FontAwesomeIcon icon={faEdit} />
                  </button>
                  <button
                    className="btn btn-sm btn-outline-info me-2"
                    onClick={() => handleUsers(customer.id)}
                    title="Benutzer"
                  >
                    <FontAwesomeIcon icon={faUsers} />
                  </button>
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => handleDelete(customer.id)}
                    title="Löschen"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Sicherstellen, dass die Seite nur für authentifizierte Benutzer zugänglich ist
export async function getServerSideProps(context) {
  return {
    props: {
      protected: true
    }
  }
} 