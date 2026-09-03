import { PALACE_META, PALACE_ORDER, type EventId } from "@/lib/app-types";

export type PalaceView = {
  id: number;
  bagua: string;
  direction: string;
  earthStem?: string;
  heavenStem?: string;
  star?: string;
  gate?: string | null;
  god?: string | null;
  isKong?: boolean;
  isZhiFu?: boolean;
  isZhiShi?: boolean;
  hint?: string;
};

export type FocusView = {
  name: string;
  level?: string;
  reading?: string;
  brief?: string;
  omen?: string;
  palaceId?: number;
  probability?: number;
  bagua?: string;
  direction?: string;
};

export type DirectionView = {
  direction: string;
  bagua?: string;
  gate?: string;
  star?: string;
  level?: string;
};

export type PeriodView = {
  kind: string;
  title: string;
  level?: string;
  reading?: string;
  probability?: number;
};

export type WeatherView = {
  headline?: string;
  sky?: string;
  advice?: string;
};

export type PeopleView = {
  role: string;
  sixKin?: string;
  level?: string;
  summary: string;
  bagua?: string;
};

export type ScanView = {
  hasChart: boolean;
  juLabel?: string;
  hourName?: string;
  palaces: Record<string, PalaceView>;
  focus: FocusView | null;
  directions: DirectionView[];
  fortune: { year: PeriodView | null; month: PeriodView | null; day: PeriodView | null };
  weather: WeatherView | null;
  people: PeopleView[];
};

function asRec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function clip(text: string, max: number) {
  const t = text.replace(/\s+/g, " ").trim();
  if ([...t].length <= max) return t;
  return [...t].slice(0, max).join("").replace(/[，。、；：:\s]+$/, "") + "…";
}

function cleanReading(raw: string) {
  return clip(
    raw
      .replace(/分值算法[^\n。]*[。]?/g, "")
      .replace(/S 加权后[^\n。]*[。]?/g, "")
      .replace(/\s+/g, " ")
      .trim(),
    160,
  );
}

function palaceFrom(id: number, raw: Record<string, unknown> | undefined): PalaceView {
  const meta = PALACE_META[id];
  return {
    id,
    bagua: str(raw?.bagua) || meta?.bagua || String(id),
    direction: str(raw?.direction) || meta?.direction || "",
    earthStem: str(raw?.earthStem) || undefined,
    heavenStem: str(raw?.heavenStem) || undefined,
    star: str(raw?.star) || undefined,
    gate: raw?.gate == null ? null : str(raw.gate),
    god: raw?.god == null ? null : str(raw.god),
    isKong: Boolean(raw?.isKong),
    isZhiFu: Boolean(raw?.isZhiFu),
    isZhiShi: Boolean(raw?.isZhiShi),
    hint: meta?.hint,
  };
}

function periodFrom(raw: unknown, fallbackKind: string): PeriodView | null {
  const o = asRec(raw);
  if (!o.title && !o.reading && !o.level) return null;
  return {
    kind: str(o.kind) || fallbackKind,
    title: str(o.title) || (fallbackKind === "year" ? "年运" : fallbackKind === "day" ? "日运" : "月运"),
    level: str(o.level) || undefined,
    reading: o.reading ? cleanReading(str(o.reading)) : undefined,
    probability: typeof o.probability === "number" ? o.probability : undefined,
  };
}

function peopleFrom(raw: unknown): PeopleView[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(asRec(raw).list)
      ? (asRec(raw).list as unknown[])
      : Array.isArray(asRec(raw).links)
        ? (asRec(raw).links as unknown[])
        : [];
  return list
    .map((item) => {
      const o = asRec(item);
      const summary = str(o.summary) || str(o.reading) || "";
      if (!summary && !o.role) return null;
      return {
        role: str(o.role) || str(o.sixKin) || "人事",
        sixKin: str(o.sixKin) || undefined,
        level: str(o.level) || undefined,
        summary: clip(summary, 80),
        bagua: str(o.bagua) || undefined,
      } as PeopleView;
    })
    .filter((x): x is PeopleView => Boolean(x))
    .sort((a, b) => Number(Boolean(b.level)) - Number(Boolean(a.level)))
    .slice(0, 4);
}

export function readScan(scan: unknown): ScanView {
  const root = asRec(scan);
  const chart = asRec(root.chart);
  const palacesIn = asRec(chart.palaces);
  const palaces: Record<string, PalaceView> = {};
  for (const id of PALACE_ORDER) {
    palaces[String(id)] = palaceFrom(id, asRec(palacesIn[String(id)]));
  }
  const focusRaw = asRec(root.focus);
  const palaceId = Number(focusRaw.palaceId ?? 0) || undefined;
  const used = palaceId ? palaces[String(palaceId)] : undefined;
  const dirsRaw = asRec(root.directions);
  const overall = Array.isArray(dirsRaw.overall) ? dirsRaw.overall : [];
  const fortune = asRec(root.fortune);
  const weatherRoot = asRec(root.weather);
  const sketch = asRec(weatherRoot.sketch);
  const hasPalaces = Object.keys(palacesIn).length > 0;
  const juLabel = str(asRec(chart.ju).label) || undefined;
  const hourName = str(chart.hourName) || undefined;
  return {
    hasChart: hasPalaces || Boolean(juLabel || hourName),
    juLabel,
    hourName,
    palaces,
    focus: focusRaw.name
      ? {
          name: str(focusRaw.name),
          level: str(focusRaw.level) || undefined,
          reading: focusRaw.reading ? cleanReading(str(focusRaw.reading)) : undefined,
          brief: focusRaw.brief ? clip(str(focusRaw.brief), 120) : undefined,
          omen: focusRaw.omen ? clip(str(focusRaw.omen), 80) : undefined,
          palaceId,
          probability: typeof focusRaw.probability === "number" ? focusRaw.probability : undefined,
          bagua: used?.bagua,
          direction: used?.direction,
        }
      : null,
    directions: overall.slice(0, 3).map((d) => {
      const o = asRec(d);
      return {
        direction: str(o.direction),
        bagua: str(o.bagua) || undefined,
        gate: str(o.gate) || undefined,
        star: str(o.star) || undefined,
        level: str(o.level) || undefined,
      };
    }),
    fortune: {
      year: periodFrom(fortune.year, "year"),
      month: periodFrom(fortune.month, "month"),
      day: periodFrom(fortune.day, "day"),
    },
    weather:
      sketch.headline || sketch.sky || sketch.advice
        ? {
            headline: str(sketch.headline) || undefined,
            sky: str(sketch.sky) || undefined,
            advice: sketch.advice ? clip(str(sketch.advice), 120) : undefined,
          }
        : null,
    people: peopleFrom(root.people),
  };
}

export function palaceAskText(p: PalaceView, eventName?: string): string {
  const event = eventName ? `对「${eventName}」` : "对眼前这件事";
  return `请专门讲讲${p.bagua}宫（${p.direction}）这一格：八神${p.god || "无"}，九星${p.star || "无"}，八门${p.gate || "无门"}。用白话告诉我，这一宫${event}意味着什么，宜忌是什么。`;
}

export type { EventId };
