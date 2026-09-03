import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  BEIJING_LOCATION,
  EVENT_NAME,
  FORTUNE_SPAN_LABEL,
  MODE_SHORT,
  type CivilTime,
  type EventId,
  type GeoLocation,
  type Portrait,
  type SessionMode,
} from "@/lib/app-types";
import {
  GREETING,
  cluesFromScan,
  companionSay,
  extractTurn,
  inferMode,
  isPreciseLocation,
  missingProfilePrompt,
  needFortunePrompt,
  needLotsPrompt,
  needTimePrompt,
  readPortrait,
  refreshPortrait,
  shouldOpenNewFortuneChart,
  shouldOpenNewLotsChart,
  shouldOpenNewTimeChart,
  sisterSay,
  beijingNowCivil,
  parseFortuneRelative,
  type CastMode,
  type ExtractedTurn,
} from "@/lib/agent.server";
import { resolveLocation } from "@/lib/location.server";
import { runLots, runScan, type QueryBody } from "@/lib/qimen.server";
import { NeedPayError, consumeCast } from "@/lib/fn/billing";
import { hourNameOf, shichenRangeLabel } from "@/lib/shichen";
import { formatBeijing, newId, type JsonValue } from "@/lib/utils";

const eventIdSchema = z.enum([
  "wealth",
  "career",
  "job",
  "romance",
  "study",
  "health",
  "travel",
  "lawsuit",
  "partner",
  "property",
  "negotiate",
  "find",
]);

const civilSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

const locSchema = z.object({
  province: z.string(),
  city: z.string(),
  district: z.string(),
  source: z.enum(["gps", "ip", "fallback", "profile"]),
});

type SessionRow = {
  id: string;
  user_id: string;
  mode: string;
  fortune_span: string | null;
  lots_code: string | null;
  event_id: string | null;
  civil_year: number | null;
  civil_month: number | null;
  civil_day: number | null;
  civil_hour: number | null;
  civil_minute: number | null;
  hour_name: string | null;
  ju_label: string | null;
  location_json: string;
  chart_json: string;
  scan_json: string;
  pending_json: string | null;
  created_at: string;
};

type MsgRow = {
  id: number;
  session_id: string;
  role: string;
  content: string;
  kind: string;
  created_at: string;
};

type ProfileLite = {
  nickname: string;
  gender: "male" | "female" | null;
  birth_year: number | null;
  province: string | null;
  city: string | null;
  district: string | null;
  disabled: boolean;
  portrait: Portrait;
};

type PendingBody = {
  kind?: "need_profile" | "new_chart" | "need_mode" | "need_lots" | "need_time" | "need_span";
  declined?: boolean;
  askedProfile?: boolean;
  mode?: SessionMode;
  eventId?: EventId;
  civil?: CivilTime;
  question?: string;
  lotsCode?: string;
  fortuneSpan?: "day" | "month" | "year";
};

function asObj(v: JsonValue): { [k: string]: JsonValue } {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function civilOf(scan: JsonValue): CivilTime {
  const obj = asObj(scan);
  const chart = asObj(obj.chart ?? null);
  const c = (obj.civil ?? chart.beijing) as CivilTime | undefined;
  if (c && c.year) return c;
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
  };
}

async function loadProfile(userId: string): Promise<ProfileLite> {
  const sql = await getSql();
  const rows = await sql<ProfileLite & { portrait_json?: string }>`
    select nickname, gender, birth_year, province, city, district, disabled, portrait_json
    from profiles where user_id = ${userId} limit 1
  `;
  if (rows[0]?.disabled) throw new Error("账号已被停用");
  const users = await sql<{ name: string }>`select name from "user" where id = ${userId} limit 1`;
  const row = rows[0];
  return {
    nickname: row?.nickname || users[0]?.name || "问事人",
    gender: row?.gender ?? null,
    birth_year: row?.birth_year ?? null,
    province: row?.province ?? null,
    city: row?.city ?? null,
    district: row?.district ?? null,
    disabled: Boolean(row?.disabled),
    portrait: readPortrait(row?.portrait_json),
  };
}

async function savePortrait(userId: string, portrait: Portrait) {
  const sql = await getSql();
  await sql`
    insert into profiles (user_id, nickname, portrait_json)
    values (${userId}, ${""}, ${JSON.stringify(portrait)})
    on conflict (user_id) do update set portrait_json = ${JSON.stringify(portrait)}, updated_at = now()
  `;
}

function bodyFrom(opts: {
  profile: ProfileLite;
  loc: GeoLocation;
  civil?: CivilTime;
  eventId?: EventId | null;
  casting?: "chaibu" | "lots";
  lotsCode?: string | null;
  lotsMonth?: number;
  question?: string;
  history?: { role: "user" | "assistant"; content: string }[];
}): QueryBody {
  return {
    civil: opts.civil,
    casting: opts.casting ?? "chaibu",
    lotsCode: opts.lotsCode ?? undefined,
    lotsMonth: opts.lotsMonth,
    subjectKind: "person",
    personName: opts.profile.nickname || "问事人",
    gender: opts.profile.gender ?? undefined,
    birthYear: opts.profile.birth_year,
    location: {
      province: opts.loc.province,
      city: opts.loc.city,
      district: opts.loc.district,
    },
    eventId: opts.eventId ?? "wealth",
    question: opts.question,
    history: opts.history,
  };
}

function packSession(row: SessionRow, messages: MsgRow[] = []) {
  return {
    id: row.id,
    mode: row.mode as SessionMode,
    fortuneSpan: row.fortune_span,
    lotsCode: row.lots_code,
    eventId: row.event_id as EventId | null,
    civil: {
      year: row.civil_year ?? 0,
      month: row.civil_month ?? 0,
      day: row.civil_day ?? 0,
      hour: row.civil_hour ?? 0,
      minute: row.civil_minute ?? 0,
    },
    hourName: row.hour_name,
    juLabel: row.ju_label,
    location: JSON.parse(row.location_json || "{}") as GeoLocation,
    scan: JSON.parse(row.scan_json || "{}") as JsonValue,
    pending: row.pending_json ? (JSON.parse(row.pending_json) as JsonValue) : null,
    createdAt: String(row.created_at),
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
      kind: m.kind,
      createdAt: String(m.created_at),
    })),
  };
}

async function insertMessage(
  sessionId: string,
  userId: string,
  role: string,
  content: string,
  kind: string,
) {
  const sql = await getSql();
  const rows = await sql<MsgRow>`
    insert into messages (session_id, user_id, role, content, kind)
    values (${sessionId}, ${userId}, ${role}, ${content}, ${kind})
    returning id, session_id, role, content, kind, created_at
  `;
  return rows[0]!;
}

async function loadPacked(id: string, userId: string) {
  const sql = await getSql();
  const rows = await sql<SessionRow>`
    select * from divination_sessions where id = ${id} and user_id = ${userId} limit 1
  `;
  if (!rows[0]) throw new Error("找不到这一盘");
  const messages = await sql<MsgRow>`
    select id, session_id, role, content, kind, created_at
    from messages where session_id = ${id} and user_id = ${userId}
    order by id asc
  `;
  return packSession(rows[0], messages);
}

async function applyProfilePatch(
  userId: string,
  extracted: ExtractedTurn,
): Promise<ProfileLite> {
  const sql = await getSql();
  await sql`
    insert into profiles (user_id, nickname)
    values (${userId}, ${""})
    on conflict (user_id) do nothing
  `;
  if (extracted.gender) {
    await sql`update profiles set gender = ${extracted.gender}, updated_at = now() where user_id = ${userId}`;
  }
  if (extracted.birthYear) {
    await sql`update profiles set birth_year = ${extracted.birthYear}, updated_at = now() where user_id = ${userId}`;
  }
  if (extracted.location) {
    await sql`
      update profiles set
        province = ${extracted.location.province},
        city = ${extracted.location.city},
        district = ${extracted.location.district},
        updated_at = now()
      where user_id = ${userId}
    `;
  }
  return loadProfile(userId);
}

function locFromProfile(profile: ProfileLite, fallback: GeoLocation | null): GeoLocation {
  if (profile.province) {
    return {
      province: profile.province,
      city: profile.city || profile.province,
      district: profile.district || profile.city || profile.province,
      source: "profile",
    };
  }
  return resolveLocation(profile, fallback);
}

function gapsOf(profile: ProfileLite, loc: GeoLocation) {
  return {
    gender: !profile.gender,
    birthYear: !profile.birth_year,
    location: !isPreciseLocation(loc),
  };
}

function hasGaps(g: { gender: boolean; birthYear: boolean; location: boolean }) {
  return g.gender || g.birthYear || g.location;
}

async function writePending(sessionId: string, userId: string, pending: PendingBody | null) {
  const sql = await getSql();
  const raw = pending ? JSON.stringify(pending) : null;
  await sql`update divination_sessions set pending_json = ${raw} where id = ${sessionId} and user_id = ${userId}`;
}

async function fillChart(opts: {
  userId: string;
  sessionId: string;
  mode: SessionMode;
  eventId: EventId;
  loc: GeoLocation;
  profile: ProfileLite;
  civil?: CivilTime;
  lotsCode?: string | null;
  fortuneSpan?: "day" | "month" | "year" | null;
  question: string;
  promptExtra?: string;
}) {
  const now = beijingNowCivil();
  let lots = null as { ju: number; steps: string[]; code: string } | null;
  if (opts.mode === "lots") {
    const code = opts.lotsCode ?? "";
    if (!/^\d{3}$/.test(code)) throw new Error("摇卦需要一个三位数");
    lots = (await runLots(code)) as { ju: number; steps: string[]; code: string };
  }
  const fortuneSpan = opts.fortuneSpan ?? (opts.mode === "fortune" ? "month" : null);
  const civilInput =
    opts.mode === "timed" || opts.mode === "fortune" ? (opts.civil ?? now) : undefined;
  const body = bodyFrom({
    profile: opts.profile,
    loc: opts.loc.province ? opts.loc : BEIJING_LOCATION,
    civil: civilInput,
    eventId: opts.eventId,
    casting: opts.mode === "lots" ? "lots" : "chaibu",
    lotsCode: lots?.code ?? opts.lotsCode,
    lotsMonth: (civilInput?.month ?? now.month) as number,
    question: opts.question,
  });
  await consumeCast(opts.userId, opts.sessionId);
  const scan = await runScan(body);
  const civil = civilOf(scan);
  const chart = asObj(asObj(scan).chart ?? null) as { hourName?: string; ju?: { label?: string } };
  const spanName = fortuneSpan === "year" ? "年运" : fortuneSpan === "day" ? "日运" : "月运";
  const juLabel =
    opts.mode === "fortune" && civilInput
      ? `${civilInput.year}年${civilInput.month}月${spanName}${chart.ju?.label ? ` · ${chart.ju.label}` : ""}`
      : (chart.ju?.label ?? "");
  const hourName = chart.hourName ?? hourNameOf(civil.hour);
  const sql = await getSql();
  await sql`
    update divination_sessions set
      mode = ${opts.mode},
      fortune_span = ${fortuneSpan},
      lots_code = ${lots?.code ?? opts.lotsCode ?? null},
      event_id = ${opts.eventId},
      civil_year = ${civil.year},
      civil_month = ${civil.month},
      civil_day = ${civil.day},
      civil_hour = ${civil.hour},
      civil_minute = ${civil.minute},
      hour_name = ${hourName},
      ju_label = ${juLabel},
      location_json = ${JSON.stringify(opts.loc)},
      chart_json = ${JSON.stringify(asObj(scan).chart ?? {})},
      scan_json = ${JSON.stringify(scan)},
      pending_json = null
    where id = ${opts.sessionId} and user_id = ${opts.userId}
  `;
  const fortunePack = asObj(asObj(scan).fortune ?? null);
  const period = fortuneSpan ? asObj(fortunePack[fortuneSpan] ?? null) : null;
  const periodLine =
    opts.mode === "fortune" && civilInput
      ? `${civilInput.year}年${civilInput.month}月${fortuneSpan === "year" ? "年运" : fortuneSpan === "day" ? "日运" : "月运"}。${period?.reading ? String(period.reading) : ""}`
      : "";
  const allowPlace = isPreciseLocation(opts.loc);
  const extra = [periodLine || undefined, opts.promptExtra].filter(Boolean).join("\n");
  const text = await sisterSay({
    question: opts.question,
    clues: cluesFromScan(scan as Record<string, unknown>),
    juLabel,
    hourName,
    eventName: EVENT_NAME[opts.eventId],
    allowPlace,
    place: allowPlace ? `${opts.loc.city}` : undefined,
    portrait: opts.profile.portrait,
    extra: extra || undefined,
  });
  await insertMessage(opts.sessionId, opts.userId, "assistant", text, "compose");
  return loadPacked(opts.sessionId, opts.userId);
}

async function saveNewSession(opts: {
  userId: string;
  mode: SessionMode;
  fortuneSpan?: string | null;
  lotsCode?: string | null;
  eventId?: EventId | null;
  loc: GeoLocation;
  scan: JsonValue;
  pending?: JsonValue | null;
}) {
  const sql = await getSql();
  const id = newId();
  const civil = civilOf(opts.scan);
  const chart = asObj(asObj(opts.scan).chart ?? null) as { hourName?: string; ju?: { label?: string } };
  const juLabel = chart.ju?.label ?? "";
  const hourName = chart.hourName ?? hourNameOf(civil.hour);
  await sql`
    insert into divination_sessions (
      id, user_id, mode, fortune_span, lots_code, event_id,
      civil_year, civil_month, civil_day, civil_hour, civil_minute,
      hour_name, ju_label, location_json, chart_json, scan_json, pending_json
    ) values (
      ${id}, ${opts.userId}, ${opts.mode}, ${opts.fortuneSpan ?? null}, ${opts.lotsCode ?? null},
      ${opts.eventId ?? null},
      ${civil.year}, ${civil.month}, ${civil.day}, ${civil.hour}, ${civil.minute},
      ${hourName}, ${juLabel},
      ${JSON.stringify(opts.loc)}, ${JSON.stringify(asObj(opts.scan).chart ?? {})},
      ${JSON.stringify(opts.scan)}, ${opts.pending ? JSON.stringify(opts.pending) : null}
    )
  `;
  const rows = await sql<SessionRow>`select * from divination_sessions where id = ${id} limit 1`;
  return rows[0]!;
}

async function openCastSession(userId: string, data: {
  mode: SessionMode;
  eventId?: EventId;
  question?: string;
  civil?: CivilTime;
  lotsCode?: string;
  fortuneSpan?: "day" | "month" | "year";
  location?: GeoLocation;
}) {
  const profile = await loadProfile(userId);
  const loc = locFromProfile(profile, data.location ?? null);
  const eventId = (data.eventId ?? "wealth") as EventId;
  const question = data.question?.trim() || "请帮我看看最近的情况";
  const row = await saveNewSession({
    userId,
    mode: "inbox",
    loc,
    scan: {},
    eventId,
  });
  return fillChart({
    userId,
    sessionId: row.id,
    mode: data.mode === "inbox" ? "now" : data.mode,
    eventId,
    loc,
    profile,
    civil: data.civil,
    lotsCode: data.lotsCode,
    fortuneSpan: data.fortuneSpan,
    question,
  });
}

function asCastMode(m?: SessionMode | string | null): CastMode | null {
  return m === "now" || m === "timed" || m === "fortune" || m === "lots" ? m : null;
}

function describeManualCast(data: {
  mode: CastMode;
  eventId: EventId;
  civil?: CivilTime;
  lotsCode?: string;
  fortuneSpan?: "day" | "month" | "year";
  question?: string;
}) {
  const bits = [MODE_SHORT[data.mode]];
  if (data.fortuneSpan) bits.push(FORTUNE_SPAN_LABEL[data.fortuneSpan]);
  if (data.lotsCode) bits.push(`摇卦 ${data.lotsCode}`);
  if (data.civil?.year) bits.push(formatBeijing(data.civil));
  bits.push(`事项「${EVENT_NAME[data.eventId]}」`);
  const head = `我在网页上起了一盘：${bits.join(" · ")}`;
  return data.question?.trim() ? `${head}。我想问：${data.question.trim()}` : `${head}。请根据盘面主动总结。`;
}


function isYes(text: string, kind: ExtractedTurn["kind"]) {
  if (kind === "confirm_yes") return true;
  return /^(是的?|好的?呀?呢?吧?|要的?|开吧?|重新起?盘?|可以|行|嗯+|好)\s*[。.!！]*$/.test(text.trim());
}

function isNo(text: string, kind: ExtractedTurn["kind"]) {
  if (kind === "confirm_no") return true;
  return /^(不|先不|不用|取消|不要|算了)(了|吧|啦)?\s*[。.!！]*$/.test(text.trim());
}

function acceptsGuess(text: string) {
  return /随便|你看着来|都可以|按你说/.test(text);
}

function wantsReading(extracted: ExtractedTurn): boolean {
  if (extracted.kind === "chitchat" && !extracted.hasQuestion) return false;
  if ((extracted.kind === "provide_profile" || extracted.kind === "decline_profile") && !extracted.hasQuestion) {
    return false;
  }
  if (extracted.kind === "confirm_no") return false;
  return (
    extracted.hasQuestion ||
    extracted.kind === "ask_question" ||
    extracted.kind === "fortune" ||
    extracted.kind === "new_lots" ||
    extracted.kind === "new_time" ||
    extracted.kind === "new_event" ||
    extracted.kind === "pick_mode" ||
    Boolean(extracted.lotsCode) ||
    Boolean(extracted.civil) ||
    Boolean(extracted.fortuneSpan) ||
    Boolean(extracted.modeGuess && extracted.modeExplicit)
  );
}

function resolvePickedMode(
  extracted: ExtractedTurn,
  pending: PendingBody | null,
  yes: boolean,
  text: string,
): CastMode | null {
  if (extracted.fortuneSpan || extracted.kind === "fortune" || extracted.modeGuess === "fortune") {
    return "fortune";
  }
  if (extracted.lotsCode) return "lots";
  if (extracted.civil && extracted.modeGuess !== "now") return "timed";
  if (extracted.modeExplicit && extracted.modeGuess) return extracted.modeGuess;
  if (extracted.kind === "pick_mode" && extracted.modeGuess) return extracted.modeGuess;
  if (yes || acceptsGuess(text)) return asCastMode(pending?.mode);
  if (pending?.kind === "need_profile") return asCastMode(pending.mode);
  return null;
}

async function loadHistory(sessionId: string, userId: string) {
  const sql = await getSql();
  const historyRows = await sql<MsgRow>`
    select role, content from messages
    where session_id = ${sessionId} and user_id = ${userId} and role in ('user','assistant')
    order by id desc limit 10
  `;
  return historyRows.reverse().map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

async function replyText(
  sessionId: string,
  userId: string,
  text: string,
  kind = "chat",
  extra?: { type?: "reply" | "confirm"; eventId?: EventId },
) {
  await insertMessage(sessionId, userId, "assistant", text, kind);
  return {
    type: extra?.type ?? ("reply" as const),
    session: await loadPacked(sessionId, userId),
    eventId: extra?.eventId,
  };
}

async function proceedCast(opts: {
  userId: string;
  session: SessionRow;
  profile: ProfileLite;
  loc: GeoLocation;
  mode: CastMode;
  eventId: EventId;
  civil?: CivilTime;
  lotsCode?: string | null;
  fortuneSpan?: "day" | "month" | "year" | null;
  question: string;
  declined: boolean;
  openNew: boolean;
}) {
  const pendingBase: PendingBody = {
    mode: opts.mode,
    eventId: opts.eventId,
    civil: opts.civil,
    question: opts.question,
    lotsCode: opts.lotsCode ?? undefined,
    fortuneSpan: opts.fortuneSpan ?? undefined,
    declined: opts.declined,
  };
  if (opts.mode === "lots" && !/^\d{3}$/.test(opts.lotsCode ?? "")) {
    await writePending(opts.session.id, opts.userId, { ...pendingBase, kind: "need_lots" });
    return replyText(opts.session.id, opts.userId, needLotsPrompt(), "system");
  }
  if (opts.mode === "timed" && !opts.civil?.year) {
    await writePending(opts.session.id, opts.userId, { ...pendingBase, kind: "need_time" });
    return replyText(opts.session.id, opts.userId, needTimePrompt(), "system");
  }
  if (opts.mode === "fortune" && !opts.fortuneSpan) {
    await writePending(opts.session.id, opts.userId, { ...pendingBase, kind: "need_span" });
    return replyText(opts.session.id, opts.userId, needFortunePrompt(), "system");
  }
  const gaps = gapsOf(opts.profile, opts.loc);
  if (hasGaps(gaps) && !opts.declined) {
    await writePending(opts.session.id, opts.userId, {
      ...pendingBase,
      kind: "need_profile",
      askedProfile: true,
    });
    return replyText(
      opts.session.id,
      opts.userId,
      missingProfilePrompt({ ...gaps, question: opts.question }),
      "system",
    );
  }
  if (opts.openNew) {
    const opened = await openCastSession(opts.userId, {
      mode: opts.mode,
      eventId: opts.eventId,
      question: opts.question,
      civil: opts.civil,
      lotsCode: opts.lotsCode ?? undefined,
      fortuneSpan: opts.fortuneSpan ?? undefined,
      location: opts.loc,
    });
    return { type: "new_session" as const, session: opened };
  }
  const packed = await fillChart({
    userId: opts.userId,
    sessionId: opts.session.id,
    mode: opts.mode,
    eventId: opts.eventId,
    loc: opts.loc,
    profile: opts.profile,
    civil: opts.civil,
    lotsCode: opts.lotsCode,
    fortuneSpan: opts.fortuneSpan,
    question: opts.question,
  });
  return { type: "reply" as const, session: packed };
}

export const ensureThread = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      location: locSchema.optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const existing = await sql<SessionRow>`
      select d.* from divination_sessions d
      left join (
        select session_id, max(id) as last_id from messages group by session_id
      ) m on m.session_id = d.id
      where d.user_id = ${context.userId}
      order by coalesce(m.last_id, 0) desc, d.created_at desc
      limit 1
    `;
    if (existing[0]) {
      if (data.location?.source === "gps") {
        const loc = data.location;
        await sql`
          update profiles set
            province = ${loc.province},
            city = ${loc.city},
            district = ${loc.district},
            updated_at = now()
          where user_id = ${context.userId}
        `;
      }
      return loadPacked(existing[0].id, context.userId);
    }
    const profile = await loadProfile(context.userId);
    const loc = locFromProfile(profile, data.location ?? null);
    const id = newId();
    await sql`
      insert into divination_sessions (
        id, user_id, mode, location_json, chart_json, scan_json
      ) values (
        ${id}, ${context.userId}, ${"inbox"}, ${JSON.stringify(loc)}, ${"{}"}, ${"{}"}
      )
    `;
    await insertMessage(id, context.userId, "assistant", GREETING, "greet");
    return loadPacked(id, context.userId);
  });

export const openSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      mode: z.enum(["now", "timed", "fortune", "lots", "inbox"]),
      eventId: eventIdSchema.optional(),
      question: z.string().trim().max(400).optional(),
      civil: civilSchema.optional(),
      lotsCode: z.string().regex(/^\d{3}$/).optional(),
      fortuneSpan: z.enum(["day", "month", "year"]).optional(),
      location: locSchema.optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const session = await openCastSession(context.userId, data);
    return { session };
  });

export const castManual = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      sessionId: z.string().min(1),
      mode: z.enum(["now", "timed", "fortune", "lots"]),
      eventId: eventIdSchema,
      civil: civilSchema.optional(),
      lotsCode: z.string().regex(/^\d{3}$/).optional(),
      fortuneSpan: z.enum(["day", "month", "year"]).optional(),
      question: z.string().trim().max(400).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<SessionRow>`
      select * from divination_sessions where id = ${data.sessionId} and user_id = ${context.userId} limit 1
    `;
    if (!rows[0]) throw new Error("找不到这一盘");
    const profile = await loadProfile(context.userId);
    const loc = locFromProfile(profile, JSON.parse(rows[0].location_json || "{}") as GeoLocation);
    const question = data.question?.trim() || "请根据网页这一盘主动总结";
    const userLine = describeManualCast({
      mode: data.mode,
      eventId: data.eventId,
      civil: data.civil,
      lotsCode: data.lotsCode,
      fortuneSpan: data.fortuneSpan,
      question: data.question,
    });
    await insertMessage(rows[0].id, context.userId, "user", userLine, "user");
    try {
      const session = await fillChart({
        userId: context.userId,
        sessionId: rows[0].id,
        mode: data.mode,
        eventId: data.eventId,
        loc,
        profile,
        civil: data.civil,
        lotsCode: data.lotsCode,
        fortuneSpan: data.fortuneSpan,
        question,
        promptExtra: "这是网页上手动起的盘。请根据当前盘面，用白话主动总结：问的是什么、总断吉凶、较顺的方位、宜忌。智断写在对话里即可，不要让用户再选测法。",
      });
      return { type: "reply" as const, session };
    } catch (err) {
      if (err instanceof NeedPayError || (err instanceof Error && err.name === "NeedPayError")) {
        const msg =
          err instanceof Error
            ? err.message
            : "这一问需要扣 1 次。次数不够的话，去「充值」买次数或开通月租。";
        await insertMessage(rows[0].id, context.userId, "assistant", msg, "paywall");
        return { type: "reply" as const, session: await loadPacked(rows[0].id, context.userId) };
      }
      throw err;
    }
  });

export const listSessions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<SessionRow>`
      select * from divination_sessions
      where user_id = ${context.userId} and mode != ${"inbox"}
      order by created_at desc limit 40
    `;
    return rows.map((r) => packSession(r));
  });

export const getSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    return loadPacked(data.id, context.userId);
  });

export const sendConsult = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      sessionId: z.string().min(1),
      text: z.string().trim().min(1).max(800),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<SessionRow>`
      select * from divination_sessions where id = ${data.sessionId} and user_id = ${context.userId} limit 1
    `;
    if (!rows[0]) throw new Error("找不到这一盘");
    const session = rows[0];
    let profile = await loadProfile(context.userId);
    let loc = locFromProfile(profile, JSON.parse(session.location_json || "{}") as GeoLocation);
    const chartCivil: CivilTime = {
      year: session.civil_year ?? 0,
      month: session.civil_month ?? 0,
      day: session.civil_day ?? 0,
      hour: session.civil_hour ?? 0,
      minute: session.civil_minute ?? 0,
    };
    await insertMessage(session.id, context.userId, "user", data.text, "user");

    const pending = session.pending_json ? (JSON.parse(session.pending_json) as PendingBody) : null;
    const history = await loadHistory(session.id, context.userId);
    const [extracted, nextPortrait] = await Promise.all([
      extractTurn({
        text: data.text,
        mode: session.mode as SessionMode,
        eventId: (session.event_id as EventId | null) ?? null,
        chartCivil: chartCivil.year ? chartCivil : null,
        hasPending: Boolean(pending && pending.kind === "new_chart"),
        awaitingProfile: Boolean(pending && pending.kind === "need_profile"),
        awaitingMode: Boolean(pending && pending.kind === "need_mode"),
        awaitingKind: pending?.kind,
      }),
      refreshPortrait({
        current: profile.portrait,
        nickname: profile.nickname,
        text: data.text,
        recent: history,
      }).catch(() => profile.portrait),
    ]);

    profile = await applyProfilePatch(context.userId, extracted);
    await savePortrait(context.userId, nextPortrait);
    profile = { ...profile, portrait: nextPortrait };
    loc = locFromProfile(profile, loc);

    const yes = isYes(data.text, extracted.kind);
    const no = isNo(data.text, extracted.kind);
    const hasChart = Boolean(session.ju_label);
    const nextEvent = (extracted.eventId ?? pending?.eventId ?? (session.event_id as EventId) ?? "wealth") as EventId;
    const fortuneFirst = Boolean(
      extracted.fortuneSpan || extracted.kind === "fortune" || extracted.modeGuess === "fortune",
    );
    const lotsCode = fortuneFirst ? null : (extracted.lotsCode ?? pending?.lotsCode ?? null);
    let civil = extracted.civil ?? pending?.civil ?? undefined;
    const question = extracted.question || pending?.question || data.text;
    const declined =
      extracted.declinedProfile ||
      extracted.kind === "decline_profile" ||
      Boolean(pending?.declined) ||
      Boolean(extracted.fortuneSpan || extracted.lotsCode || extracted.modeExplicit);
    const picked = resolvePickedMode(extracted, pending, yes, data.text);
    let fortuneSpan = extracted.fortuneSpan ?? pending?.fortuneSpan ?? null;
    if (pending?.kind === "need_span" && yes && !fortuneSpan) fortuneSpan = "day";
    if (
      !fortuneSpan &&
      (extracted.kind === "fortune" || extracted.modeGuess === "fortune" || picked === "fortune")
    ) {
      fortuneSpan = "month";
    }
    if ((picked === "fortune" || fortuneSpan) && !civil?.year) {
      const rel = parseFortuneRelative(data.text);
      civil = rel.civil ?? beijingNowCivil();
      if (!extracted.fortuneSpan && rel.span) fortuneSpan = rel.span;
    }

    const comfort = async () => {
      const text = await companionSay({
        text: data.text,
        nickname: profile.nickname,
        portrait: profile.portrait,
        history,
      });
      return replyText(session.id, context.userId, text, "chat");
    };

    const paywall = (err: unknown) => {
      const msg =
        err instanceof NeedPayError || (err instanceof Error && err.name === "NeedPayError")
          ? err.message
          : "这一问需要扣 1 次。次数不够的话，去「充值」买次数或开通月租。";
      return replyText(session.id, context.userId, msg, "paywall");
    };

    const cast = async (mode: CastMode) => {
      try {
        return await proceedCast({
          userId: context.userId,
          session,
          profile,
          loc,
          mode,
          eventId: nextEvent,
          civil,
          lotsCode,
          fortuneSpan,
          question,
          declined,
          openNew: false,
        });
      } catch (err) {
        if (err instanceof NeedPayError || (err instanceof Error && err.name === "NeedPayError")) {
          return paywall(err);
        }
        throw err;
      }
    };

    const autoMode = (): CastMode =>
      picked ||
      asCastMode(inferMode(extracted, session.mode as SessionMode)) ||
      "now";

    if (pending?.kind === "new_chart" && yes) {
      await writePending(session.id, context.userId, null);
      const mode =
        picked ||
        asCastMode(pending.mode) ||
        asCastMode(inferMode(extracted, session.mode as SessionMode)) ||
        "now";
      return cast(mode);
    }
    if (pending?.kind === "new_chart" && no) {
      await writePending(session.id, context.userId, null);
      return replyText(
        session.id,
        context.userId,
        "好，咱们继续看这一盘。你把想问的细节再说说就行。",
        "system",
      );
    }
    if (pending?.kind === "new_chart" && wantsReading(extracted)) {
      await writePending(session.id, context.userId, null);
      const mode =
        picked ||
        asCastMode(pending.mode) ||
        asCastMode(inferMode(extracted, session.mode as SessionMode)) ||
        "now";
      return cast(mode);
    }

    if (pending?.kind === "need_profile") {
      if (declined || !hasGaps(gapsOf(profile, loc))) {
        const mode = picked || asCastMode(pending.mode) || "now";
        return cast(mode);
      }
      if (extracted.gender || extracted.birthYear || extracted.location || extracted.kind === "provide_profile") {
        await writePending(session.id, context.userId, { ...pending, askedProfile: true });
        return replyText(
          session.id,
          context.userId,
          missingProfilePrompt({ ...gapsOf(profile, loc), question: pending.question }),
          "system",
        );
      }
      return comfort();
    }

    if (
      pending?.kind === "need_lots" ||
      pending?.kind === "need_time" ||
      pending?.kind === "need_span" ||
      pending?.kind === "need_mode"
    ) {
      if (picked) return cast(picked);
      const confirmed = asCastMode(pending.mode);
      if (yes && confirmed) return cast(confirmed);
      if (wantsReading(extracted)) return cast(autoMode());
      return comfort();
    }

    if (!hasChart) {
      if (
        !wantsReading(extracted) &&
        (extracted.kind === "provide_profile" || extracted.gender || extracted.birthYear || extracted.location)
      ) {
        const left = gapsOf(profile, loc);
        const text = hasGaps(left)
          ? missingProfilePrompt(left)
          : "资料我记下了。想问哪件事，直接说就好。";
        return replyText(session.id, context.userId, text, "system");
      }
      if (!wantsReading(extracted)) return comfort();
      return cast(autoMode());
    }

    if (!wantsReading(extracted) && extracted.kind !== "followup" && extracted.kind !== "ask_question") {
      return comfort();
    }

    const timeShift = shouldOpenNewTimeChart(session.mode as SessionMode, chartCivil, extracted.civil);
    const fortuneShift = shouldOpenNewFortuneChart(
      session.mode as SessionMode,
      session.fortune_span,
      chartCivil,
      fortuneSpan,
      civil ?? null,
    );
    const lotsShift = shouldOpenNewLotsChart(session.mode as SessionMode, session.event_id as EventId, nextEvent);
    const modeShift = Boolean(picked && picked !== session.mode);
    const eventShift = extracted.kind === "new_event" && nextEvent !== session.event_id;

    if (fortuneShift) {
      await writePending(session.id, context.userId, {
        kind: "new_chart",
        mode: "fortune",
        eventId: nextEvent,
        civil,
        fortuneSpan: fortuneSpan ?? undefined,
        question,
      });
      const when =
        civil && fortuneSpan === "month"
          ? `${civil.year}年${civil.month}月`
          : civil && fortuneSpan === "year"
            ? `${civil.year}年`
            : fortuneSpan === "day"
              ? "那一天"
              : "新的运势";
      return replyText(
        session.id,
        context.userId,
        `这一盘还在当前时段里。你要看的是${when}的运势，已经超出这一盘。要不要按新的时间再起一盘？说「好」我就起，想继续问这一盘也可以。`,
        "confirm",
        { type: "confirm" },
      );
    }

    if (timeShift && extracted.civil) {
      await writePending(session.id, context.userId, {
        kind: "new_chart",
        mode: picked || (session.mode as SessionMode),
        eventId: nextEvent,
        civil: extracted.civil,
        question,
      });
      return replyText(
        session.id,
        context.userId,
        `你提到的时间已经过了这一盘的时辰（${shichenRangeLabel(chartCivil.hour)}）。要不要按新时间再起一盘？说「好」就行，不想换就继续问这一盘。`,
        "confirm",
        { type: "confirm" },
      );
    }

    if (lotsShift || modeShift || eventShift) {
      const nextMode = picked || autoMode();
      await writePending(session.id, context.userId, {
        kind: "new_chart",
        mode: nextMode,
        eventId: nextEvent,
        civil,
        lotsCode: lotsCode ?? undefined,
        fortuneSpan: fortuneSpan ?? undefined,
        question,
      });
      return replyText(
        session.id,
        context.userId,
        `这一盘是「${EVENT_NAME[(session.event_id as EventId) || "wealth"]}」。超出这一盘的范围了。要不要另起一盘？说「好」我就按新的来；想继续问这一盘，说一声就行。`,
        "confirm",
        { type: "confirm" },
      );
    }

    if (extracted.kind === "chitchat" && !extracted.hasQuestion) return comfort();

    try {
      const scan = JSON.parse(session.scan_json || "{}") as Record<string, unknown>;
      const text = await sisterSay({
        question,
        clues: cluesFromScan(scan),
        juLabel: session.ju_label ?? undefined,
        hourName: session.hour_name ?? undefined,
        eventName: EVENT_NAME[nextEvent],
        allowPlace: isPreciseLocation(loc),
        place: isPreciseLocation(loc) ? loc.city : undefined,
        followup: true,
        history,
        portrait: profile.portrait,
      });
      await insertMessage(session.id, context.userId, "assistant", text, "ask");
      if (nextEvent && nextEvent !== session.event_id) {
        await sql`update divination_sessions set event_id = ${nextEvent} where id = ${session.id} and user_id = ${context.userId}`;
      }
      return { type: "reply" as const, session: await loadPacked(session.id, context.userId), eventId: nextEvent };
    } catch (err) {
      const text = err instanceof Error ? err.message : "这一问问得有点含糊，你换个说法再试试。";
      return replyText(session.id, context.userId, text, "error");
    }
  });
