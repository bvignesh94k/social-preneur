// Calendar arithmetic on plain YYYY-MM-DD strings. Working in strings keeps a
// planned day the same day everywhere, instead of drifting when a server in one
// timezone renders a calendar for a client in another.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const match = ISO_RE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

function toUtc(iso: string): Date {
  const match = ISO_RE.exec(iso);
  if (!match) throw new Error(`Not a date: ${iso}`);
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

export function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return isoOf(date);
}

export function dayOfMonth(iso: string): number {
  return toUtc(iso).getUTCDate();
}

// 1 = Monday through 7 = Sunday, the way a week reads on a calendar.
export function isoWeekday(iso: string): number {
  return toUtc(iso).getUTCDay() || 7;
}

export function isWeekend(iso: string): boolean {
  return isoWeekday(iso) >= 6;
}

export interface MonthBounds {
  from: string;
  to: string;
}

export function monthBounds(year: number, month: number): MonthBounds {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  return { from: isoOf(first), to: isoOf(last) };
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const base = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: base.getUTCFullYear(), month: base.getUTCMonth() + 1 };
}

// Six rows of seven days, Monday first, so the grid never changes height
// between months and the layout cannot jump as you page through.
export function monthWeeks(year: number, month: number): string[][] {
  const { from } = monthBounds(year, month);
  const start = addDays(from, -(isoWeekday(from) - 1));

  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)),
  );
}

export function isInMonth(iso: string, year: number, month: number): boolean {
  const date = toUtc(iso);
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month;
}

// The day it is where the client is, which is what their calendar should show.
export function todayIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return isoOf(now);
  }
}

export function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

export function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(toUtc(iso));
}

export function timeIn(timeZone: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(at);
  } catch {
    return at.toISOString().slice(11, 16);
  }
}

// Turns a day and a wall clock time in the client's timezone into a real moment.
export function momentIn(timeZone: string, iso: string, time: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  if (!isIsoDate(iso) || Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error("Need a date and a time like 09:30");
  }

  const guess = new Date(`${iso}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  // Measure how far the guess lands from the wanted wall clock in that zone,
  // then correct by the difference. Two passes settle daylight saving edges.
  let result = guess;
  for (let pass = 0; pass < 2; pass++) {
    const shown = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(result);

    const get = (type: string) => Number(shown.find((part) => part.type === type)?.value ?? 0);
    const shownUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
    const drift = shownUtc - Date.UTC(
      Number(iso.slice(0, 4)),
      Number(iso.slice(5, 7)) - 1,
      Number(iso.slice(8, 10)),
      hour,
      minute,
    );
    if (drift === 0) break;
    result = new Date(result.getTime() - drift);
  }
  return result;
}
