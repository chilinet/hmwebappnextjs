import { useState } from 'react';
import { useRouter } from 'next/router';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit, faTrash, faEnvelope } from '@fortawesome/free-solid-svg-icons';
import { toast } from 'react-hot-toast';

export default function Users() {
  const router = useRouter();
  const [users, setUsers] = useState([]);

  const sendActivationLink = async (userId) => {
    try {
      const response = await fetch('/api/config/users/send-activation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error('Fehler beim Senden des Aktivierungslinks');
      }

      toast.success('Aktivierungslink wurde versendet');

    } catch (error) {
      console.error('Error:', error);
      toast.error(error.message);
    }
  };

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>E-Mail</th>
          <th>Aktionen</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id}>
            <td>{user.name}</td>
            <td>{user.email}</td>
            <td>
              <button 
                className="btn btn-sm btn-outline-primary me-2"
                onClick={() => router.push(`/config/users/edit/${user.id}`)}
              >
                <FontAwesomeIcon icon={faEdit} />
              </button>
              <button 
                className="btn btn-sm btn-outline-danger me-2"
                onClick={() => handleDelete(user.id)}
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
              {!user.activated && (
                <button 
                  className="btn btn-sm btn-outline-warning"
                  onClick={() => sendActivationLink(user.id)}
                  title="Aktivierungslink senden"
                >
                  <FontAwesomeIcon icon={faEnvelope} />
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
} 