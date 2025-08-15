#!/usr/bin/env node

/**
 * E-Mail API Test-Skript für HeatManager
 * 
 * Verwendung:
 * 1. npm install node-fetch
 * 2. node test-email-api.js
 */

const fetch = require('node-fetch');

// Konfiguration
const BASE_URL = 'http://localhost:3000';
const SESSION_TOKEN = 'ihr_session_token_hier'; // Ersetzen Sie dies mit Ihrem echten Token

// Test-E-Mail-Daten
const testEmails = [
  {
    name: 'Einfache Text-E-Mail',
    data: {
      to: 'test@example.com',
      subject: 'Test E-Mail - Text',
      text: 'Dies ist eine einfache Test-E-Mail mit nur Text.'
    }
  },
  {
    name: 'HTML-E-Mail',
    data: {
      to: 'test@example.com',
      subject: 'Test E-Mail - HTML',
      html: `
        <h1>Test E-Mail - HTML</h1>
        <p>Dies ist eine <strong>HTML-E-Mail</strong> mit Formatierung.</p>
        <ul>
          <li>Punkt 1</li>
          <li>Punkt 2</li>
          <li>Punkt 3</li>
        </ul>
        <p style="color: blue;">Blaue Schrift für den Test.</p>
      `
    }
  },
  {
    name: 'Kombinierte E-Mail',
    data: {
      to: 'test@example.com',
      subject: 'Test E-Mail - Kombiniert',
      text: 'Dies ist eine Test-E-Mail mit Text und HTML.',
      html: '<h1>Test E-Mail</h1><p>Dies ist eine Test-E-Mail mit <strong>Text und HTML</strong>.</p>'
    }
  }
];

// API-Endpunkte
const endpoints = [
  {
    name: 'OAuth2 Helper',
    url: '/api/email/send-oauth2',
    method: 'POST'
  },
  {
    name: 'Simple OAuth2',
    url: '/api/email/send-simple-oauth2',
    method: 'POST'
  },
  {
    name: 'App Password',
    url: '/api/email/send-app-password',
    method: 'POST'
  }
];

// Hilfsfunktionen
async function makeRequest(endpoint, data) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint.url}`, {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `next-auth.session-token=${SESSION_TOKEN}`
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();
    
    return {
      success: response.ok,
      status: response.status,
      data: result
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      data: { error: error.message }
    };
  }
}

async function testEndpoint(endpoint, emailData) {
  console.log(`\n🧪 Teste: ${endpoint.name}`);
  console.log(`📧 E-Mail: ${emailData.name}`);
  console.log(`📤 Endpoint: ${endpoint.url}`);
  
  const result = await makeRequest(endpoint, emailData.data);
  
  if (result.success) {
    console.log(`✅ Erfolgreich (${result.status})`);
    console.log(`📨 Message ID: ${result.data.messageId || 'N/A'}`);
    console.log(`🔧 Methode: ${result.data.method || 'N/A'}`);
  } else {
    console.log(`❌ Fehlgeschlagen (${result.status})`);
    console.log(`🚨 Fehler: ${result.data.error || 'Unbekannter Fehler'}`);
    if (result.data.details) {
      console.log(`📋 Details: ${result.data.details}`);
    }
  }
  
  return result;
}

async function testAllEndpoints() {
  console.log('🚀 Starte E-Mail API-Tests...\n');
  
  const results = [];
  
  for (const endpoint of endpoints) {
    for (const emailData of testEmails) {
      const result = await testEndpoint(endpoint, emailData);
      results.push({
        endpoint: endpoint.name,
        email: emailData.name,
        ...result
      });
      
      // Kurze Pause zwischen Tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}

async function runTests() {
  try {
    console.log('📋 Test-Konfiguration:');
    console.log(`🌐 Base URL: ${BASE_URL}`);
    console.log(`🔑 Session Token: ${SESSION_TOKEN ? 'Gesetzt' : 'Fehlt'}`);
    console.log(`📧 Test-E-Mails: ${testEmails.length}`);
    console.log(`🔌 Endpoints: ${endpoints.length}`);
    
    if (!SESSION_TOKEN || SESSION_TOKEN === 'ihr_session_token_hier') {
      console.log('\n⚠️  Warnung: Session Token ist nicht gesetzt!');
      console.log('   Setzen Sie SESSION_TOKEN in der Konfiguration.');
      return;
    }
    
    const results = await testAllEndpoints();
    
    // Zusammenfassung
    console.log('\n📊 Test-Zusammenfassung:');
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`✅ Erfolgreich: ${successful}`);
    console.log(`❌ Fehlgeschlagen: ${failed}`);
    console.log(`📊 Gesamt: ${results.length}`);
    
    if (failed > 0) {
      console.log('\n🚨 Fehlgeschlagene Tests:');
      results.filter(r => !r.success).forEach(result => {
        console.log(`   - ${result.endpoint}: ${result.email} - ${result.data.error}`);
      });
    }
    
  } catch (error) {
    console.error('💥 Test-Ausführung fehlgeschlagen:', error.message);
  }
}

// Tests ausführen
if (require.main === module) {
  runTests();
}

module.exports = {
  testEndpoint,
  testAllEndpoints,
  makeRequest
};
