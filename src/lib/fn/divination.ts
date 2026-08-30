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
import { parseIntent, shouldOpenNewLotsChart, shouldOpenNewTimeChart } from "@/lib/intent.server";
import { resolveLocation } from "@/lib/location.server";
import { runAsk, runCompose, runLots, runScan, type QueryBody } from "@/lib/qimen.server";
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
};

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

async function saveSession(opts: {
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

function openingCopy(mode: SessionMode, scan: JsonValue, eventId: EventId | null) {
  const obj = scan && typeof scan === "object" && !Array.isArray(scan) ? scan : {};
  const chart = (obj.chart ?? {}) as { ju?: { label?: string }; hourName?: string; timeLabel?: string };
  const loc = (obj.location ?? {}) as { province?: string; city?: string; district?: string };
  const place = [loc.province, loc.city, loc.district].filter(Boolean).join(" ");
  const eventName = eventId ? EVENT_NAME[eventId] : "总盘";
  const range = civilOf(scan);
  if (mode === "lots") {
    return `已按摇卦起盘。${chart.ju?.label ?? ""}。当前事项按「${eventName}」来看。你可以继续追问同一类事情。`;
  }
  if (mode === "fortune") {
    return `已起年、月、日运。下面是智断联想。你可以继续问某一段运势。`;
  }
  return `已按北京时间 ${formatBeijing(range)}（${shichenRangeLabel(range.hour)}）起盘。${chart.ju?.label ?? ""}。地点：${place || "北京"}。默认以智断联想作答；若你有具体事情，我会结合盘面追问。`;
}

function sceneText(scene: JsonValue | null | undefined): string {
  if (!scene) return "";
  const obj = asObj(scene);
  const expansion = Array.isArray(obj.expansion) ? obj.expansion : [];
  const lines = [
    obj.scene && String(obj.scene),
    obj.content && `事情：${obj.content}`,
    obj.time && `时间：${obj.time}`,
    obj.place && `地点：${obj.place}`,
    obj.people && `人物：${obj.people}`,
    expansion.length ? `延伸：${expansion.map(String).join("；")}` : "",
    obj.caution && `提醒：${obj.caution}`,
  ].filter(Boolean);
  return lines.join("\n");
}

type OpenInput = {
  mode: SessionMode;
  eventId?: EventId;
  question?: string;
  civil?: CivilTime;
  lotsCode?: string;
  fortuneSpan?: "day" | "month" | "year";
  location?: GeoLocation;
};

async function openSessionForUser(userId: string, data: OpenInput) {
  const profile = await loadProfile(userId);
  const loc = resolveLocation(profile, data.location ?? null);
  const eventId = (data.eventId ?? "wealth") as EventId;
  let lots = null as { ju: number; steps: string[]; code: string } | null;
  if (data.mode === "lots") {
    const code = data.lotsCode ?? "168";
    lots = (await runLots(code)) as { ju: number; steps: string[]; code: string };
  }
  const now = new Date();
  const civil = data.mode === "timed" && data.civil ? data.civil : undefined;
  const question =
    data.question?.trim() ||
    (data.mode === "fortune"
      ? "请就年运、月运、日运作智断联想"
      : `请就「${EVENT_NAME[eventId]}」围绕「${profile.nickname || "问事人"}」联想一件最合理的具体事情。`);
  const body = bodyFrom({
    profile,
    loc: loc.province ? loc : BEIJING_LOCATION,
    civil,
    eventId,
    casting: data.mode === "lots" ? "lots" : "chaibu",
    lotsCode: lots?.code ?? data.lotsCode,
    lotsMonth: (data.civil?.month ?? now.getMonth() + 1) as number,
    question,
  });
  const scan = await runScan(body);
  const row = await saveSession({
    userId,
    mode: data.mode,
    fortuneSpan: data.fortuneSpan ?? (data.mode === "fortune" ? "day" : null),
    lotsCode: lots?.code ?? data.lotsCode ?? null,
    eventId,
    loc,
    scan,
  });
  await insertMessage(row.id, userId, "system", openingCopy(data.mode, scan, eventId), "system");
  try {
    const composed = await runCompose({ ...body, question });
    const composeText = sceneText(asObj(composed).scene ?? null);
    if (composeText) {
      await insertMessage(row.id, userId, "assistant", composeText, "compose");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "智断联想暂时无法完成，你可以先看盘面，或换个问题再试。";
    await insertMessage(row.id, userId, "assistant", msg, "error");
  }
  const sql = await getSql();
  const messages = await sql<MsgRow>`
    select id, session_id, role, content, kind, created_at
    from messages where session_id = ${row.id} and user_id = ${userId}
    order by id asc
  `;
  return { session: packSession(row, messages), lots };
}

export const openSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      mode: z.enum(["now", "timed", "fortune", "lots"]),
      eventId: eventIdSchema.optional(),
      question: z.string().trim().max(400).optional(),
      civil: civilSchema.optional(),
      lotsCode: z.string().regex(/^\d{3}$/).optional(),
      fortuneSpan: z.enum(["day", "month", "year"]).optional(),
      location: locSchema.optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    return openSessionForUser(context.userId, data);
  });

export const listSessions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<SessionRow>`
      select * from divination_sessions where user_id = ${context.userId}
      order by created_at desc limit 40
    `;
    return rows.map((r) => packSession(r));
  });

export const getSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<SessionRow>`
      select * from divination_sessions where id = ${data.id} and user_id = ${context.userId} limit 1
    `;
    if (!rows[0]) throw new Error("找不到这一盘");
    const messages = await sql<MsgRow>`
      select id, session_id, role, content, kind, created_at
      from messages where session_id = ${data.id} and user_id = ${context.userId}
      order by id asc
    `;
    return packSession(rows[0], messages);
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
    const profile = await loadProfile(context.userId);
    const loc = JSON.parse(session.location_json || "{}") as GeoLocation;
    const chartCivil: CivilTime = {
      year: session.civil_year ?? 0,
      month: session.civil_month ?? 0,
      day: session.civil_day ?? 0,
      hour: session.civil_hour ?? 0,
      minute: session.civil_minute ?? 0,
    };
    await insertMessage(session.id, context.userId, "user", data.text, "user");

    const pending = session.pending_json
      ? (JSON.parse(session.pending_json) as {
          mode?: SessionMode;
          eventId?: EventId;
          civil?: CivilTime;
          question?: string;
          lotsCode?: string;
        })
      : null;
    const intent = await parseIntent({
      text: data.text,
      mode: session.mode as SessionMode,
      eventId: (session.event_id as EventId | null) ?? "wealth",
      chartCivil,
      hasPending: Boolean(pending),
    });

    if (pending && (intent.kind === "confirm_yes" || /^(是|好|要|开|重新|可以|行)/.test(data.text.trim()))) {
      await sql`update divination_sessions set pending_json = null where id = ${session.id} and user_id = ${context.userId}`;
      const nextMode = (pending.mode as SessionMode) || (session.mode as SessionMode);
      const opened = await openSessionForUser(context.userId, {
        mode: nextMode,
        eventId: (pending.eventId as EventId) || (session.event_id as EventId) || "wealth",
        question: String(pending.question ?? data.text),
        civil: pending.civil as CivilTime | undefined,
        lotsCode: (pending.lotsCode as string | undefined) ?? session.lots_code ?? undefined,
        location: loc,
      });
      return { type: "new_session" as const, session: opened.session, notice: "已按你的确认另开一盘。" };
    }
    if (pending && (intent.kind === "confirm_no" || /^(不|先不|不用|取消)/.test(data.text.trim()))) {
      await sql`update divination_sessions set pending_json = null where id = ${session.id} and user_id = ${context.userId}`;
      const msg = await insertMessage(
        session.id,
        context.userId,
        "assistant",
        "好，继续看当前这一盘。你还可以追问同一件事情。",
        "system",
      );
      return {
        type: "reply" as const,
        message: { id: msg.id, role: "assistant" as const, content: msg.content, kind: msg.kind },
      };
    }

    const nextEvent = (intent.eventId ?? (session.event_id as EventId) ?? "wealth") as EventId;
    const timeShift = shouldOpenNewTimeChart(session.mode as SessionMode, chartCivil, intent.civil);
    const lotsShift = shouldOpenNewLotsChart(session.mode as SessionMode, session.event_id as EventId, nextEvent);

    if (timeShift && intent.civil) {
      const pendingBody = {
        mode: session.mode,
        eventId: nextEvent,
        civil: intent.civil,
        question: intent.question,
      };
      await sql`update divination_sessions set pending_json = ${JSON.stringify(pendingBody)} where id = ${session.id} and user_id = ${context.userId}`;
      const text = `你问到的时间 ${formatBeijing(intent.civil)} 已经超出当前奇门盘（${shichenRangeLabel(chartCivil.hour)}）的范围。是否按新的时间重新起一盘？回复「是」即另开；回复「否」则继续本盘。`;
      const msg = await insertMessage(session.id, context.userId, "assistant", text, "confirm");
      return {
        type: "confirm" as const,
        message: { id: msg.id, role: "assistant" as const, content: msg.content, kind: msg.kind },
      };
    }

    if (lotsShift) {
      const pendingBody = {
        mode: "lots",
        eventId: nextEvent,
        lotsCode: session.lots_code,
        question: intent.question,
      };
      await sql`update divination_sessions set pending_json = ${JSON.stringify(pendingBody)} where id = ${session.id} and user_id = ${context.userId}`;
      const text = `摇卦这一盘目前在问「${EVENT_NAME[(session.event_id as EventId) || "wealth"]}」。你这次问的是「${EVENT_NAME[nextEvent]}」，不属同一类事情。是否另开一局新盘？回复「是」即另开。`;
      const msg = await insertMessage(session.id, context.userId, "assistant", text, "confirm");
      return {
        type: "confirm" as const,
        message: { id: msg.id, role: "assistant" as const, content: msg.content, kind: msg.kind },
      };
    }

    const historyRows = await sql<MsgRow>`
      select role, content from messages
      where session_id = ${session.id} and user_id = ${context.userId} and role in ('user','assistant')
      order by id desc limit 8
    `;
    const history = historyRows
      .reverse()
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const body = bodyFrom({
      profile,
      loc,
      civil: chartCivil.year ? chartCivil : undefined,
      eventId: nextEvent,
      casting: session.mode === "lots" ? "lots" : "chaibu",
      lotsCode: session.lots_code,
      lotsMonth: chartCivil.month || undefined,
      question: intent.question,
      history,
    });

    try {
      const asked = await runAsk(body);
      const askedText = String(asObj(asked).text ?? "");
      const msg = await insertMessage(session.id, context.userId, "assistant", askedText, "ask");
      if (nextEvent && nextEvent !== session.event_id) {
        await sql`update divination_sessions set event_id = ${nextEvent} where id = ${session.id} and user_id = ${context.userId}`;
      }
      return {
        type: "reply" as const,
        message: { id: msg.id, role: "assistant" as const, content: msg.content, kind: msg.kind },
        eventId: nextEvent,
      };
    } catch (err) {
      const text = err instanceof Error ? err.message : "这一问没有答上来，请换个说法再试。";
      const msg = await insertMessage(session.id, context.userId, "assistant", text, "error");
      return {
        type: "reply" as const,
        message: { id: msg.id, role: "assistant" as const, content: msg.content, kind: msg.kind },
      };
    }
  });
