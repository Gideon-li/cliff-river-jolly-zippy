import { PALACE_META, PALACE_ORDER, type EventId, type FortuneSpan } from "@/lib/app-types";

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

export type GanzhiView = {
  label: string;
  detail?: string;
};

export type FocusView = {
  name: string;
  level?: string;
  reading?: string;
  brief?: string;
  omen?: string;
  classic?: string;
  raw?: string;
  palaceId?: number;
  probability?: number;
  bagua?: string;
  direction?: string;
  ganzhi?: GanzhiView[];
};

export type DirectionView = {
  direction: string;
  bagua?: string;
  gate?: string;
  star?: string;
  god?: string;
  level?: string;
  suit: string[];
  avoid: string[];
  note?: string;
  classic?: string;
};

export type PeriodView = {
  kind: string;
  title: string;
  level?: string;
  reading?: string;
  omen?: string;
  classic?: string;
  raw?: string;
  probability?: number;
};

export type FortuneDigest = {
  primary: PeriodView | null;
  others: PeriodView[];
  line: string;
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
  original?: string;
  bagua?: string;
};

export type ScanView = {
  hasChart: boolean;
  juLabel?: string;
  hourName?: string;
  pillars?: string;
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

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x).trim()).filter(Boolean) : [];
}

function cleanReading(raw: string) {
  return clip(
    raw
      .replace(/分值算法[^\n。]*[。]?/g, "")
      .replace(/S 加权后[^\n。]*[。]?/g, "")
      .replace(/此为盘面权重模型[^\n。]*[。]?/g, "")
      .replace(/此为交节\/日中盘面权衡[^\n。]*[。]?/g, "")
      .replace(/\s+/g, " ")
      .trim(),
    220,
  );
}

const LEVEL_TALK: Record<string, string> = {
  大吉: "这段日子整体很顺，像顺水推舟。还是得自己动手，不是天上掉馅饼。",
  吉: "事情有成算，阻力不大，按正路去办就行。",
  小吉: "不是稳赢，是能往前走、有人肯搭把手的那种顺。宜主动，但别把话说满。",
  平: "可成可不成，关键看你动不动、门路选得对不对。",
  小凶: "不是大祸，是阻力、口舌、反复这类麻烦。宜收不宜猛冲。",
  凶: "这一课阻力明显。宜守、宜改期，先把已有的事收稳。",
  大凶: "这课很不顺。大事宜停，少签字、少远行，先避过这一阵。",
};

const GATE_PLAIN: Record<string, { suit: string[]; avoid: string[]; classic: string }> = {
  开门: { suit: ["出门办事", "见人递材料", "开张求财"], avoid: ["偷偷摸摸", "把话说死"], classic: "开门为金，乾宫本门。宜开张、求财、远行、见贵、嫁娶、入宅。" },
  休门: { suit: ["求财请客", "养病歇一歇", "把人请来"], avoid: ["硬闯强争"], classic: "休门为水，坎宫本门。宜治病、休息、求财、婚姻、公事。" },
  生门: { suit: ["求财开业", "安家生发", "把事情做起来"], avoid: ["办丧", "动硬的"], classic: "生门为土，艮宫本门。八门最吉，宜求财、生产、开业、嫁娶。" },
  伤门: { suit: ["讨债了断", "清理旧账"], avoid: ["新开张", "远行", "成亲"], classic: "伤门为木，震宫本门。宜渔猎、捕捉、讨债；不宜婚姻、安葬。" },
  杜门: { suit: ["避风头", "少露面", "把事藏稳"], avoid: ["张扬求名", "开张远行"], classic: "杜门为木，巽宫本门。宜躲藏、避难、修筑；不宜求见、开张。" },
  景门: { suit: ["投书考试", "发文求名", "亮相见人"], avoid: ["远行押身家"], classic: "景门为火，离宫本门。宜上书、考试、求名、谒贵、文书。" },
  死门: { suit: ["收尾了结"], avoid: ["求进开张", "成亲"], classic: "死门为土，坤宫本门。古法用于丧葬、行刑、捕猎；求财婚姻大忌。" },
  惊门: { suit: ["把争议说清楚"], avoid: ["图安稳远行"], classic: "惊门为金，兑宫本门。宜捕猎、词讼、惊扰；不宜安床、入宅。" },
};

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
  if (!o.title && !o.reading && !o.level && !o.associations) return null;
  const level = str(o.level) || undefined;
  const assoc = strings(o.associations);
  const rawReading = o.reading ? str(o.reading) : "";
  const talk = [level ? LEVEL_TALK[level] : "", ...assoc].filter(Boolean).join("");
  return {
    kind: str(o.kind) || fallbackKind,
    title: str(o.title) || (fallbackKind === "year" ? "年运" : fallbackKind === "day" ? "日运" : "月运"),
    level,
    reading: talk ? clip(talk, 220) : rawReading ? cleanReading(rawReading) : undefined,
    omen: o.omen ? clip(str(o.omen), 160) : undefined,
    classic: o.classicCite ? clip(str(o.classicCite), 160) : undefined,
    raw: rawReading ? clip(rawReading, 280) : undefined,
    probability: typeof o.probability === "number" ? o.probability : undefined,
  };
}

function peopleFrom(raw: unknown, palaces: Record<string, PalaceView>): PeopleView[] {
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
      const original = str(o.summary) || str(o.reading) || "";
      const role = str(o.role) || str(o.sixKin) || "人事";
      const level = str(o.level) || undefined;
      const palaceId = o.palaceId != null ? String(o.palaceId) : "";
      const fromPalace = palaceId ? palaces[palaceId] : undefined;
      const gate = str(o.gate) || fromPalace?.gate || "";
      const g = gate ? GATE_PLAIN[gate] : undefined;
      const rel = str(o.relation);
      const relTalk =
        rel === "克我"
          ? "和主事的人有点较劲，宜留余地"
          : rel === "我克"
            ? "这边人你压得住"
            : rel === "生我"
              ? "这边人能帮到你"
              : rel === "我生"
                ? "你这边要多付出"
                : rel === "比和"
                  ? "和你同一路人"
                  : "";
      const talk = [level ? LEVEL_TALK[level] : "", g ? `临${gate}，宜${g.suit[0]}` : "", relTalk]
        .filter(Boolean)
        .join("。");
      if (!original && !o.role && !talk) return null;
      return {
        role,
        sixKin: str(o.sixKin) || undefined,
        level,
        summary: clip(talk || original, 80),
        original: original && original !== talk ? clip(original, 160) : undefined,
        bagua: str(o.bagua) || undefined,
      } as PeopleView;
    })
    .filter((x): x is PeopleView => Boolean(x))
    .sort((a, b) => Number(Boolean(b.level)) - Number(Boolean(a.level)))
    .slice(0, 4);
}

function pillarsLabel(raw: unknown): string | undefined {
  const o = asRec(raw);
  const names = ["year", "month", "day", "hour"]
    .map((k) => str(asRec(o[k]).name))
    .filter(Boolean);
  return names.length === 4 ? names.join(" · ") : undefined;
}

function ganzhiFrom(raw: unknown): GanzhiView[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => asRec(item))
    .filter((o) => o.label)
    .slice(0, 6)
    .map((o) => ({ label: str(o.label), detail: str(o.detail) || undefined }));
}

function directionFrom(raw: unknown): DirectionView | null {
  const o = asRec(raw);
  const direction = str(o.direction);
  if (!direction) return null;
  const gate = str(o.gate) || undefined;
  const plain = gate ? GATE_PLAIN[gate] : undefined;
  const suit = strings(o.suit).slice(0, 4);
  const avoid = strings(o.avoid).slice(0, 3);
  return {
    direction,
    bagua: str(o.bagua) || undefined,
    gate,
    star: str(o.star) || undefined,
    god: str(o.god) || undefined,
    level: str(o.level) || undefined,
    suit: (plain?.suit ?? suit).slice(0, 4),
    avoid: (plain?.avoid ?? avoid).slice(0, 3),
    note: o.note ? clip(str(o.note), 80) : undefined,
    classic: o.classic ? clip(str(o.classic), 160) : plain?.classic,
  };
}

export function fortuneDigest(
  fortune: ScanView["fortune"],
  primary?: FortuneSpan | string | null,
): FortuneDigest {
  const key: FortuneSpan = primary === "year" || primary === "day" ? primary : "month";
  const order: FortuneSpan[] = key === "year" ? ["year", "month", "day"] : key === "day" ? ["day", "month", "year"] : ["month", "year", "day"];
  const cards = order.map((k) => fortune[k]).filter((p): p is PeriodView => Boolean(p));
  const main = fortune[key] ?? cards[0] ?? null;
  const others = cards.filter((p) => p.kind !== main?.kind);
  const line = cards
    .map((p) => `${p.title}${p.level ? p.level : ""}`)
    .join(" · ");
  return { primary: main, others, line };
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
  const brief = focusRaw.brief ? clip(str(focusRaw.brief), 120) : undefined;
  const reading = focusRaw.reading ? cleanReading(str(focusRaw.reading)) : undefined;
  const focusLevel = str(focusRaw.level) || undefined;
  const focusTalk = [focusLevel ? LEVEL_TALK[focusLevel] : "", brief].filter(Boolean).join("");
  return {
    hasChart: hasPalaces || Boolean(juLabel || hourName),
    juLabel,
    hourName,
    pillars: pillarsLabel(chart.pillars),
    palaces,
    focus: focusRaw.name
      ? {
          name: str(focusRaw.name),
          level: focusLevel,
          reading: focusTalk || brief || reading,
          brief,
          omen: focusRaw.omen ? clip(str(focusRaw.omen), 120) : undefined,
          classic: focusRaw.classicCite ? clip(str(focusRaw.classicCite), 160) : undefined,
          raw: reading,
          palaceId,
          probability: typeof focusRaw.probability === "number" ? focusRaw.probability : undefined,
          bagua: used?.bagua,
          direction: used?.direction,
          ganzhi: ganzhiFrom(focusRaw.ganzhiFlags),
        }
      : null,
    directions: overall.map(directionFrom).filter((d): d is DirectionView => Boolean(d)).slice(0, 3),
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
    people: peopleFrom(root.people, palaces),
  };
}

export function palaceAskText(p: PalaceView, eventName?: string): string {
  const event = eventName ? `对「${eventName}」` : "对眼前这件事";
  return `请专门讲讲${p.bagua}宫（${p.direction}）这一格：八神${p.god || "无"}，九星${p.star || "无"}，八门${p.gate || "无门"}。用白话告诉我，这一宫${event}意味着什么，宜忌是什么。`;
}

export type { EventId };
