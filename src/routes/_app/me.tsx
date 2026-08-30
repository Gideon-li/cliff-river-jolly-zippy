import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { signOut } from "@/lib/auth/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMyProfile, updateMyProfile } from "@/lib/fn/profile";
import { getWallet } from "@/lib/fn/billing";

export const Route = createFileRoute("/_app/me")({ component: MePage });

function MePage() {
  const user = useCurrentUser();
  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState<"" | "male" | "female">("");
  const [birthYear, setBirthYear] = useState("");
  const [place, setPlace] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [planLabel, setPlanLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void Promise.all([getMyProfile(), getWallet().catch(() => null)]).then(([p, w]) => {
      setNickname(p.nickname);
      setGender(p.gender ?? "");
      setBirthYear(p.birthYear ? String(p.birthYear) : "");
      setPlace([p.province, p.city, p.district].filter(Boolean).join(" "));
      setIsAdmin(p.isAdmin);
      setPlanLabel(w?.wallet.label ?? (p.lifetimeFree ? "永久免费" : `按次 ${p.credits} 次`));
    });
  }, []);

  async function save() {
    setBusy(true);
    try {
      await updateMyProfile({
        data: {
          nickname: nickname.trim() || undefined,
          gender: gender || null,
          birthYear: birthYear ? Number(birthYear) : null,
        },
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="我的">
      <Card className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg">{nickname || user?.displayName || "问事人"}</p>
          <p className="text-xs text-muted">{user?.primaryEmail}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void signOut("/login")}>
          退出
        </Button>
      </Card>

      <Card className="mt-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted">问事权益</p>
          <p className="mt-1 font-display text-lg">{planLabel || "按次计费"}</p>
          <p className="mt-1 text-xs text-faint">一次预测 1 元，月租 30 元</p>
        </div>
        <Link to="/wallet">
          <Button size="sm">去充值</Button>
        </Link>
      </Card>

      <Card className="mt-4 space-y-3">
        <p className="font-display">资料</p>
        <div className="space-y-1.5">
          <Label>昵称</Label>
          <Input value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>性别</Label>
            <Input
              placeholder="男 或 女，可不填"
              value={gender === "male" ? "男" : gender === "female" ? "女" : gender}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v.startsWith("女")) setGender("female");
                else if (v.startsWith("男")) setGender("male");
                else setGender("");
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>出生年</Label>
            <Input
              inputMode="numeric"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </div>
        </div>
        {place ? <p className="text-xs text-muted">最近位置 {place}</p> : null}
        <Button className="w-full" disabled={busy} onClick={() => void save()}>
          {saved ? "已保存" : "保存"}
        </Button>
      </Card>

      {isAdmin ? (
        <Link to="/admin" className="mt-4 block text-center text-sm text-cinnabar">
          进入管理后台
        </Link>
      ) : null}
    </AppShell>
  );
}
