#!/usr/bin/env node

// Mock test to demonstrate the asset tree structure with attributes
console.log('🧪 Testing Asset Tree Structure with Attributes (Mock)\n');
console.log('=' .repeat(80));

// Simulate the asset tree structure that would be returned
const mockAssetTree = [
  {
    "id": "3143ef00-647d-11ef-8cd8-8b580d9aa086",
    "name": "EME_ADG_Schloss Montabaur (ADG)",
    "type": "Property",
    "label": "Schloss Montabaur",
    "hasDevices": false,
    "operationalMode": "10",
    "childLock": false,
    "fixValue": null,
    "maxTemp": 25.0,
    "minTemp": 18.0,
    "extTempDevice": null,
    "overruleMinutes": 30,
    "runStatus": "active",
    "schedulerPlan": "weekday_schedule",
    "children": [
      {
        "id": "657d3a10-647d-11ef-8cd8-8b580d9aa086",
        "name": "EME_ADG_ADG Haus Nassau",
        "type": "Building",
        "label": "Haus Nassau",
        "hasDevices": false,
        "operationalMode": "2",
        "childLock": true,
        "fixValue": 22.0,
        "maxTemp": 24.0,
        "minTemp": 20.0,
        "extTempDevice": "3edc08d0-647a-11ef-8cd8-8b580d9aa086",
        "overruleMinutes": 60,
        "runStatus": "standby",
        "schedulerPlan": "custom_schedule",
        "children": [
          {
            "id": "65fc0700-647d-11ef-8cd8-8b580d9aa086",
            "name": "EME_ADG_ADG Raum 635 Nassau",
            "type": "Room",
            "label": "Raum 635 Nassau",
            "hasDevices": true,
            "operationalMode": "1",
            "childLock": false,
            "fixValue": null,
            "maxTemp": 23.0,
            "minTemp": 19.0,
            "extTempDevice": "3edc08d0-647a-11ef-8cd8-8b580d9aa086",
            "overruleMinutes": 15,
            "runStatus": "heating",
            "schedulerPlan": "office_hours",
            "relatedDevices": [
              {
                "id": "3edc08d0-647a-11ef-8cd8-8b580d9aa086",
                "name": "70b3d52dd3007c11",
                "type": "vicki",
                "label": "Raum 635 Nassau"
              }
            ]
          }
        ]
      }
    ]
  }
];

// Function to analyze the tree structure
function analyzeNode(node, depth = 0, maxDepth = 3) {
  if (depth > maxDepth) return;
  
  const indent = '  '.repeat(depth);
  console.log(`${indent}📁 ${node.name} (${node.type})`);
  
  // Check for asset attributes
  const assetAttributes = [
    'operationalMode',
    'childLock',
    'fixValue',
    'maxTemp',
    'minTemp',
    'extTempDevice',
    'overruleMinutes',
    'runStatus',
    'schedulerPlan'
  ];
  
  const foundAttributes = assetAttributes.filter(attr => 
    node[attr] !== null && node[attr] !== undefined
  );
  
  if (foundAttributes.length > 0) {
    console.log(`${indent}  🔧 Attributes: ${foundAttributes.join(', ')}`);
    foundAttributes.forEach(attr => {
      console.log(`${indent}    ${attr}: ${node[attr]}`);
    });
  } else {
    console.log(`${indent}  🔧 No attributes found`);
  }
  
  // Check for devices
  if (node.hasDevices && node.relatedDevices) {
    console.log(`${indent}  📱 Devices: ${node.relatedDevices.length}`);
    node.relatedDevices.forEach(device => {
      console.log(`${indent}    - ${device.name} (${device.type}): ${device.label}`);
    });
  }
  
  // Recursively analyze children
  if (node.children && node.children.length > 0) {
    node.children.forEach(child => {
      analyzeNode(child, depth + 1, maxDepth);
    });
  }
}

console.log('🌳 Mock Asset Tree Structure with Attributes:');
console.log('-'.repeat(60));

mockAssetTree.forEach(rootNode => {
  analyzeNode(rootNode);
});

// Count total attributes across all nodes
const countAttributes = (node) => {
  let count = 0;
  const assetAttributes = [
    'operationalMode', 'childLock', 'fixValue', 'maxTemp', 'minTemp',
    'extTempDevice', 'overruleMinutes', 'runStatus', 'schedulerPlan'
  ];
  
  assetAttributes.forEach(attr => {
    if (node[attr] !== null && node[attr] !== undefined) {
      count++;
    }
  });
  
  if (node.children) {
    node.children.forEach(child => {
      count += countAttributes(child);
    });
  }
  
  return count;
};

const totalAttributes = mockAssetTree.reduce((sum, node) => sum + countAttributes(node), 0);

console.log('\n📈 Summary:');
console.log(`   Total asset attributes found: ${totalAttributes}`);
console.log(`   Root nodes: ${mockAssetTree.length}`);

console.log('\n✅ Expected API Response Structure:');
console.log(JSON.stringify(mockAssetTree[0], null, 2));

console.log('\n' + '='.repeat(80));
console.log('\n🎉 Asset Tree with Attributes Mock Test Complete!');
console.log('\n📋 The API now includes the following asset attributes:');
console.log('   • operationalMode - Betriebsmodus des Assets');
console.log('   • childLock - Kindersicherung aktiviert/deaktiviert');
console.log('   • fixValue - Feste Temperatur (falls gesetzt)');
console.log('   • maxTemp - Maximale Temperatur');
console.log('   • minTemp - Minimale Temperatur');
console.log('   • extTempDevice - Externes Temperaturgerät (Device ID)');
console.log('   • overruleMinutes - Übersteuerungszeit in Minuten');
console.log('   • runStatus - Laufstatus (active, standby, heating, etc.)');
console.log('   • schedulerPlan - Zeitplan-Name');
