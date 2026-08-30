import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ConsultChat, type ChatSession } from "@/components/consult-chat";
import { Skeleton } from "@/components/ui/skeleton";
import { ensureThread, sendConsult } from "@/lib/fn/divination";
import { resolvePlace, updateMyProfile } from "@/lib/fn/profile";

export const Route = createFileRoute("/_app/")({ component: Home });

function Home() {
  const navigate = useNavigate();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void ensureThread({ data: {} })
      .then((thread) => {
        if (!cancelled) setSession(thread);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "无法开始问事");
      });

    if (!navigator.geolocation) return () => {
      cancelled = true;
    };
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void resolvePlace({ data: { lat: pos.coords.latitude, lng: pos.coords.longitude } })
          .then(async (loc) => {
            if (loc.source !== "gps") return;
            await updateMyProfile({
              data: { province: loc.province, city: loc.city, district: loc.district },
            }).catch(() => undefined);
            await ensureThread({ data: { location: loc } }).catch(() => undefined);
          })
          .catch(() => undefined);
      },
      () => undefined,
      { timeout: 4000, maximumAge: 600000 },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function send(text: string) {
    if (!session) return;
    setError("");
    setBusy(true);
    setSession({
      ...session,
      messages: [
        ...session.messages,
        { id: Date.now(), role: "user", content: text, kind: "user", createdAt: new Date().toISOString() },
      ],
    });
    try {
      const r = await sendConsult({ data: { sessionId: session.id, text } });
      if (r.type === "new_session" && r.session) {
        setSession(r.session);
        await navigate({ to: "/consult/$sessionId", params: { sessionId: r.session.id } });
        return;
      }
      if (r.session) setSession(r.session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="问象">
      {!session && !error ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">你好呀，我是问象。正在准备…</p>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}
      {session ? (
        <ConsultChat session={session} busy={busy} error={error} onSend={(t) => void send(t)} />
      ) : error ? (
        <p className="text-sm text-cinnabar">{error}</p>
      ) : null}
    </AppShell>
  );
}
