import type { CivilTime } from "./app-types";

export const HOUR_NAMES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;

export function hourToZhiIndex(hour: number): number {
  return Math.floor(((hour + 1) % 24) / 2);
}

export function hourNameOf(hour: number): string {
  return HOUR_NAMES[hourToZhiIndex(hour)] ?? "子";
}

/** Inclusive start hour of a 时辰 (子时 starts at 23). */
export function shichenStartHour(hour: number): number {
  const idx = hourToZhiIndex(hour);
  return (idx * 2 + 23) % 24;
}

export function shichenRangeLabel(hour: number): string {
  const start = shichenStartHour(hour);
  const end = (start + 2) % 24;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${hourNameOf(hour)}时 ${p(start)}:00–${p(end)}:00`;
}

function civilKey(c: CivilTime): number {
  return c.year * 1e8 + c.month * 1e6 + c.day * 1e4 + c.hour * 100 + c.minute;
}

/**
 * 子时跨日：23:00 当日与 00:00–00:59 次日同属一辰。
 * 其它时辰按日历日 + 时辰索引判断。
 */
export function sameShichen(a: CivilTime, b: CivilTime): boolean {
  const ia = hourToZhiIndex(a.hour);
  const ib = hourToZhiIndex(b.hour);
  if (ia !== ib) return false;
  if (ia === 0) {
    const dayA = a.hour >= 23 ? civilDay(a) : civilDay(a) - 1;
    const dayB = b.hour >= 23 ? civilDay(b) : civilDay(b) - 1;
    return dayA === dayB;
  }
  return civilDay(a) === civilDay(b);
}

function civilDay(c: CivilTime): number {
  return Date.UTC(c.year, c.month - 1, c.day) / 86400000;
}

export function isAfterRange(chart: CivilTime, asked: CivilTime): boolean {
  return !sameShichen(chart, asked) && civilKey(asked) !== civilKey(chart);
}
