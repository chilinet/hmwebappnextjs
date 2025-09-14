#!/usr/bin/env node

// Test the buildSubTree function directly
console.log('🧪 Testing buildSubTree function with mock data\n');

// Mock asset with attributes
const mockAsset = {
  id: "3143ef00-647d-11ef-8cd8-8b580d9aa086",
  name: "EME_ADG_Schloss Montabaur (ADG)",
  type: "Property",
  label: "Schloss Montabaur",
  hasDevices: false,
  relatedDevices: [],
  children: [],
  parentId: null,
  // Asset attributes
  operationalMode: "10",
  childLock: false,
  fixValue: null,
  maxTemp: 25.0,
  minTemp: 18.0,
  extTempDevice: null,
  overruleMinutes: 30,
  runStatus: "active",
  schedulerPlan: "weekday_schedule"
};

// Copy the buildSubTree function
function buildSubTree(asset, assetMap) {
  console.log(`Building subtree for asset ${asset.name}:`, {
    id: asset.id,
    hasAttributes: {
      operationalMode: asset.operationalMode,
      childLock: asset.childLock,
      fixValue: asset.fixValue,
      maxTemp: asset.maxTemp,
      minTemp: asset.minTemp,
      extTempDevice: asset.extTempDevice,
      overruleMinutes: asset.overruleMinutes,
      runStatus: asset.runStatus,
      schedulerPlan: asset.schedulerPlan
    }
  });

  const node = {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    label: asset.label,
    hasDevices: asset.hasDevices,
    children: asset.children
      .map(child => buildSubTree(child, assetMap))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
  
  // Füge relatedDevices nur hinzu, wenn es tatsächlich Devices gibt
  if (asset.hasDevices && asset.relatedDevices && asset.relatedDevices.length > 0) {
    node.relatedDevices = asset.relatedDevices;
  }

  // Füge Asset-Attribute hinzu
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

  assetAttributes.forEach(attr => {
    if (asset[attr] !== null && asset[attr] !== undefined) {
      node[attr] = asset[attr];
      console.log(`  Added attribute ${attr}: ${asset[attr]}`);
    }
  });
  
  console.log(`Final node for ${asset.name}:`, Object.keys(node));
  return node;
}

// Test the function
console.log('Testing buildSubTree with mock asset:');
console.log('=' .repeat(60));

const result = buildSubTree(mockAsset, new Map());

console.log('\nResult:');
console.log(JSON.stringify(result, null, 2));

console.log('\nChecking if attributes are present:');
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

assetAttributes.forEach(attr => {
  const hasAttr = result.hasOwnProperty(attr);
  const value = result[attr];
  console.log(`  ${attr}: ${hasAttr ? '✅' : '❌'} (${value})`);
});
