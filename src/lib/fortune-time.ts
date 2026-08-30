import type { CivilTime } from "./app-types";

export function beijingNowCivil(): CivilTime {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: g("year"), month: g("month"), day: g("day"), hour: g("hour"), minute: g("minute") };
}

export function shiftCivil(base: CivilTime, unit: "day" | "month" | "year", n: number): CivilTime {
  const d = new Date(Date.UTC(base.year, base.month - 1, base.day, 12, 0));
  if (unit === "day") d.setUTCDate(d.getUTCDate() + n);
  if (unit === "month") d.setUTCMonth(d.getUTCMonth() + n);
  if (unit === "year") d.setUTCFullYear(d.getUTCFullYear() + n);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: base.hour,
    minute: base.minute,
  };
}

export function parseFortuneRelative(text: string): {
  span: "day" | "month" | "year" | null;
  civil: CivilTime | null;
  explicit: boolean;
} {
  const t = text.trim();
  const now = beijingNowCivil();
  if (/下下个月/.test(t)) return { span: "month", civil: shiftCivil(now, "month", 2), explicit: true };
  if (/下个月|下月|次月/.test(t)) return { span: "month", civil: shiftCivil(now, "month", 1), explicit: true };
  if (/上个月|上月/.test(t)) return { span: "month", civil: shiftCivil(now, "month", -1), explicit: true };
  if (/明年|下一年/.test(t)) return { span: "year", civil: shiftCivil(now, "year", 1), explicit: true };
  if (/去年/.test(t)) return { span: "year", civil: shiftCivil(now, "year", -1), explicit: true };
  if (/今年|这一年|年运/.test(t) && !/明年|去年/.test(t)) {
    return { span: "year", civil: now, explicit: /年运|今年运|这一年/.test(t) };
  }
  if (/这个月|本月|当月|月运/.test(t) && !/下个月|下月|上个月/.test(t)) {
    return { span: "month", civil: now, explicit: true };
  }
  if (/后天/.test(t) && /运|运势/.test(t)) return { span: "day", civil: shiftCivil(now, "day", 2), explicit: true };
  if (/明天/.test(t) && /运|运势/.test(t)) return { span: "day", civil: shiftCivil(now, "day", 1), explicit: true };
  if (/日运|今天运|今日运|今日运势|今天运势/.test(t)) return { span: "day", civil: now, explicit: true };
  if (/运势|看运/.test(t) && /月/.test(t)) return { span: "month", civil: now, explicit: true };
  if (/运势|年运月运|看运/.test(t)) return { span: "month", civil: now, explicit: /运势|看运/.test(t) };
  return { span: null, civil: null, explicit: false };
}
