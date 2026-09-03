import { PALACE_META, PALACE_ORDER } from "@/lib/app-types";
import { cn } from "@/lib/utils";
import type { PalaceView } from "@/lib/scan-view";

export function QimenBoard({
  palaces,
  juLabel,
  hourName,
  selectedId,
  onSelect,
}: {
  palaces: Record<string, PalaceView> | undefined;
  juLabel?: string;
  hourName?: string;
  selectedId?: number | null;
  onSelect?: (palace: PalaceView) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-lg text-ink">{juLabel || "奇门盘"}</p>
          {hourName ? <p className="text-xs text-muted">{hourName.replace(/时$/, "")}时</p> : null}
        </div>
        <p className="text-xs tracking-widest text-faint">上南下北</p>
      </div>
      <div className="grid grid-cols-3 gap-1.5 rounded-[var(--radius-lg)] border border-line bg-paper p-1.5">
        {PALACE_ORDER.map((id) => {
          const meta = PALACE_META[id];
          const p = palaces?.[String(id)];
          const bagua = p?.bagua ?? meta?.bagua ?? String(id);
          const direction = p?.direction ?? meta?.direction ?? "";
          const clickable = Boolean(onSelect && p);
          return (
            <button
              key={id}
              type="button"
              disabled={!clickable}
              onClick={clickable && p ? () => onSelect?.(p) : undefined}
              aria-label={`${bagua}宫 ${direction}${p?.gate ? ` ${p.gate}` : ""}`}
              className={cn(
                "relative flex min-h-20 flex-col rounded-[var(--radius-sm)] border border-line bg-paper-2 p-1.5 text-left md:min-h-24",
                p?.isZhiFu && "border-cinnabar/50 bg-seal",
                p?.isKong && "opacity-70",
                selectedId === id && "ring-2 ring-cinnabar/40",
                clickable && "transition-colors hover:border-cinnabar/40",
                !clickable && "cursor-default",
              )}
            >
              <div className="flex items-center justify-between text-xs text-faint">
                <span>{bagua}</span>
                <span>{direction}</span>
              </div>
              <div className="mt-0.5 flex-1 space-y-0 text-center leading-tight">
                <p className="text-xs font-medium text-ink">{p?.god || "—"}</p>
                <p className="text-xs text-ink-soft">{p?.star || ""}</p>
                <p className="text-xs text-cinnabar">{p?.gate || ""}</p>
              </div>
              <div className="flex justify-end gap-0.5 text-xs text-muted">
                <span>{p?.heavenStem}</span>
                <span>{p?.earthStem}</span>
              </div>
              {p?.isZhiFu ? (
                <span className="absolute top-1 right-1 text-xs text-cinnabar">符</span>
              ) : null}
              {p?.isZhiShi ? (
                <span className="absolute top-1 left-1 text-xs text-cinnabar">使</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-faint">符是值符（主事），使是值使（行动）。点宫位，智断会在对话里讲这一格。</p>
    </section>
  );
}
