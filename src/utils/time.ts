const dayFormatterCache = new Map<string, Intl.DateTimeFormat>();
const timeFormatterCache = new Map<string, Intl.DateTimeFormat>();
const longFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(
  cache: Map<string, Intl.DateTimeFormat>,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
) {
  const key = JSON.stringify([timeZone, options]);
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    ...options,
  });
  cache.set(key, formatter);
  return formatter;
}

export function formatDayLabel(iso: string, timeZone: string) {
  return getFormatter(dayFormatterCache, timeZone, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

export function formatTimeLabel(iso: string, timeZone: string) {
  return getFormatter(timeFormatterCache, timeZone, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatDateTimeLabel(iso: string, timeZone: string) {
  return getFormatter(longFormatterCache, timeZone, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function minutesToMs(minutes: number) {
  return minutes * 60 * 1000;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function makeUtcIso(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0)).toISOString();
}
