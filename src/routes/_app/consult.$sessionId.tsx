import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { LuckBadge } from "@/components/luck-badge";
import { QimenBoard } from "@/components/qimen-board";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EVENT_NAME, type EventId } from "@/lib/app-types";
import { getSession, sendConsult } from "@/lib/fn/divination";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/consult/$sessionId")({ component: ConsultPage });

type Session = Awaited<ReturnType<typeof getSession>>;

function ConsultPage() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"chat" | "board" | "events">("chat");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void getSession({ data: { id: sessionId } })
      .then(setSession)
      .catch((e) => setError(e instanceof Error ? e.message : "无法打开"));
  }, [sessionId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages.length, tab]);

  async function send() {
    const q = text.trim();
    if (!q || !session) return;
    setText("");
    setBusy(true);
    setSession({
      ...session,
      messages: [
        ...session.messages,
        { id: Date.now(), role: "user", content: q, kind: "user", createdAt: new Date().toISOString() },
      ],
    });
    try {
      const r = await sendConsult({ data: { sessionId, text: q } });
      if (r.type === "new_session" && r.session) {
        await navigate({ to: "/consult/$sessionId", params: { sessionId: r.session.id } });
        return;
      }
      setSession((cur) =>
        cur
          ? {
              ...cur,
              eventId: ("eventId" in r && r.eventId ? r.eventId : cur.eventId) as EventId | null,
              messages: r.message ? [...cur.messages, { ...r.message, createdAt: new Date().toISOString() }] : cur.messages,
            }
          : cur,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  if (!session && !error) {
    return (
      <AppShell title="问盘" hideTabs>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="mt-3 h-24 w-full" />
      </AppShell>
    );
  }
  if (!session) {
    return (
      <AppShell title="问盘" hideTabs>
        <p className="text-sm text-cinnabar">{error}</p>
      </AppShell>
    );
  }

  const scan = session.scan as {
    chart?: { palaces?: Record<string, never>; ju?: { label?: string }; hourName?: string };
    events?: { eventId: string; name: string; level: string; probability: number; reading: string }[];
    fortune?: Record<string, { title?: string; level?: string; reading?: string; probability?: number } | null>;
    focus?: { name?: string; level?: string; reading?: string };
  };

  return (
    <AppShell title="这一盘" hideTabs>
      <div className="mb-3 flex gap-2 text-xs">
        {(["chat", "board", "events"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "h-8 rounded-full px-3",
              tab === t ? "bg-cinnabar text-paper" : "bg-seal text-muted",
            )}
          >
            {t === "chat" ? "问答" : t === "board" ? "盘面" : "事项"}
          </button>
        ))}
      </div>

      {tab === "board" ? (
        <QimenBoard
          palaces={scan.chart?.palaces as never}
          juLabel={session.juLabel ?? scan.chart?.ju?.label}
          hourName={session.hourName ?? scan.chart?.hourName}
        />
      ) : null}

      {tab === "events" ? (
        <div className="space-y-2">
          {scan.fortune
            ? (["day", "month", "year"] as const).map((k) => {
                const f = scan.fortune?.[k];
                if (!f) return null;
                return (
                  <Card key={k}>
                    <div className="flex items-center justify-between">
                      <p className="font-display">{f.title}</p>
                      <LuckBadge level={f.level} />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-ink-soft">{f.reading}</p>
                  </Card>
                );
              })
            : null}
          {(scan.events ?? []).map((e) => (
            <Card key={e.eventId}>
              <div className="flex items-center justify-between">
                <p className="font-medium">{e.name}</p>
                <LuckBadge level={e.level} />
              </div>
              <p className="mt-1 text-[11px] text-faint tabular-nums">倾向 {e.probability}%</p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">{e.reading}</p>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "chat" ? (
        <div className="space-y-3">
          <p className="text-[11px] text-faint">
            {session.juLabel} · {session.eventId ? EVENT_NAME[session.eventId] : "总盘"}
            {session.lotsCode ? ` · 摇卦 ${session.lotsCode}` : ""}
          </p>
          {session.messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[92%] rounded-[var(--radius-lg)] px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap",
                m.role === "user"
                  ? "ml-auto bg-cinnabar text-paper"
                  : m.kind === "system" || m.kind === "confirm"
                    ? "border border-line bg-seal text-ink-soft"
                    : "border border-line bg-paper-2 text-ink",
              )}
            >
              {m.content}
            </div>
          ))}
          {busy ? <p className="text-xs text-faint">正在看盘…</p> : null}
          <div ref={bottom} />
        </div>
      ) : null}

      <form
        className="sticky bottom-4 mt-4 flex gap-2 rounded-[var(--radius-xl)] border border-line bg-paper-2 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="继续追问，或提出一件具体的事"
          className="border-0 bg-transparent focus:ring-0"
        />
        <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="发送">
          <ArrowUp className="size-4" />
        </Button>
      </form>
      {error ? <p className="mt-2 text-xs text-cinnabar">{error}</p> : null}
    </AppShell>
  );
}
