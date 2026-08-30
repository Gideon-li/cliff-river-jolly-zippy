import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-[var(--radius-sm)] border border-line bg-paper-2 px-3 text-sm text-ink placeholder:text-faint outline-none transition-[border-color,box-shadow] duration-150 focus:border-cinnabar/50 focus:ring-2 focus:ring-cinnabar/20",
        className,
      )}
      {...props}
    />
  );
}
