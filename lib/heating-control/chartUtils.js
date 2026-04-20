/**
 * Heating Control – Chart-Daten synchronisieren und ECharts-Option für Temperaturverlauf
 *
 * @param {Array<{ timestamp: number, sensor_temperature?: number|null, target_temperature?: number|null, percent_valve_open?: number|null }>} timeseries – zusammengeführte Zeilen (ein Index pro Bucket)
 */

export function synchronizeChartData(timeseries, debugLog = () => {}) {
  const rows = Array.isArray(timeseries) ? timeseries : [];
  const hasRowData = rows.length > 0;
  const hasTemperatureData = hasRowData && rows.some((r) => r.sensor_temperature != null || r.temperature != null);
  const hasTargetTemperatureData = hasRowData && rows.some((r) => r.target_temperature != null);
  const hasValveOpenData =
    hasRowData && rows.some((r) => r.percent_valve_open != null || r.valveOpen != null);

  if (!hasTemperatureData && !hasTargetTemperatureData && !hasValveOpenData) {
    return { temperatureData: [], targetTemperatureData: [], valveOpenData: [] };
  }

  const allTimestamps = rows.map((item) => item.timestamp).filter((t) => t != null);
  if (allTimestamps.length === 0) {
    return { temperatureData: [], targetTemperatureData: [], valveOpenData: [] };
  }

  const minTimestamp = Math.min(...allTimestamps);
  const maxTimestamp = Math.max(...allTimestamps);
  debugLog('Synchronizing data from', new Date(minTimestamp), 'to', new Date(maxTimestamp));

  const intervalMs = 10 * 60 * 1000;
  const timeSlices = [];
  for (let timestamp = minTimestamp; timestamp <= maxTimestamp; timestamp += intervalMs) {
    timeSlices.push(timestamp);
  }
  debugLog('Created', timeSlices.length, 'time slices (10-minute intervals)');

  const findNearestRow = (targetTimestamp, maxDistanceMs = 30 * 60 * 1000) => {
    if (rows.length === 0) return null;
    let nearestItem = null;
    let minDistance = Infinity;
    for (const item of rows) {
      const distance = Math.abs(item.timestamp - targetTimestamp);
      if (distance < minDistance && distance <= maxDistanceMs) {
        minDistance = distance;
        nearestItem = item;
      }
    }
    return nearestItem;
  };

  const synchronizedData = {
    temperatureData: [],
    targetTemperatureData: [],
    valveOpenData: []
  };

  timeSlices.forEach((sliceTimestamp) => {
    const row = findNearestRow(sliceTimestamp);
    if (row) {
      if (hasTemperatureData) {
        const raw = row.sensor_temperature ?? row.temperature;
        if (raw != null) {
          const temp = Number(raw);
          if (!Number.isNaN(temp)) synchronizedData.temperatureData.push([sliceTimestamp, temp]);
        }
      }
      if (hasTargetTemperatureData) {
        const raw = row.target_temperature;
        if (raw != null) {
          const targetTemp = Number(raw);
          if (!Number.isNaN(targetTemp)) synchronizedData.targetTemperatureData.push([sliceTimestamp, targetTemp]);
        }
      }
      if (hasValveOpenData) {
        const raw = row.percent_valve_open ?? row.valveOpen;
        if (raw != null) {
          const valve = Number(raw);
          if (!Number.isNaN(valve)) synchronizedData.valveOpenData.push([sliceTimestamp, valve]);
        }
      }
    }
  });

  debugLog('Synchronized data points:', {
    temperature: synchronizedData.temperatureData.length,
    targetTemperature: synchronizedData.targetTemperatureData.length,
    valveOpen: synchronizedData.valveOpenData.length
  });
  return synchronizedData;
}

export function getTemperatureChartOption(synchronizedData, selectedTimeRange, debugLog = () => {}) {
  const { temperatureData, targetTemperatureData, valveOpenData } = synchronizedData;

  const hasTemperatureData = temperatureData.length > 0;
  const hasTargetTemperatureData = targetTemperatureData.length > 0;
  const hasValveOpenData = valveOpenData.length > 0;

  debugLog('Chart data - temperatureData length:', temperatureData.length);
  debugLog('Chart data - targetTemperatureData length:', targetTemperatureData.length);
  debugLog('Chart data - valveOpenData length:', valveOpenData.length);

  if (!hasTemperatureData && !hasTargetTemperatureData && !hasValveOpenData) {
    return {
      xAxis: {
        type: 'time',
        name: 'Zeit',
        nameLocation: 'middle',
        nameGap: 30,
        axisLabel: {
          color: '#666',
          formatter: function(value) {
            return new Date(value).toLocaleDateString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            });
          }
        },
        axisLine: { lineStyle: { color: '#ddd' } },
        splitLine: { lineStyle: { color: '#f0f0f0' } }
      },
      yAxis: {
        type: 'value',
        name: 'Temperatur (°C)',
        nameLocation: 'middle',
        nameGap: 50,
        axisLabel: { color: '#666', formatter: '{value}°C' },
        axisLine: { lineStyle: { color: '#ddd' } },
        splitLine: { lineStyle: { color: '#f0f0f0' } }
      },
      series: [],
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#ddd',
        borderWidth: 1,
        textStyle: { color: '#333' },
        formatter: () => 'Keine Daten verfügbar'
      },
      grid: { left: '10%', right: '10%', bottom: '15%', top: '15%', backgroundColor: 'transparent' },
      backgroundColor: 'transparent'
    };
  }

  return {
    legend: {
      data: [
        ...(hasTemperatureData ? ['Ist (sensor_temperature)'] : []),
        ...(hasTargetTemperatureData ? ['Zieltemperatur'] : []),
        ...(hasValveOpenData ? ['Ventil (%)'] : [])
      ],
      top: 10,
      left: 'center',
      textStyle: { color: '#333', fontSize: 12 },
      itemGap: 20,
      itemWidth: 14,
      itemHeight: 14
    },
    xAxis: {
      type: 'time',
      name: 'Zeit',
      nameLocation: 'middle',
      nameGap: 30,
      axisLabel: {
        color: '#666',
        formatter: function(value) {
          return new Date(value).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
      },
      axisLine: { lineStyle: { color: '#ddd' } },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
      scale: true,
      minInterval: 3600000
    },
    yAxis: [
      {
        type: 'value',
        name: 'Temperatur (°C)',
        nameLocation: 'middle',
        nameGap: 50,
        position: 'left',
        axisLabel: { color: '#666', formatter: '{value}°C' },
        axisLine: { lineStyle: { color: '#ddd' } },
        splitLine: { lineStyle: { color: '#f0f0f0' } }
      },
      {
        type: 'value',
        name: 'Ventilöffnung (%)',
        nameLocation: 'middle',
        nameGap: 50,
        position: 'right',
        min: 0,
        max: 100,
        axisLabel: { color: '#666', formatter: '{value}%' },
        axisLine: { lineStyle: { color: '#ddd' } },
        splitLine: { show: false }
      }
    ],
    series: [
      ...(hasTemperatureData ? [{
        name: 'Ist (sensor_temperature)',
        type: 'line',
        data: temperatureData,
        smooth: true,
        symbol: 'none',
        symbolSize: 0,
        connectNulls: true,
        encode: { x: 0, y: 1 },
        lineStyle: { color: '#F44336', width: 2 },
        itemStyle: { color: '#F44336' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(244, 67, 54, 0.3)' },
              { offset: 1, color: 'rgba(244, 67, 54, 0.05)' }
            ]
          }
        }
      }] : []),
      ...(hasTargetTemperatureData ? [{
        name: 'Zieltemperatur',
        type: 'line',
        data: targetTemperatureData,
        smooth: true,
        symbol: 'none',
        symbolSize: 0,
        connectNulls: true,
        encode: { x: 0, y: 1 },
        lineStyle: { color: '#4CAF50', width: 2 },
        itemStyle: { color: '#4CAF50' }
      }] : []),
      ...(hasValveOpenData ? [{
        name: 'Ventil (%)',
        type: 'line',
        data: valveOpenData,
        smooth: true,
        symbol: 'none',
        symbolSize: 0,
        connectNulls: true,
        yAxisIndex: 1,
        encode: { x: 0, y: 1 },
        lineStyle: { color: '#9E9E9E', width: 2 },
        itemStyle: { color: '#9E9E9E' }
      }] : [])
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#ddd',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      formatter: function(params) {
        if (params && params.length > 0) {
          const timestamp = params[0].axisValue;
          const date = new Date(timestamp).toLocaleString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          let tooltipText = `<div style="font-weight: bold; margin-bottom: 5px;">${date}</div>`;
          params.forEach((param) => {
            const value = Array.isArray(param.value) ? param.value[1] : param.value;
            const seriesName = param.seriesName;
            const color = param.color;
            const displayValue = !isNaN(Number(value)) ? Number(value).toFixed(1) : 'N/A';
            const unit = seriesName === 'Ventil (%)' ? '%' : '°C';
            tooltipText += `<div style="display: flex; align-items: center; margin: 2px 0;">
              <span style="color:${color}; margin-right: 8px;">●</span>
              <span style="font-weight: 500;">${seriesName}:</span>
              <span style="margin-left: 8px; font-weight: bold;">${displayValue}${unit}</span>
            </div>`;
          });
          return tooltipText;
        }
        return '';
      }
    },
    grid: {
      left: '10%',
      right: '10%',
      bottom: '15%',
      top: '15%',
      backgroundColor: 'transparent'
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      {
        type: 'slider',
        start: 0,
        end: 100,
        height: 20,
        bottom: 15,
        backgroundColor: 'rgba(240, 240, 240, 0.3)',
        dataBackground: { areaStyle: { color: '#f0f0f0' }, lineStyle: { color: '#ccc' } },
        selectedDataBackground: { areaStyle: { color: '#e6f3ff' }, lineStyle: { color: '#1890ff' } },
        handleStyle: { color: '#1890ff' }
      }
    ],
    backgroundColor: 'transparent',
    animation: true,
    animationDuration: 1000,
    animationEasing: 'cubicOut'
  };
}
