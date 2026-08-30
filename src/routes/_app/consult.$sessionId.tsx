import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ConsultChat, useConsultChat } from "@/components/consult-chat";
import { Skeleton } from "@/components/ui/skeleton";
import { getSession } from "@/lib/fn/divination";

export const Route = createFileRoute("/_app/consult/$sessionId")({ component: ConsultPage });

function ConsultPage() {
  const { sessionId } = Route.useParams();
  const { session, busy, error, send } = useConsultChat(sessionId, () =>
    getSession({ data: { id: sessionId } }),
  );

  if (!session && !error) {
    return (
      <AppShell title="问盘" fill>
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
    <AppShell title="这一盘" fill>
      <ConsultChat session={session} busy={busy} error={error} onSend={(t) => void send(t)} />
    </AppShell>
  );
}
