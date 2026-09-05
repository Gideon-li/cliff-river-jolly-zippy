import { ArrowUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OriginalToggle } from "@/components/original-toggle";
import { cn, formatBeijing } from "@/lib/utils";
import { splitOrigin } from "@/lib/origin";
import { castManual, sendConsult, sendInsight } from "@/lib/fn/divination";
import {
  EVENT_NAME,
  FORTUNE_SPAN_LABEL,
  MODE_SHORT,
  type CivilTime,
  type EventId,
  type FortuneSpan,
  type GeoLocation,
  type ManualCastInput,
  type SessionMode,
} from "@/lib/app-types";

export type ChatMessage = {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  kind: string;
  createdAt: string;
};

export type ChatSession = {
  id: string;
  mode: SessionMode;
  fortuneSpan: FortuneSpan | string | null;
  lotsCode: string | null;
  eventId: EventId | null;
  civil: CivilTime;
  hourName: string | null;
  juLabel: string | null;
  location: GeoLocation | Record<string, never>;
  scan: unknown;
  pending: unknown;
  createdAt?: string;
  messages: ChatMessage[];
};

const threadHold = new Map<string, ChatSession>();

function fresher(current: ChatSession | null, incoming: ChatSession): ChatSession {
  if (!current) return incoming;
  if (current.id === incoming.id) {
    return incoming.messages.length < current.messages.length ? current : incoming;
  }
  if (current.messages.length > incoming.messages.length) return current;
  return incoming;
}

function describeManualCast(input: ManualCastInput) {
  const bits = [MODE_SHORT[input.mode]];
  if (input.fortuneSpan) bits.push(FORTUNE_SPAN_LABEL[input.fortuneSpan]);
  if (input.lotsCode) bits.push(`摇卦 ${input.lotsCode}`);
  if (input.civil?.year) bits.push(formatBeijing(input.civil));
  bits.push(`事项「${EVENT_NAME[input.eventId]}」`);
  const head = `我在网页上起了一盘：${bits.join(" · ")}`;
  return input.question?.trim() ? `${head}。我想问：${input.question.trim()}` : `${head}。请根据盘面主动总结。`;
}

function optimisticUser(current: ChatSession, text: string): ChatSession {
  return {
    ...current,
    messages: [
      ...current.messages,
      {
        id: Date.now(),
        role: "user",
        content: text,
        kind: "user",
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

export function useConsultChat(key: string, loader: () => Promise<ChatSession>) {
  const [session, setSession] = useState<ChatSession | null>(() => threadHold.get(key) ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sessionRef = useRef<ChatSession | null>(session);
  const loadRef = useRef(loader);
  sessionRef.current = session;
  loadRef.current = loader;

  const adopt = useCallback(
    (incoming: ChatSession, hold = key) => {
      setSession((cur) => {
        const next = fresher(cur, incoming);
        threadHold.set(hold, next);
        threadHold.set(next.id, next);
        sessionRef.current = next;
        return next;
      });
    },
    [key],
  );

  useEffect(() => {
    let cancelled = false;
    void loadRef
      .current()
      .then((thread) => {
        if (!cancelled) adopt(thread);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "无法开始问事");
      });
    return () => {
      cancelled = true;
    };
  }, [key, adopt]);

  async function send(text: string) {
    const current = sessionRef.current;
    if (!current || busy) return;
    setError("");
    setBusy(true);
    const optimistic = optimisticUser(current, text);
    sessionRef.current = optimistic;
    threadHold.set(key, optimistic);
    threadHold.set(current.id, optimistic);
    setSession(optimistic);
    try {
      const r = await sendConsult({ data: { sessionId: current.id, text } });
      if (r.session) adopt(r.session as ChatSession);
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  async function recast(input: ManualCastInput) {
    const current = sessionRef.current;
    if (!current || busy) return;
    setError("");
    setBusy(true);
    const optimistic = optimisticUser(current, describeManualCast(input));
    sessionRef.current = optimistic;
    threadHold.set(key, optimistic);
    threadHold.set(current.id, optimistic);
    setSession(optimistic);
    try {
      const r = await castManual({
        data: {
          sessionId: current.id,
          mode: input.mode,
          eventId: input.eventId,
          civil: input.civil,
          lotsCode: input.lotsCode,
          fortuneSpan: input.fortuneSpan,
          question: input.question,
        },
      });
      if (r.session) adopt(r.session as ChatSession);
    } catch (e) {
      setError(e instanceof Error ? e.message : "起盘失败");
    } finally {
      setBusy(false);
    }
  }

  async function insight(note?: string) {
    const current = sessionRef.current;
    if (!current || busy) return;
    setError("");
    setBusy(true);
    const line = note?.trim() ? `事件智断：${note.trim()}` : "请就这件事做事件智断";
    const optimistic = optimisticUser(current, line);
    sessionRef.current = optimistic;
    threadHold.set(key, optimistic);
    threadHold.set(current.id, optimistic);
    setSession(optimistic);
    try {
      const r = await sendInsight({ data: { sessionId: current.id, note: note?.trim() || undefined } });
      if (r.session) adopt(r.session as ChatSession);
    } catch (e) {
      setError(e instanceof Error ? e.message : "智断失败");
    } finally {
      setBusy(false);
    }
  }

  return { session, busy, error, send, recast, insight };
}

export function ConsultChat({
  session,
  busy,
  error,
  onSend,
  hideMeta,
}: {
  session: ChatSession;
  busy: boolean;
  error?: string;
  onSend: (text: string) => void;
  hideMeta?: boolean;
}) {
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = session.messages[session.messages.length - 1]?.id;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [session.messages.length, lastId, busy]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {!hideMeta && session.juLabel ? (
        <p className="mb-2 shrink-0 text-xs text-faint">
          {session.juLabel}
          {session.hourName ? ` · ${session.hourName.replace(/时$/, "")}时` : ""}
        </p>
      ) : null}

      <div ref={scroller} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3">
        <div className="space-y-3 py-3">
          {session.messages.map((m, i) => (
            <div
              key={`${m.id}-${m.kind}-${i}`}
              className={cn(
                "max-w-[92%] rounded-[var(--radius-lg)] px-3.5 py-2.5 text-sm leading-6 break-words whitespace-pre-wrap",
                m.role === "user"
                  ? "ml-auto bg-cinnabar text-paper"
                  : "border border-line bg-paper-2 text-ink",
              )}
            >
              {(() => {
                const { plain, original } = splitOrigin(m.content);
                return (
                  <>
                    {plain}
                    {m.role !== "user" ? <OriginalToggle original={original} /> : null}
                  </>
                );
              })()}
              {m.kind === "paywall" ? (
                <Link to="/wallet" className="mt-2 block text-cinnabar underline-offset-4 hover:underline">
                  去充值
                </Link>
              ) : null}
            </div>
          ))}
          {busy ? <p className="text-xs text-faint">我在想，稍等一会儿…</p> : null}
        </div>
      </div>

      <form
        className="shrink-0 border-t border-line bg-paper px-3 pt-2 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          const q = text.trim();
          if (!q || busy) return;
          setText("");
          onSend(q);
        }}
      >
        <div className="flex gap-2 rounded-[var(--radius-xl)] border border-line bg-paper-2 p-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="想问什么，直接说就好"
            className="border-0 bg-transparent focus:ring-0"
          />
          <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="发送">
            <ArrowUp className="size-4" />
          </Button>
        </div>
        <p className="pt-1 text-center text-[10px] tracking-[0.18em] text-faint">玄学预测，仅供娱乐</p>
      </form>
      {error ? <p className="mt-1 shrink-0 px-3 text-xs text-cinnabar">{error}</p> : null}
    </div>
  );
}
