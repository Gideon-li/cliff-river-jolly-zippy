import type { CivilTime, EventId, GeoLocation, SessionMode } from "./app-types";
import { EVENT_CATALOG } from "./app-types";
import { llmChat } from "./qimen.server";
import { sameShichen } from "./shichen";

export const GREETING =
  "你好呀，我是问象。想问什么，直接跟我说就好。方便的话，也可以告诉我你的性别、出生年和现在所在的城市，我会把盘看得更贴你一些；不愿意说也完全没关系。";

const EVENT_HINT = EVENT_CATALOG.map((e) => `${e.id}=${e.name}`).join("，");

const BAGUA_BUILDING: Record<string, string> = {
  乾: "高楼、楼顶、圆形建筑、银行",
  坤: "田野、仓库、房产、厨房、广场",
  震: "大道、车站、工地、闹市",
  巽: "园林、学堂、走廊、机场",
  坎: "水边、井巷、地下室、港口",
  离: "厅堂、窗口、学堂、舞台",
  艮: "门口、山地、寺庙、仓库",
  兑: "湖泽、娱乐场、西厢",
  中: "室内、中庭、枢纽",
};

export type ExtractedTurn = {
  kind:
    | "followup"
    | "new_time"
    | "new_event"
    | "new_lots"
    | "fortune"
    | "confirm_yes"
    | "confirm_no"
    | "chitchat"
    | "provide_profile"
    | "decline_profile"
    | "ask_question";
  eventId: EventId | null;
  civil: CivilTime | null;
  lotsCode: string | null;
  fortuneSpan: "day" | "month" | "year" | null;
  question: string;
  gender: "male" | "female" | null;
  birthYear: number | null;
  location: { province: string; city: string; district: string } | null;
  declinedProfile: boolean;
  hasQuestion: boolean;
  reason: string;
};

export function isPreciseLocation(loc: GeoLocation | null | undefined): boolean {
  if (!loc?.province) return false;
  return loc.source === "gps" || loc.source === "profile";
}

export function clipHan(text: string, max = 200): string {
  const t = text.replace(/\s+/g, " ").replace(/[#*`]/g, "").trim();
  const chars = [...t];
  if (chars.length <= max) return t;
  const cut = chars.slice(0, max).join("");
  const m = cut.match(/^(.*[。！？!?])/s);
  return (m?.[1] ?? cut).trim();
}

function stripNamedPlace(text: string): string {
  return text
    .replace(/北京[市]?/g, "")
    .replace(/东城区|西城区|朝阳区|海淀区|丰台区/g, "")
    .replace(/地点[：:]\s*[^。！？\n]+/g, "")
    .replace(/在[^\s，。]{1,8}(省|市|区|县)/g, "在那一带")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function buildingHint(bagua?: string | null, direction?: string | null): string {
  const b = bagua ? BAGUA_BUILDING[bagua] : "";
  const parts = b ? b.split("、") : [];
  const dir = direction && direction !== "中" ? direction : "";
  if (dir && parts.length >= 2) return `${dir}一带，多见${parts[0]}、${parts[1]}`;
  if (parts.length) return parts.slice(0, 2).join("、");
  if (dir) return `${dir}方位`;
  return "室内或门口一带";
}

export function cluesFromScan(scan: Record<string, unknown> | null | undefined): string {
  if (!scan) return "";
  const focus = (scan.focus ?? {}) as Record<string, unknown>;
  const chart = (scan.chart ?? {}) as Record<string, unknown>;
  const palaces = (chart.palaces ?? {}) as Record<string, Record<string, unknown>>;
  const palaceId = String(focus.palaceId ?? "");
  const palace = palaces[palaceId] ?? {};
  const dirs = (scan.directions ?? {}) as {
    overall?: { direction?: string; bagua?: string; gate?: string; level?: string }[];
  };
  const best = Array.isArray(dirs.overall) ? dirs.overall[0] : null;
  const bagua = String(palace.bagua ?? best?.bagua ?? "");
  const direction = String(palace.direction ?? best?.direction ?? "");
  const gate = String(palace.gate ?? best?.gate ?? "");
  const star = String(palace.star ?? "");
  const parts = [
    focus.name ? `事项「${focus.name}」总断${focus.level ?? ""}` : "",
    direction ? `用神在${direction}${bagua}宫` : "",
    gate ? `临${gate}` : "",
    star ? star : "",
    buildingHint(bagua, direction),
    best?.direction ? `较顺的方位偏${best.direction}` : "",
  ];
  return parts.filter(Boolean).join("；");
}

function parsePlace(text: string): ExtractedTurn["location"] {
  const cityHit =
    text.match(/在([\u4e00-\u9fa5]{2,8})(?:市|县|区|省)?/) ??
    text.match(/([\u4e00-\u9fa5]{2,8})(?:市|县)/);
  if (!cityHit) return null;
  let name = cityHit[1]!.replace(/(省|市|县|区)$/g, "");
  if (["家", "这", "那", "外面", "公司", "路上", "这边", "那里", "学校", "医院"].includes(name)) return null;
  if (name === "北京") return { province: "北京市", city: "北京市", district: "东城区" };
  if (name === "上海") return { province: "上海市", city: "上海市", district: "黄浦区" };
  if (name === "天津") return { province: "天津市", city: "天津市", district: "和平区" };
  if (name === "重庆") return { province: "重庆市", city: "重庆市", district: "渝中区" };
  const city = name.endsWith("市") ? name : `${name}市`;
  return { province: city, city, district: city };
}

function heuristicExtract(text: string): Partial<ExtractedTurn> {
  const t = text.trim();
  let gender: "male" | "female" | null = null;
  if (/女的|女生|女性|我是女|女，|女,/.test(t)) gender = "female";
  else if (/男的|男生|男性|我是男|男，|男,/.test(t)) gender = "male";

  let birthYear: number | null = null;
  const yearHit = t.match(/(19\d{2}|20[0-2]\d)\s*年/) ?? t.match(/(?:今年)?(\d{2})\s*岁/);
  if (yearHit) {
    const n = Number(yearHit[1]);
    if (n >= 1920 && n <= 2030) birthYear = n;
    else if (n >= 16 && n <= 90) birthYear = new Date().getFullYear() - n;
  }

  const lots = t.match(/(?:摇卦|摇个|号码|数字)[^\d]{0,4}(\d{3})/) ?? (/^\d{3}$/.test(t) ? [t, t] : null);
  const lotsCode = lots ? lots[1] : null;

  let fortuneSpan: "day" | "month" | "year" | null = null;
  if (/年运|今年运|这一年/.test(t)) fortuneSpan = "year";
  else if (/月运|这个月|本月运/.test(t)) fortuneSpan = "month";
  else if (/日运|今天运|今日运/.test(t)) fortuneSpan = "day";

  const declined =
    /不[用想要]说|不想填|先不用资料|你看着来|随便吧|保密|跳过资料|按通用/.test(t) ||
    (/不[用想要]|随便|先不|不想说|保密|跳过/.test(t) && /性别|出生|位置|城市|地址|资料/.test(t));

  let eventId: EventId | null = null;
  const eventHints: [RegExp, EventId][] = [
    [/回款|求财|赚钱|生意|经营|货款|进账/, "wealth"],
    [/升职|职场|事业|官运|工作压力/, "career"],
    [/面试|求职|跳槽|入职|offer/, "job"],
    [/感情|恋爱|结婚|复合|分手|对象/, "romance"],
    [/考试|学业|考研|论文|证书/, "study"],
    [/身体|健康|看病|调养|生病/, "health"],
    [/出行|出差|远行|旅游/, "travel"],
    [/官司|纠纷|诉讼|扯皮/, "lawsuit"],
    [/合伙|合作|搭档/, "partner"],
    [/买房|置业|租房|搬家|装修/, "property"],
    [/谈判|签约|合同/, "negotiate"],
    [/寻人|找东西|失物/, "find"],
  ];
  for (const [re, id] of eventHints) {
    if (re.test(t)) {
      eventId = id;
      break;
    }
  }

  return {
    gender,
    birthYear,
    lotsCode,
    fortuneSpan,
    declinedProfile: Boolean(declined),
    eventId,
    location: parsePlace(t),
    hasQuestion: t.length >= 2 && !/^(你好|在吗|嗯|好的|谢谢)$/.test(t),
  };
}

function parseCivil(raw: unknown): CivilTime | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const year = Number(c.year);
  const month = Number(c.month);
  const day = Number(c.day);
  const hour = Number(c.hour ?? 12);
  const minute = Number(c.minute ?? 0);
  if (year >= 1920 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
    return {
      year,
      month,
      day,
      hour: Number.isFinite(hour) ? hour : 12,
      minute: Number.isFinite(minute) ? minute : 0,
    };
  }
  return null;
}

export async function extractTurn(input: {
  text: string;
  mode: SessionMode;
  eventId: EventId | null;
  chartCivil: CivilTime | null;
  hasPending: boolean;
  awaitingProfile: boolean;
}): Promise<ExtractedTurn> {
  const heuristic = heuristicExtract(input.text);
  const fallback: ExtractedTurn = {
    kind: heuristic.hasQuestion ? "ask_question" : "chitchat",
    eventId: heuristic.eventId ?? input.eventId,
    civil: null,
    lotsCode: heuristic.lotsCode ?? null,
    fortuneSpan: heuristic.fortuneSpan ?? null,
    question: input.text,
    gender: heuristic.gender ?? null,
    birthYear: heuristic.birthYear ?? null,
    location: heuristic.location ?? null,
    declinedProfile: Boolean(heuristic.declinedProfile),
    hasQuestion: Boolean(heuristic.hasQuestion),
    reason: "",
  };
  const now = new Date();
  const sys = `你是问象的对话理解器。只输出 JSON。
字段：kind, eventId, civil, lotsCode, fortuneSpan, question, gender, birthYear, location, declinedProfile, hasQuestion, reason。
kind：
- ask_question：用户提出了要预测的事情
- followup：已有盘面，继续追问同一件事
- new_time：提到另一个具体时间，可能要重起盘
- new_event：换成另一类事项
- new_lots：给出新的三位数摇卦
- fortune：问日/月/年运
- provide_profile：主要在补性别、出生年或城市
- decline_profile：不愿提供资料，可用默认
- confirm_yes / confirm_no：同意或拒绝新开盘
- chitchat：寒暄
eventId 只能是：${EVENT_HINT}。没有把握则 ${input.eventId ?? "null"}。
civil 为北京时间 {year,month,day,hour,minute}，没提时间则为 null。今天大约 ${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}。
location 形如 {province,city,district}，用户没提城市则为 null。杭州→浙江省/杭州市/杭州市。
gender 为 male|female|null。birthYear 为四位数字或 null。
declinedProfile 为 true/false。hasQuestion 为是否已有可预测的事。
question 为整理后的中文问句。
当前模式：${input.mode}；事项：${input.eventId ?? "无"}；等确认新盘：${input.hasPending ? "是" : "否"}；等补资料：${input.awaitingProfile ? "是" : "否"}。`;

  const r = await llmChat(
    [
      { role: "system", content: sys },
      { role: "user", content: input.text.slice(0, 400) },
    ],
    { json: true, maxTokens: 360 },
  );
  if (!r.ok) return fallback;
  try {
    const raw = r.text.replace(/^```json\s*/i, "").replace(/```$/i, "");
    const obj = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Record<string, unknown>;
    const kind = String(obj.kind ?? fallback.kind) as ExtractedTurn["kind"];
    const eventId = (
      EVENT_CATALOG.some((e) => e.id === obj.eventId) ? obj.eventId : (heuristic.eventId ?? input.eventId)
    ) as EventId | null;
    let location: ExtractedTurn["location"] = null;
    if (obj.location && typeof obj.location === "object") {
      const loc = obj.location as Record<string, unknown>;
      const city = String(loc.city ?? loc.province ?? "").trim();
      if (city) {
        location = {
          province: String(loc.province ?? city),
          city: String(loc.city ?? city),
          district: String(loc.district ?? loc.city ?? city),
        };
      }
    }
    const kinds: ExtractedTurn["kind"][] = [
      "followup",
      "new_time",
      "new_event",
      "new_lots",
      "fortune",
      "confirm_yes",
      "confirm_no",
      "chitchat",
      "provide_profile",
      "decline_profile",
      "ask_question",
    ];
    const gender =
      obj.gender === "female" || obj.gender === "male" ? obj.gender : (heuristic.gender ?? null);
    const birthYearNum = Number(obj.birthYear);
    const birthYear =
      birthYearNum >= 1920 && birthYearNum <= 2030 ? birthYearNum : (heuristic.birthYear ?? null);
    const lots =
      typeof obj.lotsCode === "string" && /^\d{3}$/.test(obj.lotsCode)
        ? obj.lotsCode
        : (heuristic.lotsCode ?? null);
    const span =
      obj.fortuneSpan === "day" || obj.fortuneSpan === "month" || obj.fortuneSpan === "year"
        ? obj.fortuneSpan
        : (heuristic.fortuneSpan ?? null);
    const hasQuestion =
      obj.hasQuestion === true || obj.hasQuestion === false ? Boolean(obj.hasQuestion) : fallback.hasQuestion;
    return {
      kind: kinds.includes(kind) ? kind : fallback.kind,
      eventId,
      civil: parseCivil(obj.civil),
      lotsCode: lots,
      fortuneSpan: span,
      question: String(obj.question ?? input.text).slice(0, 400),
      gender,
      birthYear,
      location: location ?? heuristic.location ?? null,
      declinedProfile: Boolean(obj.declinedProfile) || Boolean(heuristic.declinedProfile),
      hasQuestion,
      reason: String(obj.reason ?? "").slice(0, 200),
    };
  } catch {
    return fallback;
  }
}

export function inferMode(extracted: ExtractedTurn, current: SessionMode): SessionMode {
  if (extracted.lotsCode) return "lots";
  if (extracted.fortuneSpan || extracted.kind === "fortune") return "fortune";
  if (extracted.civil) return "timed";
  if (current === "inbox") return "now";
  return current;
}

export function shouldOpenNewTimeChart(
  mode: SessionMode,
  chartCivil: CivilTime | null,
  asked: CivilTime | null,
): boolean {
  if (mode === "lots" || mode === "inbox") return false;
  if (!asked || !chartCivil?.year) return false;
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

export async function sisterSay(input: {
  question: string;
  clues: string;
  juLabel?: string;
  hourName?: string;
  eventName?: string;
  allowPlace: boolean;
  place?: string;
  followup?: boolean;
  history?: { role: "user" | "assistant"; content: string }[];
  extra?: string;
}): Promise<string> {
  const placeRule = input.allowPlace
    ? `用户给过城市，可以轻轻点一下「${input.place ?? ""}」，但重点仍是方位和建筑类型。`
    : "禁止出现任何省、市、区、县名，也不要说北京、东城。地点只写方位（东南西北）和建筑类型（门口、厅堂、水边、高楼、学堂、仓库等）。";
  const sys = `你是「问象」，一位温和、积极、靠得住的知心大姐姐。用奇门盘帮人看事，但不吓人、不保证应验。
说话要求：
- 像面对面轻声聊，口语化，柔和，带一点鼓励。
- 全文不超过 200 个汉字，只写核心：判断倾向、方位或建筑提示、一句可行的建议。
- 不要分点，不要「一、二、三」，不要 Markdown，不要表情符号。
- 不要堆术语。必要时只留一个门或星的名字。
- ${placeRule}
- 供参考，不是定论。`;
  const user = [
    input.followup ? "这是追问。" : "请就这件事给出这一盘的核心看法。",
    `问：${input.question}`,
    input.eventName ? `事项：${input.eventName}` : "",
    input.juLabel ? `局：${input.juLabel}` : "",
    input.hourName ? `时辰：${input.hourName}` : "",
    input.clues ? `盘面线索：${input.clues}` : "",
    input.extra ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  const history = (input.history ?? []).slice(-6).map((m) => ({
    role: m.role,
    content: clipHan(m.content, 180),
  }));
  const r = await llmChat(
    [{ role: "system", content: sys }, ...history, { role: "user", content: user }],
    { maxTokens: 320 },
  );
  if (!r.ok) {
    return clipHan(
      input.followup
        ? "我这边这一问问得有点含糊。你再把事情说具体一点，我按盘帮你看。"
        : `先看核心：这件事成的机会还在，别急着下结论。留意${input.clues.split("；").pop() || "顺的方位"}，把该做的一步做踏实就好。`,
    );
  }
  const cleaned = input.allowPlace ? r.text : stripNamedPlace(r.text);
  return clipHan(cleaned, 200);
}

export function missingProfilePrompt(opts: {
  gender: boolean;
  birthYear: boolean;
  location: boolean;
  question?: string;
}): string {
  const bits: string[] = [];
  if (opts.gender) bits.push("性别");
  if (opts.birthYear) bits.push("出生年");
  if (opts.location) bits.push("现在所在的城市");
  const ask = bits.join("、") || "这些情况";
  if (opts.question) {
    return clipHan(
      `这件事我记下了。要是方便，把${ask}跟我说一声，盘会更贴你；不愿意说也完全没关系，我按通用的方式帮你看。`,
    );
  }
  return clipHan(`好呀。方便的话告诉我${ask}；不想说也行，直接讲你想问的事就好。`);
}

export function chitchatFallback(): string {
  return "我在的。想问事业、感情、求财还是近况，都可以直接说，我帮你看。";
}
