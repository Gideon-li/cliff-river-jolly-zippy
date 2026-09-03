import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { ADMIN_EMAIL, ADMIN_PASSWORD, type Gender, type PlanKind, type Profile } from "@/lib/app-types";
import { locateByIp, reverseGeocode } from "@/lib/location.server";
import { newId } from "@/lib/utils";

type ProfileRow = {
  user_id: string;
  nickname: string;
  gender: string | null;
  birth_year: number | null;
  province: string | null;
  city: string | null;
  district: string | null;
  wechat_openid: string | null;
  is_admin: boolean;
  disabled: boolean;
  plan: string | null;
  plan_until: string | null;
  credits: number | null;
  lifetime_free: boolean | null;
  created_at: string;
};

function toProfile(row: ProfileRow, fallbackName = ""): Profile {
  const lifetime = Boolean(row.lifetime_free) || row.plan === "lifetime";
  const plan = (lifetime
    ? "lifetime"
    : row.plan === "monthly" || row.plan === "quarterly" || row.plan === "yearly"
      ? row.plan
      : "payg") as PlanKind;
  return {
    userId: row.user_id,
    nickname: row.nickname || fallbackName,
    gender: row.gender === "female" || row.gender === "male" ? (row.gender as Gender) : null,
    birthYear: row.birth_year,
    province: row.province,
    city: row.city,
    district: row.district,
    wechatOpenid: row.wechat_openid,
    isAdmin: Boolean(row.is_admin),
    plan,
    planUntil: row.plan_until ? String(row.plan_until) : null,
    credits: Number(row.credits ?? 3),
    lifetimeFree: lifetime,
    createdAt: String(row.created_at),
  };
}

export async function ensureAdmin() {
  const sql = await getSql();
  const existing = await sql<{ id: string }>`select id from "user" where email = ${ADMIN_EMAIL} limit 1`;
  if (existing[0]) {
    await sql`
      insert into profiles (user_id, nickname, is_admin, lifetime_free, plan, credits)
      values (${existing[0].id}, ${"管理员"}, ${true}, ${true}, ${"lifetime"}, ${999})
      on conflict (user_id) do update set is_admin = true, lifetime_free = true, plan = ${"lifetime"}
    `;
    return;
  }
  const userId = newId();
  const hash = await hashPassword(ADMIN_PASSWORD);
  await sql`
    insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
    values (${userId}, ${"管理员"}, ${ADMIN_EMAIL}, ${true}, now(), now())
  `;
  await sql`
    insert into "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
    values (${newId()}, ${ADMIN_EMAIL}, ${"credential"}, ${userId}, ${hash}, now(), now())
  `;
  await sql`
    insert into profiles (user_id, nickname, is_admin, lifetime_free, plan, credits)
    values (${userId}, ${"管理员"}, ${true}, ${true}, ${"lifetime"}, ${999})
  `;
}

export const bootstrapAuth = createServerFn({ method: "POST" }).handler(async () => {
  await ensureAdmin();
  return { ok: true as const };
});

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureAdmin();
    const sql = await getSql();
    const users = await sql<{ name: string; email: string }>`
      select name, email from "user" where id = ${context.userId} limit 1
    `;
    const name = users[0]?.name ?? "";
    const rows = await sql<ProfileRow>`select * from profiles where user_id = ${context.userId} limit 1`;
    if (!rows[0]) {
      await sql`
        insert into profiles (user_id, nickname, is_admin)
        values (${context.userId}, ${name}, ${users[0]?.email === ADMIN_EMAIL})
      `;
      const created = await sql<ProfileRow>`select * from profiles where user_id = ${context.userId} limit 1`;
      return toProfile(created[0]!, name);
    }
    if (!rows[0].nickname && name) {
      await sql`update profiles set nickname = ${name}, updated_at = now() where user_id = ${context.userId}`;
      rows[0].nickname = name;
    }
    return toProfile(rows[0], name);
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      nickname: z.string().trim().min(1).max(32).optional(),
      gender: z.enum(["male", "female"]).nullable().optional(),
      birthYear: z.number().int().min(1920).max(2030).nullable().optional(),
      province: z.string().trim().max(32).nullable().optional(),
      city: z.string().trim().max(32).nullable().optional(),
      district: z.string().trim().max(32).nullable().optional(),
      wechatOpenid: z.string().trim().max(64).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into profiles (user_id, nickname)
      values (${context.userId}, ${data.nickname ?? ""})
      on conflict (user_id) do nothing
    `;
    const current = await sql<ProfileRow>`select * from profiles where user_id = ${context.userId} limit 1`;
    const row = current[0];
    if (!row) throw new Error("资料不存在");
    const nickname = data.nickname ?? row.nickname;
    const gender = data.gender !== undefined ? data.gender : row.gender;
    const birthYear = data.birthYear !== undefined ? data.birthYear : row.birth_year;
    const province = data.province !== undefined ? data.province : row.province;
    const city = data.city !== undefined ? data.city : row.city;
    const district = data.district !== undefined ? data.district : row.district;
    const wechatOpenid = data.wechatOpenid ?? row.wechat_openid;
    await sql`
      update profiles set
        nickname = ${nickname},
        gender = ${gender},
        birth_year = ${birthYear},
        province = ${province},
        city = ${city},
        district = ${district},
        wechat_openid = ${wechatOpenid},
        updated_at = now()
      where user_id = ${context.userId}
    `;
    const rows = await sql<ProfileRow>`select * from profiles where user_id = ${context.userId} limit 1`;
    return toProfile(rows[0]!);
  });

export const resolvePlace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      lat: z.number().optional(),
      lng: z.number().optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (typeof data.lat === "number" && typeof data.lng === "number") {
      return reverseGeocode(data.lat, data.lng);
    }
    return locateByIp();
  });
