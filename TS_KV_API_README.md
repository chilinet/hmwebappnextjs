# TS_KV API Documentation

This API provides direct access to the PostgreSQL `ts_kv` table containing transaction/telemetry data.

## Endpoint

```
GET /api/telemetry/ts-kv
```

## Required Parameters

- `entity_id` (string): UUID of the entity (required)
- `key` (string|number): Attribute identifier - can be either:
  - Attribute name from ts_kv_dictionary (e.g., `transportApiState`)
  - Numeric key_id (e.g., `1`)

## Optional Parameters

- `from` (string): Start timestamp in ISO format (e.g., "2024-01-01T00:00:00.000Z")
- `to` (string): End timestamp in ISO format (e.g., "2024-01-31T23:59:59.999Z")
- `limit` (number): Maximum number of records to return (default: 1, max: 1000)

## Behavior

- **Key Resolution**: If an attribute name is provided, it's automatically resolved to the numeric key_id using ts_kv_dictionary
- **Value Types**: The API automatically detects and returns the correct value type from the ts_kv table fields
- **Without timerange**: Returns the latest values ordered by timestamp (descending)
- **With timerange**: Returns values within the specified time range ordered by timestamp (descending)

## Value Types

The API supports the following value types from the ts_kv table:

- `boolean` - from `bool_v` field
- `string` - from `str_v` field  
- `long` - from `long_v` field
- `double` - from `dbl_v` field
- `json` - from `json_v` field

Only one value type is populated per record, and the API automatically detects which field contains the actual value.

## Timestamp Fields

Each data record includes two timestamp representations:

- `ts` - Original timestamp as serial number (milliseconds since Unix epoch)
- `ts_readable` - Human-readable timestamp in format 'YYYY-MM-DD HH24:MI:SS'

## Response Format

```json
{
  "success": true,
  "entity_id": "4a2a2440-7ffb-11f0-a2b4-4355cd101d7b",
  "data": [
    {
      "key": 1,
      "ts": 1705329025000,
      "ts_readable": "2024-01-15 14:30:25",
      "value": 25.5,
      "value_type": "double"
    }
  ],
  "count": 1,
  "parameters": {
    "key": "transportApiState",
    "key_resolved": 1,
    "from": null,
    "to": null,
    "limit": 1
  }
}
```

## Example Requests

### 1. Get latest value using attribute name
```bash
curl "http://localhost:3000/api/telemetry/ts-kv?entity_id=4a2a2440-7ffb-11f0-a2b4-4355cd101d7b&key=transportApiState"
```

### 2. Get latest value using numeric key_id
```bash
curl "http://localhost:3000/api/telemetry/ts-kv?entity_id=4a2a2440-7ffb-11f0-a2b4-4355cd101d7b&key=1"
```

### 3. Get values within a time range using attribute name
```bash
curl "http://localhost:3000/api/telemetry/ts-kv?entity_id=4a2a2440-7ffb-11f0-a2b4-4355cd101d7b&key=transportApiState&from=2024-01-01T00:00:00.000Z&to=2024-01-31T23:59:59.999Z&limit=50"
```

### 4. Get latest 5 values using attribute name
```bash
curl "http://localhost:3000/api/telemetry/ts-kv?entity_id=4a2a2440-7ffb-11f0-a2b4-4355cd101d7b&key=transportApiState&limit=5"
```

## Error Responses

### 400 Bad Request
```json
{
  "error": "entity_id parameter is required"
}
```

### 405 Method Not Allowed
```json
{
  "error": "Method not allowed"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "Connection failed"
}
```

## Environment Variables Required

Add these to your `.env.local` file:

```env
PG_USER=your_postgres_username
PG_PASSWORD=your_postgres_password
PG_HOST=your_postgres_host
PG_PORT=5432
PG_DATABASE=your_postgres_database
PG_SSL=false
```

## Testing

Run the test script to verify the API works:

```bash
node test-ts-kv-api.js
```

Make sure your Next.js development server is running (`npm run dev`) before running the test.
