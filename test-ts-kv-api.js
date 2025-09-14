const axios = require('axios');

// Test the ts_kv API endpoint with attribute names
async function testTsKvApi() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('Testing ts_kv API endpoint with attribute names...\n');

  // Test 1: Basic query with numeric key that has data (should return only 1 value by default)
  console.log('Test 1: Basic query with numeric key 63 (default limit=1)');
  try {
    const response = await axios.get(`${baseUrl}/api/telemetry/ts-kv`, {
      params: {
        entity_id: '4a2a2440-7ffb-11f0-a2b4-4355cd101d7b',
        key: 63
      }
    });
    console.log('✅ Success:', response.data);
  } catch (error) {
    console.log('❌ Error:', error.response?.data || error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 1b: Basic query with numeric key_id
  console.log('Test 1b: Basic query with numeric key_id');
  try {
    const response = await axios.get(`${baseUrl}/api/telemetry/ts-kv`, {
      params: {
        entity_id: '4a2a2440-7ffb-11f0-a2b4-4355cd101d7b',
        key: 1
      }
    });
    console.log('✅ Success:', response.data);
  } catch (error) {
    console.log('❌ Error:', error.response?.data || error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 1c: Basic query with invalid attribute name (should fail)
  console.log('Test 1c: Basic query with invalid attribute name (should fail)');
  try {
    const response = await axios.get(`${baseUrl}/api/telemetry/ts-kv`, {
      params: {
        entity_id: '4a2a2440-7ffb-11f0-a2b4-4355cd101d7b',
        key: 'nonexistentAttribute'
      }
    });
    console.log('❌ Should have failed:', response.data);
  } catch (error) {
    console.log('✅ Correctly failed:', error.response?.data);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 2: Query with timerange using numeric key
  console.log('Test 2: Query with timerange using numeric key 63');
  try {
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours ago
    const to = new Date().toISOString(); // now
    
    const response = await axios.get(`${baseUrl}/api/telemetry/ts-kv`, {
      params: {
        entity_id: '4a2a2440-7ffb-11f0-a2b4-4355cd101d7b',
        key: 63,
        from: from,
        to: to,
        limit: 10
      }
    });
    console.log('✅ Success:', response.data);
  } catch (error) {
    console.log('❌ Error:', error.response?.data || error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 3: Invalid parameters
  console.log('Test 3: Invalid parameters');
  try {
    const response = await axios.get(`${baseUrl}/api/telemetry/ts-kv`, {
      params: {
        entity_id: 'invalid-uuid',
        key: 'transportApiState'
      }
    });
    console.log('❌ Should have failed:', response.data);
  } catch (error) {
    console.log('✅ Correctly failed:', error.response?.data);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 4: Missing required parameters
  console.log('Test 4: Missing required parameters');
  try {
    const response = await axios.get(`${baseUrl}/api/telemetry/ts-kv`, {
      params: {
        key: 'transportApiState'
      }
    });
    console.log('❌ Should have failed:', response.data);
  } catch (error) {
    console.log('✅ Correctly failed:', error.response?.data);
  }
}

// Run the test
testTsKvApi().catch(console.error);