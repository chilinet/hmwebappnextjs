import { useRouter } from 'next/router';
import { useSession, getSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

export default function RoleForm() {
  const router = useRouter();
  const { id } = router.query;
  const isNewRole = id === 'new';
  
  const [role, setRole] = useState({
    rolename: '',
    adminrole: false,
    descrlong: ''
  });
  const [loading, setLoading] = useState(!isNewRole);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isNewRole && id) {
      fetchRole();
    }
  }, [id]);

  const fetchRole = async () => {
    try {
      const response = await fetch(`/api/roles/${id}`);
      if (!response.ok) throw new Error('Failed to fetch role');
      const data = await response.json();
      setRole(data);
    } catch (error) {
      console.error('Error fetching role:', error);
      alert('Fehler beim Laden der Rolle');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      const url = isNewRole ? '/api/roles' : `/api/roles/${id}`;
      const method = isNewRole ? 'POST' : 'PUT';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(role)
      });

      if (!response.ok) throw new Error('Failed to save role');
      
      router.push('/config/roles');
    } catch (error) {
      console.error('Error saving role:', error);
      alert('Fehler beim Speichern der Rolle');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center p-4">Laden...</div>;
  }

  return (
    <div className="container mt-4">
      <h2 className="text-white mb-4">
        {isNewRole ? 'Neue Rolle erstellen' : 'Rolle bearbeiten'}
      </h2>
      
      <div className="card" style={{ backgroundColor: '#2C3E50' }}>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label htmlFor="rolename" className="form-label text-white">Bezeichnung</label>
              <input
                type="text"
                className="form-control"
                id="rolename"
                value={role.rolename}
                onChange={(e) => setRole({...role, rolename: e.target.value})}
                required
              />
            </div>
            
            <div className="mb-3">
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="adminrole"
                  checked={role.adminrole}
                  onChange={(e) => setRole({...role, adminrole: e.target.checked})}
                />
                <label className="form-check-label text-white" htmlFor="adminrole">
                  Admin-Rolle
                </label>
              </div>
            </div>
            
            <div className="mb-3">
              <label htmlFor="descrlong" className="form-label text-white">Beschreibung</label>
              <textarea
                className="form-control"
                id="descrlong"
                rows="3"
                value={role.descrlong || ''}
                onChange={(e) => setRole({...role, descrlong: e.target.value})}
              />
            </div>
            
            <div className="d-flex gap-2">
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? 'Speichern...' : 'Speichern'}
              </button>
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={() => router.push('/config/roles')}
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

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