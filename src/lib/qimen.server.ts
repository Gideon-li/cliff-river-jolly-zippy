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

export function slimScan(raw: Record<string, unknown>) {
  const chart = (raw.chart ?? {}) as Record<string, unknown>;
  const palacesIn = (chart.palaces ?? {}) as Record<string, Record<string, unknown>>;
  const palaces: Record<string, ReturnType<typeof slimPalace>> = {};
  for (const [k, v] of Object.entries(palacesIn)) palaces[k] = slimPalace(v);
  const events = Array.isArray(raw.events)
    ? raw.events.map((x) => slimEvent(x as Record<string, unknown>))
    : [];
  const fortune = raw.fortune as Record<string, Record<string, unknown>> | undefined;
  const weather = raw.weather as
    | { district?: Record<string, unknown>; climateBand?: Record<string, unknown> }
    | undefined;
  return asJson({
    subject: raw.subject,
    location: raw.location,
    civil: raw.civil,
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
    directions: raw.directions,
    fortune: fortune
      ? {
          year: slimPeriod(fortune.year),
          month: slimPeriod(fortune.month),
          day: slimPeriod(fortune.day),
        }
      : null,
    natal: raw.natal,
    weather: weather
      ? {
          district: weather.district
            ? {
                cls: weather.district.cls,
                probability: weather.district.probability,
                rainProb: weather.district.rainProb,
                reading: weather.district.reading,
                level: weather.district.level,
              }
            : null,
          climateBand: weather.climateBand
            ? {
                cls: weather.climateBand.cls,
                probability: weather.climateBand.probability,
                rainProb: weather.climateBand.rainProb,
                reading: weather.climateBand.reading,
                level: weather.climateBand.level,
              }
            : null,
        }
      : null,
  } as JsonValue);
}

export async function runScan(body: QueryBody) {
  const qimen = await getQimen();
  try {
    const raw = (await qimen.scan(body)) as Record<string, unknown>;
    return slimScan(raw);
  } catch (err) {
    // Weather model file missing on some deploys — still return the chart.
    const raw = qimen.events(body) as Record<string, unknown>;
    const focus = qimen.event(body) as Record<string, unknown>;
    let fortune = null;
    try {
      fortune = (qimen.fortune(body) as { fortune?: Record<string, unknown> }).fortune ?? null;
    } catch {
      fortune = null;
    }
    return slimScan({
      ...raw,
      focus: (focus as { event?: unknown }).event ?? focus,
      fortune,
      weather: null,
      error: err instanceof Error ? err.message : String(err),
    });
  }
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
