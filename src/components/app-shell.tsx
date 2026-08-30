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
}: {
  title?: string;
  children: React.ReactNode;
  hideTabs?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-paper shadow-[var(--shadow-sheet)]">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/92 px-5 pt-3 pb-3 backdrop-blur">
        <p className="text-[10px] tracking-[0.42em] text-faint">问象 · 奇门智断</p>
        <h1 className="mt-1 font-display text-xl text-ink">{title ?? "问象"}</h1>
        <EntertainmentNotice className="mt-2" />
      </header>
      <main className={cn("flex-1 px-5 py-4", hideTabs ? "pb-8" : "pb-28")}>{children}</main>
      {hideTabs ? null : (
        <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 border-t border-line bg-paper-2/95 backdrop-blur">
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
