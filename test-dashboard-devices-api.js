const baseUrl = 'http://localhost:3000';

async function testDashboardDevicesAPI() {
  console.log('Testing dashboard devices API endpoint...\n');

  // Test cases
  const testCases = [
    {
      name: 'Test 1: Root Property Node (Schloss Montabaur)',
      nodeId: '3143ef00-647d-11ef-8cd8-8b580d9aa086',
      expectedDevices: 'multiple devices from all sub-nodes'
    },
    {
      name: 'Test 2: Building Node (Haus Nassau)',
      nodeId: '657d3a10-647d-11ef-8cd8-8b580d9aa086',
      expectedDevices: 'devices from rooms in this building'
    },
    {
      name: 'Test 3: Room Node (Raum 635 Nassau)',
      nodeId: '65fc0700-647d-11ef-8cd8-8b580d9aa086',
      expectedDevices: 'devices directly in this room'
    },
    {
      name: 'Test 4: Building Node (Haus Tabor)',
      nodeId: '67895dc0-647d-11ef-8cd8-8b580d9aa086',
      expectedDevices: 'devices from rooms in Tabor building'
    },
    {
      name: 'Test 5: Room Node (Raum 242)',
      nodeId: '946e7b70-8021-11f0-a2b4-4355cd101d7b',
      expectedDevices: 'devices directly in this room'
    },
    {
      name: 'Test 6: Invalid UUID format',
      nodeId: 'invalid-uuid',
      expectedDevices: 'should return error'
    },
    {
      name: 'Test 7: Non-existent Node ID',
      nodeId: '00000000-0000-0000-0000-000000000000',
      expectedDevices: 'should return 404'
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n${testCase.name}`);
    console.log('='.repeat(50));
    
    try {
      const response = await fetch(`${baseUrl}/api/dashboard/devices/${testCase.nodeId}?customerId=2EA4BA70-647A-11EF-8CD8-8B580D9AA086`, {
        headers: {
          'x-api-source': 'backend',
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      
      if (response.ok) {
        console.log('✅ Success:');
        console.log(`   Node ID: ${data.node_id}`);
        console.log(`   Node Name: ${data.node_name}`);
        console.log(`   Node Type: ${data.node_type}`);
        console.log(`   Node Label: ${data.node_label}`);
        console.log(`   Total Devices: ${data.total_devices}`);
        
        if (data.devices && data.devices.length > 0) {
          console.log('\n   Sample Devices:');
          data.devices.slice(0, 5).forEach((device, index) => {
            console.log(`   ${index + 1}. ${device.device_label} (${device.device_type})`);
            console.log(`      ID: ${device.device_id}`);
            console.log(`      Name: ${device.device_name}`);
            console.log(`      Path: ${device.path_string}`);
          });
          
          if (data.devices.length > 5) {
            console.log(`   ... and ${data.devices.length - 5} more devices`);
          }

          // Group devices by type
          const deviceTypes = {};
          data.devices.forEach(device => {
            if (!deviceTypes[device.device_type]) {
              deviceTypes[device.device_type] = 0;
            }
            deviceTypes[device.device_type]++;
          });

          console.log('\n   Device Types Summary:');
          Object.entries(deviceTypes).forEach(([type, count]) => {
            console.log(`   - ${type}: ${count} devices`);
          });
        } else {
          console.log('   No devices found in this node or its children');
        }
      } else {
        console.log('❌ Error:');
        console.log(`   Status: ${response.status}`);
        console.log(`   Error: ${data.error}`);
        if (data.message) {
          console.log(`   Message: ${data.message}`);
        }
      }
    } catch (error) {
      console.log('❌ Network Error:');
      console.log(`   ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Dashboard Devices API testing completed!');
}

// Run the tests
testDashboardDevicesAPI().catch(console.error);
