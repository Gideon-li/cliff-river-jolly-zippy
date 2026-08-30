import { join } from "node:path";
import type { QueryBody as EngineQuery } from "../../vendor/qimen/src/kernel.ts";
import type { JsonValue } from "./utils";
import { asJson } from "./utils";

const LLM_KEY =
  "sk-sp-H.DLPXYX.8dEa.MEYCIQD9PLJBWlSjpU3fST0yLg2oMGeFbNLx9JRWt0bR0YZ2jwIhAKSdg467g9FaluXCIuFKDAHw9tgWKmFyO4E6B-sdnTnm";

function applyEnv() {
  process.env.QIMEN_LLM_API_KEY ||= process.env.QWEN_API_KEY || LLM_KEY;
  process.env.QIMEN_LLM_BASE_URL ||=
    "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";
  process.env.QIMEN_LLM_MODEL ||= "qwen3.8-flash";
  process.env.QIMEN_LLM_ENABLED ||= "1";
  process.env.QIMEN_DISTRICT_WEIGHTS ||= join(
    process.cwd(),
    "vendor/qimen/models/qimen-district-weights-2020-2026.json",
  );
  process.env.QIMEN_CONFIG_PATH ||= join(process.cwd(), "data/qimen-config.json");
}

export type QueryBody = EngineQuery;

type QimenApi = typeof import("../../vendor/qimen/src/api.ts");

let cached: QimenApi | null = null;

export async function getQimen(): Promise<QimenApi> {
  applyEnv();
  if (cached) return cached;
  cached = await import("../../vendor/qimen/src/api.ts");
  return cached;
}

function slimEvent(e: Record<string, unknown> | null | undefined) {
  if (!e) return null;
  return {
    eventId: e.eventId,
    name: e.name,
    brief: e.brief,
    palaceId: e.palaceId,
    score: e.score,
    probability: e.probability,
    level: e.level,
    phases: e.phases,
    patterns: e.patterns,
    reading: e.reading,
    associations: e.associations,
    omen: e.omen,
    classicCite: e.classicCite,
  };
}

function slimPalace(p: Record<string, unknown>) {
  return {
    id: p.id,
    bagua: p.bagua,
    direction: p.direction,
    earthStem: p.earthStem,
    heavenStem: p.heavenStem,
    star: p.star,
    gate: p.gate,
    god: p.god,
    isKong: p.isKong,
    isZhiFu: p.isZhiFu,
    isZhiShi: p.isZhiShi,
    isMa: p.isMa,
    fuYin: p.fuYin,
    fanYin: p.fanYin,
  };
}

function slimPeriod(p: Record<string, unknown> | null | undefined) {
  if (!p) return null;
  const events = Array.isArray(p.events) ? p.events.map((x) => slimEvent(x as Record<string, unknown>)) : [];
  return {
    kind: p.kind,
    title: p.title,
    subtitle: p.subtitle,
    civil: p.civil,
    score: p.score,
    probability: p.probability,
    level: p.level,
    reading: p.reading,
    associations: p.associations,
    omen: p.omen,
    events,
    slices: p.slices,
  };
}

function blurPlaceText(s: unknown) {
  if (typeof s !== "string") return s;
  return s
    .replace(/[\u4e00-\u9fa5]{2,12}(特别行政区|自治区|省|市|区|县)/g, "这一带")
    .replace(/这一带这一带+/g, "这一带");
}

function slimSketch(d: Record<string, unknown> | null | undefined) {
  if (!d) return null;
  const aspects = Array.isArray(d.aspects)
    ? (d.aspects as Record<string, unknown>[])
        .filter((a) => a.level && a.level !== "无")
        .map((a) => ({
          key: a.key,
          label: a.label,
          level: a.level,
          kind: a.kind,
          text: a.text,
        }))
    : [];
  const from = Array.isArray(d.from)
    ? (d.from as Record<string, unknown>[]).map((f) => ({
        key: f.key,
        label: f.label,
        palace: f.palace,
        direction: f.direction,
        name: f.name,
        text: f.text,
      }))
    : [];
  return {
    headline: d.headline,
    sky: d.sky,
    kan: d.kan,
    from,
    aspects,
    narrative: blurPlaceText(d.narrative),
    advice: blurPlaceText(d.advice),
  };
}

function slimWxCell(cell: Record<string, unknown> | null | undefined) {
  if (!cell) return null;
  return {
    cls: cell.cls,
    probability: cell.probability,
    rainProb: cell.rainProb,
    level: cell.level,
    detail: slimSketch(cell.detail as Record<string, unknown> | undefined),
  };
}

function slimWeather(weather: Record<string, unknown> | null | undefined) {
  if (!weather) return null;
  const district = weather.district as Record<string, unknown> | undefined;
  const climateBand = weather.climateBand as Record<string, unknown> | undefined;
  const sketch = slimSketch(
    (weather.sketch as Record<string, unknown> | undefined) ??
      (district?.detail as Record<string, unknown> | undefined),
  );
  return {
    district: slimWxCell(district),
    climateBand: slimWxCell(climateBand),
    sketch,
  };
}

export function slimScan(raw: Record<string, unknown>) {
  const chart = (raw.chart ?? {}) as Record<string, unknown>;
  const palacesIn = (chart.palaces ?? {}) as Record<string, Record<string, unknown>>;
  const palaces: Record<string, ReturnType<typeof slimPalace>> = {};
  for (const [k, v] of Object.entries(palacesIn)) palaces[k] = slimPalace(v);
  const events = Array.isArray(raw.events)
    ? raw.events.map((x) => slimEvent(x as Record<string, unknown>))
    : [];
  const fortune = raw.fortune as Record<string, Record<string, unknown>> | undefined;
  return asJson({
    subject: raw.subject,
    location: raw.location,
    civil: raw.civil,
    model: raw.model ?? null,
    chart: {
      timeLabel: chart.timeLabel,
      hourName: chart.hourName,
      beijing: chart.beijing,
      pillars: chart.pillars,
      ju: chart.ju,
      meta: chart.meta,
      palaces,
    },
    events,
    focus: slimEvent(raw.focus as Record<string, unknown>),
    people: raw.people,
    directions: raw.directions
      ? {
          overall: Array.isArray((raw.directions as { overall?: unknown }).overall)
            ? ((raw.directions as { overall: Record<string, unknown>[] }).overall as Record<
                string,
                unknown
              >[])
                .slice(0, 3)
                .map((d) => ({
                  direction: d.direction,
                  bagua: d.bagua,
                  gate: d.gate,
                  star: d.star,
                  level: d.level,
                }))
            : [],
        }
      : null,
    fortune: fortune
      ? {
          year: slimPeriod(fortune.year),
          month: slimPeriod(fortune.month),
          day: slimPeriod(fortune.day),
        }
      : null,
    natal: raw.natal,
    weather: slimWeather(raw.weather as Record<string, unknown> | undefined),
  } as JsonValue);
}

export async function runScan(body: QueryBody) {
  const qimen = await getQimen();
  try {
    const raw = (await qimen.scan(body)) as Record<string, unknown>;
    return slimScan(raw);
  } catch (err) {
    const raw = (await qimen.events(body)) as Record<string, unknown>;
    const focus = (await qimen.event(body)) as Record<string, unknown>;
    let fortune = null;
    try {
      fortune = ((await qimen.fortune(body)) as { fortune?: Record<string, unknown> }).fortune ?? null;
    } catch {
      fortune = null;
    }
    let people: unknown = null;
    let directions: unknown = null;
    try {
      people = ((await qimen.people(body)) as { people?: unknown }).people ?? null;
      directions = ((await qimen.directions(body)) as { directions?: unknown }).directions ?? null;
    } catch {
      people = null;
      directions = null;
    }
    return slimScan({
      ...raw,
      focus: (focus as { event?: unknown }).event ?? focus,
      fortune,
      people,
      directions,
      weather: null,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function runWeather(body: QueryBody) {
  const qimen = await getQimen();
  const r = (await qimen.weather(body)) as Record<string, unknown>;
  return asJson({
    civil: r.civil,
    location: r.location,
    model: r.model ?? null,
    weather: slimWeather(r.weather as Record<string, unknown> | undefined),
  });
}

export async function runCompose(body: QueryBody) {
  const qimen = await getQimen();
  const r = (await qimen.consultCompose(body)) as Record<string, unknown>;
  return asJson({
    event: slimEvent(r.event as Record<string, unknown>),
    scene: r.scene,
    civil: r.civil,
    chart: r.chart,
  });
}

export async function runAsk(body: QueryBody) {
  const qimen = await getQimen();
  const r = (await qimen.consultAsk(body)) as Record<string, unknown>;
  return asJson({
    event: slimEvent(r.event as Record<string, unknown>),
    text: String(r.text ?? ""),
  });
}

export async function runLots(code: string) {
  const qimen = await getQimen();
  return asJson(qimen.lots(code) as JsonValue);
}

export async function llmChat(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts?: { json?: boolean; maxTokens?: number },
) {
  applyEnv();
  const { llmChat: chat } = await import("../../vendor/qimen/src/llm.ts");
  return chat(messages, opts);
}
