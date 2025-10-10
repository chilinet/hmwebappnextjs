// Test script for PostgreSQL APIs
const testDeviceSensorsAPI = async () => {
  console.log('Testing device-sensors API...');
  
  try {
    // Test with a sample device ID (replace with actual device ID from your system)
    const testDeviceId = '12345678-1234-1234-1234-123456789012'; // Replace with real device ID
    const response = await fetch(`http://localhost:3000/api/telemetry/device-sensors?deviceIds=${testDeviceId}&keys=sensorTemperature,targetTemperature,PercentValveOpen`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ device-sensors API response:', JSON.stringify(data, null, 2));
    } else {
      console.error('❌ device-sensors API error:', response.status, await response.text());
    }
  } catch (error) {
    console.error('❌ device-sensors API error:', error.message);
  }
};

const testDeviceSensorsAggregatedAPI = async () => {
  console.log('Testing device-sensors-aggregated API...');
  
  try {
    // Test with a sample device ID and time range
    const testDeviceId = '12345678-1234-1234-1234-123456789012'; // Replace with real device ID
    const endTime = Date.now();
    const startTime = endTime - (24 * 60 * 60 * 1000); // 24 hours ago
    
    const response = await fetch(`http://localhost:3000/api/telemetry/device-sensors-aggregated?deviceIds=${testDeviceId}&key=sensorTemperature&startTs=${startTime}&endTs=${endTime}&interval=3600000`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ device-sensors-aggregated API response:', JSON.stringify(data, null, 2));
    } else {
      console.error('❌ device-sensors-aggregated API error:', response.status, await response.text());
    }
  } catch (error) {
    console.error('❌ device-sensors-aggregated API error:', error.message);
  }
};

const testTSKVAPI = async () => {
  console.log('Testing ts-kv API...');
  
  try {
    // Test with a sample device ID and key
    const testDeviceId = '12345678-1234-1234-1234-123456789012'; // Replace with real device ID
    const response = await fetch(`http://localhost:3000/api/telemetry/ts-kv?entity_id=${testDeviceId}&key=sensorTemperature&limit=5`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ ts-kv API response:', JSON.stringify(data, null, 2));
    } else {
      console.error('❌ ts-kv API error:', response.status, await response.text());
    }
  } catch (error) {
    console.error('❌ ts-kv API error:', error.message);
  }
};

// Run all tests
const runTests = async () => {
  console.log('🚀 Starting PostgreSQL API tests...\n');
  
  await testTSKVAPI();
  console.log('\n' + '='.repeat(50) + '\n');
  
  await testDeviceSensorsAPI();
  console.log('\n' + '='.repeat(50) + '\n');
  
  await testDeviceSensorsAggregatedAPI();
  console.log('\n' + '='.repeat(50) + '\n');
  
  console.log('✅ All tests completed!');
};

// Check if running in Node.js environment
if (typeof window === 'undefined') {
  // Node.js environment - use node-fetch
  const fetch = require('node-fetch');
  runTests();
} else {
  // Browser environment
  runTests();
}
