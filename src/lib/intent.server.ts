import type { CivilTime, EventId, SessionMode } from "./app-types";
import { EVENT_CATALOG } from "./app-types";
import { llmChat } from "./qimen.server";
import { sameShichen } from "./shichen";

export type IntentKind =
  | "followup"
  | "new_time"
  | "new_event"
  | "new_lots"
  | "fortune"
  | "confirm_yes"
  | "confirm_no"
  | "chitchat";

export type ParsedIntent = {
  kind: IntentKind;
  eventId: EventId | null;
  civil: CivilTime | null;
  lotsCode: string | null;
  fortuneSpan: "day" | "month" | "year" | null;
  question: string;
  reason: string;
};

const EVENT_HINT = EVENT_CATALOG.map((e) => `${e.id}=${e.name}`).join("，");

export async function parseIntent(input: {
  text: string;
  mode: SessionMode;
  eventId: EventId | null;
  chartCivil: CivilTime | null;
  hasPending: boolean;
}): Promise<ParsedIntent> {
  const fallback: ParsedIntent = {
    kind: "followup",
    eventId: input.eventId,
    civil: null,
    lotsCode: null,
    fortuneSpan: null,
    question: input.text,
    reason: "",
  };
  const now = new Date();
  const sys = `你是奇门咨询的意图解析器。只输出 JSON。
字段：kind, eventId, civil, lotsCode, fortuneSpan, question, reason。
kind 取值：
- followup：仍在当前盘面追问同一类事情
- new_time：用户提到了另一个时间，需要按新时间起盘
- new_event：摇卦模式下换成另一类事项
- new_lots：用户给出新的三位数摇卦
- fortune：问日/月/年运
- confirm_yes：同意重新起盘
- confirm_no：拒绝重新起盘
- chitchat：寒暄、与盘面无关
eventId 只能是：${EVENT_HINT}。不确定则沿用 ${input.eventId ?? "wealth"}。
civil 为北京时间 {year,month,day,hour,minute}，未提到时间则为 null。
当前北京日期大约是 ${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}。
「明天」「后天」「今晚」「下午三点」等要换成具体 civil。
lotsCode 仅当用户给出三位数时填写。
fortuneSpan 为 day|month|year 或 null。
question 为整理后的中文问句。
当前模式：${input.mode}；当前事项：${input.eventId ?? "无"}；是否在等待确认新开盘：${input.hasPending ? "是" : "否"}。`;

  const r = await llmChat(
    [
      { role: "system", content: sys },
      { role: "user", content: input.text.slice(0, 400) },
    ],
    { json: true, maxTokens: 400 },
  );
  if (!r.ok) return fallback;
  try {
    const obj = JSON.parse(r.text.replace(/^```json\s*/i, "").replace(/```$/i, "")) as Record<
      string,
      unknown
    >;
    const kind = String(obj.kind ?? "followup") as IntentKind;
    const eventId = (EVENT_CATALOG.some((e) => e.id === obj.eventId) ? obj.eventId : input.eventId) as
      | EventId
      | null;
    let civil: CivilTime | null = null;
    if (obj.civil && typeof obj.civil === "object") {
      const c = obj.civil as Record<string, unknown>;
      const year = Number(c.year);
      const month = Number(c.month);
      const day = Number(c.day);
      const hour = Number(c.hour ?? 12);
      const minute = Number(c.minute ?? 0);
      if (year >= 1920 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        civil = { year, month, day, hour: Number.isFinite(hour) ? hour : 12, minute: Number.isFinite(minute) ? minute : 0 };
      }
    }
    const lots = typeof obj.lotsCode === "string" && /^\d{3}$/.test(obj.lotsCode) ? obj.lotsCode : null;
    const span = obj.fortuneSpan === "day" || obj.fortuneSpan === "month" || obj.fortuneSpan === "year"
      ? obj.fortuneSpan
      : null;
    return {
      kind: [
        "followup",
        "new_time",
        "new_event",
        "new_lots",
        "fortune",
        "confirm_yes",
        "confirm_no",
        "chitchat",
      ].includes(kind)
        ? kind
        : "followup",
      eventId,
      civil,
      lotsCode: lots,
      fortuneSpan: span,
      question: String(obj.question ?? input.text).slice(0, 400),
      reason: String(obj.reason ?? "").slice(0, 200),
    };
  } catch {
    return fallback;
  }
}

export function shouldOpenNewTimeChart(
  mode: SessionMode,
  chartCivil: CivilTime | null,
  asked: CivilTime | null,
): boolean {
  if (mode === "lots") return false;
  if (!asked || !chartCivil) return false;
  return !sameShichen(chartCivil, asked);
}

export function shouldOpenNewLotsChart(
  mode: SessionMode,
  currentEvent: EventId | null,
  nextEvent: EventId | null,
): boolean {
  if (mode !== "lots") return false;
  if (!currentEvent || !nextEvent) return false;
  return currentEvent !== nextEvent;
}
