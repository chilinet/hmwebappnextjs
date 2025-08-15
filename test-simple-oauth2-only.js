#!/usr/bin/env node

/**
 * Simple OAuth2 Test für HeatManager
 * 
 * Verwendung:
 * node test-simple-oauth2-only.js
 */

const https = require('https');
const http = require('http');

// Konfiguration
const BASE_URL = 'http://localhost:3000';
const SESSION_TOKEN = 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..2eOZESYuVbvZBeB6.Mfp7rMToXYafVc22P2LoL136d1TRF_LByKEkOvPyummt4RsCp08_16Uuy8BdnBocIu_lFW8yKbvo_y2xUjI3LjPDa5h1YrvjMLa3_Aq441mPT8LR0ASQiITkdwt4MRRTNyTsmhkXWAsfvlP_cGOLFvaCJosBMARjus7mUa2FEHR2s9w7rjSRi4PKSEdr_ooiE46S8MnGHnuas69z5PiR0BsTzW_WMG26FfxlBOi9eXet3hwzbPYt74c0Y4T17NMsPemkdPq76bvXHCL_ToDe5aRop1NgWNCLM-YOwFY-zzMZ0qLUc1EHtLXYejePGzI0nsj-YlOYVZ-NKP4mOQmn9WWsReUShIr1QOjeuHbYLTBKh-Ah53IIEmHh61RY_GraViMpYlH1jHMOovosyZmeIL5T8D6Dw8jGURmNN6vg0DETb0M1lYeVrLuglbkdIojCxTloD2zbn6ANhM18iF3DGBTNf1CFS3xdBDr_iAPJetpEIx5Yws6GKeVLejVGI-KlIeglGFn0z7SdbWL_2k60nexU67ZLewfoPjAfWl_nOwx4oEjDY71WEPBxFF-7wGSstpur2SN4vZk8pcB6-t3yG6iP9ls5E4x03IiYWKOHh1Bpcn6wD0Tl5IhmG4NpRbjpTp1-_PZiRNHV2eLY2UkZRC5lLksEE6D3dqvTSQrIv0-_QYZyIW4qgA4xjDXpfPXNk4CGPwkSWUa8e95HNmRJxqLU8OSnjLdVihcC5ULvvs_MmAOXj1VtMBa7wVfIxMH2N4qRvU5Tlq6uRlafEBsV6J7wzSyc3XBfeZomW-7fAk2oqlGenDBZMVn0VGMD7PuFTK2pLkBm38zdaLTFUS9GfTts7_riC1x_Amzl4kbIxru9MPranx4ZOnBrOZuGkM0YE9N_C3QCfCAxqFuKp1kdLtvdTCz68dQDV-Ohn0Wm2xL2N1plKCg4uDdth16VnuOAo0aFyzSBvhMU4VJ_VIQ0lcfzaP625tTBKeE0u7Mu7U5tIAt2870FnOW7MWv1NiRTXtZ1An2mLjwhoUB4owekieYSdSv4yGdAJs7E98Too5kVCijgw2DLvm7wS2J2RRoN7vkj74DoXvj2G4wQMumzs6ka6o-33UFoBnGY36yKccpQOKau0TqM8WwN7Yc8aB94kPS3rcMG5GWVjvPwfBWh_X17b1-AqxZoucCxm_9_edu6YJDbTKih8TYc5mqFXs_-uJfm7TWCm4QyMvsLe0r22Mh2-xMltZ6RGthLeXOcuxyagOvBnYmj1fArDwGCn1lePjHu7rU5r5fkhvRJWPOfHgzPFAR8fD-uWYgTy4O36e1SszSHtDQkF9CKIS1QN9K5xeW0JcrRCnkej0awot2J3xlP6hCdzLB8MrRXJ5Jb1XIJIJdGmvXLQdQDB0FveKJnUMY3KvvxKeK8fIeFsASffIyuOf8mVg_tjxiE-E9GwhF8thzjNWM3iprpoedLM0ZX6Ceq_yQC93BoyITgTaubk-Cf1A37rG36mip5a11KniyzMLPBP78Q7z7CeHqjxpnUgl9SwWXP26ob5IjH_JrVJ039eGv2rHCVvN7ZZ7SHMslMd7PyHz0GJRhc5m8Feq0D601_qNPJSbj1wILh6qHVHsbYtVny3Vucw1Tt_MuoHrxVbWtlpMsvz2-4fB3jsCpORVQ2cSSv7NHjdyCdbFLwjjtDd01WsREM8es3vm6uihFJRVI0QjVnlGQrTuiDxpIeMKTQcbcglzyBOAYEL0aGXWGf05ibm3N2e8bUVcvEplydQiOIEBIVyfV7SQ0oNNVAbGDzCdLIsEXrcpcvSlM5jWfjsBItpvOTPj2VlEYwpp18ksybNpjYugKhCPl3i_eWuq3DNTvtZFTUhvTksXGECSPDWAxkeDKvVseZ4gli0PqEHdb54y33bjG1kMOpMrOdWsoRmHlFU6__MOTR6_CW_04J38KGTuOw8lqWM-8rlUFrL3hC0HJKuu-A3PxEUYuvOWDsnC9fkrrMmjn9jGAx0W3RBzdFOsKQXk-1LQu_zQPr5WLnmoxdrCQyC3IxpT8M_fZcwzvwHFJ-aumFhD2wzvhmK-lYmUW9mraqL6X_Kd74V66RKu30n26ff-Q_Jm5v1P1EeW8x84GmBQrfaoN4i3Eq-Xc0wICEyN7O2tF4RGMae_O2p8GDy_LmgryY0EzSak83V30Qj1GOzYZTEVsmBGOPKiKZlmZCcAeo33RZZX9YyHI6cmxySr8.x14EqBpVOxYsNzqq_J1KFw'; // Ersetzen Sie dies!

// Test-E-Mail
const testEmail = {
  to: 'sluther@chilinet.solutions',
  subject: 'Test E-Mail - Simple OAuth2',
  text: 'Dies ist eine Test-E-Mail über Simple OAuth2.',
  html: '<h1>Test E-Mail - Simple OAuth2</h1><p>Dies ist eine <strong>Test-E-Mail</strong> über Simple OAuth2.</p>'
};

// HTTP-Request-Funktion
function makeRequest(endpoint, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Cookie': `next-auth.session-token=${SESSION_TOKEN}`
      }
    };
    
    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          resolve({
            success: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            data: result
          });
        } catch (error) {
          resolve({
            success: false,
            status: res.statusCode,
            data: { error: 'Invalid JSON response', raw: responseData }
          });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(postData);
    req.end();
  });
}

// Simple OAuth2 Test
async function testSimpleOAuth2() {
  console.log('🧪 Teste Simple OAuth2...');
  console.log(`📧 E-Mail an: ${testEmail.to}`);
  console.log(`📤 Endpoint: /api/email/send-simple-oauth2`);
  console.log(`🔑 Session Token: ${SESSION_TOKEN ? 'Gesetzt' : 'Fehlt'}`);
  
  if (!SESSION_TOKEN || SESSION_TOKEN === 'ihr_session_token_hier') {
    console.log('\n⚠️  Warnung: Session Token ist nicht gesetzt!');
    console.log('   Setzen Sie SESSION_TOKEN in der Konfiguration.');
    return { success: false, error: 'Session Token fehlt' };
  }
  
  try {
    const result = await makeRequest('/api/email/send-simple-oauth2', testEmail);
    
    if (result.success) {
      console.log('\n✅ Simple OAuth2 erfolgreich!');
      console.log(`📨 Message ID: ${result.data.messageId || 'N/A'}`);
      console.log(`🔧 Methode: ${result.data.method || 'N/A'}`);
      console.log(`📊 Status: ${result.status}`);
      
      if (result.data.tokenInfo) {
        console.log('\n🔑 Token-Informationen:');
        console.log(`   Access Token: ${result.data.tokenInfo.access_token}`);
        console.log(`   Refresh Token: ${result.data.tokenInfo.refresh_token}`);
        console.log(`   Läuft ab in: ${result.data.tokenInfo.expires_in} Sekunden`);
      }
      
    } else {
      console.log('\n❌ Simple OAuth2 fehlgeschlagen!');
      console.log(`🚨 Status: ${result.status}`);
      console.log(`🚨 Fehler: ${result.data.error || 'Unbekannter Fehler'}`);
      
      if (result.data.details) {
        console.log(`📋 Details: ${result.data.details}`);
      }
      
      if (result.data.solution) {
        console.log(`💡 Lösung: ${result.data.solution}`);
      }
    }
    
    return result;
    
  } catch (error) {
    console.log('\n💥 Simple OAuth2 Fehler:');
    console.log(`🚨 Fehler: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Hauptfunktion
async function runTest() {
  console.log('🚀 Starte Simple OAuth2 Test...\n');
  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log(`📧 Test-E-Mail: ${testEmail.subject}`);
  console.log(`📨 Empfänger: ${testEmail.to}`);
  
  const result = await testSimpleOAuth2();
  
  console.log('\n📊 Test-Zusammenfassung:');
  if (result.success) {
    console.log('✅ Simple OAuth2 funktioniert korrekt!');
    console.log('🎉 Sie können Simple OAuth2 für E-Mails verwenden.');
  } else {
    console.log('❌ Simple OAuth2 funktioniert nicht.');
    console.log('🔧 Überprüfen Sie Ihre Konfiguration.');
    
    if (result.data?.error === 'OAuth2 invalid_grant error') {
      console.log('\n💡 Lösung für "invalid_grant error":');
      console.log('   1. Gehen Sie zu /admin/email-test');
      console.log('   2. Klicken Sie auf "OAuth2-URL generieren"');
      console.log('   3. Holen Sie einen neuen Authorization Code');
      console.log('   4. Aktualisieren Sie OAUTH_AUTHORIZATION_CODE in .env');
      console.log('   5. Starten Sie die App neu');
    }
  }
}

// Test ausführen
if (require.main === module) {
  runTest().catch(console.error);
}

module.exports = {
  testSimpleOAuth2,
  runTest
};
