import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { ChartWorkspace } from "@/components/chart-workspace";
import { useConsultChat } from "@/components/consult-chat";
import { Skeleton } from "@/components/ui/skeleton";
import { ensureThread } from "@/lib/fn/divination";
import { resolvePlace, updateMyProfile } from "@/lib/fn/profile";

export const Route = createFileRoute("/_app/")({ component: Home });

function Home() {
  const { session, busy, error, send, recast, insight } = useConsultChat("inbox", () => ensureThread({ data: {} }));

  useEffect(() => {
    if (!navigator.geolocation) return;
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
  }, []);

  return (
    <AppShell title="问象" fill>
      {!session && !error ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">你好呀，我是问象。正在准备…</p>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}
      {session ? (
        <ChartWorkspace
          session={session}
          busy={busy}
          error={error}
          onSend={(t) => void send(t)}
          onCast={(d) => void recast(d)}
          onInsight={(n) => void insight(n)}
        />
      ) : error ? (
        <p className="text-sm text-cinnabar">{error}</p>
      ) : null}
    </AppShell>
  );
}
