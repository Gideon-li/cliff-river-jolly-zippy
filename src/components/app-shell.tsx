import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, ScrollText, UserRound, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/", label: "问盘", icon: Compass },
  { to: "/history", label: "记录", icon: ScrollText },
  { to: "/wallet", label: "充值", icon: Wallet },
  { to: "/me", label: "我的", icon: UserRound },
] as const;

export function EntertainmentNotice({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex items-center rounded-full border border-cinnabar/35 bg-cinnabar/8 px-2.5 py-0.5 text-[11px] font-medium tracking-[0.22em] text-cinnabar",
        className,
      )}
    >
      玄学预测，仅供娱乐
    </p>
  );
}

export function AppShell({
  title,
  children,
  hideTabs,
  fill,
}: {
  title?: string;
  children: React.ReactNode;
  hideTabs?: boolean;
  fill?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="mx-auto flex h-dvh w-full max-w-6xl flex-col overflow-hidden bg-paper shadow-[var(--shadow-sheet)] md:border-x md:border-line">
      <header className="shrink-0 border-b border-line bg-paper/92 px-4 pt-3 pb-3 md:px-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] tracking-[0.42em] text-faint">问象 · 奇门智断</p>
            <h1 className="mt-1 font-display text-xl text-ink">{title ?? "问象"}</h1>
            <EntertainmentNotice className="mt-2" />
          </div>
          <nav className="hidden md:block">
            <ul className="flex items-center gap-1 pt-1">
              {TABS.map((tab) => {
                const active = tab.to === "/" ? pathname === "/" : pathname.startsWith(tab.to);
                const Icon = tab.icon;
                return (
                  <li key={tab.to}>
                    <Link
                      to={tab.to}
                      className={cn(
                        "flex h-10 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-sm",
                        active ? "bg-seal text-cinnabar" : "text-muted hover:bg-seal/60",
                      )}
                    >
                      <Icon className="size-4" strokeWidth={active ? 2.2 : 1.7} />
                      {tab.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>
      <main
        className={cn(
          "min-h-0 flex-1 px-4 pt-4 md:px-5",
          fill ? "flex flex-col overflow-hidden pb-2" : "overflow-y-auto pb-4",
        )}
      >
        {fill ? children : <div className="mx-auto w-full max-w-2xl">{children}</div>}
      </main>
      {hideTabs ? null : (
        <nav className="shrink-0 border-t border-line bg-paper-2 md:hidden">
          <ul className="grid grid-cols-4">
            {TABS.map((tab) => {
              const active = tab.to === "/" ? pathname === "/" : pathname.startsWith(tab.to);
              const Icon = tab.icon;
              return (
                <li key={tab.to}>
                  <Link
                    to={tab.to}
                    className={cn(
                      "flex h-14 flex-col items-center justify-center gap-1 text-[11px]",
                      active ? "text-cinnabar" : "text-muted",
                    )}
                  >
                    <Icon className="size-5" strokeWidth={active ? 2.2 : 1.7} />
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
