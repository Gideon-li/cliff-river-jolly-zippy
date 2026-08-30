import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  children,
}: {
  className?: string;
  tone?: "neutral" | "good" | "bad" | "accent";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide",
        tone === "neutral" && "bg-seal text-muted",
        tone === "good" && "bg-auspicious/10 text-auspicious",
        tone === "bad" && "bg-ink/8 text-inauspicious",
        tone === "accent" && "bg-cinnabar/10 text-cinnabar",
        className,
      )}
    >
      {children}
    </span>
  );
}
