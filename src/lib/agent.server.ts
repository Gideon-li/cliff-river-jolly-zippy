import type { CivilTime, EventId, GeoLocation, Portrait, SessionMode } from "./app-types";
import { EMPTY_PORTRAIT, EVENT_CATALOG, MODE_LABEL } from "./app-types";
import { llmChat } from "./qimen.server";
import { sameShichen } from "./shichen";
import { parseFortuneRelative } from "./fortune-time";

export { beijingNowCivil, parseFortuneRelative, shiftCivil } from "./fortune-time";

export const GREETING =
  "你好呀，我是问象。想聊一聊，或找我看盘，都可以直接说。看盘有四种测法：按此刻、指定一个时间、看年运月运日运，或摇个三位数求签。你想用哪一种，跟我说一声就好。盘面只作参考，玄学预测，仅供娱乐。";

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

export type CastMode = Exclude<SessionMode, "inbox">;

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
    | "ask_question"
    | "pick_mode";
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
  modeGuess: CastMode | null;
  modeExplicit: boolean;
  reason: string;
};

export function isPreciseLocation(loc: GeoLocation | null | undefined): boolean {
  if (!loc?.province) return false;
  return loc.source === "gps" || loc.source === "profile";
}

export function clipHan(text: string, max = 500): string {
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
  const weather = (scan.weather ?? {}) as {
    sketch?: {
      headline?: string;
      sky?: string;
      advice?: string;
      from?: { direction?: string; label?: string; name?: string }[];
    };
    district?: { cls?: string; rainProb?: number };
  };
  const sketch = weather.sketch ?? {};
  const wxFrom = Array.isArray(sketch.from) ? sketch.from[0] : null;
  const parts = [
    focus.name ? `事项「${focus.name}」总断${focus.level ?? ""}` : "",
    direction ? `用神在${direction}${bagua}宫` : "",
    gate ? `临${gate}` : "",
    star ? star : "",
    buildingHint(bagua, direction),
    best?.direction ? `较顺的方位偏${best.direction}` : "",
    sketch.headline ? `天象「${sketch.headline}」` : "",
    wxFrom?.direction ? `${wxFrom.label ?? "雨"}从${wxFrom.direction}来` : "",
    sketch.advice ? `天气宜忌：${sketch.advice}` : "",
  ];
  return parts.filter(Boolean).join("；");
}

function parsePlace(text: string): ExtractedTurn["location"] {
  const cityHit =
    text.match(/在([\u4e00-\u9fa5]{2,8})(?:市|县|区|省)?/) ??
    text.match(/([\u4e00-\u9fa5]{2,8})(?:市|县)/);
  if (!cityHit) return null;
  const name = cityHit[1]!.replace(/(省|市|县|区)$/g, "");
  if (["家", "这", "那", "外面", "公司", "路上", "这边", "那里", "学校", "医院"].includes(name)) return null;
  if (name === "北京") return { province: "北京市", city: "北京市", district: "东城区" };
  if (name === "上海") return { province: "上海市", city: "上海市", district: "黄浦区" };
  if (name === "天津") return { province: "天津市", city: "天津市", district: "和平区" };
  if (name === "重庆") return { province: "重庆市", city: "重庆市", district: "渝中区" };
  const city = name.endsWith("市") ? name : `${name}市`;
  return { province: city, city, district: city };
}

function guessMode(text: string): { mode: CastMode | null; explicit: boolean } {
  const t = text.trim();
  const fortune = parseFortuneRelative(t);
  if (fortune.span || /年运|月运|日运|运势|看运|流年|流月/.test(t)) {
    return { mode: "fortune", explicit: fortune.explicit || /年运|月运|日运|运势|看运/.test(t) };
  }
  if (/第三|选三|测法三|第三种/.test(t)) return { mode: "fortune", explicit: true };
  if (/(?:摇卦|摇个|求签|摇签|三位数)/.test(t) || /(?:摇卦|摇个|号码|数字)[^\d]{0,4}\d{3}/.test(t) || /^\d{3}$/.test(t)) {
    return { mode: "lots", explicit: true };
  }
  if (/第四|选四|测法四|第四种/.test(t)) return { mode: "lots", explicit: true };
  if (
    /指定时间|选个时间|选定时间|约在|改到/.test(t) ||
    /明天|后天|大后天|下周|上周/.test(t) ||
    /\d{1,2}\s*月\s*\d{1,2}/.test(t) ||
    /\d{1,2}\s*点/.test(t)
  ) {
    return { mode: "timed", explicit: /明天|后天|点|指定|选定/.test(t) };
  }
  if (/第二|选二|测法二|第二种/.test(t)) return { mode: "timed", explicit: true };
  if (
    /此刻|现在看|当前时辰|当前时间|按现在|按此刻|按当前|这一时辰/.test(t) ||
    /第一|选一|测法一|第一种/.test(t)
  ) {
    return { mode: "now", explicit: true };
  }
  if (/帮我看|起盘|测一|算一|问问盘|看一下|预测|算算|帮我测|帮我断/.test(t)) {
    return { mode: "now", explicit: false };
  }
  return { mode: null, explicit: false };
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

  const fortune = parseFortuneRelative(t);
  const lotsHint = /(?:摇卦|摇个|号码|数字|求签|摇签)/.test(t) && !fortune.span;
  const lots =
    /^\d{3}$/.test(t) || lotsHint
      ? (t.match(/(?:摇卦|摇个|号码|数字|求签)[^\d]{0,4}(\d{3})/) ?? (/^\d{3}$/.test(t) ? [t, t] : null))
      : null;
  const lotsCode = fortune.span ? null : lots ? lots[1] : null;
  const fortuneSpan = fortune.span;
  const civilHint = fortune.civil;

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

  const mode = guessMode(t);
  const chitchatOnly = /^(你好|在吗|嗯|好的|谢谢|早|晚安)$/.test(t);
  const hasQuestion =
    Boolean(eventId || lotsCode || fortuneSpan || mode.mode) ||
    (t.length >= 4 && /看|问|测|算|盘|运|回款|面试|预测|运势/.test(t) && !chitchatOnly);

  return {
    gender,
    birthYear,
    lotsCode,
    fortuneSpan,
    civil: civilHint,
    declinedProfile: Boolean(declined),
    eventId,
    location: parsePlace(t),
    hasQuestion,
    modeGuess: mode.mode,
    modeExplicit: mode.explicit,
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

function asCastMode(v: unknown): CastMode | null {
  return v === "now" || v === "timed" || v === "fortune" || v === "lots" ? v : null;
}

export async function extractTurn(input: {
  text: string;
  mode: SessionMode;
  eventId: EventId | null;
  chartCivil: CivilTime | null;
  hasPending: boolean;
  awaitingProfile: boolean;
  awaitingMode: boolean;
  awaitingKind?: string;
}): Promise<ExtractedTurn> {
  const heuristic = heuristicExtract(input.text);
  const fallback: ExtractedTurn = {
    kind: input.awaitingMode
      ? "pick_mode"
      : heuristic.hasQuestion
        ? "ask_question"
        : "chitchat",
    eventId: heuristic.eventId ?? input.eventId,
    civil: heuristic.civil ?? null,
    lotsCode: heuristic.lotsCode ?? null,
    fortuneSpan: heuristic.fortuneSpan ?? null,
    question: input.text,
    gender: heuristic.gender ?? null,
    birthYear: heuristic.birthYear ?? null,
    location: heuristic.location ?? null,
    declinedProfile: Boolean(heuristic.declinedProfile),
    hasQuestion: Boolean(heuristic.hasQuestion),
    modeGuess: heuristic.modeGuess ?? null,
    modeExplicit: Boolean(heuristic.modeExplicit),
    reason: "",
  };
  const now = new Date();
  const sys = `你是问象的对话理解器。只输出 JSON。
字段：kind, eventId, civil, lotsCode, fortuneSpan, question, gender, birthYear, location, declinedProfile, hasQuestion, modeGuess, modeExplicit, reason。
kind：
- ask_question：用户提出了要预测的事情
- pick_mode：用户在选择或确认测法
- followup：已有盘面，继续追问同一件事
- new_time：提到另一个具体时间，可能要重起盘
- new_event：换成另一类事项
- new_lots：给出新的三位数摇卦
- fortune：问日/月/年运
- provide_profile：主要在补性别、出生年或城市
- decline_profile：不愿提供资料，可用默认
- confirm_yes / confirm_no：同意或拒绝新开盘
- chitchat：寒暄、情绪倾诉、和生活有关但不是起盘
测法 modeGuess 只能是 now|timed|fortune|lots|null：
- now：按当前时辰
- timed：用户指定某个钟点（如明天下午三点），不是「下个月运势」
- fortune：年运、月运或日运。『下个月运势/这个月运/明年运』一律 fortune，civil 要挪到对应月份或年份，绝不是求签
- lots：仅当用户明确说摇卦、求签、或单独报了一个三位数
modeExplicit 为 true 表示用户已经点明测法，不必再问。
『下个月』『下月运势』不要当成求签，也不要问三位数。
eventId 只能是：${EVENT_HINT}。没有把握则 ${input.eventId ?? "null"}。
civil 为北京时间 {year,month,day,hour,minute}。今天大约 ${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}。下个月就把 month+1（12 月则 year+1, month=1）。没提时间则为 null。
location 形如 {province,city,district}，用户没提城市则为 null。
gender 为 male|female|null。birthYear 为四位数字或 null。
当前模式：${input.mode}；事项：${input.eventId ?? "无"}；等确认新盘：${input.hasPending ? "是" : "否"}；等补资料：${input.awaitingProfile ? "是" : "否"}；等选测法：${input.awaitingMode ? "是" : "否"}；等待补充：${input.awaitingKind ?? "无"}。`;

  const r = await llmChat(
    [
      { role: "system", content: sys },
      { role: "user", content: input.text.slice(0, 500) },
    ],
    { json: true, maxTokens: 420 },
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
      "pick_mode",
    ];
    const gender =
      obj.gender === "female" || obj.gender === "male" ? obj.gender : (heuristic.gender ?? null);
    const birthYearNum = Number(obj.birthYear);
    const birthYear =
      birthYearNum >= 1920 && birthYearNum <= 2030 ? birthYearNum : (heuristic.birthYear ?? null);
    const lots =
      heuristic.fortuneSpan
        ? null
        : typeof obj.lotsCode === "string" && /^\d{3}$/.test(obj.lotsCode)
          ? obj.lotsCode
          : (heuristic.lotsCode ?? null);
    const span =
      heuristic.fortuneSpan ??
      (obj.fortuneSpan === "day" || obj.fortuneSpan === "month" || obj.fortuneSpan === "year"
        ? obj.fortuneSpan
        : null);
    const hasQuestion =
      obj.hasQuestion === true || obj.hasQuestion === false ? Boolean(obj.hasQuestion) : fallback.hasQuestion;
    const modeGuess = heuristic.fortuneSpan
      ? "fortune"
      : (asCastMode(obj.modeGuess) ?? heuristic.modeGuess ?? null);
    const modeExplicit =
      Boolean(heuristic.fortuneSpan) ||
      (obj.modeExplicit === true || obj.modeExplicit === false
        ? Boolean(obj.modeExplicit)
        : Boolean(heuristic.modeExplicit));
    const civil = heuristic.civil ?? parseCivil(obj.civil);
    return {
      kind: heuristic.fortuneSpan
        ? kinds.includes(kind) && kind !== "chitchat" && kind !== "new_lots"
          ? kind === "pick_mode"
            ? "fortune"
            : kind
          : "fortune"
        : kinds.includes(kind)
          ? kind
          : fallback.kind,
      eventId,
      civil,
      lotsCode: lots,
      fortuneSpan: span,
      question: String(obj.question ?? input.text).slice(0, 500),
      gender,
      birthYear,
      location: location ?? heuristic.location ?? null,
      declinedProfile: Boolean(obj.declinedProfile) || Boolean(heuristic.declinedProfile),
      hasQuestion,
      modeGuess,
      modeExplicit: modeExplicit || Boolean(lots) || Boolean(span) || Boolean(parseCivil(obj.civil)),
      reason: String(obj.reason ?? "").slice(0, 200),
    };
  } catch {
    return fallback;
  }
}

export function inferMode(extracted: ExtractedTurn, current: SessionMode): SessionMode {
  if (extracted.fortuneSpan || extracted.kind === "fortune" || extracted.modeGuess === "fortune") return "fortune";
  if (extracted.lotsCode || extracted.modeGuess === "lots") return "lots";
  if (extracted.civil || extracted.modeGuess === "timed") return "timed";
  if (extracted.modeGuess === "now") return "now";
  if (current === "inbox") return "now";
  return current;
}

export function shouldOpenNewTimeChart(
  mode: SessionMode,
  chartCivil: CivilTime | null,
  asked: CivilTime | null,
): boolean {
  if (mode === "lots" || mode === "inbox") return false;
  if (mode === "fortune") return false;
  if (!asked || !chartCivil?.year) return false;
  return !sameShichen(chartCivil, asked);
}

export function shouldOpenNewFortuneChart(
  mode: SessionMode,
  currentSpan: string | null,
  currentCivil: CivilTime | null,
  nextSpan: "day" | "month" | "year" | null,
  nextCivil: CivilTime | null,
): boolean {
  if (!nextSpan) return false;
  if (mode !== "fortune") return true;
  if (currentSpan && currentSpan !== nextSpan) return true;
  if (!nextCivil || !currentCivil?.year) return false;
  if (nextSpan === "year") return nextCivil.year !== currentCivil.year;
  if (nextSpan === "month") {
    return nextCivil.year !== currentCivil.year || nextCivil.month !== currentCivil.month;
  }
  return (
    nextCivil.year !== currentCivil.year ||
    nextCivil.month !== currentCivil.month ||
    nextCivil.day !== currentCivil.day
  );
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

export function modeChoicePrompt(guess: CastMode | null, question?: string): string {
  const hint = guess
    ? `你这次更像是想「${MODE_LABEL[guess]}」${question ? `，事关「${question.slice(0, 24)}」` : ""}。说「好」我就按这个来，也可以改口。`
    : "你想用哪一种，直接说就好。";
  return clipHan(
    `要起盘的话，先选一种测法：按此刻时辰看、指定一个时间看、看年运月运或日运，或者摇个三位数求签。${hint}`,
  );
}

export function needLotsPrompt(): string {
  return "摇卦这一路要一个三位数，比如 168。你心里默一个，报给我就好。";
}

export function needTimePrompt(): string {
  return "指定时间这一路，把你想看的日期和钟点告诉我就好，比如「明天下午三点」。";
}

export function needFortunePrompt(): string {
  return "你想看年运、月运，还是今天的日运？说一声我就起。";
}

export function portraitLine(portrait?: Portrait | null): string {
  if (!portrait?.summary) return "";
  const bits = [
    portrait.summary,
    portrait.mood ? `近况心情：${portrait.mood}` : "",
    portrait.concerns.length ? `牵挂：${portrait.concerns.slice(0, 4).join("、")}` : "",
    portrait.care ? `安慰时注意：${portrait.care}` : "",
  ].filter(Boolean);
  return `问事人画像（供语气和针对性，不要当众宣读）：${bits.join("。")}`;
}

function parsePortrait(raw: unknown): Portrait {
  if (!raw || typeof raw !== "object") return { ...EMPTY_PORTRAIT };
  const o = raw as Record<string, unknown>;
  const list = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => String(x).slice(0, 40)).filter(Boolean).slice(0, 6) : [];
  return {
    summary: String(o.summary ?? "").slice(0, 240),
    mood: String(o.mood ?? "").slice(0, 80),
    tone: String(o.tone ?? "").slice(0, 80),
    situation: String(o.situation ?? "").slice(0, 160),
    concerns: list(o.concerns),
    traits: list(o.traits),
    care: String(o.care ?? "").slice(0, 120),
  };
}

export function readPortrait(json: string | null | undefined): Portrait {
  if (!json) return { ...EMPTY_PORTRAIT };
  try {
    return parsePortrait(JSON.parse(json));
  } catch {
    return { ...EMPTY_PORTRAIT };
  }
}

export async function refreshPortrait(input: {
  current: Portrait;
  nickname: string;
  text: string;
  recent: { role: string; content: string }[];
}): Promise<Portrait> {
  const sys = `你在为问象更新「人物肖像」。只输出 JSON。
字段：summary, mood, tone, situation, concerns（数组）, traits（数组）, care。
规则：
- 只写有把握的推断，没把握就沿用旧值或留空，不要编造职业、家庭、疾病。
- summary 两三句，写这个人眼下的处境和性情。
- mood 写当前情绪。tone 写适合怎么跟ta说话。
- concerns 是ta在意的事。traits 是较稳定的性格。
- care 是安慰时该注意什么。
旧画像：${JSON.stringify(input.current)}`;
  const recent = input.recent
    .slice(-6)
    .map((m) => `${m.role}: ${clipHan(m.content, 120)}`)
    .join("\n");
  const r = await llmChat(
    [
      { role: "system", content: sys },
      { role: "user", content: `称呼：${input.nickname}\n近对话：\n${recent}\n这一句：${input.text.slice(0, 400)}` },
    ],
    { json: true, maxTokens: 420 },
  );
  if (!r.ok) return input.current;
  try {
    const raw = r.text.replace(/^```json\s*/i, "").replace(/```$/i, "");
    const next = parsePortrait(JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)));
    return {
      summary: next.summary || input.current.summary,
      mood: next.mood || input.current.mood,
      tone: next.tone || input.current.tone,
      situation: next.situation || input.current.situation,
      concerns: next.concerns.length ? next.concerns : input.current.concerns,
      traits: next.traits.length ? next.traits : input.current.traits,
      care: next.care || input.current.care,
    };
  } catch {
    return input.current;
  }
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
  portrait?: Portrait | null;
}): Promise<string> {
  const placeRule = input.allowPlace
    ? `用户给过城市，可以轻轻点一下「${input.place ?? ""}」，但重点仍是方位和建筑类型。`
    : "禁止出现任何省、市、区、县名，也不要说北京、东城。地点只写方位（东南西北）和建筑类型（门口、厅堂、水边、高楼、学堂、仓库等）。";
  const sys = `你是「问象」，一位温和、积极、靠得住的知心大姐姐。用奇门盘帮人看事，但不吓人、不保证应验。
说话要求：
- 像面对面轻声聊，口语化，柔和，带一点鼓励。可按人物肖像调整语气，但不要把画像当众念出来。
- 全文不超过 500 个汉字。写清判断倾向、方位或建筑提示、一句可行的建议，必要时补一点为什么。
- 不要分点编号，不要 Markdown，不要表情符号。
- 不要堆术语。必要时只留一两个门或星的名字。
- ${placeRule}
- 供参考，不是定论。`;
  const user = [
    input.followup ? "这是追问。" : "请就这件事给出这一盘的看法。",
    `问：${input.question}`,
    input.eventName ? `事项：${input.eventName}` : "",
    input.juLabel ? `局：${input.juLabel}` : "",
    input.hourName ? `时辰：${input.hourName}` : "",
    input.clues ? `盘面线索：${input.clues}` : "",
    portraitLine(input.portrait),
    input.extra ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  const history = (input.history ?? []).slice(-6).map((m) => ({
    role: m.role,
    content: clipHan(m.content, 360),
  }));
  const r = await llmChat(
    [{ role: "system", content: sys }, ...history, { role: "user", content: user }],
    { maxTokens: 1024 },
  );
  if (!r.ok) {
    return clipHan(
      input.followup
        ? "我这边这一问问得有点含糊。你再把事情说具体一点，我按盘帮你看。"
        : `先看核心：这件事成的机会还在，别急着下结论。留意${input.clues.split("；").pop() || "顺的方位"}，把该做的一步做踏实就好。`,
    );
  }
  const cleaned = input.allowPlace ? r.text : stripNamedPlace(r.text);
  return clipHan(cleaned, 500);
}

export async function companionSay(input: {
  text: string;
  nickname: string;
  portrait?: Portrait | null;
  history?: { role: "user" | "assistant"; content: string }[];
}): Promise<string> {
  const p = input.portrait;
  const sys = `你是「问象」，知心大姐姐。这一轮用户没有要起盘，用通用的方式陪伴。
要求：
- 积极、向上、安慰、鼓励，但不空洞。
- 按人物肖像定向关心，不要把画像条款念出来。
- 全文不超过 500 个汉字。口语，柔和。不要 Markdown，不要表情符号。
- 如果对方其实想看盘，可以轻轻提一句：看盘有四种测法，按此刻、指定时间、年月日运，或摇个三位数。
画像：${p?.summary || "还不多"}。心情：${p?.mood || "未知"}。牵挂：${p?.concerns.join("、") || "未知"}。安慰注意：${p?.care || "温和、具体"}。`;
  const history = (input.history ?? []).slice(-6).map((m) => ({
    role: m.role as "user" | "assistant",
    content: clipHan(m.content, 280),
  }));
  const r = await llmChat(
    [
      { role: "system", content: sys },
      ...history,
      { role: "user", content: `${input.nickname}说：${input.text.slice(0, 500)}` },
    ],
    { maxTokens: 1024 },
  );
  if (!r.ok) {
    return clipHan(
      p?.care
        ? "我在的。你把心里那句再说清楚一点，我听着。想看盘也随时说，我陪你。"
        : "我在的。想倾诉、想看盘都可以。看盘的话告诉我想按此刻、指定时间、看运势，还是摇个三位数。",
    );
  }
  return clipHan(r.text, 500);
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
  return "我在的。想聊近况，或看事业、感情、求财，都可以直接说。看盘的话告诉我想按此刻、指定时间、看运势，还是摇个三位数。";
}
