import { describe, expect, it } from "vitest";
import {
  addDays,
  dayOfMonth,
  isInMonth,
  isIsoDate,
  isWeekend,
  isoWeekday,
  momentIn,
  monthBounds,
  monthLabel,
  monthWeeks,
  shiftMonth,
  timeIn,
  todayIn,
} from "./dates";

describe("isIsoDate", () => {
  it("accepts a real date", () => {
    expect(isIsoDate("2026-09-16")).toBe(true);
  });

  it("rejects a day that does not exist", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("16-09-2026")).toBe(false);
  });

  it("accepts the leap day only in a leap year", () => {
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
  });
});

describe("addDays", () => {
  it("crosses a month boundary", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("crosses a year boundary backwards", () => {
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("month arithmetic", () => {
  it("finds the first and last day of a month", () => {
    expect(monthBounds(2026, 9)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(monthBounds(2026, 2)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthBounds(2028, 2).to).toBe("2028-02-29");
  });

  it("steps across the year end", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("names the month for a heading", () => {
    expect(monthLabel(2026, 9)).toBe("September 2026");
  });
});

describe("monthWeeks", () => {
  const weeks = monthWeeks(2026, 9);

  it("always returns six rows of seven days so the grid cannot jump", () => {
    expect(weeks).toHaveLength(6);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it("starts on the Monday on or before the first of the month", () => {
    // 1 September 2026 is a Tuesday, so the grid opens on 31 August.
    expect(weeks[0]![0]).toBe("2026-08-31");
    expect(isoWeekday(weeks[0]![0]!)).toBe(1);
  });

  it("contains every day of the month exactly once", () => {
    const inMonth = weeks.flat().filter((iso) => isInMonth(iso, 2026, 9));
    expect(inMonth).toHaveLength(30);
    expect(new Set(inMonth).size).toBe(30);
  });

  it("runs in unbroken single day steps", () => {
    const days = weeks.flat();
    expect(days.every((iso, index) => index === 0 || iso === addDays(days[index - 1]!, 1))).toBe(true);
  });
});

describe("weekday helpers", () => {
  it("treats Saturday and Sunday as the weekend", () => {
    expect(isWeekend("2026-09-19")).toBe(true);
    expect(isWeekend("2026-09-20")).toBe(true);
    expect(isWeekend("2026-09-21")).toBe(false);
  });

  it("reads the day number", () => {
    expect(dayOfMonth("2026-09-16")).toBe(16);
  });
});

describe("timezone handling", () => {
  it("gives the client's own day, not the server's", () => {
    // 22:30 UTC is already the next day in Kolkata.
    const at = new Date("2026-09-16T22:30:00Z");
    expect(todayIn("Asia/Kolkata", at)).toBe("2026-09-17");
    expect(todayIn("UTC", at)).toBe("2026-09-16");
  });

  it("falls back to UTC for a zone it does not know", () => {
    expect(todayIn("Not/AZone", new Date("2026-09-16T10:00:00Z"))).toBe("2026-09-16");
  });

  it("shows a stored moment as the local publish time", () => {
    expect(timeIn("Asia/Kolkata", new Date("2026-09-16T04:00:00Z"))).toBe("09:30");
  });

  it("turns a local publish time into the right moment", () => {
    const moment = momentIn("Asia/Kolkata", "2026-09-16", "09:30");
    expect(moment.toISOString()).toBe("2026-09-16T04:00:00.000Z");
  });

  it("round trips a time through a zone that uses daylight saving", () => {
    const moment = momentIn("Europe/London", "2026-07-01", "09:30");
    expect(timeIn("Europe/London", moment)).toBe("09:30");
    expect(moment.toISOString()).toBe("2026-07-01T08:30:00.000Z");
  });

  it("refuses a time that is not a time", () => {
    expect(() => momentIn("Asia/Kolkata", "2026-09-16", "morning")).toThrow();
  });
});
