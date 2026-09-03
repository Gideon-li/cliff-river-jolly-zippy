import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  ADMIN_EMAIL,
  PAY_SKUS,
  type PayChannel,
  type PaySku,
  type PlanKind,
} from "@/lib/app-types";
import { newId } from "@/lib/utils";

export type Wallet = {
  plan: PlanKind;
  planUntil: string | null;
  credits: number;
  lifetimeFree: boolean;
  unlimited: boolean;
  label: string;
};

const SUB_PLANS: PlanKind[] = ["monthly", "quarterly", "yearly"];

export class NeedPayError extends Error {
  constructor(public wallet: Wallet) {
    super(
      wallet.credits <= 0
        ? "这一问需要扣 1 次。次数不够了，去「充值」买次数，或开通包月 / 包季 / 包年。"
        : "先充值后再问这一盘。",
    );
    this.name = "NeedPayError";
  }
}

function skuOf(id: string) {
  return PAY_SKUS.find((s) => s.id === id) ?? null;
}

function untilDay(until: string | null) {
  if (!until) return "";
  const d = new Date(until);
  if (Number.isNaN(d.getTime())) return String(until).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function planTitle(plan: PlanKind) {
  if (plan === "yearly") return "年租";
  if (plan === "quarterly") return "季租";
  if (plan === "monthly") return "月租";
  if (plan === "lifetime") return "永久免费";
  return "按次";
}

function labelOf(plan: PlanKind, lifetime: boolean, until: string | null, credits: number) {
  if (lifetime || plan === "lifetime") return "永久免费";
  if (SUB_PLANS.includes(plan) && until && new Date(until).getTime() > Date.now()) {
    return `${planTitle(plan)}至 ${untilDay(until)}`;
  }
  return `按次 ${credits} 次`;
}

function asPlan(raw?: string | null, lifetime?: boolean): PlanKind {
  if (lifetime || raw === "lifetime") return "lifetime";
  if (raw === "monthly" || raw === "quarterly" || raw === "yearly") return raw;
  return "payg";
}

export function readWallet(row: {
  plan?: string | null;
  plan_until?: string | null;
  credits?: number | null;
  lifetime_free?: boolean | null;
}): Wallet {
  const lifetime = Boolean(row.lifetime_free) || row.plan === "lifetime";
  const plan = asPlan(row.plan, lifetime);
  const planUntil = row.plan_until ? String(row.plan_until) : null;
  const subOn =
    SUB_PLANS.includes(plan) && Boolean(planUntil) && new Date(planUntil as string).getTime() > Date.now();
  const credits = Number(row.credits ?? 0);
  return {
    plan,
    planUntil,
    credits,
    lifetimeFree: lifetime,
    unlimited: lifetime || subOn,
    label: labelOf(plan, lifetime, planUntil, credits),
  };
}

export async function loadWallet(userId: string): Promise<Wallet> {
  const sql = await getSql();
  const rows = await sql<{
    plan: string | null;
    plan_until: string | null;
    credits: number | null;
    lifetime_free: boolean | null;
    email: string | null;
  }>`
    select p.plan, p.plan_until, p.credits, p.lifetime_free, u.email
    from profiles p
    left join "user" u on u.id = p.user_id
    where p.user_id = ${userId}
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    await sql`
      insert into profiles (user_id, nickname, credits, plan)
      values (${userId}, ${""}, ${3}, ${"payg"})
      on conflict (user_id) do nothing
    `;
    return readWallet({ credits: 3, plan: "payg", lifetime_free: false });
  }
  if (row.email === ADMIN_EMAIL && !row.lifetime_free) {
    await sql`
      update profiles set lifetime_free = true, plan = ${"lifetime"}, updated_at = now()
      where user_id = ${userId}
    `;
    return readWallet({ ...row, lifetime_free: true, plan: "lifetime" });
  }
  return readWallet(row);
}

export async function consumeCast(userId: string, sessionId: string): Promise<Wallet> {
  const wallet = await loadWallet(userId);
  if (wallet.unlimited) {
    const sql = await getSql();
    await sql`
      insert into usage_ledger (user_id, session_id, kind, credits, note)
      values (${userId}, ${sessionId}, ${"cast"}, ${0}, ${wallet.lifetimeFree ? "永久免费" : planTitle(wallet.plan)})
    `;
    return wallet;
  }
  if (wallet.credits < 1) throw new NeedPayError(wallet);
  const sql = await getSql();
  const updated = await sql<{ credits: number }>`
    update profiles set credits = credits - 1, updated_at = now()
    where user_id = ${userId} and credits >= 1
    returning credits
  `;
  if (!updated[0]) throw new NeedPayError(wallet);
  await sql`
    insert into usage_ledger (user_id, session_id, kind, credits, note)
    values (${userId}, ${sessionId}, ${"cast"}, ${1}, ${"按次 1 元"})
  `;
  return { ...wallet, credits: updated[0].credits, label: labelOf("payg", false, null, updated[0].credits) };
}

export async function grantPlan(
  userId: string,
  patch: { creditsDelta?: number; plan?: PlanKind; lifetime?: boolean },
  note = "管理员",
) {
  const sql = await getSql();
  await sql`
    insert into profiles (user_id, nickname)
    values (${userId}, ${""})
    on conflict (user_id) do nothing
  `;
  if (typeof patch.creditsDelta === "number" && patch.creditsDelta !== 0) {
    await sql`
      update profiles set credits = greatest(0, credits + ${patch.creditsDelta}), updated_at = now()
      where user_id = ${userId}
    `;
  }
  if (patch.lifetime || patch.plan === "lifetime") {
    await sql`
      update profiles set lifetime_free = true, plan = ${"lifetime"}, plan_until = null, updated_at = now()
      where user_id = ${userId}
    `;
  } else if (patch.plan && SUB_PLANS.includes(patch.plan)) {
    if (patch.plan === "yearly") {
      await sql`
        update profiles set
          plan = ${"yearly"},
          plan_until = greatest(coalesce(plan_until, now()), now()) + interval '365 days',
          lifetime_free = false,
          updated_at = now()
        where user_id = ${userId}
      `;
    } else if (patch.plan === "quarterly") {
      await sql`
        update profiles set
          plan = ${"quarterly"},
          plan_until = greatest(coalesce(plan_until, now()), now()) + interval '90 days',
          lifetime_free = false,
          updated_at = now()
        where user_id = ${userId}
      `;
    } else {
      await sql`
        update profiles set
          plan = ${"monthly"},
          plan_until = greatest(coalesce(plan_until, now()), now()) + interval '30 days',
          lifetime_free = false,
          updated_at = now()
        where user_id = ${userId}
      `;
    }
  } else if (patch.plan === "payg") {
    await sql`
      update profiles set plan = ${"payg"}, lifetime_free = false, updated_at = now()
      where user_id = ${userId}
    `;
  }
  await sql`
    insert into usage_ledger (user_id, kind, credits, note)
    values (${userId}, ${"grant"}, ${patch.creditsDelta ?? 0}, ${note})
  `;
  return loadWallet(userId);
}

async function applyPaidSku(userId: string, sku: PaySku) {
  const item = skuOf(sku);
  if (!item) throw new Error("未知套餐");
  if (item.plan && SUB_PLANS.includes(item.plan)) {
    return grantPlan(userId, { plan: item.plan }, `${planTitle(item.plan)}到账`);
  }
  return grantPlan(userId, { creditsDelta: item.credits }, `充值 ${item.credits} 次`);
}

export const getWallet = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const wallet = await loadWallet(context.userId);
    const sql = await getSql();
    const payments = await sql<{
      id: string;
      channel: string;
      sku: string;
      amount_fen: number;
      credits: number;
      status: string;
      remark: string | null;
      created_at: string;
      paid_at: string | null;
    }>`
      select id, channel, sku, amount_fen, credits, status, remark, created_at, paid_at
      from payments where user_id = ${context.userId}
      order by created_at desc limit 20
    `;
    return { wallet, payments, skus: PAY_SKUS };
  });

export const createPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      sku: z.enum(["credits_1", "credits_10", "credits_30", "credits_88", "monthly", "quarterly", "yearly"]),
      channel: z.enum(["wechat", "alipay"]),
    }),
  )
  .handler(async ({ context, data }) => {
    const item = skuOf(data.sku);
    if (!item) throw new Error("未知套餐");
    const id = newId();
    const remark = `${data.channel === "alipay" ? "ZFB" : "WX"}${id.slice(-6).toUpperCase()}`;
    const sql = await getSql();
    await sql`
      insert into payments (id, user_id, channel, sku, amount_fen, credits, status, remark)
      values (
        ${id}, ${context.userId}, ${data.channel}, ${data.sku},
        ${item.amountYuan * 100}, ${item.credits}, ${"pending"}, ${remark}
      )
    `;
    return {
      id,
      sku: data.sku,
      channel: data.channel as PayChannel,
      title: item.title,
      amountYuan: item.amountYuan,
      credits: item.credits,
      hint: item.hint,
      remark,
      qrSrc: data.channel === "wechat" ? "/pay/wechat.png" : "/pay/alipay.png",
      status: "pending" as const,
    };
  });

export async function markPaidAndGrant(paymentId: string, expectedUserId?: string) {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    user_id: string;
    sku: string;
    status: string;
  }>`
    select id, user_id, sku, status from payments
    where id = ${paymentId}
    limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("找不到这笔订单");
  if (expectedUserId && row.user_id !== expectedUserId) throw new Error("找不到这笔订单");
  if (row.status === "paid") return { ok: true as const, wallet: await loadWallet(row.user_id) };
  await sql`
    update payments set status = ${"paid"}, paid_at = now()
    where id = ${row.id} and status = ${"pending"}
  `;
  const wallet = await applyPaidSku(row.user_id, row.sku as PaySku);
  return { ok: true as const, wallet };
}

export const confirmPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => markPaidAndGrant(data.id, context.userId));
