export const MARKET_SESSIONS = [
  { key: 'NY', name: 'NY', timeZone: 'America/New_York', startHour: 9, startMinute: 30, endHour: 16, endMinute: 0 },
  { key: 'FRANKFURT', name: 'Frankfurt', timeZone: 'Europe/Berlin', startHour: 8, startMinute: 0, endHour: 9, endMinute: 0 },
  { key: 'LONDON', name: 'London', timeZone: 'Europe/London', startHour: 8, startMinute: 0, endHour: 12, endMinute: 0 },
  { key: 'ASIA', name: 'Asia', timeZone: 'Asia/Tokyo', startHour: 9, startMinute: 0, endHour: 15, endMinute: 0 },
] as const;

export type MarketSession = (typeof MARKET_SESSIONS)[number];

export type SessionStatus = {
  key: MarketSession['key'];
  name: string;
  active: boolean;
  msUntilClose: number;
  msUntilOpen: number;
};

export function marketSessionStatuses(now: Date): SessionStatus[] {
  return MARKET_SESSIONS.map((session) => sessionStatus(session, now));
}

export function sessionStatus(session: MarketSession, now: Date): SessionStatus {
  const parts = zonedParts(now, session.timeZone);
  const localMinutes = parts.hour * 60 + parts.minute + parts.second / 60;
  const startMinutes = session.startHour * 60 + session.startMinute;
  const endMinutes = session.endHour * 60 + session.endMinute;
  const active = localMinutes >= startMinutes && localMinutes < endMinutes;
  const close = zonedTimeToUtc(session.timeZone, parts.year, parts.month, parts.day, session.endHour, session.endMinute, 0);
  const open = active || localMinutes < startMinutes
    ? zonedTimeToUtc(session.timeZone, parts.year, parts.month, parts.day, session.startHour, session.startMinute, 0)
    : zonedTimeToUtc(session.timeZone, parts.year, parts.month, parts.day + 1, session.startHour, session.startMinute, 0);

  return {
    key: session.key,
    name: session.name,
    active,
    msUntilClose: Math.max(0, close.getTime() - now.getTime()),
    msUntilOpen: Math.max(0, open.getTime() - now.getTime()),
  };
}

export function nextFourHourCandleClose(now: Date): Date {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(Math.floor(now.getUTCHours() / 4) * 4 + 4);
  return next;
}

export function formatDuration(ms: number, includeSeconds = false): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }

  return includeSeconds
    ? `${minutes}m ${seconds.toString().padStart(2, '0')}s`
    : `${minutes}m`;
}

function zonedParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  return {
    year: Number(part(parts, 'year')),
    month: Number(part(parts, 'month')),
    day: Number(part(parts, 'day')),
    hour: Number(part(parts, 'hour')),
    minute: Number(part(parts, 'minute')),
    second: Number(part(parts, 'second')),
  };
}

function zonedTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset = timeZoneOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offset);
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return localAsUtc - date.getTime();
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((item) => item.type === type)?.value ?? '0';
}
