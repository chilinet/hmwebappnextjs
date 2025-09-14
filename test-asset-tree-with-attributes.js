#!/usr/bin/env node

const baseUrl = 'http://localhost:3000';

async function testAssetTreeWithAttributes() {
  console.log('🧪 Testing Asset Tree API with Attributes\n');
  console.log('=' .repeat(80));

  // Test customer ID (you may need to adjust this)
  const customerId = '2EA4BA70-647A-11EF-8CD8-8B580D9AA086';

  try {
    console.log(`📋 Testing Asset Tree Sync for Customer: ${customerId}`);
    console.log('-'.repeat(60));

    const response = await fetch(`${baseUrl}/api/config/customers/tree/${customerId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-source': 'backend'
      }
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ Status: ${response.status}`);
      console.log(`📊 Success: ${data.success}`);
      console.log(`📝 Message: ${data.message}`);
      
      if (data.tree && data.tree.length > 0) {
        console.log(`\n🌳 Tree Structure Analysis:`);
        console.log(`   Root nodes: ${data.tree.length}`);
        
        // Analyze first few nodes for attributes
        const analyzeNode = (node, depth = 0, maxDepth = 3) => {
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
          }
          
          // Recursively analyze children
          if (node.children && node.children.length > 0) {
            node.children.slice(0, 2).forEach(child => { // Only show first 2 children
              analyzeNode(child, depth + 1, maxDepth);
            });
            if (node.children.length > 2) {
              console.log(`${indent}  ... and ${node.children.length - 2} more children`);
            }
          }
        };
        
        data.tree.slice(0, 2).forEach(rootNode => { // Only analyze first 2 root nodes
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
        
        const totalAttributes = data.tree.reduce((sum, node) => sum + countAttributes(node), 0);
        console.log(`\n📈 Summary:`);
        console.log(`   Total asset attributes found: ${totalAttributes}`);
        
      } else {
        console.log(`❌ No tree data returned`);
      }
    } else {
      console.log(`❌ Status: ${response.status}`);
      console.log(`❌ Error: ${data.message || data.error}`);
    }

  } catch (error) {
    console.log(`❌ Network Error: ${error.message}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n🎉 Asset Tree with Attributes Test Complete!');
}

// Run the test
testAssetTreeWithAttributes().catch(console.error);
