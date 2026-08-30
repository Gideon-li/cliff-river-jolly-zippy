import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { EVENT_NAME, type EventId } from "@/lib/app-types";
import { listSessions } from "@/lib/fn/divination";
import { formatBeijing } from "@/lib/utils";

export const Route = createFileRoute("/_app/history")({ component: HistoryPage });

const MODE_LABEL: Record<string, string> = {
  inbox: "问事",
  now: "此刻",
  timed: "择时",
  fortune: "运势",
  lots: "摇卦",
};

function HistoryPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listSessions>> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void listSessions()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "无法读取"));
  }, []);

  return (
    <AppShell title="记录">
      {error ? <p className="text-sm text-cinnabar">{error}</p> : null}
      {!rows ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="pt-16 text-center text-sm text-muted">还没有问过事</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => (
            <li key={s.id}>
              <Link
                to="/consult/$sessionId"
                params={{ sessionId: s.id }}
                className="block rounded-[var(--radius-lg)] border border-line bg-paper-2 px-4 py-3"
              >
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{MODE_LABEL[s.mode] ?? s.mode}</span>
                  <span>{s.civil.year ? formatBeijing(s.civil) : ""}</span>
                </div>
                <p className="mt-1 font-display text-ink">{s.juLabel || "奇门盘"}</p>
                <p className="mt-1 text-[11px] text-faint">
                  {s.eventId ? EVENT_NAME[s.eventId as EventId] : "总盘"}
                  {s.lotsCode ? ` · 摇卦 ${s.lotsCode}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
