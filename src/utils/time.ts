const dayFormatterCache = new Map<string, Intl.DateTimeFormat>();
const timeFormatterCache = new Map<string, Intl.DateTimeFormat>();
const longFormatterCache = new Map<string, Intl.DateTimeFormat>();
const zonePartsFormatterCache = new Map<string, Intl.DateTimeFormat>();

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

function getZoneParts(date: Date, timeZone: string) {
  const formatter = getFormatter(zonePartsFormatterCache, timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });

  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getZoneParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

export function utcToLocalInputValue(iso: string, timeZone: string) {
  const parts = getZoneParts(new Date(iso), timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function localInputToUtcIso(localValue: string, timeZone: string) {
  const match = localValue.match(
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})$/,
  );

  if (!match?.groups) {
    return null;
  }

  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);

  const initialUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let resolvedUtc = initialUtc - getTimeZoneOffsetMs(new Date(initialUtc), timeZone);
  resolvedUtc = initialUtc - getTimeZoneOffsetMs(new Date(resolvedUtc), timeZone);

  return new Date(resolvedUtc).toISOString();
}
