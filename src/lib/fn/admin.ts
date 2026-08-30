import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { ADMIN_EMAIL } from "@/lib/app-types";
import { ensureAdmin } from "./profile";
import { grantPlan, readWallet } from "./billing";

async function requireAdmin(userId: string) {
  await ensureAdmin();
  const sql = await getSql();
  const rows = await sql<{ email: string; is_admin: boolean | null }>`
    select u.email, p.is_admin
    from "user" u
    left join profiles p on p.user_id = u.id
    where u.id = ${userId}
    limit 1
  `;
  const row = rows[0];
  if (!row || (row.email !== ADMIN_EMAIL && !row.is_admin)) {
    throw new Error("没有管理员权限");
  }
}

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const users = await sql<{ count: number }>`select count(*)::int as count from "user"`;
    const sessions = await sql<{ count: number }>`select count(*)::int as count from divination_sessions`;
    const messages = await sql<{ count: number }>`select count(*)::int as count from messages`;
    const today = await sql<{ count: number }>`
      select count(*)::int as count from divination_sessions
      where created_at >= date_trunc('day', now())
    `;
    const revenue = await sql<{ fen: number }>`
      select coalesce(sum(amount_fen), 0)::int as fen from payments where status = ${"paid"}
    `;
    const paidCount = await sql<{ count: number }>`
      select count(*)::int as count from payments where status = ${"paid"}
    `;
    const monthly = await sql<{ count: number }>`
      select count(*)::int as count from profiles
      where plan = ${"monthly"} and plan_until is not null and plan_until > now()
    `;
    const lifetime = await sql<{ count: number }>`
      select count(*)::int as count from profiles where lifetime_free = true or plan = ${"lifetime"}
    `;
    const byMode = await sql<{ mode: string; count: number }>`
      select mode, count(*)::int as count
      from divination_sessions group by mode order by count desc
    `;
    const byEvent = await sql<{ event_id: string; count: number }>`
      select coalesce(event_id, 'unknown') as event_id, count(*)::int as count
      from divination_sessions group by event_id order by count desc
    `;
    const daily = await sql<{ day: string; count: number }>`
      select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*)::int as count
      from divination_sessions
      where created_at >= now() - interval '14 days'
      group by 1 order by 1
    `;
    return {
      users: users[0]?.count ?? 0,
      sessions: sessions[0]?.count ?? 0,
      messages: messages[0]?.count ?? 0,
      today: today[0]?.count ?? 0,
      revenueYuan: Math.round((revenue[0]?.fen ?? 0) / 100),
      paidCount: paidCount[0]?.count ?? 0,
      monthly: monthly[0]?.count ?? 0,
      lifetime: lifetime[0]?.count ?? 0,
      byMode,
      byEvent,
      daily,
    };
  });

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    return sql<{
      id: string;
      name: string;
      email: string;
      createdAt: string;
      nickname: string | null;
      gender: string | null;
      birth_year: number | null;
      province: string | null;
      city: string | null;
      is_admin: boolean | null;
      disabled: boolean | null;
      plan: string | null;
      plan_until: string | null;
      credits: number | null;
      lifetime_free: boolean | null;
      sessions: number;
      messages: number;
    }>`
      select
        u.id, u.name, u.email, u."createdAt",
        p.nickname, p.gender, p.birth_year, p.province, p.city, p.is_admin, p.disabled,
        p.plan, p.plan_until, p.credits, p.lifetime_free,
        coalesce(s.n, 0)::int as sessions,
        coalesce(m.n, 0)::int as messages
      from "user" u
      left join profiles p on p.user_id = u.id
      left join (
        select user_id, count(*) as n from divination_sessions group by user_id
      ) s on s.user_id = u.id
      left join (
        select user_id, count(*) as n from messages group by user_id
      ) m on m.user_id = u.id
      order by u."createdAt" desc
    `;
  });

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      userId: z.string().min(1),
      nickname: z.string().trim().max(32).optional(),
      disabled: z.boolean().optional(),
      creditsDelta: z.number().int().min(-999).max(999).optional(),
      plan: z.enum(["payg", "monthly", "lifetime"]).optional(),
      lifetime: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    if (data.userId === context.userId && data.disabled) {
      throw new Error("不能停用当前管理员");
    }
    const sql = await getSql();
    await sql`
      insert into profiles (user_id, nickname)
      values (${data.userId}, ${data.nickname ?? ""})
      on conflict (user_id) do nothing
    `;
    await sql`
      update profiles set
        nickname = coalesce(${data.nickname ?? null}, nickname),
        disabled = coalesce(${data.disabled ?? null}, disabled),
        updated_at = now()
      where user_id = ${data.userId}
    `;
    if (data.creditsDelta || data.plan || data.lifetime) {
      await grantPlan(
        data.userId,
        {
          creditsDelta: data.creditsDelta,
          plan: data.plan,
          lifetime: data.lifetime || data.plan === "lifetime",
        },
        "管理员操作",
      );
    }
    const row = await sql<{
      plan: string | null;
      plan_until: string | null;
      credits: number | null;
      lifetime_free: boolean | null;
    }>`
      select plan, plan_until, credits, lifetime_free from profiles where user_id = ${data.userId} limit 1
    `;
    return { ok: true as const, wallet: readWallet(row[0] ?? {}) };
  });

export const adminRecentSessions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    return sql<{
      id: string;
      user_id: string;
      nickname: string | null;
      email: string | null;
      mode: string;
      event_id: string | null;
      ju_label: string | null;
      created_at: string;
    }>`
      select d.id, d.user_id, p.nickname, u.email, d.mode, d.event_id, d.ju_label, d.created_at
      from divination_sessions d
      left join profiles p on p.user_id = d.user_id
      left join "user" u on u.id = d.user_id
      order by d.created_at desc
      limit 30
    `;
  });

export const adminRecentPayments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    return sql<{
      id: string;
      user_id: string;
      nickname: string | null;
      email: string | null;
      channel: string;
      sku: string;
      amount_fen: number;
      status: string;
      created_at: string;
      paid_at: string | null;
    }>`
      select p.id, p.user_id, pr.nickname, u.email, p.channel, p.sku, p.amount_fen, p.status, p.created_at, p.paid_at
      from payments p
      left join profiles pr on pr.user_id = p.user_id
      left join "user" u on u.id = p.user_id
      order by p.created_at desc
      limit 40
    `;
  });
