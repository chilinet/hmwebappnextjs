import { useRouter } from 'next/router';
import { useSession, signOut } from 'next-auth/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faCog, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';

export default function Profile() {
  const router = useRouter();
  const { data: session } = useSession({
    required: true,
    onUnauthenticated() {
      router.push('/auth/signin');
    },
  });

  const handleLogout = async () => {
    try {
      await signOut({ redirect: false });
      router.push('/auth/signin');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="container mt-4">
      <h2 className="mb-4 text-white">Profil</h2>
      <div className="row g-4">
        {/* Benutzer ändern Kachel */}
        <div className="col-md-4">
          <div className="card h-100 text-center p-4" 
               style={{ 
                 cursor: 'pointer',
                 backgroundColor: '#2C3E50', // Dunkleres Anthrazit für Karten
                 transition: 'background-color 0.3s'
               }}
               onMouseOver={e => e.currentTarget.style.backgroundColor = '#1a252f'} // Noch dunklerer Hover-Effekt
               onMouseOut={e => e.currentTarget.style.backgroundColor = '#2C3E50'}
               onClick={() => router.push('/profile/edit-user')}>
            <div className="card-body">
              <FontAwesomeIcon icon={faUser} size="3x" className="mb-3 text-white" />
              <h5 className="card-title text-white">Benutzer ändern</h5>
            </div>
          </div>
        </div>

        {/* Einstellungen Kachel */}
        <div className="col-md-4">
          <div className="card h-100 text-center p-4" 
               style={{ 
                 cursor: 'pointer',
                 backgroundColor: '#2C3E50',
                 transition: 'background-color 0.3s'
               }}
               onMouseOver={e => e.currentTarget.style.backgroundColor = '#1a252f'}
               onMouseOut={e => e.currentTarget.style.backgroundColor = '#2C3E50'}
               onClick={() => router.push('/profile/settings')}>
            <div className="card-body">
              <FontAwesomeIcon icon={faCog} size="3x" className="mb-3 text-white" />
              <h5 className="card-title text-white">Einstellungen</h5>
            </div>
          </div>
        </div>

        {/* Abmelden Kachel */}
        <div className="col-md-4">
          <div className="card h-100 text-center p-4" 
               style={{ 
                 cursor: 'pointer',
                 backgroundColor: '#2C3E50',
                 transition: 'background-color 0.3s'
               }}
               onMouseOver={e => e.currentTarget.style.backgroundColor = '#1a252f'}
               onMouseOut={e => e.currentTarget.style.backgroundColor = '#2C3E50'}
               onClick={handleLogout}>
            <div className="card-body">
              <FontAwesomeIcon icon={faSignOutAlt} size="3x" className="mb-3 text-white" />
              <h5 className="card-title text-white">Abmelden</h5>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}