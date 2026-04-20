/**
 * Heating Control – Zeitbereich-Optionen und Hilfsfunktionen
 */
export const timeRangeOptions = [
  { value: '1d', label: '1 Tag' },
  { value: '3d', label: '3 Tage' },
  { value: '7d', label: '7 Tage' },
  { value: '14d', label: '14 Tage' },
  { value: '30d', label: '30 Tage' },
  { value: '90d', label: '90 Tage' }
];

export function getTimeRangeInMs(timeRange) {
  const now = Date.now();
  switch (timeRange) {
    case '1d': return now - (1 * 24 * 60 * 60 * 1000);
    case '3d': return now - (3 * 24 * 60 * 60 * 1000);
    case '7d': return now - (7 * 24 * 60 * 60 * 1000);
    case '14d': return now - (14 * 24 * 60 * 60 * 1000);
    case '30d': return now - (30 * 24 * 60 * 60 * 1000);
    case '90d': return now - (90 * 24 * 60 * 60 * 1000);
    default: return now - (7 * 24 * 60 * 60 * 1000);
  }
}

export function getTimeRangeLabel(timeRange, options = timeRangeOptions) {
  const option = options.find(opt => opt.value === timeRange);
  return option ? option.label : '7 Tage';
}
