import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ConsultChat, type ChatSession } from "@/components/consult-chat";
import { Skeleton } from "@/components/ui/skeleton";
import { getSession, sendConsult } from "@/lib/fn/divination";

export const Route = createFileRoute("/_app/consult/$sessionId")({ component: ConsultPage });

function ConsultPage() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void getSession({ data: { id: sessionId } })
      .then(setSession)
      .catch((e) => setError(e instanceof Error ? e.message : "无法打开"));
  }, [sessionId]);

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

  if (!session && !error) {
    return (
      <AppShell title="问盘">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="mt-3 h-24 w-full" />
      </AppShell>
    );
  }
  if (!session) {
    return (
      <AppShell title="问盘">
        <p className="text-sm text-cinnabar">{error}</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="这一盘">
      <ConsultChat session={session} busy={busy} error={error} onSend={(t) => void send(t)} />
    </AppShell>
  );
}
