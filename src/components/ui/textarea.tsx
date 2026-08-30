import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-[var(--radius-sm)] border border-line bg-paper-2 px-3 py-2 text-sm text-ink placeholder:text-faint outline-none transition-[border-color,box-shadow] duration-150 focus:border-cinnabar/50 focus:ring-2 focus:ring-cinnabar/20",
        className,
      )}
      {...props}
    />
  );
}
