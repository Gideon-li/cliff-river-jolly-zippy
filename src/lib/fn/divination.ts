import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  BEIJING_LOCATION,
  EVENT_NAME,
  type CivilTime,
  type EventId,
  type GeoLocation,
  type SessionMode,
} from "@/lib/app-types";
import {
  GREETING,
  chitchatFallback,
  cluesFromScan,
  extractTurn,
  inferMode,
  isPreciseLocation,
  missingProfilePrompt,
  shouldOpenNewLotsChart,
  shouldOpenNewTimeChart,
  sisterSay,
  type ExtractedTurn,
} from "@/lib/agent.server";
import { resolveLocation } from "@/lib/location.server";
import { runLots, runScan, type QueryBody } from "@/lib/qimen.server";
import { hourNameOf, shichenRangeLabel } from "@/lib/shichen";
import { newId, type JsonValue } from "@/lib/utils";

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
};

type PendingBody = {
  kind?: "need_profile" | "new_chart";
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
  const rows = await sql<ProfileLite>`
    select nickname, gender, birth_year, province, city, district, disabled
    from profiles where user_id = ${userId} limit 1
  `;
  if (rows[0]?.disabled) throw new Error("账号已被停用");
  const users = await sql<{ name: string }>`select name from "user" where id = ${userId} limit 1`;
  return (
    rows[0] ?? {
      nickname: users[0]?.name ?? "问事人",
      gender: null,
      birth_year: null,
      province: null,
      city: null,
      district: null,
      disabled: false,
    }
  );
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
}) {
  const now = new Date();
  let lots = null as { ju: number; steps: string[]; code: string } | null;
  if (opts.mode === "lots") {
    const code = opts.lotsCode ?? "168";
    lots = (await runLots(code)) as { ju: number; steps: string[]; code: string };
  }
  const body = bodyFrom({
    profile: opts.profile,
    loc: opts.loc.province ? opts.loc : BEIJING_LOCATION,
    civil: opts.mode === "timed" ? opts.civil : undefined,
    eventId: opts.eventId,
    casting: opts.mode === "lots" ? "lots" : "chaibu",
    lotsCode: lots?.code ?? opts.lotsCode,
    lotsMonth: (opts.civil?.month ?? now.getMonth() + 1) as number,
    question: opts.question,
  });
  const scan = await runScan(body);
  const civil = civilOf(scan);
  const chart = asObj(asObj(scan).chart ?? null) as { hourName?: string; ju?: { label?: string } };
  const juLabel = chart.ju?.label ?? "";
  const hourName = chart.hourName ?? hourNameOf(civil.hour);
  const sql = await getSql();
  await sql`
    update divination_sessions set
      mode = ${opts.mode},
      fortune_span = ${opts.fortuneSpan ?? (opts.mode === "fortune" ? "day" : null)},
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
  const allowPlace = isPreciseLocation(opts.loc);
  const text = await sisterSay({
    question: opts.question,
    clues: cluesFromScan(scan as Record<string, unknown>),
    juLabel,
    hourName,
    eventName: EVENT_NAME[opts.eventId],
    allowPlace,
    place: allowPlace ? `${opts.loc.city}` : undefined,
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
      select * from divination_sessions
      where user_id = ${context.userId}
      order by created_at desc
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
      text: z.string().trim().min(1).max(400),
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
    const extracted = await extractTurn({
      text: data.text,
      mode: session.mode as SessionMode,
      eventId: (session.event_id as EventId | null) ?? null,
      chartCivil: chartCivil.year ? chartCivil : null,
      hasPending: Boolean(pending && pending.kind === "new_chart"),
      awaitingProfile: Boolean(pending && pending.kind === "need_profile"),
    });

    profile = await applyProfilePatch(context.userId, extracted);
    loc = locFromProfile(profile, loc);

    const yes =
      extracted.kind === "confirm_yes" || /^(是|好|要|开|重新|可以|行|嗯)/.test(data.text.trim());
    const no = extracted.kind === "confirm_no" || /^(不|先不|不用|取消)/.test(data.text.trim());

    if (pending?.kind === "new_chart" && yes) {
      await writePending(session.id, context.userId, null);
      const opened = await openCastSession(context.userId, {
        mode: (pending.mode as SessionMode) || inferMode(extracted, session.mode as SessionMode),
        eventId: pending.eventId || (session.event_id as EventId) || "wealth",
        question: String(pending.question ?? extracted.question ?? data.text),
        civil: pending.civil,
        lotsCode: pending.lotsCode ?? session.lots_code ?? undefined,
        fortuneSpan: pending.fortuneSpan,
        location: loc,
      });
      return { type: "new_session" as const, session: opened };
    }
    if (pending?.kind === "new_chart" && no) {
      await writePending(session.id, context.userId, null);
      const text = "好，咱们继续看这一盘。你把想问的细节再说说就行。";
      await insertMessage(session.id, context.userId, "assistant", text, "system");
      return { type: "reply" as const, session: await loadPacked(session.id, context.userId) };
    }

    const nextEvent = (extracted.eventId ?? (session.event_id as EventId) ?? "wealth") as EventId;
    const nextMode = inferMode(extracted, session.mode as SessionMode);
    const question = extracted.question || pending?.question || data.text;
    const hasChart = Boolean(session.ju_label);
    const gaps = gapsOf(profile, loc);
    const declined = extracted.declinedProfile || extracted.kind === "decline_profile" || Boolean(pending?.declined);

    if (pending?.kind === "need_profile") {
      const stillMissing = hasGaps(gaps) && !declined;
      if (stillMissing && !extracted.declinedProfile && extracted.kind === "provide_profile") {
        const text = missingProfilePrompt({ ...gaps, question: pending.question });
        await writePending(session.id, context.userId, { ...pending, askedProfile: true });
        await insertMessage(session.id, context.userId, "assistant", text, "system");
        return { type: "reply" as const, session: await loadPacked(session.id, context.userId) };
      }
      const packed = await fillChart({
        userId: context.userId,
        sessionId: session.id,
        mode: (pending.mode as SessionMode) || nextMode,
        eventId: (pending.eventId as EventId) || nextEvent,
        loc,
        profile,
        civil: pending.civil ?? extracted.civil ?? undefined,
        lotsCode: pending.lotsCode ?? extracted.lotsCode,
        fortuneSpan: pending.fortuneSpan ?? extracted.fortuneSpan,
        question: pending.question || question,
      });
      return { type: "reply" as const, session: packed };
    }

    const readyQuestion =
      extracted.hasQuestion ||
      extracted.kind === "ask_question" ||
      extracted.kind === "fortune" ||
      extracted.kind === "new_lots" ||
      Boolean(extracted.lotsCode);

    if (!hasChart) {
      if (extracted.kind === "chitchat" && !readyQuestion && !extracted.gender && !extracted.birthYear && !extracted.location) {
        await insertMessage(session.id, context.userId, "assistant", chitchatFallback(), "chat");
        return { type: "reply" as const, session: await loadPacked(session.id, context.userId) };
      }
      if (readyQuestion && hasGaps(gaps) && !declined && !pending?.askedProfile) {
        await writePending(session.id, context.userId, {
          kind: "need_profile",
          askedProfile: true,
          mode: nextMode,
          eventId: nextEvent,
          civil: extracted.civil ?? undefined,
          question,
          lotsCode: extracted.lotsCode ?? undefined,
          fortuneSpan: extracted.fortuneSpan ?? undefined,
        });
        const text = missingProfilePrompt({ ...gaps, question });
        await insertMessage(session.id, context.userId, "assistant", text, "system");
        return { type: "reply" as const, session: await loadPacked(session.id, context.userId) };
      }
      if (!readyQuestion && (extracted.gender || extracted.birthYear || extracted.location || extracted.kind === "provide_profile")) {
        const left = gapsOf(profile, loc);
        const text = hasGaps(left)
          ? missingProfilePrompt(left)
          : "资料我记下了。想问哪件事，直接说就好。";
        await insertMessage(session.id, context.userId, "assistant", text, "system");
        return { type: "reply" as const, session: await loadPacked(session.id, context.userId) };
      }
      if (!readyQuestion) {
        await insertMessage(session.id, context.userId, "assistant", chitchatFallback(), "chat");
        return { type: "reply" as const, session: await loadPacked(session.id, context.userId) };
      }
      const packed = await fillChart({
        userId: context.userId,
        sessionId: session.id,
        mode: nextMode,
        eventId: nextEvent,
        loc,
        profile,
        civil: extracted.civil ?? undefined,
        lotsCode: extracted.lotsCode,
        fortuneSpan: extracted.fortuneSpan,
        question,
      });
      return { type: "reply" as const, session: packed };
    }

    const timeShift = shouldOpenNewTimeChart(session.mode as SessionMode, chartCivil, extracted.civil);
    const lotsShift = shouldOpenNewLotsChart(session.mode as SessionMode, session.event_id as EventId, nextEvent);

    if (timeShift && extracted.civil) {
      await writePending(session.id, context.userId, {
        kind: "new_chart",
        mode: session.mode as SessionMode,
        eventId: nextEvent,
        civil: extracted.civil,
        question,
      });
      const text = `你提到的时间已经过了这一盘的时辰（${shichenRangeLabel(chartCivil.hour)}）。要不要按新时间再起一盘？说「好」就行，不想换就继续问这一盘。`;
      await insertMessage(session.id, context.userId, "assistant", text, "confirm");
      return { type: "confirm" as const, session: await loadPacked(session.id, context.userId) };
    }

    if (lotsShift) {
      await writePending(session.id, context.userId, {
        kind: "new_chart",
        mode: "lots",
        eventId: nextEvent,
        lotsCode: session.lots_code ?? undefined,
        question,
      });
      const text = `这一盘本来在看「${EVENT_NAME[(session.event_id as EventId) || "wealth"]}」，你这次问的是「${EVENT_NAME[nextEvent]}」。要不要另开一局？说「好」我就重起。`;
      await insertMessage(session.id, context.userId, "assistant", text, "confirm");
      return { type: "confirm" as const, session: await loadPacked(session.id, context.userId) };
    }

    const historyRows = await sql<MsgRow>`
      select role, content from messages
      where session_id = ${session.id} and user_id = ${context.userId} and role in ('user','assistant')
      order by id desc limit 8
    `;
    const history = historyRows
      .reverse()
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    const scan = JSON.parse(session.scan_json || "{}") as Record<string, unknown>;
    try {
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
      });
      await insertMessage(session.id, context.userId, "assistant", text, "ask");
      if (nextEvent && nextEvent !== session.event_id) {
        await sql`update divination_sessions set event_id = ${nextEvent} where id = ${session.id} and user_id = ${context.userId}`;
      }
      return { type: "reply" as const, session: await loadPacked(session.id, context.userId), eventId: nextEvent };
    } catch (err) {
      const text = err instanceof Error ? err.message : "这一问问得有点含糊，你换个说法再试试。";
      await insertMessage(session.id, context.userId, "assistant", text, "error");
      return { type: "reply" as const, session: await loadPacked(session.id, context.userId) };
    }
  });
