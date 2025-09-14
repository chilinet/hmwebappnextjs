# Dashboard Devices API Documentation

## Overview

The Dashboard Devices API extracts all related devices from a given node in the tree structure for dashboard purposes. The tree structure is stored in the MSSQL database in the `customer_settings` table under the `tree` field.

## Endpoint

```
GET /api/dashboard/devices/[nodeId]
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | string (UUID) | Yes | The ID of the node to extract devices from |
| `customerId` | string (UUID) | No | Customer ID (for backend calls, otherwise uses session) |

## Authentication

- **Session-based**: Uses NextAuth session for authentication
- **Backend calls**: Supports `x-api-source: backend` header with `customerId` parameter

## Response Format

### Success Response (200)

```json
{
  "success": true,
  "node_id": "3143ef00-647d-11ef-8cd8-8b580d9aa086",
  "node_name": "EME_ADG_Schloss Montabaur (ADG)",
  "node_type": "Property",
  "node_label": "Schloss Montabaur",
  "total_devices": 15,
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

### Error Responses

#### 400 Bad Request
```json
{
  "error": "Node ID is required"
}
```

#### 400 Bad Request - Invalid UUID
```json
{
  "error": "Node ID must be a valid UUID"
}
```

#### 401 Unauthorized
```json
{
  "error": "Not authenticated"
}
```

#### 404 Not Found - Node
```json
{
  "error": "Node not found",
  "message": "No node found with ID: 00000000-0000-0000-0000-000000000000"
}
```

#### 404 Not Found - Tree
```json
{
  "error": "Tree not found for customer"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "..."
}
```

## Device Object Structure

Each device in the `devices` array contains:

| Field | Type | Description |
|-------|------|-------------|
| `device_id` | string | Unique identifier of the device |
| `device_name` | string | Device name/identifier |
| `device_type` | string | Type of device (e.g., "vicki", "LHT52", "LW-eTRV", "dnt-lw-wth", "mcpanel") |
| `device_label` | string | Human-readable label for the device |
| `path` | array | Array of path objects showing the hierarchy to this device |
| `path_string` | string | Human-readable path string (e.g., "Building > Floor > Room") |

## Path Object Structure

Each path object contains:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Node ID |
| `name` | string | Node name |
| `type` | string | Node type (Property, Building, Floor, Room, Area, etc.) |
| `label` | string | Human-readable label |

## Example Requests

### Get all devices from a Property node
```bash
curl "http://localhost:3000/api/dashboard/devices/3143ef00-647d-11ef-8cd8-8b580d9aa086"
```

### Get all devices from a Building node
```bash
curl "http://localhost:3000/api/dashboard/devices/657d3a10-647d-11ef-8cd8-8b580d9aa086"
```

### Get all devices from a Room node
```bash
curl "http://localhost:3000/api/dashboard/devices/65fc0700-647d-11ef-8cd8-8b580d9aa086"
```

### Backend call with customer ID
```bash
curl -H "x-api-source: backend" "http://localhost:3000/api/dashboard/devices/3143ef00-647d-11ef-8cd8-8b580d9aa086?customerId=your-customer-id"
```

## Behavior

1. **Authentication**: Validates user session or backend API key
2. **Node Lookup**: Searches for the specified node ID in the tree structure
3. **Recursive Extraction**: All `relatedDevices` from the target node and all its sub-nodes are extracted
4. **Path Building**: For each device, the complete path from root to the device's parent node is built
5. **Response Formatting**: Devices are returned with their metadata and hierarchical path information

## Database Dependencies

- **Table**: `customer_settings`
- **Field**: `tree` (JSON/Text field containing the tree structure)
- **Connection**: Uses existing MSSQL connection from `lib/db.js`

## Device Types

The API supports various device types found in the tree structure:

- **vicki** - Vicki devices
- **LHT52** - Temperature/humidity sensors
- **LW-eTRV** - Electronic thermostatic radiator valves
- **dnt-lw-wth** - Wall thermostats
- **mcpanel** - Control panels

## Testing

Run the test script to verify API functionality:

```bash
node test-dashboard-devices-api.js
```

The test script includes:
- Valid node ID tests for different hierarchy levels
- Invalid UUID format tests
- Non-existent node ID tests
- Response format validation
- Device type grouping and summary
