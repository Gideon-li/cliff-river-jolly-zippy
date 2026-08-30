import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export function asJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function formatBeijing(civil: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${civil.year}-${p(civil.month)}-${p(civil.day)} ${p(civil.hour)}:${p(civil.minute)}`;
}
