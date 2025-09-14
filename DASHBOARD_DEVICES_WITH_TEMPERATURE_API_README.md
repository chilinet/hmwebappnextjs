# Dashboard Devices API with Temperature Data

## Overview
The Dashboard Devices API retrieves all related devices for a given node from the hierarchical tree structure stored in the MSSQL `customer_settings.tree` field, with optional temperature data from the PostgreSQL `ts_kv` table.

## Endpoint
```
GET /api/dashboard/devices/[nodeId]
```

## Parameters

### Required
- `nodeId` (string, UUID): The ID of the node to extract devices from

### Optional
- `customerId` (string, UUID): Customer ID to use for tree lookup (defaults to session customer or `2EA4BA70-647A-11EF-8CD8-8B580D9AA086`)
- `includeTemperature` (boolean): Whether to include temperature data for each device (default: `false`)

## Features

### Device Extraction
- Recursively extracts all `relatedDevices` from the specified node and its children
- Provides full hierarchical path information for each device
- Supports different node types (Property, Building, Room, etc.)

### Temperature Integration
- When `includeTemperature=true`, fetches the latest `sensorTemperatur` value for each device
- Uses the device ID as `entity_id` in the `ts_kv` table
- Resolves `sensorTemperatur` text key to numeric `key_id` via `ts_kv_dictionary`
- Handles multiple value types (boolean, string, long, double, json)

## Response Format

### Without Temperature Data
```json
{
  "success": true,
  "node_id": "3143ef00-647d-11ef-8cd8-8b580d9aa086",
  "node_name": "EME_ADG_Schloss Montabaur (ADG)",
  "node_type": "Property",
  "node_label": "Schloss Montabaur",
  "total_devices": 45,
  "devices_with_temperature": 0,
  "include_temperature": false,
  "devices": [
    {
      "device_id": "3edc08d0-647a-11ef-8cd8-8b580d9aa086",
      "device_name": "70b3d52dd3007c11",
      "device_type": "vicki",
      "device_label": "Raum 635 Nassau",
      "path": [
        {
          "id": "3143ef00-647d-11ef-8cd8-8b580d9aa086",
          "name": "EME_ADG_Schloss Montabaur (ADG)",
          "type": "Property",
          "label": "Schloss Montabaur"
        },
        {
          "id": "657d3a10-647d-11ef-8cd8-8b580d9aa086",
          "name": "EME_ADG_ADG Haus Nassau",
          "type": "Building",
          "label": "Haus Nassau"
        },
        {
          "id": "65fc0700-647d-11ef-8cd8-8b580d9aa086",
          "name": "EME_ADG_ADG Raum 635 Nassau",
          "type": "Room",
          "label": "Raum 635 Nassau"
        }
      ],
      "path_string": "Schloss Montabaur > Haus Nassau > Raum 635 Nassau"
    }
  ]
}
```

### With Temperature Data
```json
{
  "success": true,
  "node_id": "3143ef00-647d-11ef-8cd8-8b580d9aa086",
  "node_name": "EME_ADG_Schloss Montabaur (ADG)",
  "node_type": "Property",
  "node_label": "Schloss Montabaur",
  "total_devices": 45,
  "devices_with_temperature": 23,
  "include_temperature": true,
  "devices": [
    {
      "device_id": "3edc08d0-647a-11ef-8cd8-8b580d9aa086",
      "device_name": "70b3d52dd3007c11",
      "device_type": "vicki",
      "device_label": "Raum 635 Nassau",
      "path": [...],
      "path_string": "Schloss Montabaur > Haus Nassau > Raum 635 Nassau",
      "temperature": {
        "temperature": 22.5,
        "value_type": "double",
        "timestamp": 1703123456789,
        "timestamp_readable": "2023-12-21 14:30:56",
        "key": 63
      }
    }
  ]
}
```

## Temperature Data Structure

When `includeTemperature=true`, each device includes a `temperature` object:

- `temperature`: The actual temperature value (number, string, boolean, or object)
- `value_type`: The data type ("double", "long", "string", "boolean", "json")
- `timestamp`: Unix timestamp in milliseconds
- `timestamp_readable`: Human-readable timestamp (YYYY-MM-DD HH:MI:SS)
- `key`: The numeric key ID from ts_kv_dictionary

If no temperature data is available, `temperature` will be `null`.

## Usage Examples

### Get devices without temperature data
```bash
curl "http://localhost:3000/api/dashboard/devices/3143ef00-647d-11ef-8cd8-8b580d9aa086?customerId=2EA4BA70-647A-11EF-8CD8-8B580D9AA086" \
  -H "x-api-source: backend"
```

### Get devices with temperature data
```bash
curl "http://localhost:3000/api/dashboard/devices/3143ef00-647d-11ef-8cd8-8b580d9aa086?customerId=2EA4BA70-647A-11EF-8CD8-8B580D9AA086&includeTemperature=true" \
  -H "x-api-source: backend"
```

### JavaScript/Node.js
```javascript
// Without temperature data
const response1 = await fetch('http://localhost:3000/api/dashboard/devices/3143ef00-647d-11ef-8cd8-8b580d9aa086?customerId=2EA4BA70-647A-11EF-8CD8-8B580D9AA086', {
  headers: { 'x-api-source': 'backend' }
});

// With temperature data
const response2 = await fetch('http://localhost:3000/api/dashboard/devices/3143ef00-647d-11ef-8cd8-8b580d9aa086?customerId=2EA4BA70-647A-11EF-8CD8-8B580D9AA086&includeTemperature=true', {
  headers: { 'x-api-source': 'backend' }
});

const data = await response2.json();
console.log(`Found ${data.total_devices} devices, ${data.devices_with_temperature} with temperature data`);
```

## Error Responses

### 400 Bad Request
```json
{
  "error": "Node ID is required"
}
```

### 404 Not Found
```json
{
  "error": "Node not found",
  "message": "No node found with ID: 00000000-0000-0000-0000-000000000000"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "Database connection failed"
}
```

## Performance Considerations

- **Temperature queries**: When `includeTemperature=true`, the API makes one database query per device to fetch temperature data
- **Large datasets**: For nodes with many devices, consider pagination or filtering
- **Caching**: Consider implementing caching for frequently accessed temperature data
- **Database connections**: Uses connection pooling for both MSSQL and PostgreSQL

## Database Dependencies

### MSSQL (customer_settings table)
- `customer_id`: Customer identifier
- `tree`: JSON field containing hierarchical structure

### PostgreSQL (ts_kv and ts_kv_dictionary tables)
- `ts_kv_dictionary`: Maps text keys to numeric key IDs
- `ts_kv`: Contains telemetry data with multiple value columns

## Testing

Run the test script to verify functionality:
```bash
node test-dashboard-devices-with-temperature.js
```

The test script validates:
- Device extraction for different node types
- Temperature data retrieval
- Error handling for invalid nodes
- Response format validation
