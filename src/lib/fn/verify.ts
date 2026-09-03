import { createHash, randomBytes, randomInt } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { getSql } from "@/lib/db";
import { SESSION_TOKEN_COOKIE } from "@/lib/auth/server";
import { sendLoginCodeEmail, smtpStatus } from "@/lib/mail.server";
import { sendLoginCodeSms, smsReady } from "@/lib/sms.server";
import { newId } from "@/lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^1\d{10}$/;

function ident(channel: "email" | "phone", target: string) {
  return `login-code:${channel}:${target}`;
}

function digest(target: string, code: string) {
  return createHash("sha256").update(`${target}:${code}`).digest("hex");
}

function toEmail(channel: "email" | "phone", target: string) {
  return channel === "phone" ? `${target}@fortune.fun` : target;
}

export const loginChannels = createServerFn({ method: "GET" }).handler(async () => {
  const mail = smtpStatus();
  return { email: mail.ok, sms: smsReady() };
});

export const sendVerifyCode = createServerFn({ method: "POST" })
  .validator(
    z.object({
      channel: z.enum(["email", "phone"]),
      target: z.string().trim().min(3).max(80),
    }),
  )
  .handler(async ({ data }) => {
    const target = data.target.trim().toLowerCase();
    if (data.channel === "email" && !EMAIL_RE.test(target)) throw new Error("请填写有效邮箱");
    if (data.channel === "phone" && !PHONE_RE.test(target)) throw new Error("请填写 11 位手机号");
    const sql = await getSql();
    const key = ident(data.channel, target);
    const recent = await sql<{ created: string }>`
      select "createdAt" as created from verification
      where identifier = ${key}
      order by "createdAt" desc limit 1
    `;
    if (recent[0] && Date.now() - new Date(recent[0].created).getTime() < 60_000) {
      throw new Error("验证码刚发过，请稍等一分钟");
    }
    const code = String(randomInt(100000, 1000000));
    await sql`delete from verification where identifier = ${key}`;
    await sql`
      insert into verification ("id", "identifier", "value", "expiresAt", "createdAt", "updatedAt")
      values (${newId()}, ${key}, ${digest(target, code)}, now() + interval '5 minutes', now(), now())
    `;
    try {
      if (data.channel === "email") await sendLoginCodeEmail(target, code);
      else await sendLoginCodeSms(target, code);
    } catch (err) {
      await sql`delete from verification where identifier = ${key}`;
      throw err instanceof Error ? err : new Error("验证码没有发出");
    }
    return { ok: true as const, ttlSec: 60 };
  });

export const completeCodeLogin = createServerFn({ method: "POST" })
  .validator(
    z.object({
      channel: z.enum(["email", "phone"]),
      target: z.string().trim().min(3).max(80),
      code: z.string().trim().min(4).max(8),
      nickname: z.string().trim().max(32).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const target = data.target.trim().toLowerCase();
    if (data.channel === "email" && !EMAIL_RE.test(target)) throw new Error("请填写有效邮箱");
    if (data.channel === "phone" && !PHONE_RE.test(target)) throw new Error("请填写 11 位手机号");
    const code = data.code.replace(/\s+/g, "");
    const sql = await getSql();
    const key = ident(data.channel, target);
    const rows = await sql<{ value: string }>`
      select value from verification
      where identifier = ${key} and "expiresAt" > now()
      limit 1
    `;
    if (!rows[0] || rows[0].value !== digest(target, code)) throw new Error("验证码不对或已过期");
    await sql`delete from verification where identifier = ${key}`;

    const email = toEmail(data.channel, target);
    const name =
      data.nickname?.trim() ||
      (data.channel === "phone" ? `问事人${target.slice(-4)}` : email.split("@")[0] || "问事人");
    const existing = await sql<{ id: string }>`select id from "user" where email = ${email} limit 1`;
    let userId = existing[0]?.id;
    if (!userId) {
      userId = newId();
      const password = `Cd.${randomBytes(12).toString("hex")}`;
      const hash = await hashPassword(password);
      await sql`
        insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
        values (${userId}, ${name}, ${email}, ${true}, now(), now())
      `;
      await sql`
        insert into "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
        values (${newId()}, ${email}, ${"credential"}, ${userId}, ${hash}, now(), now())
      `;
    }
    await sql`
      insert into profiles (user_id, nickname)
      values (${userId}, ${name})
      on conflict (user_id) do nothing
    `;
    const token = randomBytes(32).toString("base64url");
    await sql`
      insert into "session" ("id", "expiresAt", "token", "createdAt", "updatedAt", "userId")
      values (${newId()}, now() + interval '7 days', ${token}, now(), now(), ${userId})
    `;
    setCookie(SESSION_TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return { ok: true as const, token };
  });
