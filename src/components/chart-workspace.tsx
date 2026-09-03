import { useEffect, useMemo, useState } from "react";
import { Columns2, LayoutGrid, MessageSquare } from "lucide-react";
import { QimenBoard } from "@/components/qimen-board";
import { ConsultChat, type ChatSession } from "@/components/consult-chat";
import { LuckBadge } from "@/components/luck-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EVENT_CATALOG,
  EVENT_NAME,
  FORTUNE_SPAN_LABEL,
  MODE_SHORT,
  type EventId,
  type FortuneSpan,
  type ManualCastInput,
  type SessionMode,
} from "@/lib/app-types";
import { palaceAskText, readScan, type PalaceView } from "@/lib/scan-view";
import { beijingNowCivil } from "@/lib/fortune-time";
import { cn, formatBeijing } from "@/lib/utils";

type Pane = "split" | "chart" | "chat";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function civilToLocal(c: { year: number; month: number; day: number; hour: number; minute: number }) {
  return `${c.year}-${pad(c.month)}-${pad(c.day)}T${pad(c.hour)}:${pad(c.minute)}`;
}

function localToCivil(value: string) {
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return { year, month, day, hour, minute };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-2 p-4">
      <h2 className="font-display text-base text-ink">{title}</h2>
      {children}
    </Card>
  );
}

export function ChartWorkspace({
  session,
  busy,
  error,
  onSend,
  onCast,
}: {
  session: ChatSession;
  busy: boolean;
  error?: string;
  onSend: (text: string) => void;
  onCast: (input: ManualCastInput) => void;
}) {
  const view = useMemo(() => readScan(session.scan), [session.scan]);
  const [pane, setPane] = useState<Pane>("split");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const now = beijingNowCivil();
  const [mode, setMode] = useState<Exclude<SessionMode, "inbox">>("now");
  const [eventId, setEventId] = useState<EventId>("wealth");
  const [when, setWhen] = useState(civilToLocal(now));
  const [span, setSpan] = useState<FortuneSpan>("month");
  const [lots, setLots] = useState("");
  const [question, setQuestion] = useState("");

  useEffect(() => {
    if (session.mode && session.mode !== "inbox") setMode(session.mode);
    if (session.eventId) setEventId(session.eventId);
    if (session.civil?.year) setWhen(civilToLocal(session.civil));
    if (session.fortuneSpan === "day" || session.fortuneSpan === "month" || session.fortuneSpan === "year") {
      setSpan(session.fortuneSpan);
    }
    if (session.lotsCode) setLots(session.lotsCode);
  }, [session.id, session.juLabel, session.mode, session.eventId, session.fortuneSpan, session.lotsCode, session.civil]);

  const fortuneOrder: FortuneSpan[] =
    session.fortuneSpan === "year"
      ? ["year", "month", "day"]
      : session.fortuneSpan === "day"
        ? ["day", "month", "year"]
        : ["month", "year", "day"];
  const fortuneCards = fortuneOrder.map((k) => view.fortune[k]).filter((p): p is NonNullable<typeof p> => Boolean(p));

  function submitCast() {
    const next: ManualCastInput = { mode, eventId };
    if (mode === "timed" || mode === "fortune") next.civil = localToCivil(when);
    if (mode === "fortune") next.fortuneSpan = span;
    if (mode === "lots") next.lotsCode = lots.trim();
    if (question.trim()) next.question = question.trim();
    onCast(next);
  }

  function askPalace(p: PalaceView) {
    setSelectedId(p.id);
    onSend(palaceAskText(p, session.eventId ? EVENT_NAME[session.eventId] : undefined));
  }

  const metaBits = [
    session.mode && session.mode !== "inbox" ? MODE_SHORT[session.mode] : "",
    session.fortuneSpan && (session.fortuneSpan === "day" || session.fortuneSpan === "month" || session.fortuneSpan === "year")
      ? FORTUNE_SPAN_LABEL[session.fortuneSpan]
      : "",
    session.eventId ? EVENT_NAME[session.eventId] : "",
    session.civil?.year ? formatBeijing(session.civil) : "",
  ].filter(Boolean);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 gap-2 md:hidden">
        {(
          [
            ["split", "对照", Columns2],
            ["chart", "盘面", LayoutGrid],
            ["chat", "智断", MessageSquare],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPane(id)}
            className={cn(
              "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border text-sm",
              pane === id ? "border-cinnabar/40 bg-seal text-cinnabar" : "border-line bg-paper-2 text-muted",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 md:grid md:grid-cols-5">
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-y-auto md:col-span-3",
            pane === "chat" && "hidden md:block",
          )}
        >
          <div className="space-y-3 pb-4">
            {view.hasChart ? (
              <>
                <div>
                  <p className="text-xs tracking-widest text-faint">这一盘</p>
                  <p className="mt-1 font-display text-xl text-ink">{session.juLabel || view.juLabel || "奇门盘"}</p>
                  {metaBits.length ? <p className="mt-1 text-xs text-muted">{metaBits.join(" · ")}</p> : null}
                </div>
                <QimenBoard
                  palaces={view.palaces}
                  juLabel={session.juLabel || view.juLabel}
                  hourName={session.hourName || view.hourName}
                  selectedId={selectedId}
                  onSelect={askPalace}
                />
                {view.focus ? (
                  <Section title={view.focus.name}>
                    <div className="flex items-center gap-2">
                      <LuckBadge level={view.focus.level} />
                      {view.focus.direction ? (
                        <span className="text-xs text-muted">
                          用神在{view.focus.direction}
                          {view.focus.bagua}宫
                        </span>
                      ) : null}
                    </div>
                    {view.focus.reading ? <p className="text-sm leading-6 text-ink-soft">{view.focus.reading}</p> : null}
                    {view.focus.brief && view.focus.brief !== view.focus.reading ? (
                      <p className="text-sm text-muted">{view.focus.brief}</p>
                    ) : null}
                  </Section>
                ) : null}
                {view.directions.length ? (
                  <Section title="较顺的方位">
                    <ul className="space-y-1.5 text-sm text-ink-soft">
                      {view.directions.map((d) => (
                        <li key={`${d.direction}-${d.gate}`} className="flex items-center justify-between gap-2">
                          <span>
                            {d.direction}
                            {d.gate ? ` · ${d.gate}` : ""}
                          </span>
                          <LuckBadge level={d.level} />
                        </li>
                      ))}
                    </ul>
                  </Section>
                ) : null}
                {fortuneCards.map((p) => (
                  <Section key={p.kind} title={p.title}>
                    <LuckBadge level={p.level} />
                    {p.reading ? <p className="text-sm leading-6 text-ink-soft">{p.reading}</p> : null}
                  </Section>
                ))}
                {view.weather ? (
                  <Section title={view.weather.headline || "天象"}>
                    {view.weather.sky ? <p className="text-sm text-ink-soft">{view.weather.sky}</p> : null}
                    {view.weather.advice ? <p className="text-sm text-muted">{view.weather.advice}</p> : null}
                  </Section>
                ) : null}
                {view.people.length ? (
                  <Section title="盘上的人象">
                    <ul className="space-y-2">
                      {view.people.map((p) => (
                        <li key={`${p.role}-${p.bagua}`} className="text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-ink">{p.role}</span>
                            {p.sixKin ? <span className="text-xs text-faint">{p.sixKin}</span> : null}
                            <LuckBadge level={p.level} />
                          </div>
                          <p className="mt-0.5 text-ink-soft">{p.summary}</p>
                        </li>
                      ))}
                    </ul>
                  </Section>
                ) : null}
              </>
            ) : (
              <Card className="space-y-2 p-4">
                <p className="font-display text-lg text-ink">还没有起盘</p>
                <p className="text-sm leading-6 text-muted">
                  在右边跟问象说话，例如「下个月运势」「今晚八点看回款」。也可以用下面的表单自己起一盘，智断会写在对话框里。
                </p>
              </Card>
            )}

            <Card className="space-y-3 p-4">
              <p className="font-display text-base text-ink">手动起盘</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["now", "timed", "fortune", "lots"] as const).map((id) => (
                  <Button key={id} type="button" size="sm" variant={mode === id ? "default" : "outline"} onClick={() => setMode(id)}>
                    {id === "now" ? "此刻" : id === "timed" ? "指定时间" : id === "fortune" ? "运势" : "摇卦"}
                  </Button>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="event">问哪一类事</Label>
                <select
                  id="event"
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value as EventId)}
                  className="h-11 w-full rounded-[var(--radius-sm)] border border-line bg-paper-2 px-3 text-sm text-ink"
                >
                  {EVENT_CATALOG.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {e.hint}
                    </option>
                  ))}
                </select>
              </div>
              {mode === "timed" || mode === "fortune" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="when">北京时间</Label>
                  <Input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
                </div>
              ) : null}
              {mode === "fortune" ? (
                <div className="flex gap-2">
                  {(["day", "month", "year"] as const).map((id) => (
                    <Button key={id} type="button" size="sm" variant={span === id ? "default" : "outline"} onClick={() => setSpan(id)}>
                      {FORTUNE_SPAN_LABEL[id]}
                    </Button>
                  ))}
                </div>
              ) : null}
              {mode === "lots" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="lots">三位数</Label>
                  <Input id="lots" inputMode="numeric" maxLength={3} value={lots} onChange={(e) => setLots(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="例如 168" />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="q">想问一句（可选）</Label>
                <Input id="q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="不填则按盘面主动总结" />
              </div>
              <Button type="button" className="w-full" disabled={busy || (mode === "lots" && !/^\d{3}$/.test(lots))} onClick={submitCast}>
                起这一盘
              </Button>
            </Card>
          </div>
        </div>

        <div
          className={cn(
            "flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-line bg-paper-2 md:col-span-2",
            pane === "chart" && "hidden md:flex",
          )}
        >
          <div className="shrink-0 border-b border-line px-4 py-2">
            <p className="font-display text-ink">智断</p>
            <p className="text-xs text-muted">问象的答复都在这里</p>
          </div>
          <ConsultChat session={session} busy={busy} error={error} onSend={onSend} hideMeta />
        </div>
      </div>
    </div>
  );
}
