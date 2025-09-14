import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import sql from 'mssql';
import { getConnection } from '../../../../lib/db';
import { getPgConnection } from '../../../../lib/pgdb';

/**
 * Find a node by ID in the tree structure
 * @param {Array} treeData - Array of root nodes
 * @param {string} nodeId - ID to search for
 * @returns {Object|null} Found node or null
 */
function findNodeById(treeData, nodeId) {
  for (const node of treeData) {
    if (node.id === nodeId) {
      return node;
    }
    
    // Search in children recursively
    const found = findNodeInChildren(node.children, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * Recursively search for a node in children
 * @param {Array} children - Array of child nodes
 * @param {string} nodeId - ID to search for
 * @returns {Object|null} Found node or null
 */
function findNodeInChildren(children, nodeId) {
  if (!children || !Array.isArray(children)) {
    return null;
  }
  
  for (const child of children) {
    if (child.id === nodeId) {
      return child;
    }
    
    // Search recursively in this child's children
    const found = findNodeInChildren(child.children, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * Get sensor target temperature for a device from ts_kv table
 * @param {string} deviceId - Device entity ID
 * @returns {Object|null} Target temperature data or null if not found
 */
async function getSensorTargetTemperature(deviceId) {
  try {
    const pool = await getPgConnection();
    const client = await pool.connect();
    
    try {
      // Try to find target temperature-related keys in the dictionary
      const keyResult = await client.query(`
        SELECT key, key_id 
        FROM ts_kv_dictionary 
        WHERE key = 'targetTemperature'
        LIMIT 1
      `);
      
      if (keyResult.rows.length === 0) {
        console.log(`No target temperature-related keys found in dictionary for device ${deviceId}`);
        return {
          error: 'Key not found',
          message: 'No target temperature-related keys found in ts_kv_dictionary'
        };
      }
      
      const keyId = keyResult.rows[0].key_id;
      const keyName = keyResult.rows[0].key;
      
      // Get the latest target temperature value
      const targetTempResult = await client.query(`
        SELECT entity_id,
               key,
               ts,
               to_char(to_timestamp(ts / 1000), 'YYYY-MM-DD HH24:MI:SS') AS ts_readable,
               bool_v,
               str_v,
               long_v,
               dbl_v,
               json_v
        FROM ts_kv
        WHERE entity_id = $1
          AND key = $2
        ORDER BY ts DESC
        LIMIT 1
      `, [deviceId, keyId]);
      
      if (targetTempResult.rows.length === 0) {
        return {
          error: 'No data',
          message: 'No target temperature data found for this device'
        };
      }
      
      const row = targetTempResult.rows[0];
      let value = null;
      let valueType = null;
      
      // Determine which field has a value and extract it
      if (row.bool_v !== null) {
        value = row.bool_v;
        valueType = 'boolean';
      } else if (row.str_v !== null) {
        value = row.str_v;
        valueType = 'string';
      } else if (row.long_v !== null) {
        value = row.long_v;
        valueType = 'long';
      } else if (row.dbl_v !== null) {
        value = row.dbl_v;
        valueType = 'double';
      } else if (row.json_v !== null) {
        value = row.json_v;
        valueType = 'json';
      }
      
      return {
        targetTemperature: value,
        value_type: valueType,
        timestamp: row.ts,
        timestamp_readable: row.ts_readable,
        key: row.key,
        key_name: keyName
      };
      
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`Error getting target temperature for device ${deviceId}:`, error);
    return {
      error: 'Database error',
      message: `PostgreSQL connection failed: ${error.message}`
    };
  }
}

/**
 * Get sensor relative humidity for a device from ts_kv table
 * @param {string} deviceId - Device entity ID
 * @returns {Object|null} Humidity data or null if not found
 */
async function getSensorHumidity(deviceId) {
  try {
    const pool = await getPgConnection();
    const client = await pool.connect();
    
    try {
      // Try to find humidity-related keys in the dictionary
      const keyResult = await client.query(`
        SELECT key, key_id 
        FROM ts_kv_dictionary 
        WHERE key = 'relativeHumidity'
        LIMIT 1
      `);
      
      if (keyResult.rows.length === 0) {
        console.log(`No humidity-related keys found in dictionary for device ${deviceId}`);
        return {
          error: 'Key not found',
          message: 'No humidity-related keys found in ts_kv_dictionary'
        };
      }
      
      const keyId = keyResult.rows[0].key_id;
      const keyName = keyResult.rows[0].key;
      
      // Get the latest humidity value
      const humidityResult = await client.query(`
        SELECT entity_id,
               key,
               ts,
               to_char(to_timestamp(ts / 1000), 'YYYY-MM-DD HH24:MI:SS') AS ts_readable,
               bool_v,
               str_v,
               long_v,
               dbl_v,
               json_v
        FROM ts_kv
        WHERE entity_id = $1
          AND key = $2
        ORDER BY ts DESC
        LIMIT 1
      `, [deviceId, keyId]);
      
      if (humidityResult.rows.length === 0) {
        return {
          error: 'No data',
          message: 'No humidity data found for this device'
        };
      }
      
      const row = humidityResult.rows[0];
      let value = null;
      let valueType = null;
      
      // Determine which field has a value and extract it
      if (row.bool_v !== null) {
        value = row.bool_v;
        valueType = 'boolean';
      } else if (row.str_v !== null) {
        value = row.str_v;
        valueType = 'string';
      } else if (row.long_v !== null) {
        value = row.long_v;
        valueType = 'long';
      } else if (row.dbl_v !== null) {
        value = row.dbl_v;
        valueType = 'double';
      } else if (row.json_v !== null) {
        value = row.json_v;
        valueType = 'json';
      }
      
      return {
        humidity: value,
        value_type: valueType,
        timestamp: row.ts,
        timestamp_readable: row.ts_readable,
        key: row.key,
        key_name: keyName
      };
      
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`Error getting humidity for device ${deviceId}:`, error);
    return {
      error: 'Database error',
      message: `PostgreSQL connection failed: ${error.message}`
    };
  }
}

/**
 * Get sensor temperature for a device from ts_kv table
 * @param {string} deviceId - Device entity ID
 * @returns {Object|null} Temperature data or null if not found
 */
async function getSensorTemperature(deviceId) {
  try {
    const pool = await getPgConnection();
    const client = await pool.connect();
    
    try {
      // Try to find temperature-related keys in the dictionary
      const keyResult = await client.query(`
        SELECT key, key_id 
        FROM ts_kv_dictionary 
        WHERE key = 'sensorTemperature'
        LIMIT 1
      `);
      
      if (keyResult.rows.length === 0) {
        console.log(`No temperature-related keys found in dictionary for device ${deviceId}`);
        return {
          error: 'Key not found',
          message: 'No temperature-related keys found in ts_kv_dictionary'
        };
      }
      
      const keyId = keyResult.rows[0].key_id;
      const keyName = keyResult.rows[0].key;
      
      // Get the latest temperature value
      const tempResult = await client.query(`
        SELECT entity_id,
               key,
               ts,
               to_char(to_timestamp(ts / 1000), 'YYYY-MM-DD HH24:MI:SS') AS ts_readable,
               bool_v,
               str_v,
               long_v,
               dbl_v,
               json_v
        FROM ts_kv
        WHERE entity_id = $1
          AND key = $2
        ORDER BY ts DESC
        LIMIT 1
      `, [deviceId, keyId]);
      
      if (tempResult.rows.length === 0) {
        return {
          error: 'No data',
          message: 'No temperature data found for this device'
        };
      }
      
      const row = tempResult.rows[0];
      let value = null;
      let valueType = null;
      
      // Determine which field has a value and extract it
      if (row.bool_v !== null) {
        value = row.bool_v;
        valueType = 'boolean';
      } else if (row.str_v !== null) {
        value = row.str_v;
        valueType = 'string';
      } else if (row.long_v !== null) {
        value = row.long_v;
        valueType = 'long';
      } else if (row.dbl_v !== null) {
        value = row.dbl_v;
        valueType = 'double';
      } else if (row.json_v !== null) {
        value = row.json_v;
        valueType = 'json';
      }
      
      return {
        temperature: value,
        value_type: valueType,
        timestamp: row.ts,
        timestamp_readable: row.ts_readable,
        key: row.key,
        key_name: keyName
      };
      
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`Error getting temperature for device ${deviceId}:`, error);
    return {
      error: 'Database error',
      message: `PostgreSQL connection failed: ${error.message}`
    };
  }
}

/**
 * Recursively extract all related devices from a node and its children
 * @param {Object} node - The current node
 * @param {Array} path - Current path to this node
 * @param {boolean} includeTemperature - Whether to include temperature data
 * @returns {Array} Array of related devices with path information
 */
async function extractRelatedDevices(node, path = [], includeTemperature = false) {
  const devices = [];
  
  // Add current node to path
  const currentPath = [...path, {
    id: node.id,
    name: node.name,
    type: node.type,
    label: node.label
  }];

  // Don't add individual devices - only add node information with temperature

  // Add node temperature, humidity and target temperature information based on operationalMode
  if (node.relatedDevices && Array.isArray(node.relatedDevices) && node.relatedDevices.length > 0) {
    let nodeTemperature = null;
    let temperatureSource = null;
    let nodeHumidity = null;
    let humiditySource = null;
    let nodeTargetTemperature = null;
    let targetTemperatureSource = null;
    
    if (includeTemperature) {
      if (node.operationalMode && (node.operationalMode == 2 || node.operationalMode == 10)) {
        // For operationalMode 2 or 10, use extTempDevice
        if (node.extTempDevice) {
          const temperatureData = await getSensorTemperature(node.extTempDevice);
          nodeTemperature = temperatureData.temperature || null;
          temperatureSource = 'extTempDevice';
        }
      } else {
        // For operationalMode 0 or missing, calculate average temperature from all devices
        const temperatures = [];
        
        for (const device of node.relatedDevices) {
          const temperatureData = await getSensorTemperature(device.id);
          if (temperatureData.temperature !== null && temperatureData.temperature !== undefined) {
            const tempValue = parseFloat(temperatureData.temperature);
            if (!isNaN(tempValue)) {
              temperatures.push(tempValue);
            }
          }
        }
        
        if (temperatures.length > 0) {
          const averageTemp = temperatures.reduce((sum, temp) => sum + temp, 0) / temperatures.length;
          nodeTemperature = averageTemp.toFixed(1);
          temperatureSource = 'average';
        }
      }
    }
    
    // Load humidity data using the same logic as temperature
    if (includeTemperature) {
      if (node.operationalMode && (node.operationalMode == 2 || node.operationalMode == 10)) {
        // For operationalMode 2 or 10, use extTempDevice
        if (node.extTempDevice) {
          const humidityData = await getSensorHumidity(node.extTempDevice);
          nodeHumidity = humidityData.humidity || null;
          humiditySource = 'extTempDevice';
        }
      } else {
        // For operationalMode 0 or missing, calculate average humidity from all devices
        const humidities = [];
        
        for (const device of node.relatedDevices) {
          const humidityData = await getSensorHumidity(device.id);
          if (humidityData.humidity !== null && humidityData.humidity !== undefined) {
            const humidityValue = parseFloat(humidityData.humidity);
            if (!isNaN(humidityValue)) {
              humidities.push(humidityValue);
            }
          }
        }
        
        if (humidities.length > 0) {
          const averageHumidity = humidities.reduce((sum, humidity) => sum + humidity, 0) / humidities.length;
          nodeHumidity = averageHumidity.toFixed(1);
          humiditySource = 'average';
        }
      }
    }
    
    // Load target temperature data with different logic
    if (includeTemperature) {
      if (node.operationalMode && node.operationalMode == 2) {
        // For operationalMode 2, use extTempDevice
        if (node.extTempDevice) {
          const targetTempData = await getSensorTargetTemperature(node.extTempDevice);
          nodeTargetTemperature = targetTempData.targetTemperature || null;
          targetTemperatureSource = 'extTempDevice';
        }
      } else {
        // For all other operationalModes (0, 10, missing), calculate average from all devices
        const targetTemperatures = [];
        
        for (const device of node.relatedDevices) {
          const targetTempData = await getSensorTargetTemperature(device.id);
          if (targetTempData.targetTemperature !== null && targetTempData.targetTemperature !== undefined) {
            const targetTempValue = parseFloat(targetTempData.targetTemperature);
            if (!isNaN(targetTempValue)) {
              targetTemperatures.push(targetTempValue);
            }
          }
        }
        
        if (targetTemperatures.length > 0) {
          const averageTargetTemp = targetTemperatures.reduce((sum, temp) => sum + temp, 0) / targetTemperatures.length;
          nodeTargetTemperature = averageTargetTemp.toFixed(1);
          targetTemperatureSource = 'average';
        }
      }
    }
    
    // Add node as asset with temperature, humidity and target temperature information
    const nodeAssetData = {
      asset_id: node.id,
      asset_name: node.name,
      asset_type: node.type,
      asset_label: node.label,
      path_string: currentPath.map(p => p.label).join(' > '),
      operational_mode: node.operationalMode || 0,
      ext_temp_device: node.extTempDevice || null,
      temperature: nodeTemperature,
      temperature_source: temperatureSource,
      humidity: nodeHumidity,
      humidity_source: humiditySource,
      target_temperature: nodeTargetTemperature,
      target_temperature_source: targetTemperatureSource,
      device_count: node.relatedDevices.length
    };
    
    devices.push(nodeAssetData);
  }

  // Recursively process children
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      const childDevices = await extractRelatedDevices(child, currentPath, includeTemperature);
      devices.push(...childDevices);
    }
  }

  return devices;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  const isBackendCall = req.headers['x-api-source'] === 'backend';

  // For testing purposes, allow unauthenticated access
  // if (!session && !isBackendCall) {
  //   return res.status(401).json({ error: 'Not authenticated' });
  // }

  const { nodeId, customerId, includeTemperature = 'false' } = req.query;
  if (!nodeId) {
    return res.status(400).json({ error: 'Node ID is required' });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(nodeId)) {
    return res.status(400).json({ error: 'Node ID must be a valid UUID' });
  }

  let connection;
  try {
    connection = await getConnection();
    const customerIdToUse = isBackendCall ? customerId : (session?.user?.customerid || '2EA4BA70-647A-11EF-8CD8-8B580D9AA086');

    // Load the tree structure from customer_settings table
    const result = await connection.request()
      .input('customerId', sql.UniqueIdentifier, customerIdToUse)
      .query('SELECT tree FROM customer_settings WHERE customer_id = @customerId');

    if (!result.recordset[0]?.tree) {
      return res.status(404).json({ error: 'Tree not found for customer' });
    }

    // Parse tree JSON
    const treeData = JSON.parse(result.recordset[0].tree);
    
    // Find the node with the given ID
    const targetNode = findNodeById(treeData, nodeId);
    
    if (!targetNode) {
      return res.status(404).json({ 
        error: 'Node not found',
        message: `No node found with ID: ${nodeId}`
      });
    }

    // Extract all related devices recursively
    const shouldIncludeTemperature = includeTemperature === 'true';
    const relatedDevices = await extractRelatedDevices(targetNode, [], shouldIncludeTemperature);
    
    // Count assets with temperature data
    const assetsWithTemperature = relatedDevices.filter(asset => 
      asset.temperature !== null && asset.temperature !== undefined
    ).length;

    // Count assets with operational mode 2 or 10
    const assetsWithOperationalMode = relatedDevices.filter(asset => 
      asset.operational_mode && (asset.operational_mode == 2 || asset.operational_mode == 10)
    ).length;

    // Count assets with external temperature devices
    const assetsWithExtTempDevice = relatedDevices.filter(asset => 
      asset.ext_temp_device && asset.ext_temp_device !== null
    ).length;

    // Count assets with average temperature
    const assetsWithAverageTemp = relatedDevices.filter(asset => 
      asset.temperature_source === 'average'
    ).length;

    // Count assets with humidity data
    const assetsWithHumidity = relatedDevices.filter(asset => 
      asset.humidity !== null && asset.humidity !== undefined
    ).length;

    // Count assets with average humidity
    const assetsWithAverageHumidity = relatedDevices.filter(asset => 
      asset.humidity_source === 'average'
    ).length;

    // Count assets with target temperature data
    const assetsWithTargetTemperature = relatedDevices.filter(asset => 
      asset.target_temperature !== null && asset.target_temperature !== undefined
    ).length;

    // Count assets with average target temperature
    const assetsWithAverageTargetTemperature = relatedDevices.filter(asset => 
      asset.target_temperature_source === 'average'
    ).length;

    // Build response
    const response = {
      success: true,
      node_id: nodeId,
      node_name: targetNode.name || 'Unknown',
      node_type: targetNode.type || 'Unknown',
      node_label: targetNode.label || 'Unknown',
      total_assets: relatedDevices.length,
      assets_with_temperature: assetsWithTemperature,
      assets_with_operational_mode: assetsWithOperationalMode,
      assets_with_ext_temp_device: assetsWithExtTempDevice,
      assets_with_average_temp: assetsWithAverageTemp,
      assets_with_humidity: assetsWithHumidity,
      assets_with_average_humidity: assetsWithAverageHumidity,
      assets_with_target_temperature: assetsWithTargetTemperature,
      assets_with_average_target_temperature: assetsWithAverageTargetTemperature,
      include_temperature: shouldIncludeTemperature,
      assets: relatedDevices
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Error in dashboard devices API:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}
