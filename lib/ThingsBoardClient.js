import { getConnection } from './db';
import sql from 'mssql';

/**
 * @typedef {Object} Device
 * @property {Object} id
 * @property {string} id.id
 * @property {string} id.entityType
 * @property {number} createdTime
 * @property {string} name
 * @property {string} type
 * @property {string} [label]
 * @property {Object} [additionalInfo]
 * @property {string} [additionalInfo.description]
 * @property {boolean} [additionalInfo.gateway]
 * @property {boolean} [additionalInfo.overwriteActivityTime]
 * @property {Object} [deviceProfileId]
 * @property {string} deviceProfileId.id
 * @property {string} deviceProfileId.entityType
 * @property {Object} [tenantId]
 * @property {string} tenantId.id
 * @property {string} tenantId.entityType
 * @property {Object} [customerId]
 * @property {string} customerId.id
 * @property {string} customerId.entityType
 * @property {Object} [ownerId]
 * @property {string} ownerId.id
 * @property {string} ownerId.entityType
 * @property {Object} [firmwareId]
 * @property {string} firmwareId.id
 * @property {string} firmwareId.entityType
 * @property {Object} [softwareId]
 * @property {string} softwareId.id
 * @property {string} softwareId.entityType
 * @property {Object} [externalId]
 * @property {string} externalId.id
 * @property {string} externalId.entityType
 */

/**
 * @typedef {Object} TelemetryData
 * @property {number} ts
 * @property {*} value
 */

/**
 * @typedef {Object.<string, TelemetryData[]>} TelemetryResponse
 */

/**
 * @typedef {Object} DeviceAttribute
 * @property {string} key
 * @property {*} value
 * @property {number} [lastUpdateTs]
 */

/**
 * @typedef {Object.<string, DeviceAttribute[]>} DeviceAttributes
 */

/**
 * ThingsBoard Device Manager Class
 * Verwaltet ThingsBoard-Geräte über die ThingsBoard API
 */
export class ThingsBoardDeviceManager {
  /**
   * @param {string} [baseUrl] - ThingsBoard Base URL
   */
  constructor(baseUrl) {
    this.baseUrl = baseUrl || process.env.THINGSBOARD_URL || 'http://localhost:8080';
  }

  /**
   * Get ThingsBoard token for a customer from database
   * @param {string} customerId - Customer ID
   * @returns {Promise<string>} ThingsBoard Token
   */
  async getCustomerToken(customerId) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('customerId', sql.UniqueIdentifier, customerId)
      .query(`
        SELECT tbtoken, tbtokenexpiry
        FROM customer_settings 
        WHERE customer_id = @customerId
      `);

    if (result.recordset.length === 0) {
      throw new Error(`Keine ThingsBoard-Konfiguration für Customer ${customerId} gefunden`);
    }

    const record = result.recordset[0];
    
    console.log('*************************************************');
    console.log('customerId: ', customerId);
    console.log('result: ', result);
    console.log('*************************************************');

    // Prüfe ob Token abgelaufen ist
    if (!record.tbtoken || !record.tbtokenexpiry || new Date(record.tbtokenexpiry) < new Date()) {
      throw new Error(`ThingsBoard Token für Customer ${customerId} ist abgelaufen oder nicht verfügbar`);
    }

    return record.tbtoken;
  }

  /**
   * Get ThingsBoard token for a user by user ID
   * @param {number} userId - User ID
   * @returns {Promise<{token: string, customerId: string}>} Token und Customer ID
   */
  async getUserToken(userId) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT u.customerid, cs.tbtoken, cs.tbtokenexpiry
        FROM hm_users u
        LEFT JOIN customer_settings cs ON u.customerid = cs.customer_id
        WHERE u.userid = @userId
      `);

    if (result.recordset.length === 0) {
      throw new Error(`Benutzer ${userId} nicht gefunden`);
    }

    const record = result.recordset[0];
    
    if (!record.customerid) {
      throw new Error(`Keine Customer ID für Benutzer ${userId} gefunden`);
    }

    if (!record.tbtoken || !record.tbtokenexpiry || new Date(record.tbtokenexpiry) < new Date()) {
      throw new Error(`ThingsBoard Token für Customer ${record.customerid} ist abgelaufen oder nicht verfügbar`);
    }

    return { token: record.tbtoken, customerId: record.customerid };
  }

  /**
   * Make HTTP request to ThingsBoard API
   * @param {string} endpoint - API endpoint
   * @param {string} token - ThingsBoard token
   * @param {Object} options - Request options
   * @returns {Promise<*>} API response
   */
  async makeRequest(endpoint, token, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ThingsBoard API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get all devices for a customer
   * @param {string} customerId - Customer ID
   * @param {Object} params - Query parameters
   * @param {number} [params.pageSize] - Page size
   * @param {number} [params.page] - Page number
   * @param {string} [params.textSearch] - Search term
   * @param {string} [params.sortProperty] - Sort property
   * @param {'ASC'|'DESC'} [params.sortOrder] - Sort order
   * @param {string} [params.deviceProfileId] - Device profile ID
   * @param {boolean} [params.active] - Active devices only
   * @returns {Promise<{data: Device[], totalElements: number, totalPages: number, hasNext: boolean}>}
   */
  async getDevices(customerId, params = {}) {
    const token = await this.getCustomerToken(customerId);
    const searchParams = new URLSearchParams();
    
    // Standardwerte setzen, falls nicht angegeben
    const pageSize = params.pageSize || 50;
    const page = params.page || 0;
    
    // Parameter zur URL hinzufügen
    searchParams.append('pageSize', pageSize.toString());
    searchParams.append('page', page.toString());
    
    if (params.textSearch) searchParams.append('textSearch', params.textSearch);
    if (params.sortProperty) searchParams.append('sortProperty', params.sortProperty);
    if (params.sortOrder) searchParams.append('sortOrder', params.sortOrder);
    if (params.deviceProfileId) searchParams.append('deviceProfileId', params.deviceProfileId);
    if (params.active !== undefined) searchParams.append('active', params.active.toString());

    const queryString = searchParams.toString();
    const endpoint = `/api/customer/${customerId}/deviceInfos?${queryString}`;
    
    //console.log('*************************************************');
    //console.log('customerId: ', customerId);
    //console.log('params: ', params);
    //console.log('pageSize: ', pageSize);
    //console.log('page: ', page);
    //console.log('queryString: ', queryString);
    //console.log('endpoint: ', endpoint);
    //console.log('token: ', token);
    //console.log('*************************************************');   
    
    return this.makeRequest(endpoint, token);
  }

  /**
   * Get devices for a user by user ID
   * @param {number} userId - User ID
   * @param {Object} params - Query parameters
   * @returns {Promise<{data: Device[], totalElements: number, totalPages: number, hasNext: boolean, customerId: string}>}
   */
  async getDevicesByUser(userId, params = {}) {
    const { token, customerId } = await this.getUserToken(userId);
    const result = await this.getDevices(customerId, params);
    return { ...result, customerId };
  }

  /**
   * Get a specific device by ID
   * @param {string} deviceId - Device ID
   * @param {string} customerId - Customer ID
   * @returns {Promise<Device>}
   */
  async getDevice(deviceId, customerId) {
    const token = await this.getCustomerToken(customerId);
    return this.makeRequest(`/api/device/${deviceId}`, token);
  }

  /**
   * Get device telemetry data
   * @param {string} deviceId - Device ID
   * @param {string} customerId - Customer ID
   * @param {string[]} keys - Telemetry keys
   * @param {number} startTs - Start timestamp
   * @param {number} endTs - End timestamp
   * @param {number} [interval] - Aggregation interval
   * @param {number} [limit] - Max data points
   * @param {'NONE'|'MIN'|'MAX'|'AVG'|'SUM'|'COUNT'} [agg] - Aggregation function
   * @returns {Promise<TelemetryResponse>}
   */
  async getDeviceTelemetry(deviceId, customerId, keys, startTs, endTs, interval, limit, agg) {
    const token = await this.getCustomerToken(customerId);
    const params = new URLSearchParams({
      keys: keys.join(','),
      startTs: startTs.toString(),
      endTs: endTs.toString(),
    });

    if (interval) params.append('interval', interval.toString());
    if (limit) params.append('limit', limit.toString());
    if (agg) params.append('agg', agg);

    return this.makeRequest(`/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?${params}`, token);
  }

  /**
   * Get device telemetry for the last 7 days with hourly averages
   * @param {string} deviceId - Device ID
   * @param {string} customerId - Customer ID
   * @param {string[]} keys - Telemetry keys
   * @returns {Promise<TelemetryResponse>}
   */
  async getDeviceTelemetryLast7Days(deviceId, customerId, keys) {
    const endTs = Date.now();
    const startTs = endTs - (7 * 24 * 60 * 60 * 1000); // 7 days ago
    const interval = 60 * 60 * 1000; // 1 hour in milliseconds

    return this.getDeviceTelemetry(deviceId, customerId, keys, startTs, endTs, interval, undefined, 'AVG');
  }

  /**
   * Get device attributes
   * @param {string} deviceId - Device ID
   * @param {string} customerId - Customer ID
   * @param {'SERVER_SCOPE'|'SHARED_SCOPE'|'CLIENT_SCOPE'} [scope='SERVER_SCOPE'] - Attribute scope
   * @param {string[]} [keys] - Specific keys to retrieve
   * @returns {Promise<DeviceAttributes>}
   */
  async getDeviceAttributes(deviceId, customerId, scope = 'SERVER_SCOPE', keys) {
    const token = await this.getCustomerToken(customerId);
    let endpoint = `/api/plugins/telemetry/DEVICE/${deviceId}/attributes/${scope}`;
    
    if (keys && keys.length > 0) {
      endpoint += `?keys=${keys.join(',')}`;
    }

    return this.makeRequest(endpoint, token);
  }

  /**
   * Set device attributes
   * @param {string} deviceId - Device ID
   * @param {string} customerId - Customer ID
   * @param {'SERVER_SCOPE'|'SHARED_SCOPE'|'CLIENT_SCOPE'} scope - Attribute scope
   * @param {Object.<string, *>} attributes - Attributes to set
   * @returns {Promise<void>}
   */
  async setDeviceAttributes(deviceId, customerId, scope, attributes) {
    const token = await this.getCustomerToken(customerId);
    await this.makeRequest(`/api/plugins/telemetry/DEVICE/${deviceId}/attributes/${scope}`, token, {
      method: 'POST',
      body: JSON.stringify(attributes),
    });
  }

  /**
   * Delete device attributes
   * @param {string} deviceId - Device ID
   * @param {string} customerId - Customer ID
   * @param {'SERVER_SCOPE'|'SHARED_SCOPE'|'CLIENT_SCOPE'} scope - Attribute scope
   * @param {string[]} keys - Keys to delete
   * @returns {Promise<void>}
   */
  async deleteDeviceAttributes(deviceId, customerId, scope, keys) {
    const token = await this.getCustomerToken(customerId);
    await this.makeRequest(`/api/plugins/telemetry/DEVICE/${deviceId}/attributes/${scope}`, token, {
      method: 'DELETE',
      body: JSON.stringify(keys),
    });
  }

  /**
   * Create a new device
   * @param {string} customerId - Customer ID
   * @param {Object} deviceData - Device data
   * @param {string} deviceData.name - Device name
   * @param {string} deviceData.type - Device type
   * @param {string} [deviceData.label] - Device label
   * @param {string} [deviceData.deviceProfileId] - Device profile ID
   * @param {Object} [deviceData.additionalInfo] - Additional info
   * @returns {Promise<Device>}
   */
  async createDevice(customerId, deviceData) {
    const token = await this.getCustomerToken(customerId);
    return this.makeRequest('/api/device', token, {
      method: 'POST',
      body: JSON.stringify(deviceData),
    });
  }

  /**
   * Update an existing device
   * @param {string} deviceId - Device ID
   * @param {string} customerId - Customer ID
   * @param {Object} deviceData - Device data to update
   * @returns {Promise<Device>}
   */
  async updateDevice(deviceId, customerId, deviceData) {
    const token = await this.getCustomerToken(customerId);
    return this.makeRequest(`/api/device/${deviceId}`, token, {
      method: 'POST',
      body: JSON.stringify(deviceData),
    });
  }

  /**
   * Delete a device
   * @param {string} deviceId - Device ID
   * @param {string} customerId - Customer ID
   * @returns {Promise<void>}
   */
  async deleteDevice(deviceId, customerId) {
    const token = await this.getCustomerToken(customerId);
    await this.makeRequest(`/api/device/${deviceId}`, token, {
      method: 'DELETE',
    });
  }

  /**
   * Search devices by name or type
   * @param {string} customerId - Customer ID
   * @param {string} searchTerm - Search term
   * @param {Object} params - Query parameters
   * @returns {Promise<{data: Device[], totalElements: number, totalPages: number, hasNext: boolean}>}
   */
  async searchDevices(customerId, searchTerm, params = {}) {
    return this.getDevices(customerId, { ...params, textSearch: searchTerm });
  }
}

// Export a singleton instance for easy use
export const thingsBoardDeviceManager = new ThingsBoardDeviceManager(); 