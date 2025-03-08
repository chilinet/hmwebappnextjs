import { useRouter } from 'next/router';
import { useSession, getSession } from 'next-auth/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faPencilAlt, faTrash } from '@fortawesome/free-solid-svg-icons';
import { useEffect, useState } from 'react';

export default function Roles() {
  const router = useRouter();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const { data: session } = useSession({
    required: true,
    onUnauthenticated() {
      router.push('/auth/signin');
    },
  });

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const response = await fetch('/api/roles');
        if (!response.ok) throw new Error('Failed to fetch roles');
        const data = await response.json();
        setRoles(data);
      } catch (error) {
        console.error('Error fetching roles:', error);
        // Hier könnte man einen Toast oder eine andere Fehleranzeige implementieren
      } finally {
        setLoading(false);
      }
    };

    fetchRoles();
  }, []);

  const deleteRole = async (roleId) => {
    if (!confirm('Möchten Sie diese Rolle wirklich löschen?')) return;
    
    try {
      const response = await fetch(`/api/roles/${roleId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to delete role');
      
      // Aktualisiere die Rollenliste
      setRoles(roles.filter(role => role.roleid !== roleId));
    } catch (error) {
      console.error('Error deleting role:', error);
      alert('Fehler beim Löschen der Rolle');
    }
  };

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="text-white">Rollen und Berechtigungen</h2>
        <button 
          className="btn btn-primary"
          onClick={() => router.push('/config/roles/new')}
        >
          <FontAwesomeIcon icon={faPlus} className="me-2" />
          Neue Rolle
        </button>
      </div>

      <div className="card" style={{ backgroundColor: '#2C3E50' }}>
        <div className="card-body">
          {loading ? (
            <div className="text-center text-white p-4">
              <div className="spinner-border" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover table-dark">
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Bezeichnung</th>
                    <th scope="col">Admin-Rolle</th>
                    <th scope="col">Beschreibung</th>
                    <th scope="col">Erstellt am</th>
                    <th scope="col">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.roleid}>
                      <td>{role.roleid}</td>
                      <td>{role.rolename}</td>
                      <td>
                        <span className={`badge ${role.adminrole ? 'bg-success' : 'bg-secondary'}`}>
                          {role.adminrole ? 'Ja' : 'Nein'}
                        </span>
                      </td>
                      <td>{role.descrlong}</td>
                      <td>{new Date(role.createdttm).toLocaleDateString('de-DE')}</td>
                      <td>
                        <button 
                          className="btn btn-sm btn-outline-primary me-2"
                          onClick={() => router.push(`/config/roles/${role.roleid}`)}
                          title="Bearbeiten"
                        >
                          <FontAwesomeIcon icon={faPencilAlt} />
                        </button>
                        <button 
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => deleteRole(role.roleid)}
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
          )}
        </div>
      </div>
    </div>
  );
}

// Server-side Authentifizierungsprüfung
export async function getServerSideProps(context) {
  const session = await getSession(context);

  if (!session) {
    return {
      redirect: {
        destination: '/auth/signin',
        permanent: false,
      },
    };
  }

  return {
    props: {},
  };
} 