import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { bootstrapAuth } from "@/lib/fn/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntertainmentNotice } from "@/components/app-shell";

export const Route = createFileRoute("/login")({ component: Login });

function toEmail(account: string) {
  const v = account.trim();
  if (!v) return "";
  if (v.includes("@")) return v;
  if (/^1\d{10}$/.test(v)) return `${v}@fortune.fun`;
  return `${v}@fortune.fun`;
}

function Login() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"wechat" | "account">("wechat");
  const [nickname, setNickname] = useState("");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void bootstrapAuth().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isPending && user) navigate({ to: "/" });
  }, [isPending, user, navigate]);

  async function wechatEnter() {
    setBusy(true);
    setError("");
    try {
      let openid = window.localStorage.getItem("wx-openid");
      if (!openid) {
        openid = crypto.randomUUID();
        window.localStorage.setItem("wx-openid", openid);
      }
      const email = `wx.${openid.slice(0, 12)}@fortune.fun`;
      const pwd = `Wx.${openid}.fun9`;
      const name = nickname.trim() || "问事人";
      const signed = await authClient.signIn.email({ email, password: pwd });
      if (signed.error) {
        const created = await authClient.signUp.email({ email, password: pwd, name });
        if (created.error) throw new Error(created.error.message ?? "授权失败");
      }
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "授权失败");
    } finally {
      setBusy(false);
    }
  }

  async function accountEnter(kind: "in" | "up") {
    setBusy(true);
    setError("");
    try {
      const email = toEmail(account);
      if (!email || password.length < 6) throw new Error("请填写账号，密码至少 6 位");
      if (kind === "up") {
        const created = await authClient.signUp.email({
          email,
          password,
          name: nickname.trim() || account.trim() || "问事人",
        });
        if (created.error) throw new Error(created.error.message ?? "注册失败");
      } else {
        const signed = await authClient.signIn.email({ email, password });
        if (signed.error) throw new Error(signed.error.message ?? "登录失败");
      }
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-paper px-6 py-10">
      <div className="rise-in mt-8">
        <p className="text-[10px] tracking-[0.48em] text-faint">WECHAT MINI PROGRAM</p>
        <h1 className="mt-3 font-display text-4xl text-ink">问象</h1>
        <EntertainmentNotice className="mt-3" />
        <p className="mt-2 text-sm text-muted">想问什么，直接说。授权后即可问事。</p>
      </div>

      <div className="rise-in mt-10 rounded-[var(--radius-xl)] border border-line bg-paper-2 p-5">
        {mode === "wechat" ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">申请使用你的昵称创建问事账号。网页体验对应微信授权登录。</p>
            <div className="space-y-1.5">
              <Label htmlFor="nick">微信昵称</Label>
              <Input
                id="nick"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="不填则用「问事人」"
              />
            </div>
            <Button className="w-full" variant="wechat" disabled={busy || !authEnabled} onClick={() => void wechatEnter()}>
              {busy ? "授权中…" : "微信授权登录"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs text-muted"
              onClick={() => setMode("account")}
            >
              使用手机号 / 邮箱
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nick2">昵称</Label>
              <Input id="nick2" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="显示名称" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc">手机号或邮箱</Label>
              <Input id="acc" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="11 位手机号或邮箱" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwd">密码</Label>
              <Input id="pwd" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button className="w-full" disabled={busy} onClick={() => void accountEnter("in")}>
              登录
            </Button>
            <Button className="w-full" variant="outline" disabled={busy} onClick={() => void accountEnter("up")}>
              创建账号
            </Button>
            <button type="button" className="w-full text-center text-xs text-muted" onClick={() => setMode("wechat")}>
              返回微信授权
            </button>
          </div>
        )}

        {authEnabled ? (
          <div className="mt-5 space-y-2 border-t border-line pt-4">
            <p className="text-center text-[11px] text-faint">其他方式</p>
            {GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
              >
                使用 {p.label} 继续
              </Button>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-center text-xs text-muted">登录未开启</p>
        )}
        {error ? <p className="mt-3 text-center text-xs text-cinnabar">{error}</p> : null}
      </div>

      <p className="mt-auto pt-8 text-center text-[11px] text-faint">
        <Link to="/admin" className="underline-offset-4 hover:underline">
          管理后台
        </Link>
      </p>
    </div>
  );
}
