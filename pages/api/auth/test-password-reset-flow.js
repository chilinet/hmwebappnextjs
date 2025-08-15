export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: 'Nur POST-Anfragen sind erlaubt'
    });
  }

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Missing email',
        message: 'E-Mail-Adresse ist erforderlich'
      });
    }

    console.log(`Testing password reset flow for email: ${email}`);

    // Schritt 1: Passwort-Reset-E-Mail anfordern
    console.log('Step 1: Requesting password reset email...');
    const forgotPasswordResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    if (!forgotPasswordResponse.ok) {
      const errorData = await forgotPasswordResponse.json();
      console.error('Forgot password request failed:', errorData);
      return res.status(400).json({
        success: false,
        error: 'Forgot password request failed',
        details: errorData
      });
    }

    const forgotPasswordResult = await forgotPasswordResponse.json();
    console.log('Step 1 completed:', forgotPasswordResult);

    // Schritt 2: Token aus der Datenbank abrufen (für Testzwecke)
    console.log('Step 2: Retrieving token from database...');
    const tokenResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/auth/get-reset-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    if (!tokenResponse.ok) {
      console.error('Token retrieval failed');
      return res.status(400).json({
        success: false,
        error: 'Token retrieval failed',
        message: 'Konnte den Reset-Token nicht abrufen'
      });
    }

    const tokenResult = await tokenResponse.json();
    console.log('Step 2 completed:', { token: tokenResult.token ? '✓ Present' : '✗ Missing' });

    // Schritt 3: Token validieren
    console.log('Step 3: Validating token...');
    const validateResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/auth/validate-reset-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: tokenResult.token }),
    });

    if (!validateResponse.ok) {
      const errorData = await validateResponse.json();
      console.error('Token validation failed:', errorData);
      return res.status(400).json({
        success: false,
        error: 'Token validation failed',
        details: errorData
      });
    }

    const validateResult = await validateResponse.json();
    console.log('Step 3 completed:', validateResult);

    // Schritt 4: Passwort zurücksetzen
    console.log('Step 4: Resetting password...');
    const resetResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/auth/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: tokenResult.token,
        password: 'TestPassword123!'
      }),
    });

    if (!resetResponse.ok) {
      const errorData = await resetResponse.json();
      console.error('Password reset failed:', errorData);
      return res.status(400).json({
        success: false,
        error: 'Password reset failed',
        details: errorData
      });
    }

    const resetResult = await resetResponse.json();
    console.log('Step 4 completed:', resetResult);

    return res.status(200).json({
      success: true,
      message: 'Password reset flow test completed successfully',
      summary: {
        step1: 'Password reset email requested',
        step2: 'Token retrieved from database',
        step3: 'Token validated successfully',
        step4: 'Password reset completed'
      },
      details: {
        forgotPassword: forgotPasswordResult,
        tokenRetrieval: { success: !!tokenResult.token },
        validation: validateResult,
        reset: resetResult
      }
    });

  } catch (error) {
    console.error('Password reset flow test error:', error);
    return res.status(500).json({
      success: false,
      error: 'Test failed',
      details: error.message
    });
  }
}
