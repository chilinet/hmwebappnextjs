import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faArrowLeft } from '@fortawesome/free-solid-svg-icons';

export default function Profile() {
  const router = useRouter();
  const { data: session } = useSession({
    required: true,
    onUnauthenticated() {
      router.push('/auth/signin');
    },
  });

  return (
    <div className="container mt-4">
      <div className="d-flex align-items-center mb-4">
        <button 
          className="btn btn-outline-secondary me-3"
          onClick={() => router.back()}
        >
          <FontAwesomeIcon icon={faArrowLeft} />
        </button>
        <h1 className="mb-0" style={{ color: '#fd7e14', fontSize: '2.5rem', fontWeight: 'bold' }}>Profil</h1>
      </div>
      <div className="row g-4">
        {/* Benutzer ändern Kachel */}
        <div className="col-md-4">
          <div className="card h-100 text-center p-4" 
               style={{ 
                 cursor: 'pointer',
                 backgroundColor: '#ffffff',
                 border: '1px solid #dee2e6',
                 transition: 'all 0.3s'
               }}
               onMouseOver={e => {
                 e.currentTarget.style.backgroundColor = '#f8f9fa';
                 e.currentTarget.style.transform = 'translateY(-5px)';
                 e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
               }}
               onMouseOut={e => {
                 e.currentTarget.style.backgroundColor = '#ffffff';
                 e.currentTarget.style.transform = 'translateY(0)';
                 e.currentTarget.style.boxShadow = 'none';
               }}
               onClick={() => router.push('/profile/edit-user')}>
            <div className="card-body">
              <FontAwesomeIcon icon={faUser} size="3x" className="mb-3" style={{ color: '#fd7e14' }} />
              <h5 className="card-title" style={{ color: '#fd7e14' }}>Benutzer ändern</h5>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}