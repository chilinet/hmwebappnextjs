#!/usr/bin/env node

const baseUrl = 'http://localhost:3000';

// Test cases for different node types
const testCases = [
  {
    name: 'Property Level - Schloss Montabaur',
    nodeId: '3143ef00-647d-11ef-8cd8-8b580d9aa086',
    expectedDevices: 'many',
    description: 'Should return all devices in the entire property'
  },
  {
    name: 'Building Level - Haus Nassau',
    nodeId: '657d3a10-647d-11ef-8cd8-8b580d9aa086',
    expectedDevices: 'many',
    description: 'Should return all devices in Haus Nassau building'
  },
  {
    name: 'Room Level - Raum 635 Nassau',
    nodeId: '65fc0700-647d-11ef-8cd8-8b580d9aa086',
    expectedDevices: 'few',
    description: 'Should return devices in specific room'
  },
  {
    name: 'Non-existent Node',
    nodeId: '00000000-0000-0000-0000-000000000000',
    expectedDevices: 'none',
    description: 'Should return 404 error'
  }
];

async function testDashboardDevicesAPI() {
  console.log('🧪 Testing Dashboard Devices API with Temperature Data\n');
  console.log('=' .repeat(80));

  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`📝 Description: ${testCase.description}`);
    console.log(`🔗 Node ID: ${testCase.nodeId}`);
    console.log('-'.repeat(60));

    try {
      // Test without temperature data
      console.log('\n🌡️  Testing WITHOUT temperature data:');
      const responseWithoutTemp = await fetch(`${baseUrl}/api/dashboard/devices/${testCase.nodeId}?customerId=2EA4BA70-647A-11EF-8CD8-8B580D9AA086`, {
        headers: {
          'x-api-source': 'backend',
          'Content-Type': 'application/json'
        }
      });

      const dataWithoutTemp = await responseWithoutTemp.json();
      
      if (responseWithoutTemp.ok) {
        console.log(`✅ Status: ${responseWithoutTemp.status}`);
        console.log(`📊 Total Devices: ${dataWithoutTemp.total_devices}`);
        console.log(`🌡️  Devices with Temperature: ${dataWithoutTemp.devices_with_temperature || 'N/A'}`);
        console.log(`🔧 Include Temperature: ${dataWithoutTemp.include_temperature}`);
        
        if (dataWithoutTemp.devices && dataWithoutTemp.devices.length > 0) {
          console.log(`\n📱 Sample Device (without temperature):`);
          const sampleDevice = dataWithoutTemp.devices[0];
          console.log(`   Device ID: ${sampleDevice.device_id}`);
          console.log(`   Name: ${sampleDevice.device_name}`);
          console.log(`   Type: ${sampleDevice.device_type}`);
          console.log(`   Label: ${sampleDevice.device_label}`);
          console.log(`   Path: ${sampleDevice.path_string}`);
          console.log(`   Temperature: ${sampleDevice.temperature ? 'Present' : 'Not requested'}`);
        }
      } else {
        console.log(`❌ Status: ${responseWithoutTemp.status}`);
        console.log(`❌ Error: ${dataWithoutTemp.error}`);
        if (dataWithoutTemp.message) {
          console.log(`📝 Message: ${dataWithoutTemp.message}`);
        }
      }

      // Test with temperature data
      console.log('\n🌡️  Testing WITH temperature data:');
      const responseWithTemp = await fetch(`${baseUrl}/api/dashboard/devices/${testCase.nodeId}?customerId=2EA4BA70-647A-11EF-8CD8-8B580D9AA086&includeTemperature=true`, {
        headers: {
          'x-api-source': 'backend',
          'Content-Type': 'application/json'
        }
      });

      const dataWithTemp = await responseWithTemp.json();
      
      if (responseWithTemp.ok) {
        console.log(`✅ Status: ${responseWithTemp.status}`);
        console.log(`📊 Total Devices: ${dataWithTemp.total_devices}`);
        console.log(`🌡️  Devices with Temperature: ${dataWithTemp.devices_with_temperature}`);
        console.log(`🔧 Include Temperature: ${dataWithTemp.include_temperature}`);
        
        if (dataWithTemp.devices && dataWithTemp.devices.length > 0) {
          console.log(`\n📱 Sample Device (with temperature):`);
          const sampleDevice = dataWithTemp.devices[0];
          console.log(`   Device ID: ${sampleDevice.device_id}`);
          console.log(`   Name: ${sampleDevice.device_name}`);
          console.log(`   Type: ${sampleDevice.device_type}`);
          console.log(`   Label: ${sampleDevice.device_label}`);
          console.log(`   Path: ${sampleDevice.path_string}`);
          
          if (sampleDevice.temperature) {
            if (sampleDevice.temperature.error) {
              console.log(`   🌡️  Temperature Error:`);
              console.log(`      Error: ${sampleDevice.temperature.error}`);
              console.log(`      Message: ${sampleDevice.temperature.message}`);
            } else {
              console.log(`   🌡️  Temperature Data:`);
              console.log(`      Value: ${sampleDevice.temperature.temperature}`);
              console.log(`      Type: ${sampleDevice.temperature.value_type}`);
              console.log(`      Timestamp: ${sampleDevice.temperature.timestamp_readable}`);
              console.log(`      Key: ${sampleDevice.temperature.key}`);
            }
          } else {
            console.log(`   🌡️  Temperature: No data available`);
          }
        }

        // Show temperature statistics
        if (dataWithTemp.devices && dataWithTemp.devices.length > 0) {
          const devicesWithTemp = dataWithTemp.devices.filter(d => d.temperature && d.temperature.temperature !== null);
          const devicesWithoutTemp = dataWithTemp.devices.filter(d => !d.temperature || d.temperature.temperature === null);
          
          console.log(`\n📈 Temperature Statistics:`);
          console.log(`   Devices with temperature data: ${devicesWithTemp.length}`);
          console.log(`   Devices without temperature data: ${devicesWithoutTemp.length}`);
          
          if (devicesWithTemp.length > 0) {
            const tempValues = devicesWithTemp
              .map(d => d.temperature.temperature)
              .filter(t => typeof t === 'number')
              .sort((a, b) => a - b);
            
            if (tempValues.length > 0) {
              console.log(`   Temperature range: ${tempValues[0]}°C - ${tempValues[tempValues.length - 1]}°C`);
              console.log(`   Average temperature: ${(tempValues.reduce((a, b) => a + b, 0) / tempValues.length).toFixed(2)}°C`);
            }
          }
        }
      } else {
        console.log(`❌ Status: ${responseWithTemp.status}`);
        console.log(`❌ Error: ${dataWithTemp.error}`);
        if (dataWithTemp.message) {
          console.log(`📝 Message: ${dataWithTemp.message}`);
        }
      }

    } catch (error) {
      console.log(`❌ Network Error: ${error.message}`);
    }

    console.log('\n' + '='.repeat(80));
  }

  console.log('\n🎉 Dashboard Devices API with Temperature Test Complete!');
}

// Run the test
testDashboardDevicesAPI().catch(console.error);
