import { useState } from "react";
import { cn } from "@/lib/utils";

export function OriginalToggle({
  original,
  className,
}: {
  original?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const text = (original ?? "").trim();
  if (!text) return null;
  return (
    <div className={cn("pt-1", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="min-h-10 text-xs text-muted underline-offset-4 hover:underline"
      >
        {open ? "收起原文" : "看原文"}
      </button>
      {open ? <p className="mt-1 text-xs leading-6 text-faint whitespace-pre-wrap">{text}</p> : null}
    </div>
  );
}
