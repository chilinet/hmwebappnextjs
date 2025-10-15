#!/usr/bin/env node

/**
 * Test Script für die Reporting API
 * 
 * Verwendung:
 * node test-reporting-api.js [API_KEY] [BASE_URL]
 * 
 * Beispiel:
 * node test-reporting-api.js "your-api-key" "http://localhost:3000"
 */

const https = require('https');
const http = require('http');

// Konfiguration
const API_KEY = process.argv[2] || 'default-reporting-key-2024';
const BASE_URL = process.argv[3] || 'http://localhost:3000';
const API_ENDPOINT = `${BASE_URL}/api/reporting`;

console.log('🔧 Reporting API Test Script');
console.log('============================');
console.log(`API Key: ${API_KEY.substring(0, 8)}...`);
console.log(`Base URL: ${BASE_URL}`);
console.log(`Endpoint: ${API_ENDPOINT}`);
console.log('');

// Hilfsfunktion für HTTP-Anfragen
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    
    if (postData) {
      requestOptions.headers['Content-Type'] = 'application/json';
      requestOptions.headers['Content-Length'] = Buffer.byteLength(postData);
    }
    
    const req = client.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: jsonData
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: data
          });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (postData) {
      req.write(postData);
    }
    
    req.end();
  });
}

// Test-Funktionen
async function testBasicAuth() {
  console.log('🧪 Test 1: Basic Authentication');
  console.log('-------------------------------');
  
  try {
    const response = await makeRequest({
      url: API_ENDPOINT,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });
    
    console.log(`Status: ${response.statusCode}`);
    console.log(`Records: ${response.data.data ? response.data.data.length : 'N/A'}`);
    console.log(`Success: ${response.data.success || false}`);
    
    if (response.data.metadata) {
      console.log(`Metadata:`, response.data.metadata);
    }
    
    return response.statusCode === 200;
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

async function testApiKeyHeader() {
  console.log('\n🧪 Test 2: X-API-Key Header');
  console.log('----------------------------');
  
  try {
    const response = await makeRequest({
      url: API_ENDPOINT,
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    console.log(`Status: ${response.statusCode}`);
    console.log(`Records: ${response.data.data ? response.data.data.length : 'N/A'}`);
    console.log(`Success: ${response.data.success || false}`);
    
    return response.statusCode === 200;
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

async function testQueryParameter() {
  console.log('\n🧪 Test 3: Query Parameter');
  console.log('----------------------------');
  
  try {
    const response = await makeRequest({
      url: `${API_ENDPOINT}?key=${API_KEY}`,
      method: 'GET'
    });
    
    console.log(`Status: ${response.statusCode}`);
    console.log(`Records: ${response.data.data ? response.data.data.length : 'N/A'}`);
    console.log(`Success: ${response.data.success || false}`);
    
    return response.statusCode === 200;
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

async function testWithLimit() {
  console.log('\n🧪 Test 4: With Limit Parameter');
  console.log('-----------------------------');
  
  try {
    const response = await makeRequest({
      url: `${API_ENDPOINT}?key=${API_KEY}&limit=5`,
      method: 'GET'
    });
    
    console.log(`Status: ${response.statusCode}`);
    console.log(`Records: ${response.data.data ? response.data.data.length : 'N/A'}`);
    console.log(`Success: ${response.data.success || false}`);
    
    if (response.data.metadata) {
      console.log(`Limit: ${response.data.metadata.limit}`);
    }
    
    return response.statusCode === 200;
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

async function testWithEntityId() {
  console.log('\n🧪 Test 5: With Entity ID Filter');
  console.log('--------------------------------');
  
  try {
    const response = await makeRequest({
      url: `${API_ENDPOINT}?key=${API_KEY}&entity_id=00229de0-6473-11ef-8cd8-8b580d9aa086&limit=3`,
      method: 'GET'
    });
    
    console.log(`Status: ${response.statusCode}`);
    console.log(`Records: ${response.data.data ? response.data.data.length : 'N/A'}`);
    console.log(`Success: ${response.data.success || false}`);
    
    if (response.data.data && response.data.data.length > 0) {
      console.log(`Sample Entity ID: ${response.data.data[0].entity_id}`);
    }
    
    return response.statusCode === 200;
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

async function testWithDateRange() {
  console.log('\n🧪 Test 6: With Date Range Filter');
  console.log('----------------------------------');
  
  try {
    const response = await makeRequest({
      url: `${API_ENDPOINT}?key=${API_KEY}&start_date=2025-09-15&end_date=2025-09-16&limit=3`,
      method: 'GET'
    });
    
    console.log(`Status: ${response.statusCode}`);
    console.log(`Records: ${response.data.data ? response.data.data.length : 'N/A'}`);
    console.log(`Success: ${response.data.success || false}`);
    
    if (response.data.data && response.data.data.length > 0) {
      console.log(`Sample Date: ${response.data.data[0].bucket_10m}`);
    }
    
    return response.statusCode === 200;
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

async function testInvalidAuth() {
  console.log('\n🧪 Test 7: Invalid Authentication');
  console.log('----------------------------------');
  
  try {
    const response = await makeRequest({
      url: API_ENDPOINT,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer invalid-key'
      }
    });
    
    console.log(`Status: ${response.statusCode}`);
    console.log(`Expected: 401`);
    console.log(`Error: ${response.data.error || 'N/A'}`);
    
    return response.statusCode === 401;
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

async function testInvalidParameters() {
  console.log('\n🧪 Test 8: Invalid Parameters');
  console.log('-----------------------------');
  
  try {
    const response = await makeRequest({
      url: `${API_ENDPOINT}?key=${API_KEY}&limit=2000`,
      method: 'GET'
    });
    
    console.log(`Status: ${response.statusCode}`);
    console.log(`Expected: 400`);
    console.log(`Error: ${response.data.error || 'N/A'}`);
    
    return response.statusCode === 400;
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

// Hauptfunktion
async function runTests() {
  console.log('🚀 Starting API Tests...\n');
  
  const tests = [
    { name: 'Basic Auth', fn: testBasicAuth },
    { name: 'API Key Header', fn: testApiKeyHeader },
    { name: 'Query Parameter', fn: testQueryParameter },
    { name: 'With Limit', fn: testWithLimit },
    { name: 'With Entity ID', fn: testWithEntityId },
    { name: 'With Date Range', fn: testWithDateRange },
    { name: 'Invalid Auth', fn: testInvalidAuth },
    { name: 'Invalid Parameters', fn: testInvalidParameters }
  ];
  
  const results = [];
  
  for (const test of tests) {
    try {
      const result = await test.fn();
      results.push({ name: test.name, passed: result });
      console.log(`${result ? '✅' : '❌'} ${test.name}: ${result ? 'PASSED' : 'FAILED'}`);
    } catch (error) {
      results.push({ name: test.name, passed: false, error: error.message });
      console.log(`❌ ${test.name}: ERROR - ${error.message}`);
    }
  }
  
  // Zusammenfassung
  console.log('\n📊 Test Summary');
  console.log('===============');
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  console.log(`Total Tests: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`Success Rate: ${Math.round((passed / total) * 100)}%`);
  
  if (passed === total) {
    console.log('\n🎉 All tests passed!');
  } else {
    console.log('\n⚠️  Some tests failed. Check the output above for details.');
  }
  
  // Fehlerdetails
  const failed = results.filter(r => !r.passed);
  if (failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    failed.forEach(test => {
      console.log(`  - ${test.name}${test.error ? `: ${test.error}` : ''}`);
    });
  }
}

// Script ausführen
if (require.main === module) {
  runTests().catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = {
  makeRequest,
  testBasicAuth,
  testApiKeyHeader,
  testQueryParameter,
  testWithLimit,
  testWithEntityId,
  testWithDateRange,
  testInvalidAuth,
  testInvalidParameters,
  runTests
};
