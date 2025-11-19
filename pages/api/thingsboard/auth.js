import axios from 'axios';

const thingsboardAuth = async (username, password) => {
  try {
    console.log('Attempting ThingsBoard login:', {
      url: `${process.env.THINGSBOARD_URL}/api/auth/login`,
      username: username
    });
    
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
    
    // Zeige die ThingsBoard-Fehlermeldung, falls vorhanden
    if (error.response?.data) {
      console.error('ThingsBoard error response:', error.response.data);
      const tbError = error.response.data;
      throw new Error(
        `ThingsBoard Authentifizierung fehlgeschlagen: ${tbError.message || 'Unbekannter Fehler'} (Code: ${tbError.errorCode || 'N/A'})`
      );
    }
    
    throw new Error('Authentifizierung bei Thingsboard fehlgeschlagen');
  }
};

export default thingsboardAuth; 