import axios from 'axios';

const thingsboardAuth = async (username, password) => {
  try {
    const response = await axios.post(
      `${process.env.THINGSBOARD_URL}/api/auth/login`,
      {
        username,
        password
      }
    );
    
    return response.data.token;
  } catch (error) {
    console.error('Thingsboard Auth Error:', error);
    throw new Error('Authentifizierung bei Thingsboard fehlgeschlagen');
  }
};

export default thingsboardAuth; 