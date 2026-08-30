import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-xl)] border border-line bg-paper-2 p-4 shadow-[var(--shadow-sheet)]",
        className,
      )}
      {...props}
    />
  );
}
