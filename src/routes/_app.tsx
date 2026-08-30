import { Outlet, createFileRoute } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { EntertainmentNotice } from "@/components/app-shell";

export const Route = createFileRoute("/_app")({ component: AppLayout });

function AppLayout() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col justify-center bg-paper px-6">
        <p className="text-[10px] tracking-[0.48em] text-faint">问象 · 奇门智断</p>
        <h1 className="mt-3 font-display text-4xl text-ink">问象</h1>
        <EntertainmentNotice className="mt-3" />
        <p className="mt-2 text-sm text-muted">正在进入问事…</p>
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return <Outlet />;
}
