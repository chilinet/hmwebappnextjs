import { getConnection } from './db';
import sql from 'mssql';

export interface Device {
  id: {
    id: string;
    entityType: string;
  };
  createdTime: number;
  name: string;
  type: string;
  label?: string;
  additionalInfo?: {
    description?: string;
    gateway?: boolean;
    overwriteActivityTime?: boolean;
    [key: string]: any;
  };
  deviceProfileId?: {
    id: string;
    entityType: string;
  };
  tenantId?: {
    id: string;
    entityType: string;
  };
  customerId?: {
    id: string;
    entityType: string;
  };
  ownerId?: {
    id: string;
    entityType: string;
  };
  firmwareId?: {
    id: string;
    entityType: string;
  };
  softwareId?: {
    id: string;
    entityType: string;
  };
  externalId?: {
    id: string;
    entityType: string;
  };
}

export interface TelemetryData {
  ts: number;
  value: any;
}

export interface TelemetryResponse {
  [key: string]: TelemetryData[];
}

export interface DeviceAttribute {
  key: string;
  value: any;
  lastUpdateTs?: number;
}

export interface DeviceAttributes {
  [key: string]: DeviceAttribute[];
}

export class ThingsBoardDeviceManager {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.THINGSBOARD_URL || 'http://localhost:8080';
  }

  /**
   * Get ThingsBoard token for a customer from database
   */
  private async getCustomerToken(customerId: string): Promise<string> {
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
   */
  private async getUserToken(userId: number): Promise<{ token: string; customerId: string }> {
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
    
    /* console.log('*************************************************');
    console.log('record: ', record);    
    console.log('result: ', result);    
    console.log('*************************************************');
    */
      
    if (!record.customerid) {
      throw new Error(`Keine Customer ID für Benutzer ${userId} gefunden`);
    }

    if (!record.tbtoken || !record.tbtokenexpiry || new Date(record.tbtokenexpiry) < new Date()) {
      throw new Error(`ThingsBoard Token für Customer ${record.customerid} ist abgelaufen oder nicht verfügbar`);
    }

    return { token: record.tbtoken, customerId: record.customerid };
  }

  private async makeRequest(endpoint: string, token: string, options: RequestInit = {}): Promise<any> {
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
   */
  async getDevices(customerId: string, params: {
    pageSize?: number;
    page?: number;
    textSearch?: string;
    sortProperty?: string;
    sortOrder?: 'ASC' | 'DESC';
    deviceProfileId?: string;
    active?: boolean;
  } = {}): Promise<{ data: Device[]; totalElements: number; totalPages: number; hasNext: boolean }> {
    const token = await this.getCustomerToken(customerId);
    const searchParams = new URLSearchParams();
    
    if (params.pageSize) searchParams.append('pageSize', params.pageSize.toString());
    if (params.page) searchParams.append('page', params.page.toString());
    if (params.textSearch) searchParams.append('textSearch', params.textSearch);
    if (params.sortProperty) searchParams.append('sortProperty', params.sortProperty);
    if (params.sortOrder) searchParams.append('sortOrder', params.sortOrder);
    if (params.deviceProfileId) searchParams.append('deviceProfileId', params.deviceProfileId);
    if (params.active !== undefined) searchParams.append('active', params.active.toString());

    const queryString = searchParams.toString();
    const endpoint = `/api/customer/${customerId}/deviceInfos${queryString ? `?${queryString}` : ''}`;
    console.log('*************************************************');
    console.log('endpoint: ', endpoint);
    console.log('*************************************************');   
    return this.makeRequest(endpoint, token);
  }

  /**
   * Get devices for a user by user ID
   */
  async getDevicesByUser(userId: number, params: {
    pageSize?: number;
    page?: number;
    textSearch?: string;
    sortProperty?: string;
    sortOrder?: 'ASC' | 'DESC';
    deviceProfileId?: string;
    active?: boolean;
  } = {}): Promise<{ data: Device[]; totalElements: number; totalPages: number; hasNext: boolean; customerId: string }> {
    const { token, customerId } = await this.getUserToken(userId);
    const result = await this.getDevices(customerId, params);
    return { ...result, customerId };
  }

  /**
   * Get a specific device by ID
   */
  async getDevice(deviceId: string, customerId: string): Promise<Device> {
    const token = await this.getCustomerToken(customerId);
    return this.makeRequest(`/api/device/${deviceId}`, token);
  }

  /**
   * Get device telemetry data
   */
  async getDeviceTelemetry(
    deviceId: string,
    customerId: string,
    keys: string[],
    startTs: number,
    endTs: number,
    interval?: number,
    limit?: number,
    agg?: 'NONE' | 'MIN' | 'MAX' | 'AVG' | 'SUM' | 'COUNT'
  ): Promise<TelemetryResponse> {
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
   */
  async getDeviceTelemetryLast7Days(
    deviceId: string,
    customerId: string,
    keys: string[]
  ): Promise<TelemetryResponse> {
    const endTs = Date.now();
    const startTs = endTs - (7 * 24 * 60 * 60 * 1000); // 7 days ago
    const interval = 60 * 60 * 1000; // 1 hour in milliseconds

    return this.getDeviceTelemetry(deviceId, customerId, keys, startTs, endTs, interval, undefined, 'AVG');
  }

  /**
   * Get device attributes
   */
  async getDeviceAttributes(
    deviceId: string,
    customerId: string,
    scope: 'SERVER_SCOPE' | 'SHARED_SCOPE' | 'CLIENT_SCOPE' = 'SERVER_SCOPE',
    keys?: string[]
  ): Promise<DeviceAttributes> {
    const token = await this.getCustomerToken(customerId);
    let endpoint = `/api/plugins/telemetry/DEVICE/${deviceId}/attributes/${scope}`;
    
    if (keys && keys.length > 0) {
      endpoint += `?keys=${keys.join(',')}`;
    }

    return this.makeRequest(endpoint, token);
  }

  /**
   * Set device attributes
   */
  async setDeviceAttributes(
    deviceId: string,
    customerId: string,
    scope: 'SERVER_SCOPE' | 'SHARED_SCOPE' | 'CLIENT_SCOPE',
    attributes: Record<string, any>
  ): Promise<void> {
    const token = await this.getCustomerToken(customerId);
    await this.makeRequest(`/api/plugins/telemetry/DEVICE/${deviceId}/attributes/${scope}`, token, {
      method: 'POST',
      body: JSON.stringify(attributes),
    });
  }

  /**
   * Delete device attributes
   */
  async deleteDeviceAttributes(
    deviceId: string,
    customerId: string,
    scope: 'SERVER_SCOPE' | 'SHARED_SCOPE' | 'CLIENT_SCOPE',
    keys: string[]
  ): Promise<void> {
    const token = await this.getCustomerToken(customerId);
    await this.makeRequest(`/api/plugins/telemetry/DEVICE/${deviceId}/attributes/${scope}`, token, {
      method: 'DELETE',
      body: JSON.stringify(keys),
    });
  }

  /**
   * Create a new device
   */
  async createDevice(customerId: string, deviceData: {
    name: string;
    type: string;
    label?: string;
    deviceProfileId?: string;
    additionalInfo?: Record<string, any>;
  }): Promise<Device> {
    const token = await this.getCustomerToken(customerId);
    return this.makeRequest('/api/device', token, {
      method: 'POST',
      body: JSON.stringify(deviceData),
    });
  }

  /**
   * Update an existing device
   */
  async updateDevice(deviceId: string, customerId: string, deviceData: Partial<Device>): Promise<Device> {
    const token = await this.getCustomerToken(customerId);
    return this.makeRequest(`/api/device/${deviceId}`, token, {
      method: 'POST',
      body: JSON.stringify(deviceData),
    });
  }

  /**
   * Delete a device
   */
  async deleteDevice(deviceId: string, customerId: string): Promise<void> {
    const token = await this.getCustomerToken(customerId);
    await this.makeRequest(`/api/device/${deviceId}`, token, {
      method: 'DELETE',
    });
  }

  /**
   * Search devices by name or type
   */
  async searchDevices(customerId: string, searchTerm: string, params: {
    pageSize?: number;
    page?: number;
    sortProperty?: string;
    sortOrder?: 'ASC' | 'DESC';
  } = {}): Promise<{ data: Device[]; totalElements: number; totalPages: number; hasNext: boolean }> {
    return this.getDevices(customerId, { ...params, textSearch: searchTerm });
  }
}

// Export a singleton instance for easy use
export const thingsBoardDeviceManager = new ThingsBoardDeviceManager(); 