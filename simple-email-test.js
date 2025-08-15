#!/usr/bin/env node

/**
 * Einfacher E-Mail API-Test für HeatManager
 * 
 * Verwendung:
 * node simple-email-test.js
 */

const https = require('https');
const http = require('http');

// Konfiguration
const BASE_URL = 'http://localhost:3000';
const SESSION_TOKEN = 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..hvLen8n28Lt2PvAb.UwTc3SM6dCnu6bfWZub4USN3YCYYmrJULQ5YXL5FgIfbEdu-b2BLDSRKvN7wQRKRXyiZe34LQs2BNCmPh5jWGtPr99p2GtF267K2iHARv6PSr-cGH4RZCU-QpTOL_bkBFSEOfbwo0KMFin0WkJIVbVZ0NUi_qgC0oNGJo0lwWRLSw337UHlUki5RPJoBmlsQY7tCiNy3Ahz77SkG2F_3airuPXIys3Mvxp0GKz295-EFdCjMwVmY-k8Bi8h-DB3Fy1QMp_vmPdDGUvzix7oZv6PxtSVLRWgSfS_g7uoS_Kd7dkLI1fmV7c2RMR7cgQ86oBLeGUYUAM2uOX8Yw8lif-AgeT3bg6bm9Wdf-dFdcT2rp40oWR3L8_wadxAdxcWGRzavaQNXPVns8GOZXhNaLkicvrnwVTQ8pQzzN13JqgztViK8Y4N-nPL56kS2GsxAq7xtphOp3lilQU7yR8zBdeQol6tfBTKl82xLsHmv16mFZi0sOXlMEv3KaccabijAMlZpU-vzGtsXrmOCY8Wkp-hO92Iet2HCeQm0-sfB4L1e73msmbHHYqocEzhbcwlDNLzZJywTexUFpeQ1PC2n-bzKjwM8R5j2tAXhOAl9iR5Pf3_4zfF5AkZLeh-elQwxmLdZgHdPoUdBtR0YXkyI6YmzP8Xt8KPlyZg_UzfH0e4UXXVwKMLsKmLtj7W_l1t9-tyLzrgO-L5mm2WRzqybvyIvLV9Yi7RlOn958QHNdIW4UNxXMvwo_-DQJBmmwkZ_LLaAGnX44GfvO3XOz2xI2vv_9X1fiZFYqPnSrv8KRHqIRB0gmc1ID9pwDzD84Q4a_EqsfrYBZ009QKEkX3AU3Xb4sky2UOOdufYn3r-ZjC1QEyCDOXSAsX3-G4wttmIWnNoGjxD29j5iq8I6TUhtGlTqh6XMt9zR_TcFIPOoa6AxAsFgg_n-51LcDacUXeym82Iu7jegy3KdauFYhx00FFou7q5-o4r9V06bSNS0gsjNn7tA0YzldNckJMeIxOsYMgtJUWS9_w_3jJ9jtYu08n5hYqet7bfdrOXxxjqDgTknvQr3ygqVZ9_Zx_4cdjBBNFsoI0ffZFhn5aQUgCbfhOM804ME7N8UcQjy92TpBml1OLqae-dJ9i2f2aePrzS7d5V2wFep9MC-_8XpNjX9WoFO9uZskuRbz7Pf9MOrSJNLGadKSXcSLPLBu-ic-ODCB0rLcROggk-ESavEjww5afouSuzXqwdw-MLkYNov_WJ6xUBuaU0ahholqJXQBlNsq2GCNO0kvXuW_ss7rxHG7LoG2-bI3iSyE6mBlZ12jlgCSRcPuAq641MgiQrlio2TU5FowmoKpJzFSLIvS864Wg5TYBy4TnZub898dXyC4e3QewTb2g5Fx7w7m5NfzQUr3tOLBoqypANkNfV9sgSveIA4Qw9dToKZ6jh-nGg84OruAA9pAJLGSk40-R8P8pm3ZY1jx4j_LEkpePZ8mLIIX4q1WF_dwfAfWY80WJl71HoJMst0St0IAnCxgfiB9Nc50Ztjxo2pVVaAF_zzX4O8X6ZJJzmNUHgQIj4CwoC9oynU8Rz1olSmM29S2i9NlRqJVzgdzH4Jud92jLAT-097owEU23-vGbnSUe3H17oPQJTgWo_hbGXWpibdxbtEZ2JUdpe7rYjCH8RzPiqSkzcVtFHBwTrpV0clDV2iWAEBPKPPeLWX0Fj4ji2c7YgwoiFENiPdLyMkQG-F1j4114GVzXn4YeFpt__84lm6bJR24buYwhpC9K6DfZJBeJLmFnKUG7I4IE8UX7W_NUkmM-WbviZwQGK_po7cXngM09JV5HdYK_4nFev63l4YsqwghtRv75ik4jJoaRW2u1-oZgiViK9ngXG2Si56oFGNdOih9r8TNvLZJdAyiI8efntrqfgCdGxTwn1bd4PUbmXD6MYH94EqiR1JdOVZUwmJc6-hscmKEs_Lncvx5xE7xvqIvmYC4GZq2aipBvdg4VbATgkniJ7LK-8vi5vx3MugHqzkfKhoBUHDvkMIdhBbuJ8w6UNYQ-x3tbxJwaBaMV4sbniNvo-dhY3WZhyjBYQKMCAV5r9HVxfpMePkxuYfmZ9WDBZiq5WMw3gw7Rv383puHsbc15wArMAgcG4HelTUS-sUp7ETXmJLuNvGDt3bAL-vNI-0SZ5jwTRucn2F_5aII694VLFRb-12_mT7N8xLLty8zkFAZ2xm0U1vG14.qikMIWm5X7zZIqeaUuItAA'; // Ersetzen Sie dies!

// Test-E-Mail
const testEmail = {
  to: 'sluther@chilinet.solutions',
  subject: 'Test E-Mail - HeatManager',
  text: 'Dies ist eine Test-E-Mail von HeatManager.',
  html: '<h1>Test E-Mail</h1><p>Dies ist eine <strong>Test-E-Mail</strong> von HeatManager.</p>'
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

// Test-Funktionen
async function testOAuth2() {
  console.log('\n🧪 Teste OAuth2 Helper...');
  try {
    const result = await makeRequest('/api/email/send-oauth2', testEmail);
    if (result.success) {
      console.log('✅ OAuth2 Helper erfolgreich');
      console.log(`📨 Message ID: ${result.data.messageId}`);
    } else {
      console.log('❌ OAuth2 Helper fehlgeschlagen');
      console.log(`🚨 Fehler: ${result.data.error}`);
    }
    return result;
  } catch (error) {
    console.log('💥 OAuth2 Helper Fehler:', error.message);
    return { success: false, error: error.message };
  }
}

async function testSimpleOAuth2() {
  console.log('\n🧪 Teste Simple OAuth2...');
  try {
    const result = await makeRequest('/api/email/send-simple-oauth2', testEmail);
    if (result.success) {
      console.log('✅ Simple OAuth2 erfolgreich');
      console.log(`📨 Message ID: ${result.data.messageId}`);
    } else {
      console.log('❌ Simple OAuth2 fehlgeschlagen');
      console.log(`🚨 Fehler: ${result.data.error}`);
    }
    return result;
  } catch (error) {
    console.log('💥 Simple OAuth2 Fehler:', error.message);
    return { success: false, error: error.message };
  }
}

async function testAppPassword() {
  console.log('\n🧪 Teste App Password...');
  try {
    const result = await makeRequest('/api/email/send-app-password', testEmail);
    if (result.success) {
      console.log('✅ App Password erfolgreich');
      console.log(`📨 Message ID: ${result.data.messageId}`);
    } else {
      console.log('❌ App Password fehlgeschlagen');
      console.log(`🚨 Fehler: ${result.data.error}`);
    }
    return result;
  } catch (error) {
    console.log('💥 App Password Fehler:', error.message);
    return { success: false, error: error.message };
  }
}

// Hauptfunktion
async function runTests() {
  console.log('🚀 Starte E-Mail API-Tests...\n');
  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log(`🔑 Session Token: ${SESSION_TOKEN ? 'Gesetzt' : 'Fehlt'}`);
  console.log(`📧 Test-E-Mail an: ${testEmail.to}`);
  
  if (!SESSION_TOKEN || SESSION_TOKEN === 'ihr_session_token_hier') {
    console.log('\n⚠️  Warnung: Session Token ist nicht gesetzt!');
    console.log('   Setzen Sie SESSION_TOKEN in der Konfiguration.');
    return;
  }
  
  const results = [];
  
  // Alle Tests ausführen
  results.push(await testOAuth2());
  results.push(await testSimpleOAuth2());
  results.push(await testAppPassword());
  
  // Zusammenfassung
  console.log('\n📊 Test-Zusammenfassung:');
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`✅ Erfolgreich: ${successful}`);
  console.log(`❌ Fehlgeschlagen: ${failed}`);
  console.log(`📊 Gesamt: ${results.length}`);
  
  if (successful > 0) {
    console.log('\n🎉 Mindestens eine E-Mail-Methode funktioniert!');
  } else {
    console.log('\n🚨 Alle E-Mail-Methoden sind fehlgeschlagen.');
    console.log('   Überprüfen Sie Ihre Konfiguration.');
  }
}

// Tests ausführen
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testOAuth2,
  testSimpleOAuth2,
  testAppPassword,
  runTests
};
