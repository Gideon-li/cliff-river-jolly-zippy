import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EVENT_NAME, type EventId } from "@/lib/app-types";
import { adminFulfillPayment, adminRecentPayments, adminRecentSessions, adminUpdateUser, getAdminOverview, listAdminUsers } from "@/lib/fn/admin";
import { bootstrapAuth } from "@/lib/fn/profile";

export const Route = createFileRoute("/admin")({ component: AdminPage });

function AdminPage() {
  const { user, isPending } = useCurrentUserState();
  const [phone, setPhone] = useState("18858839671");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void bootstrapAuth().catch(() => undefined);
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const email = phone.includes("@") ? phone : `${phone}@fortune.fun`;
      const r = await authClient.signIn.email({ email, password });
      if (r.error) throw new Error(r.error.message ?? "登录失败");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  if (isPending) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <Skeleton className="h-10 w-40" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
        <p className="text-[10px] tracking-[0.4em] text-faint">ADMIN</p>
        <h1 className="mt-2 font-display text-3xl">问象后台</h1>
        <form className="mt-8 space-y-3" onSubmit={(e) => void login(e)}>
          <div className="space-y-1.5">
            <Label>账号</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>密码</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button className="w-full" disabled={busy}>
            登录
          </Button>
          {error ? <p className="text-xs text-cinnabar">{error}</p> : null}
        </form>
        <Link to="/login" className="mt-6 text-center text-xs text-muted">
          返回问事
        </Link>
      </div>
    );
  }

  return <AdminDesk />;
}

function AdminDesk() {
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getAdminOverview>> | null>(null);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof listAdminUsers>> | null>(null);
  const [recent, setRecent] = useState<Awaited<ReturnType<typeof adminRecentSessions>> | null>(null);
  const [payments, setPayments] = useState<Awaited<ReturnType<typeof adminRecentPayments>> | null>(null);
  const [denied, setDenied] = useState("");

  async function reload() {
    try {
      const [o, u, r, p] = await Promise.all([
        getAdminOverview(),
        listAdminUsers(),
        adminRecentSessions(),
        adminRecentPayments(),
      ]);
      setOverview(o);
      setUsers(u);
      setRecent(r);
      setPayments(p);
    } catch (e) {
      setDenied(e instanceof Error ? e.message : "无法进入后台");
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  if (denied) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="font-display text-2xl">没有权限</p>
        <p className="mt-2 text-sm text-muted">{denied}</p>
        <Link to="/" className="mt-6 inline-block text-sm text-cinnabar">
          返回问事
        </Link>
      </div>
    );
  }
  if (!overview || !users) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div>
          <p className="text-[10px] tracking-[0.4em] text-faint">ADMIN</p>
          <h1 className="font-display text-2xl">问象后台</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/" className="text-sm text-muted">
            问事端
          </Link>
          <Button variant="outline" size="sm" onClick={() => void signOut("/admin")}>
            退出
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-6 pb-16">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="用户" value={overview.users} />
          <Stat label="起盘" value={overview.sessions} />
          <Stat label="今日起盘" value={overview.today} />
          <Stat label="充值到账" value={overview.revenueYuan} suffix="元" />
          <Stat label="付费笔数" value={overview.paidCount} />
          <Stat label="订阅用户" value={overview.monthly} />
          <Stat label="永久免费" value={overview.lifetime} />
          <Stat label="问答" value={overview.messages} />
        </div>

        <Card>
          <p className="font-display text-lg">近 14 日起盘</p>
          <div className="mt-4 flex h-28 items-end gap-1">
            {overview.daily.map((d) => {
              const max = Math.max(...overview.daily.map((x) => x.count), 1);
              return (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-sm bg-cinnabar/80"
                    style={{ height: `${Math.max(8, (d.count / max) * 100)}%` }}
                    title={`${d.day} ${d.count}`}
                  />
                  <span className="text-[9px] text-faint">{d.day.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <p className="font-display">起盘方式</p>
            <ul className="mt-3 space-y-1 text-sm">
              {overview.byMode.map((m) => (
                <li key={m.mode} className="flex justify-between">
                  <span>{m.mode}</span>
                  <span className="tabular-nums text-muted">{m.count}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <p className="font-display">事项分布</p>
            <ul className="mt-3 space-y-1 text-sm">
              {overview.byEvent.map((m) => (
                <li key={m.event_id} className="flex justify-between">
                  <span>{EVENT_NAME[m.event_id as EventId] ?? m.event_id}</span>
                  <span className="tabular-nums text-muted">{m.count}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card className="overflow-x-auto p-0">
          <p className="px-4 pt-4 font-display text-lg">用户</p>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-4 py-2">昵称</th>
                <th className="px-4 py-2">账号</th>
                <th className="px-4 py-2">性别 / 年</th>
                <th className="px-4 py-2">权益</th>
                <th className="px-4 py-2">起盘</th>
                <th className="px-4 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="px-4 py-2">{u.nickname || u.name}</td>
                  <td className="px-4 py-2 text-muted">{u.email}</td>
                  <td className="px-4 py-2 text-muted">
                    {u.gender === "female" ? "女" : u.gender === "male" ? "男" : "—"} {u.birth_year ?? ""}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {u.lifetime_free || u.plan === "lifetime"
                      ? "永久免费"
                      : u.plan === "yearly"
                        ? `年租${u.plan_until ? `至 ${new Date(u.plan_until).toISOString().slice(0, 10)}` : ""}`
                        : u.plan === "quarterly"
                          ? `季租${u.plan_until ? `至 ${new Date(u.plan_until).toISOString().slice(0, 10)}` : ""}`
                          : u.plan === "monthly"
                            ? `月租${u.plan_until ? `至 ${new Date(u.plan_until).toISOString().slice(0, 10)}` : ""}`
                            : `按次 ${u.credits ?? 0}`}
                  </td>
                  <td className="px-4 py-2 tabular-nums">{u.sessions}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="text-xs text-cinnabar"
                        onClick={() =>
                          void adminUpdateUser({ data: { userId: u.id, creditsDelta: 10 } }).then(() => reload())
                        }
                      >
                        +10次
                      </button>
                      <button
                        type="button"
                        className="text-xs text-cinnabar"
                        onClick={() =>
                          void adminUpdateUser({ data: { userId: u.id, plan: "monthly" } }).then(() => reload())
                        }
                      >
                        月租
                      </button>
                      <button
                        type="button"
                        className="text-xs text-cinnabar"
                        onClick={() =>
                          void adminUpdateUser({ data: { userId: u.id, plan: "quarterly" } }).then(() => reload())
                        }
                      >
                        季租
                      </button>
                      <button
                        type="button"
                        className="text-xs text-cinnabar"
                        onClick={() =>
                          void adminUpdateUser({ data: { userId: u.id, plan: "yearly" } }).then(() => reload())
                        }
                      >
                        年租
                      </button>
                      <button
                        type="button"
                        className="text-xs text-cinnabar"
                        onClick={() =>
                          void adminUpdateUser({ data: { userId: u.id, lifetime: true } }).then(() => reload())
                        }
                      >
                        永久免费
                      </button>
                      <button
                        type="button"
                        className="text-xs text-muted"
                        onClick={() =>
                          void adminUpdateUser({ data: { userId: u.id, disabled: !u.disabled } }).then(() => reload())
                        }
                      >
                        {u.disabled ? "恢复" : "停用"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <p className="font-display text-lg">充值订单</p>
          <ul className="mt-3 space-y-2 text-sm">
            {(payments ?? []).length === 0 ? <li className="text-muted">暂无订单</li> : null}
            {(payments ?? []).map((p) => (
              <li key={p.id} className="flex justify-between gap-3 border-b border-line pb-2">
                <span>
                  {p.nickname || p.email} · {p.channel === "wechat" ? "微信" : p.channel === "alipay" ? "支付宝" : "管理员"} ·{" "}
                  {(p.amount_fen / 100).toFixed(0)} 元
                  {p.remark ? ` · ${p.remark}` : ""} · {p.status === "paid" ? "已到账" : "待支付"}
                </span>
                {p.status === "pending" ? (
                  <button
                    type="button"
                    className="shrink-0 text-xs text-cinnabar"
                    onClick={() => void adminFulfillPayment({ data: { id: p.id } }).then(() => reload())}
                  >
                    确认到账
                  </button>
                ) : (
                  <span className="shrink-0 text-xs text-faint">{dayTime(p.created_at)}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <p className="font-display text-lg">最近起盘</p>
          <ul className="mt-3 space-y-2 text-sm">
            {(recent ?? []).map((s) => (
              <li key={s.id} className="flex justify-between gap-3 border-b border-line pb-2">
                <span>
                  {s.nickname || s.email} · {s.mode} · {s.ju_label}
                </span>
                <span className="shrink-0 text-xs text-faint">{dayTime(s.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </main>
    </div>
  );
}

function dayTime(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 16);
  return d.toISOString().slice(0, 16).replace("T", " ");
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <Card>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums">
        {value}
        {suffix ? <span className="ml-1 text-base text-muted">{suffix}</span> : null}
      </p>
    </Card>
  );
}
