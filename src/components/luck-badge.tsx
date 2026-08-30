import { Badge } from "@/components/ui/badge";

const GOOD = new Set(["大吉", "吉", "小吉"]);
const BAD = new Set(["小凶", "凶", "大凶"]);

export function LuckBadge({ level, className }: { level?: string | null; className?: string }) {
  if (!level) return null;
  const tone = GOOD.has(level) ? "good" : BAD.has(level) ? "bad" : "neutral";
  return (
    <Badge tone={tone} className={className}>
      {level}
    </Badge>
  );
}
