import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Clock3, CalendarRange, Dices, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EVENT_CATALOG, type EventId, type GeoLocation, type SessionMode } from "@/lib/app-types";
import { getMyProfile, resolvePlace, updateMyProfile } from "@/lib/fn/profile";
import { openSession } from "@/lib/fn/divination";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/")({ component: Home });

function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<SessionMode | null>(null);
  const [eventId, setEventId] = useState<EventId>("wealth");
  const [question, setQuestion] = useState("");
  const [lotsCode, setLotsCode] = useState("");
  const [when, setWhen] = useState("");
  const [fortuneSpan, setFortuneSpan] = useState<"day" | "month" | "year">("day");
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [needProfile, setNeedProfile] = useState(false);
  const [gender, setGender] = useState<"" | "male" | "female">("");
  const [birthYear, setBirthYear] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void getMyProfile()
      .then((p) => {
        setNickname(p.nickname);
        setGender(p.gender ?? "");
        setBirthYear(p.birthYear ? String(p.birthYear) : "");
        setNeedProfile(!p.gender || !p.birthYear);
      })
      .catch(() => undefined);

    if (!navigator.geolocation) {
      void resolvePlace({ data: {} }).then(setLocation).catch(() => undefined);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void resolvePlace({ data: { lat: pos.coords.latitude, lng: pos.coords.longitude } })
          .then(setLocation)
          .catch(() => undefined);
      },
      () => {
        void resolvePlace({ data: {} }).then(setLocation).catch(() => undefined);
      },
      { timeout: 4000, maximumAge: 600000 },
    );
  }, []);

  async function saveProfile() {
    setBusy(true);
    try {
      await updateMyProfile({
        data: {
          nickname: nickname || undefined,
          gender: gender || null,
          birthYear: birthYear ? Number(birthYear) : null,
          province: location?.province,
          city: location?.city,
          district: location?.district,
        },
      });
      setNeedProfile(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!mode) return;
    setBusy(true);
    setError("");
    try {
      let civil = undefined as
        | { year: number; month: number; day: number; hour: number; minute: number }
        | undefined;
      if (mode === "timed") {
        if (!when) throw new Error("请选择时间");
        const d = new Date(when);
        if (Number.isNaN(d.getTime())) throw new Error("时间无效");
        civil = {
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          day: d.getDate(),
          hour: d.getHours(),
          minute: d.getMinutes(),
        };
      }
      if (mode === "lots" && !/^\d{3}$/.test(lotsCode)) throw new Error("请输入三位数，例如 123");
      const opened = await openSession({
        data: {
          mode,
          eventId,
          question: question.trim() || undefined,
          civil,
          lotsCode: mode === "lots" ? lotsCode : undefined,
          fortuneSpan: mode === "fortune" ? fortuneSpan : undefined,
          location: location ?? undefined,
        },
      });
      await navigate({ to: "/consult/$sessionId", params: { sessionId: opened.session.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "起盘失败");
    } finally {
      setBusy(false);
    }
  }

  const locLabel = location
    ? `${location.province}${location.city}${location.district}${location.source === "fallback" ? "（中国通用）" : ""}`
    : "正在取位…";

  return (
    <AppShell title="起盘">
      {needProfile ? (
        <Card className="mb-4 space-y-3">
          <p className="font-display text-base">完善问事人信息</p>
          <p className="text-xs text-muted">昵称可用微信名。性别、出生年用于年命，可不填，缺省留空。</p>
          <div className="space-y-1.5">
            <Label>昵称</Label>
            <Input value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>性别</Label>
              <div className="flex gap-2">
                {(["male", "female"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={cn(
                      "h-11 flex-1 rounded-[var(--radius-sm)] border text-sm",
                      gender === g ? "border-cinnabar bg-seal text-cinnabar" : "border-line text-muted",
                    )}
                  >
                    {g === "male" ? "男" : "女"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>出生年</Label>
              <Input
                inputMode="numeric"
                placeholder="1992"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </div>
          </div>
          <Button className="w-full" onClick={() => void saveProfile()} disabled={busy}>
            保存并继续
          </Button>
        </Card>
      ) : null}

      <p className="mb-3 text-xs text-muted">位置 {locLabel}</p>

      <div className="grid grid-cols-2 gap-3">
        <ModeCard
          active={mode === "now"}
          icon={Clock3}
          title="此刻起盘"
          desc="按当前时辰开盘"
          onClick={() => setMode("now")}
        />
        <ModeCard
          active={mode === "timed"}
          icon={CalendarRange}
          title="择时起盘"
          desc="指定时间与事情"
          onClick={() => setMode("timed")}
        />
        <ModeCard
          active={mode === "fortune"}
          icon={Sparkles}
          title="年月日运"
          desc="看一段运势"
          onClick={() => setMode("fortune")}
        />
        <ModeCard
          active={mode === "lots"}
          icon={Dices}
          title="摇卦定局"
          desc="三位数求局"
          onClick={() => setMode("lots")}
        />
      </div>

      {mode ? (
        <Card className="mt-4 space-y-3">
          {mode === "timed" ? (
            <div className="space-y-1.5">
              <Label>问事时间</Label>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
          ) : null}
          {mode === "lots" ? (
            <div className="space-y-1.5">
              <Label>三位数</Label>
              <Input
                inputMode="numeric"
                maxLength={3}
                placeholder="例如 123"
                value={lotsCode}
                onChange={(e) => setLotsCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
              />
              <p className="text-[11px] text-faint">月份默认当前月，用以定阴阳遁。</p>
            </div>
          ) : null}
          {mode === "fortune" ? (
            <div className="flex gap-2">
              {(["day", "month", "year"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFortuneSpan(s)}
                  className={cn(
                    "h-10 flex-1 rounded-full border text-xs",
                    fortuneSpan === s ? "border-cinnabar bg-seal text-cinnabar" : "border-line text-muted",
                  )}
                >
                  {s === "day" ? "日运" : s === "month" ? "月运" : "年运"}
                </button>
              ))}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>想问的事（可空，默认智断联想）</Label>
            <Textarea
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="例如：本周回款会不会到"
            />
          </div>
          <Button className="w-full" disabled={busy} onClick={() => void start()}>
            {busy ? "起盘中…" : "开启奇门盘"}
          </Button>
          {error ? <p className="text-xs text-cinnabar">{error}</p> : null}
          <div className="space-y-1.5">
            <Label>事项</Label>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_CATALOG.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEventId(e.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px]",
                    eventId === e.id ? "border-cinnabar bg-seal text-cinnabar" : "border-line text-muted",
                  )}
                >
                  {e.name}
                </button>
              ))}
            </div>
          </div>
          <div className="h-8" />
        </Card>
      ) : (
        <p className="mt-6 text-center text-xs text-faint">选择一种起盘方式</p>
      )}
    </AppShell>
  );
}

function ModeCard({
  active,
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  icon: typeof Clock3;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[var(--radius-xl)] border p-4 text-left transition-[border-color,background-color] duration-150",
        active ? "border-cinnabar bg-seal" : "border-line bg-paper-2",
      )}
    >
      <Icon className={cn("size-5", active ? "text-cinnabar" : "text-muted")} />
      <p className="mt-3 font-display text-base text-ink">{title}</p>
      <p className="mt-1 text-[11px] text-muted">{desc}</p>
    </button>
  );
}
