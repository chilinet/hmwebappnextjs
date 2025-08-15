import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';

export default function EmailTest() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [testResult, setTestResult] = useState(null);
  const [emailData, setEmailData] = useState({
    to: '',
    subject: 'Test E-Mail über OAuth2',
    text: 'Dies ist eine Test-E-Mail, die über OAuth2 an Office365 gesendet wird.',
    html: '<h1>Test E-Mail über OAuth2</h1><p>Dies ist eine Test-E-Mail, die über OAuth2 an Office365 gesendet wird.</p>'
  });
  const [loading, setLoading] = useState(false);

  // Prüfe Authentifizierung
  if (status === 'loading') {
    return <div className="container mx-auto p-4">Lade...</div>;
  }

  if (!session) {
    router.push('/auth/signin');
    return null;
  }

  const generateOAuth2Url = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/email/oauth2-authorize');
      const result = await response.json();
      setTestResult(result);
      
      // Wenn erfolgreich, öffne die URL in einem neuen Tab
      if (result.success && result.authUrl) {
        window.open(result.authUrl, '_blank');
      }
    } catch (error) {
      setTestResult({ error: 'Failed to generate OAuth2 URL', details: error.message });
    } finally {
      setLoading(false);
    }
  };

  const testOAuth2Connection = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/email/test-oauth2');
      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({ error: 'Test failed', details: error.message });
    } finally {
      setLoading(false);
    }
  };

  const checkEnvironmentVariables = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/email/debug-env');
      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({ error: 'Environment check failed', details: error.message });
    } finally {
      setLoading(false);
    }
  };

  const sendTestEmail = async () => {
    if (!emailData.to) {
      alert('Bitte geben Sie eine E-Mail-Adresse ein');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/email/send-oauth2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData),
      });
      
      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({ error: 'Email sending failed', details: error.message });
    } finally {
      setLoading(false);
    }
  };

  const sendTestEmailSimple = async () => {
    if (!emailData.to) {
      alert('Bitte geben Sie eine E-Mail-Adresse ein');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/email/send-simple-oauth2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData),
      });
      
      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({ error: 'Simple OAuth2 email sending failed', details: error.message });
    } finally {
      setLoading(false);
    }
  };

  const sendTestEmailAppPassword = async () => {
    if (!emailData.to) {
      alert('Bitte geben Sie eine E-Mail-Adresse ein');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/email/send-app-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData),
      });
      
      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({ error: 'App Password email sending failed', details: error.message });
    } finally {
      setLoading(false);
    }
  };

  const testPasswordResetEmail = async () => {
    if (!emailData.to) {
      alert('Bitte geben Sie eine E-Mail-Adresse ein');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/email/test-password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: emailData.to }),
      });
      
      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({ error: 'Password reset test failed', details: error.message });
    } finally {
      setLoading(false);
    }
  };

  const testCompletePasswordResetFlow = async () => {
    if (!emailData.to) {
      alert('Bitte geben Sie eine E-Mail-Adresse ein');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/test-password-reset-flow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: emailData.to }),
      });
      
      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({ error: 'Complete password reset flow test failed', details: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">OAuth2 E-Mail Test</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* OAuth2-Verbindung testen */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">OAuth2-Verbindung testen</h2>
          <p className="text-gray-600 mb-4">
            Testen Sie die OAuth2-Verbindung zu Office365
          </p>
          <div className="space-y-2">
            <button
              onClick={generateOAuth2Url}
              disabled={loading}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 w-full"
            >
              {loading ? 'Generiere...' : 'OAuth2-URL generieren'}
            </button>
            <button
              onClick={testOAuth2Connection}
              disabled={loading}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 w-full"
            >
              {loading ? 'Teste...' : 'OAuth2-Verbindung testen'}
            </button>
            <button
              onClick={checkEnvironmentVariables}
              disabled={loading}
              className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 w-full"
            >
              {loading ? 'Prüfe...' : 'Umgebungsvariablen prüfen'}
            </button>
          </div>
        </div>

        {/* Test-E-Mail senden */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Test-E-Mail senden</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Empfänger:</label>
              <input
                type="email"
                value={emailData.to}
                onChange={(e) => setEmailData({...emailData, to: e.target.value})}
                placeholder="test@example.com"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Betreff:</label>
              <input
                type="text"
                value={emailData.subject}
                onChange={(e) => setEmailData({...emailData, subject: e.target.value})}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={sendTestEmail}
                disabled={loading || !emailData.to}
                className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                {loading ? 'Sende...' : 'OAuth2 Helper'}
              </button>
              <button
                onClick={() => sendTestEmailSimple()}
                disabled={loading || !emailData.to}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                {loading ? 'Sende...' : 'Simple OAuth2'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => sendTestEmailAppPassword()}
                disabled={loading || !emailData.to}
                className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                {loading ? 'Sende...' : 'App Password'}
              </button>
              <button
                onClick={testPasswordResetEmail}
                disabled={loading || !emailData.to}
                className="bg-orange-500 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                {loading ? 'Teste...' : 'Passwort-Reset Test'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Passwort-Reset-Flow testen */}
      <div className="mt-6 bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">Passwort-Reset-Flow testen</h2>
        <p className="text-gray-600 mb-4">
          Testen Sie den vollständigen Passwort-Reset-Prozess (E-Mail senden → Token validieren → Passwort zurücksetzen)
        </p>
        <div className="flex justify-center">
          <button
            onClick={testCompletePasswordResetFlow}
            disabled={loading || !emailData.to}
            className="bg-red-500 hover:bg-red-700 text-white font-bold py-3 px-6 rounded disabled:opacity-50"
          >
            {loading ? 'Teste...' : 'Vollständigen Passwort-Reset-Flow testen'}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500 text-center">
          ⚠️ Achtung: Dies setzt das Passwort des Benutzers auf &quot;TestPassword123!&quot; zurück!
        </p>
      </div>

      {/* Ergebnisse anzeigen */}
      {testResult && (
        <div className="mt-6 bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Testergebnis</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto text-sm">
            {JSON.stringify(testResult, null, 2)}
          </pre>
        </div>
      )}

      {/* OAuth2-Konfiguration */}
      <div className="mt-6 bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">OAuth2-Konfiguration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <strong>Erforderliche Umgebungsvariablen:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>OAUTH_TENANT_ID</li>
              <li>OAUTH_CLIENT_ID</li>
              <li>OAUTH_CLIENT_SECRET</li>
              <li>OAUTH_AUTHORIZATION_CODE</li>
              <li>OAUTH_REDIRECT_URI</li>
              <li>SMTP_USER</li>
              <li>SMTP_FROM</li>
            </ul>
          </div>
          <div>
            <strong>Azure App-Registrierung:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Redirect URI: {process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/auth/callback/azure</li>
              <li>API permissions: SMTP.Send</li>
              <li>Grant type: authorization_code</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
