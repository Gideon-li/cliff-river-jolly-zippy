import { PALACE_ORDER } from "@/lib/app-types";
import { cn } from "@/lib/utils";

type Palace = {
  id: number;
  bagua?: string;
  direction?: string;
  earthStem?: string;
  heavenStem?: string;
  star?: string;
  gate?: string | null;
  god?: string | null;
  isKong?: boolean;
  isZhiFu?: boolean;
  isZhiShi?: boolean;
};

export function QimenBoard({
  palaces,
  juLabel,
  hourName,
}: {
  palaces: Record<string, Palace> | undefined;
  juLabel?: string;
  hourName?: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-lg text-ink">{juLabel || "奇门盘"}</p>
          {hourName ? <p className="text-xs text-muted">{hourName}时</p> : null}
        </div>
        <p className="text-[10px] tracking-[0.3em] text-faint">南</p>
      </div>
      <div className="grid grid-cols-3 gap-1.5 rounded-[var(--radius-lg)] border border-line bg-paper p-1.5">
        {PALACE_ORDER.map((id) => {
          const p = palaces?.[String(id)];
          return (
            <div
              key={id}
              className={cn(
                "relative aspect-square rounded-[var(--radius-sm)] border border-line bg-paper-2 p-1.5",
                p?.isZhiFu && "border-cinnabar/50 bg-seal",
                p?.isKong && "opacity-70",
              )}
            >
              <div className="flex items-center justify-between text-[10px] text-faint">
                <span>{p?.bagua ?? id}</span>
                <span>{p?.direction}</span>
              </div>
              <div className="mt-0.5 space-y-0 text-center leading-tight">
                <p className="text-[11px] font-medium text-ink">{p?.god || "—"}</p>
                <p className="text-[10px] text-ink-soft">{p?.star || ""}</p>
                <p className="text-[10px] text-cinnabar">{p?.gate || ""}</p>
              </div>
              <div className="absolute right-1 bottom-1 flex gap-0.5 text-[9px] text-muted">
                <span>{p?.heavenStem}</span>
                <span>{p?.earthStem}</span>
              </div>
              {p?.isZhiFu ? (
                <span className="absolute top-1 right-1 text-[9px] text-cinnabar">符</span>
              ) : null}
              {p?.isZhiShi ? (
                <span className="absolute top-1 left-1 text-[9px] text-cinnabar">使</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
