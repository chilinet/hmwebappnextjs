/**
 * Heating Control – Anzeigenamen für Telemetrie-Attribute
 */
export function getAttributeDisplayName(attribute) {
  const displayNames = {
    'sensorTemperature': 'Aktuelle Temperatur',
    'targetTemperature': 'Zieltemperatur',
    'batteryVoltage': 'Batteriespannung',
    'PercentValveOpen': 'Ventilöffnung',
    'signalQuality': 'Signalqualität',
    'hall_sensor_state': 'Hall Sensor'
  };
  return displayNames[attribute] || attribute;
}
